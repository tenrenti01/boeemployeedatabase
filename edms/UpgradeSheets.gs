/*************************************************************
 * ➕ UPGRADE SHEETS — adds the new tabs, keeps all your data
 *
 *   Photos ............... employee photos (saved by the app)
 *   Separation Details ... cause of each separation (Entry ID link)
 *   Separation Causes .... the list the Remove button offers.
 *                          Edit this tab to add or rename causes.
 *   Settings ............. agency name and logo shown in the app
 *
 *   It also adds two columns to the Offices tab — Parent Code and Level —
 *   so an office can be a Division, a Section under a division, or a Unit
 *   under a section. Offices you already have become Divisions.
 *
 * HOW TO USE
 *  1. Extensions → Apps Script → Files ＋ → Script → name it
 *     UpgradeSheets → paste this → 💾 Save.
 *  2. Pick "upgradeSheets" in the dropdown → ▶ Run.
 *  3. The summary appears in the editor's log (View → Logs, or the panel
 *     at the bottom). Nothing waits for a click, so the run always ends.
 *     Run "checkUpgrade" any time to see what is in place.
 *
 * Safe to run more than once: tabs that already exist are left alone.
 *************************************************************/

const UPGRADE = {
  CAUSES: [
    ['Retirement (compulsory, age 65)', 'Reached the compulsory retirement age'],
    ['Retirement (optional)', 'Chose to retire early'],
    ['Resignation', 'Voluntary resignation'],
    ['Death', 'Passed away while in service'],
    ['End of contract', 'Contract of Service / Job Order not renewed'],
    ['Transfer to another agency', 'Moved to another government office'],
    ['Dropped from the rolls', 'AWOL, unsatisfactory rating or similar'],
    ['Dismissal', 'Removed through an administrative case'],
    ['Others', 'Write the details in Notes']
  ],
  SETTINGS: [
    ['Agency Name', 'Bureau of Equipment'],
    ['Department', 'Department of Public Works and Highways'],
    ['Logo', ''],
    ['COE Signatory', 'LEONISA M. DELA CRUZ'],
    ['COE Signatory Title', 'Administrative Officer IV'],
    ['COE Place', ''],
    ['Logo 2', ''],
    ['COE PERA', 24000],
    ['COE Clothing', 6000],
    ['COE CNA', 25000],
    ['COE Field Hazard', 118800],
    ['COE Cash Gift', 5000],
    ['COE Months 13 14', 2],
    ['COE Year End Months', 1],
    ['COE Contract Days Per Month', 22],
    ['Order Files Folder', '1MVb_PHe2CiOUKcX5mbJNgYhPY4KmFTpP'],
    ['License Files Folder', '1BFWGeEXosU2b7FeVWD8QyyvANBbYi7Pw']
  ],
  HEADER: { bg: '#14223a', text: '#ffffff' }
};

