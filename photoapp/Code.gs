/*************************************************************
 * 📸 BOE EMPLOYEE PHOTO UPLOAD — a separate, simple web app
 *
 * Employees pick their office and name, confirm their birthday,
 * give their active email, take or choose a photo, crop it, and
 * save. The photo goes straight into the Photos tab and the email
 * into the Emails tab (as their active email) of the employee
 * database, so HR sees both in the main system right away.
 *
 * SETUP (once)
 *  1. Go to script.google.com → New project → name it "BOE Photo Upload".
 *  2. Paste this whole file into Code.gs.
 *  3. Files ＋ → HTML → name it Index → paste Index.html into it. 💾 Save.
 *  4. Pick "checkSetup" in the function dropdown → ▶ Run → allow access
 *     (it only opens your own employee database). Open "Execution log":
 *     it should list how many offices and employees it found.
 *  5. Deploy → New deployment → ⚙ → Web app
 *       Description:     Photo upload
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     → Deploy → copy the Web app URL. Share that link (or its QR code)
 *     with employees. They don't need a Google account.
 *
 * TO CLOSE THE PAGE for a while: in the database's Settings tab add a row
 *     Photo Upload Page | Closed        (type Open to reopen it)
 *
 * TO UNDO AN UPLOAD: the "Photo Submissions" tab keeps every upload with
 * the photo it replaced. Copy its Previous Photo and Previous Thumb back
 * into that person's row in the Photos tab.
 *************************************************************/

