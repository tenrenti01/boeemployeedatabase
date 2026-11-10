/*************************************************************
 * 🏗️ STEP 2 (v2) — BUILD THE NORMALIZED SHEETS
 * Reads your "Personnel" tab and splits it into thin tables.
 * Every tab holds ONE kind of thing, and nothing is typed twice.
 *
 *  ABOUT PEOPLE
 *   Employees ......... one row per person (your basic info)
 *   Government IDs .... one row per ID (Pag-IBIG, PhilHealth, GSIS…)
 *   Emails ............ one row per email; one is marked Active
 *   Eligibilities ..... one row per eligibility or exam passed
 *   Education ......... one row per degree / course
 *   PWD Records ....... only for persons with disability
 *   Name Changes ...... one row per last-name change
 *  ABOUT JOBS
 *   Service History ... one row per job change (the service record)
 *   Plantilla Details . item number + step for plantilla entries
 *   Contract Details .. daily rate, fund, work for CoS / JO entries
 *  LOOKUP LISTS
 *   Plantilla Seats · Positions · Offices · Pay Rates
 *  VIEW (formulas only, never type here)
 *   Directory ......... everyone's current status, office, pay, age
 *  SYSTEM
 *   Users · Change Log · 🧠 Build Notes
 *
 * HOW TO USE
 *  1. Extensions → Apps Script → open BuildDatabase.
 *  2. Select everything in it, delete, paste ALL of this, 💾 Save.
 *  3. Pick "buildDatabase" in the dropdown, click ▶ Run.
 *  4. Switch to the spreadsheet: a box lists the tabs it will
 *     delete. Click YES to rebuild, NO to stop.
 *
 * FRESH START EVERY TIME: it deletes every tab except the ones in
 * KEEP_TABS below, then rebuilds all tabs from "Personnel".
 * Anything typed into the deleted tabs is lost (File → Version
 * history can bring it back). The "Personnel" tab is never changed.
 * So: run it now to clean up, then never again once people start
 * adding records through the web app.
 *************************************************************/

const BUILD = {
  SOURCE_TAB: 'Personnel',
  // Tabs that are never deleted. Every other tab is removed and rebuilt.
  KEEP_TABS: ['Personnel', 'Data Issues'],
  // Old Org Code → your office code. Leave as {} to keep the old numbers.
  OFFICE_CODES: { 41: 'OD', 42: 'EPD', 44: 'EOMD', 46: 'FED' },
  // Our own IDs have no dashes: Employee Number 0001, Record ID PL0001, Entry ID SH00001
  EMP_PREFIX: '', EMP_DIGITS: 4,
  RECORD_DIGITS: 4,
  ENTRY_PREFIX: 'SH', ENTRY_DIGITS: 5,
  // Year of the CoS / JO daily rates in the Personnel tab (monthly rates use the Report As Of year)
  DAILY_RATE_YEAR: 2025,
  TAB: {
    emp: 'Employees', ids: 'Government IDs', emails: 'Emails', elig: 'Eligibilities', edu: 'Education', pwd: 'PWD Records',
    names: 'Name Changes', hist: 'Service History', pd: 'Plantilla Details', cd: 'Contract Details',
    seats: 'Plantilla Seats', pos: 'Positions', off: 'Offices', pay: 'Pay Rates', dir: 'Directory',
    users: 'Users', log: 'Change Log', notes: '🧠 Build Notes'
  },
  COLOR: { people: '#1d8048', jobs: '#b0306f', lookup: '#2563eb', seats: '#b86200', view: '#6b7a90', system: '#14223a' },
  HEADER: { bg: '#14223a', text: '#ffffff' },
  VIEW_HEADER: { bg: '#dfe7f2', text: '#2b3a52' },
  COS_STATUS: 'Contract of Service / Job Order',
  CHANGE_TYPES: ['Start of service', 'Original (New)', 'Promotion', 'Reclassification', 'Retitled', 'Retained',
    'Reemployment', 'Transfer', 'Step increment', 'Reassignment', 'Designation (OIC)', 'Contract (CoS / JO)',
    'Contract renewal', 'Separation'],
  APPT_STATUSES: ['Permanent', 'Temporary', 'Coterminous', 'Contract of Service / Job Order', 'Contract of Service', 'Job Order'],
  ID_TYPES: ['Pag-IBIG', 'PhilHealth', 'GSIS BP No.', 'SSS', 'UMID'],
  NAME_REASONS: ['Marriage', 'Back to maiden name', 'Court order', 'Correction of record'],
  ROLES: ['Admin', 'Editor', 'Viewer']
};

