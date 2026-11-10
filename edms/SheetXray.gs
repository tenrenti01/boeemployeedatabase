/*************************************************************
 * 🧠 SHEET X-RAY FOR CLAUDE
 * Reads every tab in this spreadsheet and builds one summary
 * you can copy and paste back into Claude.
 *
 * HOW TO USE
 *  1. If the file name ends in ".xlsx": File → Save as Google Sheets.
 *     (Apps Script only works on real Google Sheets files.)
 *  2. In that new copy: Extensions → Apps Script.
 *     Delete what's there, paste ALL of this, click 💾 Save.
 *  3. In the function dropdown pick "xrayForClaude", click ▶ Run.
 *     First time only: Review permissions → your account →
 *     Advanced → Go to (project) → Allow.
 *  4. Go back to the spreadsheet tab. A window pops up.
 *     Click "Copy report", then paste it into Claude.
 *
 * Your data is NOT changed. The only button that writes anything
 * is the optional "Save as new tab".
 *************************************************************/

const XRAY = {
  FULL_DUMP_MAX_ROWS: 150,      // small tabs (like "Read Me", "Data Issues") are copied in full…
  FULL_DUMP_MAX_COLS: 15,       // …as long as they're also this narrow
  SAMPLE_ROWS: 8,               // example rows for big tabs (spread from top to bottom)
  LIST_ALL_IF_UNIQUE_AT_MOST: 40, // list every value (with counts) when a column has this few different values
  TOP_VALUES: 6,                // otherwise show only the most common ones
  MAX_CELL_CHARS: 90,           // long text gets cut to this length
  MAX_ROWS_TO_SCAN: 5000,       // safety limit for very big tabs
  HIDDEN_ROW_CHECK_LIMIT: 600,  // checking hidden rows is slow, so only the first N rows
  MASK_ID_NUMBERS: true,        // digits in ID-number columns become 9s (keeps the shape, e.g. 999-999-999)
  ID_COLUMN_WORDS: ['tin', 'pag-ibig', 'pagibig', 'hdmf', 'philhealth', 'sss', 'gsis', 'umid', 'bank', 'account no'],
  SKIP_TABS_STARTING_WITH: '🧠' // so the saved report tab isn't X-rayed next time
};

/* Adds a menu so you can run it from the spreadsheet next time */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧠 Claude Helper')
    .addItem('X-ray this spreadsheet', 'xrayForClaude')
    .addToUi();
}

/* ▶ RUN THIS ONE */
function xrayForClaude() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const tabs = ss.getSheets()
    .filter(sh => !sh.getName().startsWith(XRAY.SKIP_TABS_STARTING_WITH))
    .map(sh => xrayTab_(sh));
  const meta = {
    name: ss.getName(),
    tz: tz,
    locale: ss.getSpreadsheetLocale(),
    when: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
    namedRanges: ss.getNamedRanges().map(n => n.getName() + ' → ' + n.getRange().getA1Notation())
  };
  const report = buildReport_(meta, tabs);
  Logger.log(report); // backup copy: View → Executions / Logs

  const html = HtmlService.createHtmlOutput(buildDialog_(meta, tabs, report))
    .setWidth(1040).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, '🧠 Sheet X-Ray for Claude');
}

/* Called by the "Save as new tab" button in the popup */
function saveReportToTab(report) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = XRAY.SKIP_TABS_STARTING_WITH + ' X-Ray ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMdd-HHmm');
  const sh = ss.insertSheet(name);
  const lines = String(report).split('\n').map(l => [l.length > 49000 ? l.slice(0, 49000) : l]);
  sh.getRange(1, 1, lines.length, 1).setNumberFormat('@').setValues(lines);
  sh.setColumnWidth(1, 1200);
  return name;
}

/* ───────────────────────── one tab ───────────────────────── */