const PU = {
  SHEET_ID: '16J6ai3eoVxcVPr6LgWn4eDVYt5WxvvdHOTKGIlT6Fww',   // the employee database
  CHECK_BIRTHDAY: true,     // employees confirm their birthday before they can fill anything in
  MAX_SAVES_PER_DAY: 3,     // photo changes per employee per day
  MAX_WRONG_TRIES: 5,       // wrong birthdays before that name pauses for 30 minutes
  MAX_IMAGE_CHARS: 49000,   // a Sheets cell holds up to 50,000 characters
  LOG_TAB: 'Photo Submissions',
  // Besides the photo + email, which missing details an employee may fill in. Only BLANK fields are offered.
  ASK_TIN: true, ASK_EDUCATION: true, ASK_HISTORY: true,
  // Reported reassignments/promotions NEVER touch Service History. They go here for HR to verify and enter.
  REPORT_TAB: 'Employee-Reported History'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('BOE Employee Photo Upload')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ▶ Run once from the editor to give permission and check the database link */
function checkSetup() {
  const d = getDirectory();
  const people = d.offices.reduce((n, o) => n + o.people.length, 0);
  const ss = pu_ss_();
  Logger.log('Database: ' + ss.getName());
  Logger.log('Offices with employees: ' + d.offices.length + ' · employees listed: ' + people);
  Logger.log('Photos tab: ' + (ss.getSheetByName('Photos') ? 'found' : 'MISSING. Run upgradeSheets in the main system first.'));
  Logger.log('Education tab: ' + (ss.getSheetByName('Education') ? 'found' : 'MISSING — employees can\'t add education until it exists.'));
  Logger.log('Employees can also fill in: ' + [PU.ASK_TIN ? 'TIN' : '', PU.ASK_EDUCATION ? 'education' : '', PU.ASK_HISTORY ? 'reported history → "' + PU.REPORT_TAB + '" tab' : ''].filter(String).join(', '));
  Logger.log('Page is ' + (d.closed ? 'CLOSED (Settings tab)' : 'open') + '. Birthday check: ' + (PU.CHECK_BIRTHDAY ? 'on' : 'off'));
}

/* What the page needs: offices, and the active employees in each. Only names are sent, nothing else. */
function getDirectory() {
  const ss = pu_ss_();
  const s = pu_settings_(ss);
  const brand = { agency: s['Agency Name'] || 'Bureau of Equipment', department: s['Department'] || 'Department of Public Works and Highways', logo: s['Logo'] || '' };
  if (/^(closed|off|no)$/i.test(s['Photo Upload Page'] || '')) return Object.assign({ closed: true, offices: [] }, brand);
  const latest = pu_latest_(ss);
  const groups = {};
  pu_rows_(ss, 'Employees').forEach(e => {
    const id = pu_empNo_(e['Employee Number']);
    if (!id) return;
    const L = latest[id];
    if (L && L['Change Type'] === 'Separation') return;            // no longer with the bureau
    const code = L ? String(L['Office Code'] || '').trim() : '';
    (groups[code] = groups[code] || []).push({ id: id, name: pu_name_(e) });
  });
  const offices = pu_rows_(ss, 'Offices').map(o => {
    const code = String(o['Office Code']).trim();
    return { code: code, name: String(o['Office Name'] || '').trim(), people: (groups[code] || []).sort((a, b) => a.name.localeCompare(b.name)) };
  }).filter(o => o.people.length);
  if ((groups[''] || []).length) offices.push({ code: '', name: 'Not yet assigned to an office', people: groups[''].sort((a, b) => a.name.localeCompare(b.name)) });
  return Object.assign({ closed: false, checkBirthday: PU.CHECK_BIRTHDAY, offices: offices }, brand);
}

/* Step 1 of saving: prove it's really this employee with their birthday, then tell the page what's
   missing so it can offer only the blank fields. p = { employeeId, birthday: 'yyyy-mm-dd' }.
   Nothing about the person is returned until the birthday matches (or there is none on file). */
function verifyEmployee(p) {
  const ss = pu_ss_(), tz = ss.getSpreadsheetTimeZone();
  if (/^(closed|off|no)$/i.test(pu_settings_(ss)['Photo Upload Page'] || '')) throw new Error('The page is closed right now. Please ask HR.');
  const id = pu_empNo_(p && p.employeeId);
  const emp = pu_rows_(ss, 'Employees').find(e => pu_empNo_(e['Employee Number']) === id);
  if (!emp) throw new Error('We couldn\'t find that name. Please pick it again.');
  if ((pu_latest_(ss)[id] || {})['Change Type'] === 'Separation') throw new Error('This record is no longer active. Please ask HR.');

  const onFile = pu_day_(emp['Birthday'], tz), given = pu_day_(p && p.birthday, tz);
  let needBirthday = false;
  if (onFile) {
    const cache = CacheService.getScriptCache(), badKey = 'pu-bad-' + id, bad = Number(cache.get(badKey) || 0);
    if (bad >= PU.MAX_WRONG_TRIES) throw new Error('Too many wrong birthdays for this name. Please wait 30 minutes, or ask HR for help.');
    if (given !== onFile) {
      cache.put(badKey, String(bad + 1), 1800);
      const left = PU.MAX_WRONG_TRIES - bad - 1;
      throw new Error('That birthday doesn\'t match our records.' + (left > 0 ? ' Please check it (' + left + (left === 1 ? ' try' : ' tries') + ' left).' : ' Please wait 30 minutes, or ask HR for help.'));
    }
    cache.remove(badKey);
  } else {
    if (!given) throw new Error('Please enter your birthday.');
    needBirthday = true;   // nothing on file to check against; they'll set it
  }
  // Their own data, shown only now that the birthday is confirmed.
  const education = pu_rows_(ss, 'Education').filter(r => pu_empNo_(r['Employee Number']) === id)
    .map(r => ({ degree: pu_s_(r['Degree / Course']), school: pu_s_(r['School']), year: pu_s_(r['Year Graduated']) }));
  const history = pu_rows_(ss, 'Service History').filter(r => pu_empNo_(r['Employee Number']) === id)
    .map(r => ({ date: pu_day_(r['Effective Date'], tz), type: pu_s_(r['Change Type']), position: pu_s_(r['Position Title']), office: pu_officeName_(ss, r['Office Code']) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    ok: true, first: pu_s_(emp['First Name']), name: pu_name_(emp), needBirthday: needBirthday,
    ask: { tin: !!PU.ASK_TIN, education: !!PU.ASK_EDUCATION, history: !!PU.ASK_HISTORY },
    tinOnFile: pu_s_(emp['TIN']) !== '',           // if already filled, the page shows it read-only
    education: education, history: history
  };
}

/* Step 2: save the photo and whatever missing details the employee filled in. Birthday is re-checked here
   (this call is the one that writes). Only BLANK fields are written; reported history goes to the review tab.
   p = { employeeId, birthday, email, photo, thumb, tin, education:[{degree,school,year}], reported:[{date,type,details,order}] } */
function submitRecord(p) {
  const ss = pu_ss_(), tz = ss.getSpreadsheetTimeZone();
  if (/^(closed|off|no)$/i.test(pu_settings_(ss)['Photo Upload Page'] || '')) throw new Error('The page is closed right now. Please ask HR.');
  const id = pu_empNo_(p && p.employeeId);
  const emp = pu_rows_(ss, 'Employees').find(e => pu_empNo_(e['Employee Number']) === id);
  if (!emp) throw new Error('We couldn\'t find that name. Please pick it again.');
  const L = pu_latest_(ss)[id];
  if (L && L['Change Type'] === 'Separation') throw new Error('This record is no longer active. Please ask HR.');

  const cache = CacheService.getScriptCache();
  const onFile = pu_day_(emp['Birthday'], tz), given = pu_day_(p.birthday, tz);
  let check = 'Birthday not checked';
  if (PU.CHECK_BIRTHDAY) {
    if (onFile) {
      const badKey = 'pu-bad-' + id, bad = Number(cache.get(badKey) || 0);
      if (bad >= PU.MAX_WRONG_TRIES) throw new Error('Too many wrong birthdays for this name. Please wait 30 minutes, or ask HR for help.');
      if (given !== onFile) {
        cache.put(badKey, String(bad + 1), 1800);
        const left = PU.MAX_WRONG_TRIES - bad - 1;
        throw new Error('That birthday doesn\'t match our records.' + (left > 0 ? ' Please check it (' + left + (left === 1 ? ' try' : ' tries') + ' left).' : ' Please wait 30 minutes, or ask HR for help.'));
      }
      cache.remove(badKey); check = 'Birthday matched';
    } else {
      if (!given) throw new Error('Please enter your birthday.');
      check = 'No birthday on file — set from this form';
    }
  }

  const email = String(p.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email doesn\'t look right. Please check it.');
  const hasPhoto = !!(p.photo && String(p.photo).trim());
  if (hasPhoto) { pu_image_(p.photo, 'The photo'); pu_image_(p.thumb, 'The small photo'); }

  const tin = PU.ASK_TIN ? String(p.tin || '').trim() : '';
  if (tin && !/^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/.test(tin)) throw new Error('TIN should look like 123-456-789.');
  const edu = PU.ASK_EDUCATION ? (p.education || []).map(x => ({ degree: pu_s_(x.degree), school: pu_s_(x.school), year: pu_s_(x.year) })).filter(x => x.degree || x.school) : [];
  edu.forEach(x => { if (x.year && !/^\d{4}$/.test(x.year)) throw new Error('Year graduated should be four digits, like 2015. Got: ' + x.year); });
  const rep = PU.ASK_HISTORY ? (p.reported || []).map(x => ({ date: pu_day_(x.date, tz) || pu_s_(x.date), type: pu_s_(x.type), details: pu_s_(x.details), order: pu_s_(x.order) })).filter(x => x.type || x.details) : [];

  const setBirthday = onFile === '' && !!given;
  const setTin = !!tin && pu_s_(emp['TIN']) === '';
  if (!hasPhoto && !email && !setTin && !edu.length && !rep.length && !setBirthday)
    throw new Error('Nothing to save yet. Add your photo or some details first.');

  if (hasPhoto) {
    const upKey = 'pu-up-' + id + '-' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), ups = Number(cache.get(upKey) || 0);
    if (ups >= PU.MAX_SAVES_PER_DAY) throw new Error('This photo was already changed ' + ups + ' times today. Please try again tomorrow.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Many people are saving right now. Please try again in a few seconds.');
  const did = [];
  try {
    const prev = pu_prevPhoto_(ss, id);
    if (hasPhoto) { pu_savePhotoRow_(ss, id, p.photo, p.thumb); did.push('photo'); }
    if (email) { pu_setEmail_(ss, id, email); did.push('email'); }
    if (setBirthday) { pu_setEmpField_(ss, id, 'Birthday', pu_dateObj_(given)); did.push('birthday'); }
    if (setTin) { pu_setEmpField_(ss, id, 'TIN', tin); did.push('TIN'); }
    if (edu.length) { const n = pu_addEducation_(ss, id, edu); if (n) did.push(n + ' education'); }
    if (rep.length) { pu_addReported_(ss, id, pu_name_(emp), rep); did.push(rep.length + ' reported history (for HR review)'); }

    const officeName = pu_officeName_(ss, L ? L['Office Code'] : '');
    const log = pu_logTab_(ss), lr = log.getLastRow() + 1;
    log.getRange(lr, 2).setNumberFormat('@');
    log.getRange(lr, 1, 1, 8).setValues([[new Date(), id, pu_name_(emp), officeName,
      check + (did.length ? ' · saved: ' + did.join(', ') : ''), email || '(none given)', prev.photo, prev.thumb]]);
    const cl = ss.getSheetByName('Change Log');
    if (cl) cl.appendRow([new Date(), 'photo page (employee)', 'Self-service update', id, pu_name_(emp) + ' · ' + check + ' · ' + (did.join(', ') || 'nothing')]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (hasPhoto) { const upKey = 'pu-up-' + id + '-' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); cache.put(upKey, String(Number(cache.get(upKey) || 0) + 1), 86400); }
  return { ok: true, first: pu_s_(emp['First Name']), saved: did };
}

/* Older name kept working in case a page is still calling it. */
function submitPhoto(p) { return submitRecord(p); }

/* ───────────────────────── helpers ───────────────────────── */

function pu_ss_() { return SpreadsheetApp.openById(PU.SHEET_ID); }

function pu_rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing from the employee database.');
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const head = v[0].map(h => String(h).trim());
  return v.slice(1).filter(r => String(r[0]).trim() !== '').map(r => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
}

function pu_settings_(ss) {
  const out = {};
  if (!ss.getSheetByName('Settings')) return out;
  pu_rows_(ss, 'Settings').forEach(r => { out[String(r['Key']).trim()] = String(r['Value'] === undefined ? '' : r['Value']).trim(); });
  return out;
}

/* Each person's newest Service History row (same order as the main system: newest date first, blank dates last) */
function pu_latest_(ss) {
  const t = d => Object.prototype.toString.call(d) === '[object Date]' ? d.getTime() : (d ? new Date(d).getTime() : -Infinity);
  const out = {};
  pu_rows_(ss, 'Service History').forEach(h => {
    const id = pu_empNo_(h['Employee Number']), cur = out[id];
    if (!cur) { out[id] = h; return; }
    const a = t(h['Effective Date']), b = t(cur['Effective Date']);
    if (a > b || (a === b && String(h['Entry ID']) > String(cur['Entry ID']))) out[id] = h;
  });
  return out;
}

function pu_officeName_(ss, code) {
  code = String(code || '').trim(); if (!code) return '';
  const o = pu_rows_(ss, 'Offices').find(r => String(r['Office Code']).trim() === code);
  return o ? code + ' · ' + String(o['Office Name']).trim() : code;
}

function pu_logTab_(ss) {
  let sh = ss.getSheetByName(PU.LOG_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(PU.LOG_TAB, ss.getNumSheets());
  sh.setTabColor('#F26522');
  const head = ['Timestamp', 'Employee Number', 'Name', 'Office', 'Check', 'Email Given', 'Previous Photo', 'Previous Thumb'];
  if (sh.getMaxColumns() > head.length) sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#14223a').setFontColor('#ffffff');
  sh.getRange(1, 1).setNote('Every photo saved from the employee photo page. To undo one, copy its Previous Photo and Previous Thumb back into that person\'s row in the Photos tab.');
  sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.setFrozenRows(1);
  sh.setColumnWidth(7, 140); sh.setColumnWidth(8, 140);
  return sh;
}

/* Make this email the person's active one in the Emails tab; their other emails stay, marked not active */
function pu_setEmail_(ss, id, email) {
  const sh = ss.getSheetByName('Emails');
  if (!sh) return;
  const v = sh.getDataRange().getValues(), head = v[0].map(h => String(h).trim());
  const cId = head.indexOf('Employee Number'), cEm = head.indexOf('Email'), cAc = head.indexOf('Active');
  if (cId < 0 || cEm < 0 || cAc < 0) return;
  let found = false;
  for (let i = 1; i < v.length; i++) {
    if (pu_empNo_(v[i][cId]) !== id) continue;
    const same = String(v[i][cEm]).trim().toLowerCase() === email;
    if (same) found = true;
    const want = same ? 'Yes' : 'No';
    if (String(v[i][cAc]).trim() !== want) sh.getRange(i + 1, cAc + 1).setValue(want);
  }
  if (!found) {
    const row = sh.getLastRow() + 1;
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
    const vals = head.map(h => h === 'Employee Number' ? id : h === 'Email' ? email : h === 'Active' ? 'Yes' : '');
    sh.getRange(row, cId + 1).setNumberFormat('@');
    sh.getRange(row, 1, 1, head.length).setValues([vals]);
  }
}

function pu_name_(e) {
  const s = v => String(v === undefined || v === null ? '' : v).trim();
  return s(e['Last Name']) + ', ' + s(e['First Name']) + (s(e['Suffix']) ? ' ' + s(e['Suffix']) : '') + (s(e['Middle Name']) ? ' ' + s(e['Middle Name']).charAt(0) + '.' : '');
}

function pu_day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : '';
}

function pu_empNo_(v) {
  const t = String(v === undefined || v === null ? '' : v).trim();
  return /^\d+$/.test(t) ? t.padStart(4, '0') : t;
}

function pu_image_(dataUrl, label) {
  const v = String(dataUrl || '');
  if (!/^data:image\/jpeg;base64,/.test(v)) throw new Error(label + ' didn\'t come through. Please choose the picture again.');
  if (v.length > PU.MAX_IMAGE_CHARS) throw new Error(label + ' is too big. Please try a different picture.');
}

function pu_s_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function pu_dateObj_(iso) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : iso; }

/* The photo/thumb currently on file (before this save), for the undo column in the log */
function pu_prevPhoto_(ss, id) {
  const sh = ss.getSheetByName('Photos'); if (!sh) return { photo: '', thumb: '' };
  const v = sh.getDataRange().getValues(), head = v[0].map(h => String(h).trim());
  const cId = head.indexOf('Employee Number'), cP = head.indexOf('Photo'), cT = head.indexOf('Thumb');
  for (let i = 1; i < v.length; i++) if (pu_empNo_(v[i][cId]) === id) return { photo: cP >= 0 ? (v[i][cP] || '') : '', thumb: cT >= 0 ? (v[i][cT] || '') : '' };
  return { photo: '', thumb: '' };
}
function pu_savePhotoRow_(ss, id, photo, thumb) {
  const sh = ss.getSheetByName('Photos');
  if (!sh) throw new Error('Photos are not set up yet. Please tell HR.');
  const v = sh.getDataRange().getValues(), head = v[0].map(h => String(h).trim());
  const c = name => head.indexOf(name);
  if (c('Employee Number') < 0 || c('Photo') < 0 || c('Thumb') < 0) throw new Error('The Photos tab has unexpected columns. Please tell HR.');
  let row = -1;
  for (let i = 1; i < v.length; i++) if (pu_empNo_(v[i][c('Employee Number')]) === id) { row = i + 1; break; }
  if (row < 0) {
    row = sh.getLastRow() + 1;
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
    sh.getRange(row, c('Employee Number') + 1).setNumberFormat('@').setValue(id);
  }
  sh.getRange(row, c('Photo') + 1).setValue(photo);
  sh.getRange(row, c('Thumb') + 1).setValue(thumb);
  if (c('Updated') >= 0) sh.getRange(row, c('Updated') + 1).setValue(new Date());
}
/* Set one cell on this employee's Employees row (used only when the field was blank) */
function pu_setEmpField_(ss, id, col, value) {
  const sh = ss.getSheetByName('Employees'); if (!sh) return;
  const v = sh.getDataRange().getValues(), head = v[0].map(h => String(h).trim());
  const cId = head.indexOf('Employee Number'), cX = head.indexOf(col);
  if (cId < 0 || cX < 0) return;
  for (let i = 1; i < v.length; i++) if (pu_empNo_(v[i][cId]) === id) {
    const cell = sh.getRange(i + 1, cX + 1);
    if (col === 'TIN') cell.setNumberFormat('@');
    cell.setValue(value);
    return;
  }
}
/* Append the employee's new education entries, skipping any already on file. Returns how many were added. */
function pu_addEducation_(ss, id, edu) {
  const sh = ss.getSheetByName('Education'); if (!sh) throw new Error('Education is not set up yet. Please tell HR.');
  const v = sh.getDataRange().getValues(), head = v[0].map(h => String(h).trim());
  const cId = head.indexOf('Employee Number'), cD = head.indexOf('Degree / Course'), cS = head.indexOf('School'), cY = head.indexOf('Year Graduated');
  if (cId < 0 || cD < 0) throw new Error('The Education tab has unexpected columns. Please tell HR.');
  const key = (d, s, y) => pu_s_(d).toLowerCase() + '|' + pu_s_(s).toLowerCase() + '|' + pu_s_(y);
  const have = {};
  for (let i = 1; i < v.length; i++) if (pu_empNo_(v[i][cId]) === id) have[key(v[i][cD], cS >= 0 ? v[i][cS] : '', cY >= 0 ? v[i][cY] : '')] = true;
  let n = 0;
  edu.forEach(x => {
    if (have[key(x.degree, x.school, x.year)]) return;
    const row = sh.getLastRow() + 1; if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
    sh.getRange(row, cId + 1).setNumberFormat('@').setValue(id);
    if (cD >= 0) sh.getRange(row, cD + 1).setValue(x.degree);
    if (cS >= 0) sh.getRange(row, cS + 1).setValue(x.school);
    if (cY >= 0) sh.getRange(row, cY + 1).setValue(x.year);
    have[key(x.degree, x.school, x.year)] = true; n++;
  });
  return n;
}
/* The review tab for employee-reported reassignments/promotions. These are claims for HR to verify;
   they never touch Service History. */
function pu_reportTab_(ss) {
  let sh = ss.getSheetByName(PU.REPORT_TAB); if (sh) return sh;
  sh = ss.insertSheet(PU.REPORT_TAB, ss.getNumSheets());
  sh.setTabColor('#b0306f');
  const head = ['Timestamp', 'Employee Number', 'Name', 'Reported Date', 'Type', 'Details (position / office)', 'Order / Reference', 'Status'];
  if (sh.getMaxColumns() > head.length) sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#14223a').setFontColor('#ffffff');
  sh.getRange(1, 1).setNote('Reassignments and promotions employees reported on the self-service page. NOT official. Verify each against the order, enter it in Service History, then mark it Done here.');
  sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.setFrozenRows(1); sh.setColumnWidth(6, 280); sh.setColumnWidth(7, 180);
  return sh;
}
function pu_addReported_(ss, id, name, rep) {
  const sh = pu_reportTab_(ss);
  rep.forEach(x => {
    const row = sh.getLastRow() + 1; if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
    sh.getRange(row, 2).setNumberFormat('@');
    sh.getRange(row, 1, 1, 8).setValues([[new Date(), id, name, x.date || '', x.type || '', x.details || '', x.order || '', 'Pending review']]);
  });
}