/* ▶ RUN THIS ONE */
function buildDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const src = ss.getSheetByName(BUILD.SOURCE_TAB);
  if (!src) throw new Error('No tab named "' + BUILD.SOURCE_TAB + '" was found. Fix BUILD.SOURCE_TAB at the top of the script.');

  /* Fresh start: delete every tab that isn't on the keep list */
  const keep = BUILD.KEEP_TABS.concat([BUILD.SOURCE_TAB]);
  const doomed = ss.getSheets().filter(sh => keep.indexOf(sh.getName()) < 0);
  if (doomed.length) {
    const names = doomed.map(sh => '• ' + sh.getName());
    const list = names.slice(0, 35).join('\n') + (names.length > 35 ? '\n…and ' + (names.length - 35) + ' more' : '');
    const answer = ui.alert('Fresh start',
      'This rebuilds the whole database from the "' + BUILD.SOURCE_TAB + '" tab.\n\n' +
      'These ' + doomed.length + ' tabs will be DELETED:\n' + list + '\n\n' +
      'Kept: ' + keep.filter((n, i) => keep.indexOf(n) === i).join(', ') + '\n' +
      'Anything typed into the deleted tabs is lost. (File → Version history can bring it back.)\n\nContinue?',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) { ss.toast('Nothing was changed.', 'Cancelled', 5); return; }
    ss.setActiveSheet(src);
    // Formula tabs first (they make deleting the others slower), with short pauses so Google keeps up
    doomed.sort((a, b) => (b.getName() === BUILD.TAB.dir) - (a.getName() === BUILD.TAB.dir));
    doomed.forEach((sh, i) => {
      b_retry_(() => ss.deleteSheet(sh), 'deleting a tab');
      if (i % 5 === 4) { SpreadsheetApp.flush(); Utilities.sleep(300); }
    });
    SpreadsheetApp.flush();
    Utilities.sleep(1500);
  }
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  const res = b_build_(ss, src);
  b_popup_(res.built, res.checks, doomed.length);
}