/* ▶ RUN THIS ONE */
function upgradeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const done = [];
  if (!ss.getSheetByName('Service History')) throw new Error('No "Service History" tab found. This script upgrades a database made by buildDatabase.');

  u_tab_(ss, 'Photos', ['Employee Number', 'Photo', 'Thumb', 'Updated'], [], [1], '#1d8048',
    'Saved by the app\'s photo button. Photo and Thumb are small pictures stored as text, so they follow the spreadsheet\'s own sharing.', done,
    sh => { sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 140); });

  u_tab_(ss, 'Separation Causes', ['Cause', 'Description'], UPGRADE.CAUSES, [], '#2563eb',
    'The choices the Remove button offers. Add, rename or delete rows here; the app picks them up on the next reload.', done);

  u_tab_(ss, 'Separation Details', ['Entry ID', 'Cause', 'Notes'], [], [1], '#b0306f',
    'Extra details for "Separation" rows in Service History (same Entry ID).', done,
    sh => {
      const causes = ss.getSheetByName('Separation Causes'), hist = ss.getSheetByName('Service History');
      sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(hist.getRange('A2:A'), true).setAllowInvalid(false).build());
      sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(causes.getRange('A2:A'), true).setAllowInvalid(true).build());
    });

  u_tab_(ss, 'Settings', ['Key', 'Value'], UPGRADE.SETTINGS, [], '#14223a',
    'App settings. The logo is uploaded from the app\'s Admin page.', done,
    sh => { sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 360); });

  // Who signs the Certificate of Employment (added for sheets upgraded before certificates existed)
  u_rows_(ss, 'Settings', UPGRADE.SETTINGS.slice(3), done);

  // Division → Section → Unit on the Offices tab. Everything already there becomes a Division.
  u_cols_(ss, 'Offices', [{ h: 'Parent Code', fill: '', text: true }, { h: 'Level', fill: 'Division' }], done,
    { what: 'existing offices marked as Divisions',
      note: 'Parent Code and Level make the office tree: a Division has no parent, a Section sits under a division, a Unit sits under a section. Add them from the app\'s Admin page so the codes stay tidy.' });

  // The scanned special order for each service history entry, kept next to its reference number
  u_cols_(ss, 'Service History', [{ h: 'Order File', fill: '' }], done,
    { after: 'Order / Reference',
      note: 'Link to the scanned special order, put there by the app\'s upload button. Clearing a cell here does not delete the file from Drive.' });

  // Whether a job is technical. Certificates of Employment need it for the Field Allowance and Hazard Pay line.
  u_cols_(ss, 'Positions', [{ h: 'Technical / Non-Technical', fill: u_tech_ }], done,
    { what: 'positions filled in from the salary grade',
      note: 'Technical or Non-Technical, one value per job title. Filled in the first time by a rule: any Project Evaluation Officer, or salary grade 16 and above. Correct any row by hand; the app reads this column, it never rewrites it.' });

  // PRC licenses (for RA 1080 holders): one row per license so renewals and expired ones all stay on file
  u_tab_(ss, 'PRC Licenses',
    ['License ID', 'Employee Number', 'Profession / License', 'License Number', 'Registration Date', 'Valid Until', 'License File', 'Remarks'],
    [], [1, 2, 4], '#0f766e',
    'PRC licenses, added by the app. One row per license; a renewal is a new row and expired ones are kept. License File links to the scan in Drive.', done,
    sh => {
      const emp = ss.getSheetByName('Employees');
      if (emp) sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInRange(emp.getRange('A2:A'), true).setAllowInvalid(false).build());
      sh.getRange(2, 5, sh.getMaxRows() - 1, 2).setNumberFormat('yyyy-mm-dd');
      sh.setColumnWidth(3, 220); sh.setColumnWidth(7, 260); sh.setColumnWidth(8, 200);
    });

  // The master password lives in the script, not in a tab, so people with sheet access can't read it
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MASTER_PASSWORD')) { props.setProperty('MASTER_PASSWORD', '1'); done.push('Master password set to 1 (change it on the app\'s Admin page)'); }

  const log = ss.getSheetByName('Change Log');
  if (log && done.length) log.appendRow([new Date(), u_me_(), 'Sheets upgraded', '', done.join('; ')]);
  SpreadsheetApp.flush();                       // everything above is saved before we try to say anything

  const summary = 'Upgrade done ✅\n\n' + (done.length ? done.map(d => '• ' + d).join('\n') : 'Everything was already in place. Nothing changed.') +
    '\n\nNow reload the web app.';
  Logger.log(summary);                          // always readable in the editor's execution log
  try { ss.toast(done.length ? done.length + ' change(s) made. Reload the web app.' : 'Everything was already in place.', 'Upgrade done', 8); } catch (e) { /* no spreadsheet open */ }
  return summary;                               // shown in the editor, and never waits for a click
}

/* ▶ Run this any time to see what the upgrade did. It only looks; it changes nothing. */
function checkUpgrade() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lines = [];
  ['Photos', 'Separation Causes', 'Separation Details', 'Settings', 'PRC Licenses'].forEach(n => lines.push((ss.getSheetByName(n) ? '✅ ' : '❌ missing: ') + n + ' tab'));
  const off = ss.getSheetByName('Offices');
  if (!off) lines.push('❌ missing: Offices tab');
  else {
    const head = off.getRange(1, 1, 1, Math.max(1, off.getLastColumn())).getValues()[0].map(h => String(h).trim());
    ['Parent Code', 'Level'].forEach(h => lines.push((head.indexOf(h) >= 0 ? '✅ ' : '❌ missing: ') + 'Offices → ' + h + ' column'));
    const lvl = head.indexOf('Level');
    if (lvl >= 0 && off.getLastRow() > 1) {
      const vals = off.getRange(2, 1, off.getLastRow() - 1, head.length).getValues().filter(r => String(r[0]).trim() !== '');
      lines.push('   offices: ' + vals.map(r => r[0] + ' = ' + (r[lvl] || '(blank → treated as Division)')).join(', '));
    }
  }
  [['Service History', 'Order File'], ['Positions', 'Technical / Non-Technical']].forEach(pair => {
    const t = ss.getSheetByName(pair[0]);
    if (!t) { lines.push('❌ missing: ' + pair[0] + ' tab'); return; }
    const h = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getValues()[0].map(x => String(x).trim());
    lines.push((h.indexOf(pair[1]) >= 0 ? '✅ ' : '❌ missing: ') + pair[0] + ' → ' + pair[1] + ' column');
  });
  const set = ss.getSheetByName('Settings');
  if (set && set.getLastRow() > 1) {
    const keys = set.getRange(2, 1, set.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
    UPGRADE.SETTINGS.slice(3).map(r => r[0]).forEach(k => lines.push((keys.indexOf(k) >= 0 ? '✅ ' : '❌ missing: ') + 'Settings → ' + k));
  }
  lines.push(PropertiesService.getScriptProperties().getProperty('MASTER_PASSWORD') ? '✅ master password is set' : '❌ no master password yet');
  const out = lines.join('\n');
  Logger.log(out);
  return out;
}