function xrayTab_(sh) {
  const info = {
    name: sh.getName(), hidden: sh.isSheetHidden(),
    lastRow: sh.getLastRow(), lastCol: sh.getLastColumn(),
    frozenRows: sh.getFrozenRows(), frozenCols: sh.getFrozenColumns(),
    hasFilter: !!sh.getFilter(), merged: [], hiddenRows: 0, hiddenCols: 0, hiddenRowNote: '',
    headerRow: 1, headers: [], dataRows: 0, emptyRows: 0, truncated: false,
    columns: [], dupRows: [], dupIds: null, dupPeople: null, samples: [], fullDump: null, warnings: []
  };
  if (info.lastRow === 0 || info.lastCol === 0) { info.warnings.push('This tab is empty.'); return info; }

  const rowsToRead = Math.min(info.lastRow, XRAY.MAX_ROWS_TO_SCAN);
  info.truncated = rowsToRead < info.lastRow;
  const range = sh.getRange(1, 1, rowsToRead, info.lastCol);
  const raw = range.getValues();
  const disp = range.getDisplayValues();
  const formulas = range.getFormulas();

  info.merged = range.getMergedRanges().map(r => r.getA1Notation());
  for (let c = 1; c <= info.lastCol; c++) if (sh.isColumnHiddenByUser(c)) info.hiddenCols++;
  const rowCheck = Math.min(rowsToRead, XRAY.HIDDEN_ROW_CHECK_LIMIT);
  for (let r = 1; r <= rowCheck; r++) if (sh.isRowHiddenByUser(r)) info.hiddenRows++;
  if (rowCheck < rowsToRead) info.hiddenRowNote = ' (checked first ' + rowCheck + ' rows only)';

  // Header row = first row (within the top 10) that is at least 60% as full as the fullest one
  const fill = disp.slice(0, 10).map(r => r.filter(v => String(v).trim() !== '').length);
  const maxFill = Math.max.apply(null, fill);
  const h = fill.findIndex(n => n >= 0.6 * maxFill);
  info.headerRow = h + 1;
  info.headers = disp[h].map((v, i) => String(v).trim() || '(no header)');

  const start = h + 1;
  const dRaw = raw.slice(start), dDisp = disp.slice(start), dF = formulas.slice(start);
  const isEmptyRow = row => row.every(v => String(v).trim() === '');
  info.emptyRows = dDisp.filter(isEmptyRow).length;
  info.dataRows = dDisp.length - info.emptyRows;

  // Columns
  for (let c = 0; c < info.lastCol; c++) {
    info.columns.push(analyzeColumn_(
      info.headers[c], colLetter_(c + 1),
      dRaw.map(r => r[c]), dDisp.map(r => r[c]), dF.map(r => r[c]),
      dDisp.map(isEmptyRow)
    ));
  }
  const masked = info.columns.map(c => c.masked);
  const show = (v, c) => cut_(masked[c] ? mask_(v) : v);

  // Exact duplicate rows
  const seen = new Map();
  dDisp.forEach((row, i) => {
    if (isEmptyRow(row)) return;
    const key = row.map(v => String(v).trim()).join('␟');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(start + i + 1);
  });
  info.dupRows = Array.from(seen.values()).filter(a => a.length > 1);

  // Repeated IDs in column A (if it looks like an ID column)
  if (/\b(id|code|no\.?|number|#)\b/i.test(info.headers[0])) {
    info.dupIds = repeats_(dDisp.map(r => String(r[0]).trim()), start, 15);
  }

  // Same person listed more than once (surname + first name [+ birth date])
  const find = re => info.headers.findIndex(x => re.test(x));
  const ln = find(/surname|last\s*name|family\s*name/i), fn = find(/first\s*name|given\s*name/i), dob = find(/birth/i);
  if (ln >= 0 && fn >= 0) {
    const keys = dDisp.map(r => {
      const a = String(r[ln]).trim().toUpperCase(), b = String(r[fn]).trim().toUpperCase();
      if (!a && !b) return '';
      return a + ', ' + b + (dob >= 0 && String(r[dob]).trim() ? ' (born ' + String(r[dob]).trim() + ')' : '');
    });
    info.dupPeople = { by: info.headers[ln] + ' + ' + info.headers[fn] + (dob >= 0 ? ' + ' + info.headers[dob] : ''),
                       list: repeats_(keys, start, 20) };
  }

  // Full copy for small/narrow tabs, otherwise spread-out sample rows
  const nonEmpty = [];
  dDisp.forEach((row, i) => { if (!isEmptyRow(row)) nonEmpty.push({ n: start + i + 1, row: row }); });
  if (info.dataRows <= XRAY.FULL_DUMP_MAX_ROWS && info.lastCol <= XRAY.FULL_DUMP_MAX_COLS) {
    info.fullDump = disp.slice(0, rowsToRead).map((row, i) =>
      ({ n: i + 1, cells: row.map((v, c) => show(v, c)) })).filter(r => r.cells.some(v => v !== ''));
  } else {
    const k = Math.min(XRAY.SAMPLE_ROWS, nonEmpty.length);
    const picks = new Set();
    for (let j = 0; j < k; j++) picks.add(Math.round(j * (nonEmpty.length - 1) / Math.max(1, k - 1)));
    info.samples = Array.from(picks).map(p => ({ n: nonEmpty[p].n, cells: nonEmpty[p].row.map((v, c) => show(v, c)) }));
  }
  if (info.truncated) info.warnings.push('Only the first ' + rowsToRead + ' of ' + info.lastRow + ' rows were scanned.');
  return info;
}

/* ───────────────────────── one column ───────────────────────── */

function analyzeColumn_(header, letter, rawCol, dispCol, fCol, emptyRowFlags) {
  const masked = XRAY.MASK_ID_NUMBERS && XRAY.ID_COLUMN_WORDS.some(w => header.toLowerCase().indexOf(w) >= 0);
  const s = { header: header, letter: letter, masked: masked, filled: 0, blank: 0, rows: 0, types: {},
              formulas: 0, sampleFormula: '', spaces: 0, linebreaks: 0, unique: 0, values: [], listedAll: false,
              min: null, max: null, maxLen: 0, variants: [], flags: [] };
  const counts = new Map(), groups = new Map(), shapes = new Map(); // shapes = masked look, e.g. 999-999-999

  rawCol.forEach((v, i) => {
    if (emptyRowFlags[i]) return;           // ignore fully empty rows
    s.rows++;
    const d = String(dispCol[i]);
    if (fCol[i]) { s.formulas++; if (!s.sampleFormula) s.sampleFormula = fCol[i]; }
    if (d.trim() === '') { s.blank++; return; }
    s.filled++;
    const t = typeOf_(v);
    s.types[t] = (s.types[t] || 0) + 1;
    if (typeof v === 'string') {
      if (v !== v.trim() || /\S\s{2,}\S/.test(v)) s.spaces++;
      if (/\n/.test(v)) s.linebreaks++;
    }
    if (t === 'number' || t === 'date') {
      const n = t === 'date' ? v.getTime() : v;
      if (!s.min || n < s.min.n) s.min = { n: n, d: d };
      if (!s.max || n > s.max.n) s.max = { n: n, d: d };
    }
    s.maxLen = Math.max(s.maxLen, d.length);
    const key = d.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (masked) { const sh = mask_(key); shapes.set(sh, (shapes.get(sh) || 0) + 1); }
    const loose = key.toLowerCase().replace(/[\s.\-_]+/g, ' ').trim();
    if (!groups.has(loose)) groups.set(loose, new Set());
    groups.get(loose).add(key);
  });

  s.unique = counts.size;
  // For masked ID columns we list the FORMATS (999-999-999 ×120), never the real numbers
  const source = masked ? shapes : counts;
  const sorted = Array.from(source.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  s.listedAll = sorted.length <= XRAY.LIST_ALL_IF_UNIQUE_AT_MOST;
  s.valuesAreFormats = masked;
  s.values = (s.listedAll ? sorted : sorted.slice(0, XRAY.TOP_VALUES)).map(e => ({ v: cut_(e[0]), n: e[1] }));
  s.variants = masked ? [] : Array.from(groups.values()).filter(g => g.size > 1).slice(0, 6)
    .map(g => Array.from(g).map(x => cut_(x)).join(' | '));
  if (s.min && masked) { s.min.d = mask_(s.min.d); s.max.d = mask_(s.max.d); }

  // Flags (plain-English warnings)
  const typeNames = Object.keys(s.types);
  if (s.rows > 0 && s.filled === 0) s.flags.push('completely empty');
  if (typeNames.length > 1) s.flags.push('mixed types');
  if (s.types['number-as-text']) s.flags.push(s.types['number-as-text'] + ' numbers stored as text');
  if (s.types['date-as-text']) s.flags.push(s.types['date-as-text'] + ' dates stored as text');
  if (s.spaces) s.flags.push(s.spaces + ' with extra spaces');
  if (s.linebreaks) s.flags.push(s.linebreaks + ' with line breaks');
  if (s.variants.length) s.flags.push('spelling/case variants');
  if (s.formulas) s.flags.push('formula in ' + s.formulas + ' rows');
  const repeats = s.filled - s.unique;
  if (s.filled > 5 && s.unique / s.filled >= 0.9 && repeats > 0) s.flags.push('almost unique — ' + repeats + ' repeated (duplicates?)');
  if (s.filled > 3 && s.unique === s.filled) s.flags.push('every value unique');
  if (s.filled > 3 && s.unique === 1) s.flags.push('same value everywhere');
  if (s.filled > 0 && s.blank / Math.max(1, s.rows) >= 0.5) s.flags.push(Math.round(100 * s.blank / s.rows) + '% blank');
  return s;
}

/* ───────────────────────── helpers ───────────────────────── */

function typeOf_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return 'date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'true/false';
  const s = String(v).trim();
  if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/.test(s) && !/^0\d/.test(s)) return 'number-as-text';
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ||
      /^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}$/.test(s)) return 'date-as-text';
  return 'text';
}