/* Builds every tab from Personnel. Called by buildDatabase after the clean-up. */
function b_build_(ss, src) {
  const T = BUILD.TAB;

  /* ── 1. Read Personnel by column NAME ── */
  const all = src.getDataRange().getValues();
  const C = b_columns_(all[0].map(h => String(h).trim()));
  const rows = all.slice(1).filter(r => r.some(v => String(v).trim() !== ''));
  const asOf = rows.map(r => r[C.asOf]).find(b_isDate_);
  const payYear = asOf ? asOf.getFullYear() : new Date().getFullYear();

  const offices = new Map(), positions = new Map(), monthly = new Map(), daily = new Map(), tins = new Map();
  const oldCode = new Map(), unmapped = new Set();
  const D = { emp: [], ids: [], elig: [], edu: [], pwd: [], hist: [], pd: [], cd: [], seats: [] };
  const L = { suspect: [], mismatch: [], missingTin: [], missingDate: [], natureOdd: [], promoBefore: [], movement: [], startRows: [] };
  let nEmp = 0, nEntry = 0;
  const nextEntry = () => BUILD.ENTRY_PREFIX + String(++nEntry).padStart(BUILD.ENTRY_DIGITS, '0');

  rows.forEach(r => {
    const rid = b_rid_(r[C.id]);
    const isPl = b_s_(r[C.type]).toLowerCase() === 'plantilla';
    const rawOrg = r[C.org], title = b_s_(r[C.title]), sg = b_num_(r[C.sg]);
    const mapped = BUILD.OFFICE_CODES[String(rawOrg).trim()];
    const org = rawOrg === '' ? '' : (mapped || rawOrg);
    if (rawOrg !== '' && !mapped && Object.keys(BUILD.OFFICE_CODES).length) unmapped.add(String(rawOrg));
    if (org !== '') oldCode.set(org, rawOrg);
    const hasPerson = !!(b_s_(r[C.last]) || b_s_(r[C.first]));

    if (org !== '') b_tally_(b_sub_(offices, org), b_s_(r[C.office]), rid);
    if (title) {
      if (!positions.has(title)) positions.set(title, { sg: new Map(), level: new Map(), occ: '' });
      const p = positions.get(title);
      b_tally_(p.sg, sg, rid); b_tally_(p.level, b_num_(r[C.level]), rid);
      if (!p.occ) p.occ = b_s_(r[C.occ]);
    }
    if (isPl) {
      const m = b_num_(r[C.monthly]), a = b_num_(r[C.annual]), st = b_num_(r[C.step]);
      let bad = false;
      if (m !== '' && a !== '' && Math.abs(m * 12 - a) > 12) { if (m >= a * 0.5) { bad = true; L.suspect.push(rid); } else L.mismatch.push(rid); }
      else if (m !== '' && a === '' && m > 300000) { bad = true; L.suspect.push(rid); }
      if (!bad && hasPerson && m !== '' && st !== '' && sg !== '') b_tally_(b_sub_(monthly, sg + '|' + st), m, rid);
      if (b_s_(r[C.item])) D.seats.push([b_s_(r[C.item]), title, org, b_s_(r[C.func]), m]);
    } else {
      const d = b_num_(r[C.daily]);
      if (d !== '' && sg !== '') b_tally_(b_sub_(daily, sg), d, rid);
    }
    if (!hasPerson) return;

    /* People */
    const eid = BUILD.EMP_PREFIX + String(++nEmp).padStart(BUILD.EMP_DIGITS, '0');
    const tin = b_s_(r[C.tin]);
    if (!tin) L.missingTin.push(rid); else b_tally_(tins, tin, rid);
    D.emp.push([eid, rid, b_s_(r[C.last]), b_s_(r[C.first]), b_s_(r[C.mid]), b_s_(r[C.suf]), b_s_(r[C.sex]),
      b_isDate_(r[C.dob]) ? r[C.dob] : '', tin, '']);
    if (b_s_(r[C.pagibig])) D.ids.push([eid, 'Pag-IBIG', b_s_(r[C.pagibig])]);
    if (b_s_(r[C.phil])) D.ids.push([eid, 'PhilHealth', b_s_(r[C.phil])]);
    const el = b_s_(r[C.elig]);
    if (el && el.toLowerCase() !== 'none') D.elig.push([eid, el, '', '', '']);
    if (b_s_(r[C.cpe])) D.elig.push([eid, 'CPE', b_s_(r[C.cpe]), '', 'Career Professional Examination']);
    if (b_s_(r[C.degree])) D.edu.push([eid, b_s_(r[C.degree]), '', '']);
    if (b_s_(r[C.pwdType]) || b_s_(r[C.pwdId])) D.pwd.push([eid, b_s_(r[C.pwdType]), b_s_(r[C.pwdId]), '']);

    /* Jobs */
    const start = b_isDate_(r[C.start]) ? r[C.start] : '';
    const promo = b_isDate_(r[C.promo]) ? r[C.promo] : '';
    const remarks = b_s_(r[C.remarks]);
    const ref = rid + ' · ' + b_s_(r[C.ref]);
    if (/reassign|\bOIC\b|designat/i.test(remarks)) L.movement.push(rid);
    let date;
    if (isPl) {
      const nature = b_s_(r[C.nature]);
      date = start || promo;
      if (start && promo && promo.getTime() > start.getTime()) {
        D.hist.push([nextEntry(), eid, start, 'Start of service', '', '', '', '',
          'Start date from the old sheet. The first position and office were not recorded there; fill them in from the 201 file.', ref]);
        L.startRows.push(rid);
        date = promo;
        if (/original/i.test(nature)) L.natureOdd.push(rid);
      } else if (start && promo && promo.getTime() < start.getTime()) L.promoBefore.push(rid);
      const e = nextEntry();
      D.hist.push([e, eid, date, nature, b_s_(r[C.appt]), org, title, b_order_(remarks), remarks, ref]);
      D.pd.push([e, b_s_(r[C.item]), b_num_(r[C.step])]);
    } else {
      date = start;
      const e = nextEntry();
      D.hist.push([e, eid, date, 'Contract (CoS / JO)', b_s_(r[C.appt]) || BUILD.COS_STATUS, org, title, b_order_(remarks), remarks, ref]);
      D.cd.push([e, b_num_(r[C.daily]), b_s_(r[C.work]), b_s_(r[C.fund]), b_s_(r[C.tech])]);
    }
    if (!date) L.missingDate.push(rid);
  });

  /* ── 2. Lookup lists ── */
  const offRows = Array.from(offices.entries()).sort((a, b) => b_cmp_(oldCode.get(a[0]), oldCode.get(b[0])))
    .map(e => [e[0], b_best_(e[1]).value, oldCode.get(e[0]) === e[0] ? '' : oldCode.get(e[0])]);
  const posRows = [], posConflicts = [];
  Array.from(positions.keys()).sort().forEach(t => {
    const p = positions.get(t), s = b_best_(p.sg), l = b_best_(p.level);
    posRows.push([t, s.value, l.value, p.occ]);
    if (s.others.length || l.others.length) posConflicts.push(t + ' (' + s.others.concat(l.others).join(', ') + ')');
  });
  const payRows = [], payConflicts = [], dailyOutliers = [];
  monthly.forEach((tally, k) => {
    const g = k.split('|').map(Number), b = b_best_(tally);
    payRows.push([payYear, 'Monthly', g[0], g[1], b.value, 'Seen in ' + b.n + ' filled seat' + (b.n === 1 ? '' : 's')]);
    payConflicts.push.apply(payConflicts, b.others);
  });
  daily.forEach((tally, sg) => {
    const b = b_best_(tally);
    payRows.push([BUILD.DAILY_RATE_YEAR || payYear, 'Daily', sg, '', b.value, 'Seen in ' + b.n + ' contract' + (b.n === 1 ? '' : 's')]);
    dailyOutliers.push.apply(dailyOutliers, b.others);
  });
  payRows.sort((a, b) => b_cmp_(b[1], a[1]) || a[2] - b[2] || (a[3] || 0) - (b[3] || 0));
  const dupTins = Array.from(tins.values()).filter(ids => ids.length > 1).map(ids => ids.join(' & '));
  const eligList = Array.from(new Set(D.elig.map(e => e[1]))).sort();

  /* ── 3. Things to double-check ── */
  const checks = [];
  const add = (what, todo, ids) => { if (ids.length) checks.push([what, ids.join(', '), todo]); };
  add('Monthly salary looks like a yearly amount', 'Left out of Pay Rates. Check the appointment papers.', L.suspect);
  add('Monthly × 12 doesn\'t equal the annual salary', 'One of the two numbers is off.', L.mismatch);
  add('Same grade and step, different monthly salary', 'Pay Rates kept the most common amount. Check these seats.', payConflicts);
  add('Daily rate differs from others with the same salary grade', 'Pay Rates kept the most common rate. Check this contract.', dailyOutliers);
  add('Job title with more than one salary grade or level', 'Positions kept the most common one.', posConflicts);
  add('Same TIN on two different people', 'One of them is wrong. Check their BIR records.', dupTins);
  add('No TIN', 'Fill in Employees → TIN.', L.missingTin);
  add('No start date', 'Fill in the Effective Date in Service History.', L.missingDate);
  add('Marked "Original (New)" but also has a later promotion date', 'Check the Change Type of their newer Service History row.', L.natureOdd);
  add('Promotion date is earlier than the start date', 'One of the two dates is off.', L.promoBefore);
  add('Reassignment or OIC written only in Remarks', 'Record each one as its own Service History entry (Reassignment or Designation) with its date.', L.movement);
  add('"Start of service" rows with no position', 'Fill in their first position and office from the 201 file when you can.', L.startRows);
  if (unmapped.size) checks.push(['Org Code with no new office code', Array.from(unmapped).join(', '), 'Add it to BUILD.OFFICE_CODES at the top and run again, or rename it in Offices.']);
  const tz = ss.getSpreadsheetTimeZone();
  if (tz !== 'Asia/Manila') checks.push(['Spreadsheet time zone is ' + tz, '', 'File → Settings → Time zone → (GMT+08:00) Manila.']);

  /* ── 4. Make every tab first, so formulas and dropdowns can find each other ── */
  const S = {};
  [['emp', 'people'], ['ids', 'people'], ['emails', 'people'], ['elig', 'people'], ['edu', 'people'], ['pwd', 'people'], ['names', 'people'],
   ['hist', 'jobs'], ['pd', 'jobs'], ['cd', 'jobs'], ['seats', 'seats'], ['pos', 'lookup'], ['off', 'lookup'], ['pay', 'lookup'],
   ['dir', 'view'], ['users', 'system'], ['log', 'system'], ['notes', 'system']]
    .forEach(p => { S[p[0]] = b_newTab_(ss, T[p[0]], BUILD.COLOR[p[1]]); });
  SpreadsheetApp.flush();

  const me = b_me_();
  const F = 'mm/dd/yyyy';
  b_fill_(S.emp, ['Employee Number', 'Old Record ID', 'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Sex', 'Birthday', 'TIN', 'Photo Link'],
    D.emp, { text: [1, 2, 9], fmt: { 8: F }, note: 'One row per person. Only facts that never repeat for a person live here.' });
  b_fill_(S.ids, ['Employee Number', 'ID Type', 'ID Number'], D.ids, { text: [1, 3], note: 'One row per government ID. Add GSIS, SSS or UMID as new rows.' });
  b_fill_(S.emails, ['Employee Number', 'Email', 'Active'], [], { text: [1], note: 'One row per email address. Mark exactly one as Active = Yes; that is the email the system uses.' });
  b_fill_(S.elig, ['Employee Number', 'Eligibility / Exam', 'Result', 'Date', 'Notes'], D.elig,
    { text: [1], fmt: { 4: F }, note: 'One row per eligibility or exam. A person with two eligibilities has two rows. No row means none.' });
  b_fill_(S.edu, ['Employee Number', 'Degree / Course', 'School', 'Year Graduated'], D.edu, { text: [1], note: 'One row per degree or course.' });
  b_fill_(S.pwd, ['Employee Number', 'PWD Type', 'With PWD ID', 'PWD ID No.'], D.pwd, { text: [1, 4], note: 'Only for persons with disability.' });
  b_fill_(S.names, ['Change ID', 'Employee Number', 'Old Last Name', 'New Last Name', 'Date Effective', 'Reason', 'Document / Reference'], [],
    { text: [1, 2], fmt: { 5: F }, note: 'One row per last-name change. Employees keeps the current name; old names stay here.' });
  b_fill_(S.hist, ['Entry ID', 'Employee Number', 'Effective Date', 'Change Type', 'Appointment Status', 'Office Code', 'Position Title',
    'Order / Reference', 'Remarks', 'Source Reference'], D.hist,
    { text: [1, 2, 6], fmt: { 3: F }, note: 'One row per job change. Never edit old rows; add a new one. The newest row is the person\'s current job. Office Code here = where the person actually works (their assignment); the plantilla seat\'s own office stays in Plantilla Seats.' });
  b_fill_(S.pd, ['Entry ID', 'Item Number', 'Salary Step'], D.pd, { text: [1, 2], note: 'Extra details for plantilla entries in Service History (same Entry ID).' });
  b_fill_(S.cd, ['Entry ID', 'Daily Rate (PHP)', 'Nature of Work', 'Source of Fund', 'Technical / Non-Technical'], D.cd,
    { text: [1], fmt: { 2: '#,##0.00' }, note: 'Extra details for Contract of Service / Job Order entries in Service History (same Entry ID).' });
  b_fill_(S.seats, ['Item Number', 'Position Title', 'Office Code', 'Functional Title', 'Authorized Monthly (PHP)'], D.seats,
    { text: [1, 3], fmt: { 5: '#,##0' }, note: 'One row per plantilla item number. Filled or vacant is worked out from Service History.' });
  b_fill_(S.pos, ['Position Title', 'Salary Grade', 'Level', 'Occupational Group'], posRows, { note: 'One row per job title.' });
  b_fill_(S.off, ['Office Code', 'Office Name', 'Old Org Code'], offRows,
    { text: [1], note: 'One row per office. Office Code is what every other tab stores. To rename a code, use changeOfficeCodes so every tab changes together.' });
  b_fill_(S.pay, ['Year', 'Pay Type', 'Salary Grade', 'Step', 'Rate (PHP)', 'Notes'], payRows,
    { fmt: { 5: '#,##0.00' }, note: 'Salary by year. Monthly = plantilla (grade + step). Daily = contracts (grade). Add new rows each year.' });
  b_fill_(S.users, ['Email', 'Name', 'Role', 'Active'], me ? [[me, '', 'Admin', 'Yes']] : [],
    { note: 'Who can use the web app. Admin and Editor can save changes; Viewer can only look. Active = No switches someone off without deleting them.' });
  b_fill_(S.log, ['Timestamp', 'User', 'Action', 'Record', 'Details'], [[new Date(), me || 'builder', 'Database built', '', 'buildDatabase v2 from the ' + BUILD.SOURCE_TAB + ' tab']],
    { fmt: { 1: 'yyyy-mm-dd hh:mm' }, note: 'Every save from the web app is written here.' });

  /* ── 5. Directory view: formulas only ── */
  b_directory_(S.dir);

  /* ── 6. Dropdowns ── */
  const inRange = (sh, a1) => SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(a1), true).setAllowInvalid(false).build();
  const inList = (list, strict) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(!strict).build();
  const empIds = inRange(S.emp, 'A2:A');
  b_rule_(S.emp, 1, SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=COUNTIF($A$2:$A,A2)=1').setAllowInvalid(false)
    .setHelpText('Each Employee Number can only be used once.').build());
  b_rule_(S.emp, 7, inList(['M', 'F'], true));
  b_rule_(S.ids, 1, empIds); b_rule_(S.ids, 2, inList(BUILD.ID_TYPES, false));
  b_rule_(S.elig, 1, empIds); b_rule_(S.elig, 2, inList(eligList.length ? eligList : ['RA 1080'], false));
  b_rule_(S.edu, 1, empIds);
  b_rule_(S.pwd, 1, empIds); b_rule_(S.pwd, 3, inList(['Y', 'N'], true));
  b_rule_(S.names, 2, empIds); b_rule_(S.names, 6, inList(BUILD.NAME_REASONS, false));
  b_rule_(S.hist, 2, empIds); b_rule_(S.hist, 4, inList(BUILD.CHANGE_TYPES, true)); b_rule_(S.hist, 5, inList(BUILD.APPT_STATUSES, true));
  b_rule_(S.hist, 6, inRange(S.off, 'A2:A')); b_rule_(S.hist, 7, inRange(S.pos, 'A2:A'));
  b_rule_(S.pd, 1, inRange(S.hist, 'A2:A')); b_rule_(S.pd, 2, inRange(S.seats, 'A2:A'));
  b_rule_(S.cd, 1, inRange(S.hist, 'A2:A'));
  b_rule_(S.seats, 2, inRange(S.pos, 'A2:A')); b_rule_(S.seats, 3, inRange(S.off, 'A2:A'));
  b_rule_(S.pay, 2, inList(['Monthly', 'Daily'], true));
  b_rule_(S.users, 3, inList(BUILD.ROLES, true));
  b_rule_(S.users, 4, inList(['Yes', 'No'], true));
  b_rule_(S.emails, 1, empIds); b_rule_(S.emails, 3, inList(['Yes', 'No'], true));

  /* ── 7. Build Notes ── */
  const built = [
    [T.emp, D.emp.length, 'People'], [T.ids, D.ids.length, 'People'], [T.emails, 0, 'People'], [T.elig, D.elig.length, 'People'], [T.edu, D.edu.length, 'People'],
    [T.pwd, D.pwd.length, 'People'], [T.names, 0, 'People'], [T.hist, D.hist.length, 'Jobs'], [T.pd, D.pd.length, 'Jobs'],
    [T.cd, D.cd.length, 'Jobs'], [T.seats, D.seats.length, 'Lookup'], [T.pos, posRows.length, 'Lookup'], [T.off, offRows.length, 'Lookup'],
    [T.pay, payRows.length, 'Lookup'], [T.dir, D.emp.length, 'View (formulas)']
  ];
  b_notes_(S.notes, ss, rows.length, built, checks);
  S.emp.activate();
  return { built: built, checks: checks };
}