function u_tab_(ss, name, headers, rows, textCols, color, note, done, extra) {
  if (ss.getSheetByName(name)) return;
  const sh = ss.insertSheet(name, ss.getNumSheets());
  sh.setTabColor(color);
  if (sh.getMaxColumns() > headers.length) sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
  textCols.forEach(c => sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'));
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
    .setBackground(UPGRADE.HEADER.bg).setFontColor(UPGRADE.HEADER.text).setVerticalAlignment('middle');
  sh.getRange(1, 1).setNote(note);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
  if (extra) extra(sh);
  done.push('Added the "' + name + '" tab' + (rows.length ? ' with ' + rows.length + ' rows' : ''));
}

/* Adds rows to a key/value tab that already exists, skipping keys that are already there. */
function u_rows_(ss, name, rows, done) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  const last = sh.getLastRow();
  const have = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  const add = rows.filter(r => have.indexOf(r[0]) < 0);
  if (!add.length) return;
  if (last + add.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), last + add.length - sh.getMaxRows());
  sh.getRange(last + 1, 1, add.length, 2).setValues(add);
  done.push('Added ' + add.map(r => '"' + r[0] + '"').join(', ') + ' to the "' + name + '" tab');
}

/* Adds columns to a tab that already exists and fills them in for the rows already there.
   Each column is { h: header, fill: a value or a function of (row, headers), text: store as text }.
   opts.after names the column to insert beside; without it the columns go at the end. */
function u_cols_(ss, name, cols, done, opts) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  opts = opts || {};
  const width = Math.max(1, sh.getLastColumn());
  const headers = sh.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  const missing = cols.filter(c => headers.indexOf(c.h) < 0);
  if (!missing.length) return;
  const at = opts.after ? headers.indexOf(opts.after) + 1 : 0;      // 1-based column to insert after
  const lastRow = sh.getLastRow();
  const body = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, width).getValues() : [];

  if (at > 0) sh.insertColumnsAfter(at, missing.length);
  else if (sh.getMaxColumns() < width + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), width + missing.length - sh.getMaxColumns());
  const first = at > 0 ? at + 1 : width + 1;

  missing.forEach((c, i) => {
    const col = first + i;
    sh.getRange(1, col).setValue(c.h).setFontWeight('bold')
      .setBackground(UPGRADE.HEADER.bg).setFontColor(UPGRADE.HEADER.text).setVerticalAlignment('middle');
    const band = Math.max(1, Math.min(sh.getMaxRows() - 1, Math.max(lastRow, 200)));
    if (c.text) sh.getRange(2, col, band, 1).setNumberFormat('@');
    if (!body.length || c.fill === undefined || c.fill === '') return;
    const vals = body.map(r => [typeof c.fill === 'function' ? c.fill(r, headers) : c.fill]);
    if (vals.some(v => v[0] !== '')) sh.getRange(2, col, vals.length, 1).setValues(vals);
  });
  if (opts.note) sh.getRange(1, first).setNote(opts.note);
  sh.autoResizeColumns(1, Math.min(sh.getLastColumn(), width + missing.length));
  done.push('Added ' + missing.map(c => '"' + c.h + '"').join(' and ') + ' to the "' + name + '" tab' +
    (lastRow > 1 && opts.what ? ' (' + (lastRow - 1) + ' ' + opts.what + ')' : ''));
}

/* First guess at whether a position is technical: any Project Evaluation Officer, or SG 16 and up.
   Same rule the hire and job-change forms already use. Meant to be corrected by hand afterwards. */
function u_tech_(row, headers) {
  const title = String(row[headers.indexOf('Position Title')] || '');
  const sg = Number(row[headers.indexOf('Salary Grade')]);
  if (!title) return '';
  return (/project\s+evaluation\s+officer/i.test(title) || sg >= 16) ? 'Technical' : 'Non-Technical';
}

function u_me_() { try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; } }
