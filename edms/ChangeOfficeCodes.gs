/*************************************************************
 * 🔁 CHANGE OFFICE CODES
 * Renames office codes in EVERY tab at once, so nobody loses
 * the link to their office:
 *   Offices · Service History · Plantilla Seats
 * The Directory tab and the web app follow automatically.
 *
 * HOW TO USE
 *  1. Extensions → Apps Script → Files ＋ → Script.
 *     Name it ChangeOfficeCodes, paste this, click 💾 Save.
 *  2. Check the list below: left = code now, right = new code.
 *  3. Pick "changeOfficeCodes" in the dropdown → ▶ Run.
 *
 * Safe to run twice: codes that were already changed are skipped.
 * To rename again later, edit the list and run it again.
 *************************************************************/

const OFFICE_CODE_CHANGES = {
  '41': 'OD',     // Office of the Director
  '42': 'EPD',    // Equipment Planning Division
  '44': 'EOMD',   // Equipment Operation and Maintenance Division
  '46': 'FED'     // Floating Equipment Division
};

function changeOfficeCodes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const map = {};
  Object.keys(OFFICE_CODE_CHANGES).forEach(k => { map[String(k).trim()] = String(OFFICE_CODE_CHANGES[k]).trim(); });

  /* 1. Offices first: check for clashes, keep the old code */
  const off = ss.getSheetByName('Offices');
  if (!off) throw new Error('No "Offices" tab found. Run buildDatabase first.');
  let head = oc_headers_(off);
  const codeCol = head.indexOf('Office Code');
  if (codeCol < 0) throw new Error('The Offices tab has no "Office Code" column.');
  const last = off.getLastRow();
  const codes = last > 1 ? off.getRange(2, codeCol + 1, last - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  Object.keys(map).forEach(o => {
    if (codes.indexOf(o) >= 0 && codes.indexOf(map[o]) >= 0) throw new Error('Both "' + o + '" and "' + map[o] + '" already exist in Offices. Remove one of them first.');
  });
  const seen = {};
  Object.keys(map).forEach(o => { if (seen[map[o]]) throw new Error('Two offices would both become "' + map[o] + '".'); seen[map[o]] = 1; });

  let oldCol = head.indexOf('Old Org Code');
  if (oldCol < 0) {
    oldCol = head.length;
    if (off.getMaxColumns() < oldCol + 1) off.insertColumnsAfter(off.getMaxColumns(), 1);
    off.getRange(1, oldCol + 1).setValue('Old Org Code').setFontWeight('bold').setBackground('#14223a').setFontColor('#ffffff');
    head = oc_headers_(off);
  }
  const counts = {};
  if (last > 1) {
    const rng = off.getRange(2, 1, last - 1, head.length);
    const vals = rng.getValues();
    let n = 0;
    vals.forEach(r => {
      const k = String(r[codeCol]).trim();
      if (map[k] !== undefined) { if (String(r[oldCol]).trim() === '') r[oldCol] = r[codeCol]; r[codeCol] = map[k]; n++; }
    });
    if (n) { off.getRange(2, codeCol + 1, last - 1, 1).setNumberFormat('@'); rng.setValues(vals); }
    counts['Offices'] = n;
  }

  /* 2. Every tab that stores an office code */
  ['Service History', 'Plantilla Seats'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) { counts[name] = 0; return; }
    const c = oc_headers_(sh).indexOf('Office Code');
    if (c < 0) { counts[name] = 0; return; }
    const rng = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1);
    let n = 0;
    const vals = rng.getValues().map(r => { const k = String(r[0]).trim(); if (k !== '' && map[k] !== undefined) { n++; return [map[k]]; } return [r[0]]; });
    if (n) { rng.setNumberFormat('@'); rng.setValues(vals); }
    counts[name] = n;
  });

  /* 3. Log it and report */
  const summary = Object.keys(map).map(k => k + ' → ' + map[k]).join(', ');
  const log = ss.getSheetByName('Change Log');
  if (log) {
    let who = '';
    try { who = Session.getActiveUser().getEmail(); } catch (e) { who = ''; }
    log.appendRow([new Date(), who, 'Office codes changed', '', summary + ' · ' + Object.keys(counts).map(k => k + ': ' + counts[k]).join(', ')]);
  }
  SpreadsheetApp.getUi().alert('Office codes changed ✅\n\n' + summary + '\n\nCells updated:\n' +
    Object.keys(counts).map(k => '• ' + k + ': ' + counts[k]).join('\n') +
    '\n\nThe Directory tab and the web app follow automatically.');
}

function oc_headers_(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(h => String(h).trim());
}