/* ───────────────────────── Directory view ───────────────────────── */

function b_directory_(sh) {
  const T = BUILD.TAB, q = n => "'" + n + "'!";
  const E = q(T.emp), H = q(T.hist), PD = q(T.pd), CD = q(T.cd), O = q(T.off), P = q(T.pos), R = q(T.pay), N = q(T.names),
        EL = q(T.elig), SE = q(T.seats), EM = q(T.emails);
  const A = '$A$2:$A';
  const iff = (ref, body) => '=ARRAYFORMULA(IF(' + ref + '="","",IFERROR(' + body + ',"")))';
  const latest = k => 'VLOOKUP(' + A + ',SORT(' + H + '$B$2:$J,2,FALSE),' + k + ',FALSE)';
  // Column letters: A no. · B name · C old ID · D age · E senior · F status · G/H assigned office · I position · J item
  // K plantilla office · L grade · M step · N monthly · O daily · P start · Q years · R email · S old names · T eligibilities · U latest entry
  const cols = [
    ['Employee Number', '=IFERROR(FILTER(' + E + '$A$2:$A,' + E + '$A$2:$A<>""),"")'],
    ['Full Name', iff(A, 'VLOOKUP(' + A + ',{' + E + '$A$2:$A,' + E + '$C$2:$C&", "&' + E + '$D$2:$D&IF(' + E + '$F$2:$F="",""," "&' + E +
      '$F$2:$F)&IF(' + E + '$E$2:$E="",""," "&LEFT(' + E + '$E$2:$E,1)&".")},2,FALSE)')],
    ['Old Record ID', iff(A, 'VLOOKUP(' + A + ',' + E + '$A$2:$B,2,FALSE)')],
    ['Age', iff(A, 'DATEDIF(VLOOKUP(' + A + ',' + E + '$A$2:$H,8,FALSE),TODAY(),"Y")')],
    ['Senior Citizen', iff('$D$2:$D', 'IF($D$2:$D>=60,"Yes","No")')],
    ['Current Status', iff(A, latest(4))],
    ['Assigned Office Code', iff(A, latest(5))],
    ['Assigned Office', iff('$G$2:$G', 'VLOOKUP($G$2:$G,' + O + '$A$2:$B,2,FALSE)')],
    ['Position', iff(A, latest(6))],
    ['Item No.', iff('$U$2:$U', 'VLOOKUP($U$2:$U,' + PD + '$A$2:$C,2,FALSE)')],
    ['Plantilla Office Code', iff('$J$2:$J', 'VLOOKUP($J$2:$J,' + SE + '$A$2:$C,3,FALSE)')],
    ['Salary Grade', iff('$I$2:$I', 'VLOOKUP($I$2:$I,' + P + '$A$2:$B,2,FALSE)')],
    ['Step', iff('$U$2:$U', 'VLOOKUP($U$2:$U,' + PD + '$A$2:$C,3,FALSE)')],
    ['Monthly Salary', '=ARRAYFORMULA(IF(($A$2:$A="")+($M$2:$M=""),"",IFERROR(VLOOKUP("Monthly|"&$L$2:$L&"|"&$M$2:$M,SORT(FILTER({' +
      R + '$B$2:$B&"|"&' + R + '$C$2:$C&"|"&' + R + '$D$2:$D,' + R + '$E$2:$E,' + R + '$A$2:$A},' + R + '$A$2:$A<>"",' + R +
      '$A$2:$A<=YEAR(TODAY())),3,FALSE),2,FALSE),"")))', '#,##0.00'],
    ['Daily Rate', iff('$U$2:$U', 'VLOOKUP($U$2:$U,' + CD + '$A$2:$B,2,FALSE)'), '#,##0.00'],
    ['Service Start', iff(A, '1/(1/VLOOKUP(' + A + ',SORT(' + H + '$B$2:$C,2,TRUE),2,FALSE))'), 'mm/dd/yyyy'],
    ['Years of Service', iff('$P$2:$P', 'ROUND(DATEDIF($P$2:$P,TODAY(),"M")/12,1)')],
    ['Active Email', '=BYROW(' + A + ',LAMBDA(id,IF(id="","",IFERROR(INDEX(FILTER(' + EM + '$B$2:$B,' + EM + '$A$2:$A=id,' + EM + '$C$2:$C="Yes"),1),""))))'],
    ['Previous Last Names', '=BYROW(' + A + ',LAMBDA(id,IF(id="","",IFERROR(TEXTJOIN(", ",TRUE,FILTER(' + N + '$C$2:$C,' + N + '$B$2:$B=id)),""))))'],
    ['Eligibilities', '=BYROW(' + A + ',LAMBDA(id,IF(id="","",IFERROR(TEXTJOIN(", ",TRUE,FILTER(' + EL + '$B$2:$B,' + EL + '$A$2:$A=id)),""))))'],
    ['Latest Entry ID', iff(A, 'VLOOKUP(' + A + ',SORT({' + H + '$B$2:$B,' + H + '$C$2:$C,' + H + '$A$2:$A},2,FALSE),3,FALSE)')]
  ];
  b_ensureCols_(sh, cols.length);
  sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[0])])
    .setBackground(BUILD.VIEW_HEADER.bg).setFontColor(BUILD.VIEW_HEADER.text).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sh.getRange(1, 1).setNote('VIEW: every cell here is a formula built from the other tabs. Don\'t type here; change the base tabs instead.');
  cols.forEach((c, i) => {
    if (c[2]) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat(c[2]);
    sh.getRange(2, i + 1).setFormula(c[1]);
    sh.setColumnWidth(i + 1, i === 1 ? 240 : (i === 7 || i === 8 || i === 17) ? 220 : 120);
  });
  sh.setFrozenRows(1); sh.setFrozenColumns(2); sh.setRowHeight(1, 36);
}