function repeats_(keys, start, limit) {
  const m = new Map();
  keys.forEach((k, i) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(start + i + 1); });
  return Array.from(m.entries()).filter(e => e[1].length > 1).slice(0, limit)
    .map(e => ({ key: cut_(e[0]), rows: e[1] }));
}

function mask_(v) { return String(v).replace(/\d/g, '9'); }

function cut_(v) {
  const s = String(v).replace(/\s*\n\s*/g, ' ⏎ ');
  return s.length > XRAY.MAX_CELL_CHARS ? s.slice(0, XRAY.MAX_CELL_CHARS - 1) + '…' : s;
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ───────────────────────── text report (what you paste to Claude) ───────────────────────── */

function buildReport_(meta, tabs) {
  const out = [];
  out.push('# SHEET X-RAY: ' + meta.name);
  out.push('Made: ' + meta.when + ' | Time zone: ' + meta.tz + ' | Locale: ' + meta.locale + ' | Tabs: ' + tabs.length);
  out.push('Named ranges: ' + (meta.namedRanges.length ? meta.namedRanges.join('; ') : 'none'));
  if (XRAY.MASK_ID_NUMBERS) out.push('Note: digits in ID-number columns are replaced with 9 (format kept, numbers hidden).');
  out.push('');

  tabs.forEach((t, ti) => {
    out.push('='.repeat(70));
    out.push('## TAB ' + (ti + 1) + ': "' + t.name + '"' + (t.hidden ? ' (HIDDEN TAB)' : '') +
             ' — ' + t.dataRows + ' data rows × ' + t.lastCol + ' columns');
    t.warnings.forEach(w => out.push('⚠ ' + w));
    if (!t.lastRow) { out.push(''); return; }
    out.push('Layout: header on row ' + t.headerRow + ' | used range A1:' + colLetter_(t.lastCol) + t.lastRow +
             ' | empty rows inside: ' + t.emptyRows + ' | frozen rows/cols: ' + t.frozenRows + '/' + t.frozenCols +
             ' | hidden rows/cols: ' + t.hiddenRows + t.hiddenRowNote + '/' + t.hiddenCols +
             ' | filter: ' + (t.hasFilter ? 'yes' : 'no') +
             ' | merged cells: ' + (t.merged.length ? t.merged.slice(0, 12).join(', ') + (t.merged.length > 12 ? ' …+' + (t.merged.length - 12) : '') : 'none'));

    if (t.fullDump) {
      out.push('');
      out.push('### FULL CONTENT (row number: cells separated by " | ")');
      t.fullDump.forEach(r => out.push(r.n + ': ' + r.cells.join(' | ')));
    }

    out.push('');
    out.push('### COLUMNS');
    t.columns.forEach(c => {
      const types = Object.keys(c.types).map(k => k + ' ' + c.types[k]).join(', ') || '—';
      let line = c.letter + ' "' + c.header + '"' + (c.masked ? ' [masked]' : '') +
        ' | filled ' + c.filled + '/' + c.rows + ' | types: ' + types + ' | unique: ' + c.unique;
      if (c.min && c.max && c.min.d !== c.max.d) line += ' | range: ' + c.min.d + ' → ' + c.max.d;
      if (c.maxLen > 60) line += ' | longest: ' + c.maxLen + ' chars';
      out.push(line);
      if (c.values.length && !t.fullDump) {
        out.push('    ' + (c.valuesAreFormats ? (c.listedAll ? 'all formats' : 'top formats')
                                               : (c.listedAll ? 'all values' : 'top values')) + ': ' +
                 c.values.map(v => (v.v === '' ? '(blank)' : v.v) + ' (' + v.n + ')').join(' · '));
      }
      if (c.variants.length) out.push('    look-alike spellings: ' + c.variants.join('  //  '));
      if (c.sampleFormula) out.push('    example formula: ' + cut_(c.sampleFormula));
      if (c.flags.length) out.push('    flags: ' + c.flags.join('; '));
    });

    out.push('');
    out.push('### DUPLICATE CHECKS');
    out.push('Exact duplicate rows: ' + (t.dupRows.length ? t.dupRows.map(a => 'rows ' + a.join(', ')).join(' | ') : 'none'));
    if (t.dupIds) out.push('Repeated values in "' + t.headers[0] + '": ' +
      (t.dupIds.length ? t.dupIds.map(d => d.key + ' (rows ' + d.rows.join(', ') + ')').join(' | ') : 'none'));
    if (t.dupPeople) out.push('Same person more than once (' + t.dupPeople.by + '): ' +
      (t.dupPeople.list.length ? t.dupPeople.list.map(d => d.key + ' → rows ' + d.rows.join(', ')).join(' | ') : 'none'));

    if (t.samples.length) {
      out.push('');
      out.push('### SAMPLE ROWS (spread from top to bottom; cells separated by " | ")');
      out.push('headers: ' + t.headers.join(' | '));
      t.samples.forEach(r => out.push('row ' + r.n + ': ' + r.cells.join(' | ')));
    }
    out.push('');
  });
  out.push('# END OF X-RAY');
  return out.join('\n');
}

/* ───────────────────────── the pretty popup ───────────────────────── */

function buildDialog_(meta, tabs, report) {
  const lite = tabs.map(t => ({
    name: t.name, hidden: t.hidden, rows: t.dataRows, cols: t.lastCol, empty: t.emptyRows,
    merged: t.merged.length, dupRows: t.dupRows.length,
    dupIds: t.dupIds ? t.dupIds.length : null,
    dupPeople: t.dupPeople ? t.dupPeople.list.length : null,
    full: !!t.fullDump, warnings: t.warnings,
    columns: t.columns.map(c => ({ l: c.letter, h: c.header, f: c.filled, r: c.rows, u: c.unique,
      t: Object.keys(c.types).sort((a, b) => c.types[b] - c.types[a])[0] || '—', flags: c.flags, m: c.masked }))
  }));
  const data = JSON.stringify({ meta: meta, tabs: lite, report: report }).replace(/</g, '\\u003c');

  return `<!doctype html><html><head><base target="_top"><meta charset="utf-8">
<style>
  :root{--bg:#0f1419;--panel:#171d24;--line:#26303b;--ink:#e8edf2;--mute:#8b98a5;--accent:#4fd1a5;--warn:#f5b84b;--bad:#f2766b;--info:#7aa7ff}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  header{padding:18px 20px 12px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
  h1{margin:0;font-size:18px;letter-spacing:.2px} .sub{color:var(--mute);font-size:12px;margin-top:3px}
  .btns{display:flex;gap:8px;flex-wrap:wrap}
  button{border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px}
  button.primary{background:var(--accent);border-color:var(--accent);color:#07261c}
  button:hover{filter:brightness(1.1)}
  main{padding:14px 20px 20px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-bottom:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;transition:border-color .15s}
  .card.on{border-color:var(--accent)} .card h3{margin:0 0 6px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .big{font-size:22px;font-weight:700} .k{color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.6px}
  .row{display:flex;gap:14px;margin-top:4px}
  .pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;margin:1px 3px 1px 0;border:1px solid var(--line);color:var(--mute)}
  .pill.warn{color:var(--warn);border-color:#5a4520} .pill.bad{color:var(--bad);border-color:#5c2b27} .pill.info{color:var(--info);border-color:#2a3b5c} .pill.ok{color:var(--accent);border-color:#1f4a3c}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  th{color:var(--mute);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px;position:sticky;top:0;background:var(--panel)}
  .bar{height:6px;background:#26303b;border-radius:3px;width:90px;overflow:hidden;margin-top:5px} .bar i{display:block;height:100%;background:var(--accent)}
  .tablewrap{max-height:330px;overflow:auto;border-radius:12px}
  details{margin-top:14px} summary{cursor:pointer;color:var(--mute)}
  textarea{width:100%;height:220px;margin-top:8px;background:#0b0f13;color:#cfe3d9;border:1px solid var(--line);border-radius:10px;padding:10px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
  #toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(80px);background:var(--accent);color:#07261c;padding:10px 16px;border-radius:10px;font-weight:700;transition:transform .25s}
  #toast.show{transform:translateX(-50%) translateY(0)}
  .muted{color:var(--mute)}
</style></head><body>
<header>
  <div><h1>🧠 Sheet X-Ray</h1><div class="sub" id="sub"></div></div>
  <div class="btns">
    <button class="primary" onclick="copyReport()">📋 Copy report for Claude</button>
    <button onclick="saveTab(this)">💾 Save as new tab</button>
  </div>
</header>
<main>
  <div class="cards" id="cards"></div>
  <div class="tablewrap"><table><thead><tr><th>Col</th><th>Header</th><th>Filled</th><th>Main type</th><th>Unique</th><th>Heads-up</th></tr></thead><tbody id="cols"></tbody></table></div>
  <details><summary>Show the text report (this is what gets copied)</summary><textarea id="report" readonly></textarea></details>
</main>
<div id="toast"></div>
<script>
  var DATA = ${data};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pillClass(f){ if(/empty|duplicate|stored as text|mixed/.test(f)) return 'bad'; if(/variant|spaces|line breaks|blank/.test(f)) return 'warn'; if(/formula|unique|same value/.test(f)) return 'info'; return ''; }
  var current = 0;
  document.getElementById('sub').textContent = DATA.meta.name + ' · ' + DATA.tabs.length + ' tabs · ' + DATA.meta.when;
  document.getElementById('report').value = DATA.report;
  function issuesOf(t){ return t.columns.filter(function(c){return c.flags.some(function(f){return pillClass(f)==='bad'||pillClass(f)==='warn';});}).length; }
  function drawCards(){
    document.getElementById('cards').innerHTML = DATA.tabs.map(function(t,i){
      var extra = [];
      if (t.hidden) extra.push('<span class="pill warn">hidden tab</span>');
      if (t.full) extra.push('<span class="pill ok">copied in full</span>');
      function n(x, one, many){ return x + ' ' + (x === 1 ? one : many); }
      if (t.dupRows) extra.push('<span class="pill bad">' + n(t.dupRows, 'duplicate row', 'duplicate rows') + '</span>');
      if (t.dupIds) extra.push('<span class="pill bad">' + n(t.dupIds, 'repeated ID', 'repeated IDs') + '</span>');
      if (t.dupPeople) extra.push('<span class="pill warn">' + n(t.dupPeople, 'person listed twice', 'people listed twice') + '</span>');
      if (t.merged) extra.push('<span class="pill warn">' + n(t.merged, 'merged cell area', 'merged cell areas') + '</span>');
      return '<div class="card' + (i===current?' on':'') + '" onclick="pick(' + i + ')"><h3>' + esc(t.name) + '</h3>' +
        '<div class="row"><div><div class="big">' + t.rows + '</div><div class="k">rows</div></div>' +
        '<div><div class="big">' + t.cols + '</div><div class="k">columns</div></div>' +
        '<div><div class="big" style="color:var(--warn)">' + issuesOf(t) + '</div><div class="k">cols to fix</div></div></div>' +
        '<div style="margin-top:8px">' + extra.join('') + '</div></div>';
    }).join('');
  }
  function drawCols(){
    var t = DATA.tabs[current];
    document.getElementById('cols').innerHTML = t.columns.map(function(c){
      var pct = c.r ? Math.round(100*c.f/c.r) : 0;
      return '<tr><td class="muted">' + c.l + '</td><td>' + esc(c.h) + (c.m?' <span class="pill info">masked</span>':'') + '</td>' +
        '<td>' + pct + '%<div class="bar"><i style="width:' + pct + '%"></i></div></td>' +
        '<td>' + esc(c.t) + '</td><td>' + c.u + '</td>' +
        '<td>' + c.flags.map(function(f){return '<span class="pill ' + pillClass(f) + '">' + esc(f) + '</span>';}).join('') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Nothing here.</td></tr>';
  }
  function pick(i){ current=i; drawCards(); drawCols(); }
  function toast(msg){ var t=document.getElementById('toast'); t.textContent=msg; t.className='show'; setTimeout(function(){t.className='';},2600); }
  function copyReport(){
    var ta = document.getElementById('report'); ta.parentNode.open = true; ta.focus(); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch(e) {}
    if (ok) { toast('Copied! Now paste it into Claude.'); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function(){ toast('Copied! Now paste it into Claude.'); },
      function(){ toast('Press Ctrl+C (Cmd+C on Mac) to copy the highlighted text.'); });
    else toast('Press Ctrl+C (Cmd+C on Mac) to copy the highlighted text.');
  }
  function saveTab(btn){
    btn.disabled = true; btn.textContent = 'Saving…';
    google.script.run.withSuccessHandler(function(name){ btn.textContent='✅ Saved'; toast('Saved to tab "' + name + '"'); })
      .withFailureHandler(function(e){ btn.disabled=false; btn.textContent='💾 Save as new tab'; toast('Could not save: ' + e.message); })
      .saveReportToTab(DATA.report);
  }
  pick(0);
</script></body></html>`;
}