/* ───────────────────────── tab helpers ───────────────────────── */

function b_newTab_(ss, name, color) {
  const old = ss.getSheetByName(name);
  if (old) old.setName(name + ' (old ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMdd-HHmmss') + ')');
  const sh = b_retry_(() => {
    const made = ss.getSheetByName(name);          // an earlier try may have worked before the error came back
    return made || ss.insertSheet(name, ss.getNumSheets());
  }, 'creating the "' + name + '" tab');
  sh.setTabColor(color);
  return sh;
}

/* Google sometimes answers "Service Spreadsheets failed" when a script changes many tabs quickly.
   Wait a moment and try again (up to 5 times) instead of stopping. */
function b_retry_(fn, what) {
  let last;
  for (let i = 1; i <= 5; i++) {
    try { return fn(); } catch (e) {
      last = e;
      if (!/Service Spreadsheets|timed out|Internal error|try again|Service error/i.test(String(e && e.message))) throw e;
      SpreadsheetApp.flush();
      Utilities.sleep(800 * i * i);
    }
  }
  throw new Error('Google Sheets is busy (' + what + '). Wait a minute, then run buildDatabase again. Details: ' + (last && last.message));
}

function b_fill_(sh, headers, data, cfg) {
  cfg = cfg || {};
  b_ensureRows_(sh, data.length + 200);
  b_ensureCols_(sh, headers.length);
  const body = sh.getMaxRows() - 1;
  (cfg.text || []).forEach(c => sh.getRange(2, c, body, 1).setNumberFormat('@'));
  Object.keys(cfg.fmt || {}).forEach(c => sh.getRange(2, Number(c), body, 1).setNumberFormat(cfg.fmt[c]));
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground(BUILD.HEADER.bg).setFontColor(BUILD.HEADER.text).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  if (cfg.note) sh.getRange(1, 1).setNote(cfg.note);
  if (data.length) b_retry_(() => sh.getRange(2, 1, data.length, headers.length).setValues(data), 'writing ' + sh.getName());
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);
  sh.autoResizeColumns(1, headers.length);
  for (let c = 1; c <= headers.length; c++) sh.setColumnWidth(c, Math.min(Math.max(sh.getColumnWidth(c), 100), 320));
  const extra = sh.getMaxColumns() - headers.length;
  if (extra > 0) sh.deleteColumns(headers.length + 1, extra);   // thin tables: no empty columns to the right
}

function b_rule_(sh, col, rule) { sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule); }
function b_ensureRows_(sh, n) { const need = n + 1 - sh.getMaxRows(); if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need); }
function b_ensureCols_(sh, n) { const need = n - sh.getMaxColumns(); if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need); }
function b_me_() { try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; } }

function b_notes_(sh, ss, srcRows, built, checks) {
  b_ensureCols_(sh, 3);
  const out = [];
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMMM d, yyyy h:mm a');
  out.push(['🏗️ Build Notes (v2)', '', '']);
  out.push(['Built ' + stamp + ' from the "' + BUILD.SOURCE_TAB + '" tab (' + srcRows + ' rows). That tab was not changed.', '', '']);
  out.push(['', '', '']);
  out.push(['WHAT WAS BUILT', 'Rows', 'Group']);
  built.forEach(b => out.push([b[0], b[1], b[2]]));
  out.push(['', '', '']);
  out.push(['PLEASE CHECK (' + checks.length + ')', 'Old Record IDs', 'What to do']);
  if (!checks.length) out.push(['Nothing to check.', '', '']);
  checks.forEach(c => out.push([c[0], c[1], c[2]]));
  out.push(['', '', '']);
  out.push(['THE RULES OF THIS DATABASE', '', '']);
  [['Each tab holds one kind of thing', 'People facts, IDs, eligibilities, job changes, seats, positions, offices and pay rates each have their own tab.'],
   ['Nothing is typed twice', 'Office names, salary grades and pay are typed once in their lookup tab and linked by code or title.'],
   ['Changes are new rows', 'A promotion, reassignment or contract renewal is a NEW Service History row. Old rows are the history.'],
   ['Entry ID links the details', 'A Service History row and its Plantilla Details or Contract Details row share the same Entry ID.'],
   ['Assignment vs plantilla office', 'Office Code in Service History is where the person works now. A reassignment changes that, while the plantilla seat keeps its own office in Plantilla Seats.'],
   ['Pay by year', 'Pay Rates are looked up by the latest year on or before the date. Add a new year\'s rows when the salary schedule changes.'],
   ['Directory is a view', 'Every cell in Directory is a formula. Read it, don\'t type in it.'],
   ['Use the web app to edit', 'Once App.gs and Index.html are deployed, add and change records from the app so IDs and links are made for you.']]
    .forEach(h => out.push([h[0], h[1], '']));
  sh.getRange(1, 1, out.length, 3).setValues(out).setWrap(true).setVerticalAlignment('top');
  sh.getRange('A1').setFontSize(18).setFontWeight('bold');
  out.forEach((r, i) => {
    if (/^(WHAT WAS BUILT|PLEASE CHECK|THE RULES)/.test(r[0])) sh.getRange(i + 1, 1, 1, 3).setBackground(BUILD.HEADER.bg).setFontColor(BUILD.HEADER.text).setFontWeight('bold');
  });
  sh.setColumnWidth(1, 320); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 460);
}

function b_popup_(built, checks, removed) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cards = built.map(b => '<div class="c"><b>' + esc(b[1]) + '</b><span>' + esc(b[0]) + '</span></div>').join('');
  const list = checks.map(c => '<li><b>' + esc(c[0]) + '</b><br><span>' + esc(c[1] || c[2]) + '</span></li>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0f1419;color:#e8edf2}' +
    'header{padding:18px 20px;border-bottom:1px solid #26303b}h1{margin:0;font-size:18px}p{margin:4px 0 0;color:#8b98a5}' +
    'main{padding:16px 20px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}' +
    '.c{background:#171d24;border:1px solid #26303b;border-radius:10px;padding:10px 12px;display:grid}' +
    '.c b{font-size:20px;color:#4fd1a5}.c span{color:#8b98a5;font-size:12px}' +
    'h2{font-size:14px;margin:18px 0 8px;color:#f5b84b}ul{margin:0;padding-left:18px;display:grid;gap:6px}' +
    'li span{color:#8b98a5;word-break:break-word}button{margin-top:16px;background:#4fd1a5;border:0;color:#07261c;font-weight:700;padding:9px 16px;border-radius:8px;cursor:pointer}' +
    '</style></head><body><header><h1>🏗️ Normalized sheets are ready</h1><p>' + (removed ? 'Removed ' + removed + ' old tab' + (removed === 1 ? '' : 's') + '. ' : '') + 'Personnel was not changed. Details and rules are in 🧠 Build Notes.</p></header>' +
    '<main><div class="g">' + cards + '</div><h2>⚠ ' + checks.length + ' things to double-check</h2><ul>' + list + '</ul>' +
    '<button onclick="google.script.host.close()">Got it</button></main></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(760).setHeight(600), 'Step 2 done');
}

/* ───────────────────────── data helpers ───────────────────────── */

function b_columns_(head) {
  const need = {
    id: 'Record ID', type: 'Employment Type', org: 'Org Code', office: 'Office', title: 'Position Title', func: 'Functional Title',
    sg: 'Salary Grade', item: 'Item Number', appt: 'Appointment Status', last: 'Surname', first: 'First Name',
    mid: 'Middle Name', suf: 'Suffix', sex: 'Sex', dob: 'Date of Birth', tin: 'TIN', pagibig: 'Pag-IBIG No.',
    phil: 'PhilHealth No.', start: 'Service Start Date', promo: 'Date of Last Promotion', nature: 'Nature of Appointment',
    monthly: 'Authorized Monthly Salary (PHP)', annual: 'Actual Annual Salary (PHP)', step: 'Salary Step',
    daily: 'Daily Rate (PHP)', elig: 'Eligibility', cpe: 'CPE', level: 'Level', work: 'Nature of Work',
    occ: 'Occupational Group', fund: 'Source of Fund', tech: 'Technical / Non-Technical', pwdType: 'PWD Type',
    pwdId: 'With PWD ID', degree: 'Degree / Course', remarks: 'Remarks', asOf: 'Report As Of', ref: 'Source Reference'
  };
  const C = {}, missing = [];
  Object.keys(need).forEach(k => { const i = head.indexOf(need[k]); if (i < 0) missing.push(need[k]); C[k] = i; });
  if (missing.length) throw new Error('These columns are missing from the ' + BUILD.SOURCE_TAB + ' tab: ' + missing.join(', '));
  return C;
}
/* PL-001 → PL0001, CJ-013 → CJ0013 (letters + 4 digits, no dash) */
function b_rid_(v) {
  const t = b_s_(v), m = t.match(/^([A-Za-z]+)\s*-?\s*(\d+)$/);
  return m ? m[1].toUpperCase() + String(Number(m[2])).padStart(BUILD.RECORD_DIGITS, '0') : t;
}
function b_s_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function b_isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
function b_num_(v) {
  if (typeof v === 'number') return v;
  const s = b_s_(v).replace(/,/g, '');
  return s !== '' && !isNaN(Number(s)) ? Number(s) : '';
}
function b_cmp_(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function b_sub_(map, key) { if (!map.has(key)) map.set(key, new Map()); return map.get(key); }
function b_tally_(map, value, id) {
  if (value === '' || value === null || value === undefined) return;
  if (!map.has(value)) map.set(value, []);
  map.get(value).push(id);
}
function b_best_(tally) {
  const e = Array.from(tally.entries()).sort((a, b) => b[1].length - a[1].length);
  if (!e.length) return { value: '', n: 0, others: [] };
  return { value: e[0][0], n: e[0][1].length, others: e.slice(1).reduce((acc, x) => acc.concat(x[1]), []) };
}
function b_order_(text) {
  const m = String(text).match(/(?:BOE\s+)?Office\s+Order(?:\s+No\.?)?\s*\d+,?\s*s\.?\s*(?:of\s*)?\d{4}/i);
  return m ? m[0] : '';
}
