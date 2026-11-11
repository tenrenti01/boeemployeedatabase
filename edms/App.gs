/*************************************************************
 * 🗂️ BOE EMPLOYEE SYSTEM — web app, server side
 * This project needs two files for the app:
 *   App.gs      (this file, a Script file)
 *   Index.html  (an HTML file: Files ＋ → HTML → name it Index)
 *
 * FIRST-TIME SETUP
 *  1. Run buildDatabase (BuildDatabase.gs) so the tabs exist.
 *  2. Pick "setupApp" in the function dropdown → ▶ Run.
 *  3. Deploy → New deployment → ⚙ → Web app
 *       Execute as:      User accessing the web app
 *       Who has access:  Anyone with Google account
 *     → Deploy → copy the Web app URL. That's your system.
 *  4. For each HR staff member:
 *       - Share the spreadsheet with them (Editor; Viewer if they
 *         should only look).
 *       - Add them in the app's Users page (or the Users tab) with a
 *         Role: Admin / Editor (can save) or Viewer (can only look).
 *         Set Active to No to switch someone off without deleting them.
 *
 * After editing code later: Deploy → Manage deployments → ✏️ →
 * Version: New version → Deploy. The URL stays the same.
 *************************************************************/

const APP = {
  NAME: 'BOE Employee System',
  AGENCY: 'Bureau of Equipment',
  RETIRE_AGE: 65,
  T: {
    emp: 'Employees', ids: 'Government IDs', emails: 'Emails', elig: 'Eligibilities', edu: 'Education', pwd: 'PWD Records',
    names: 'Name Changes', hist: 'Service History', pd: 'Plantilla Details', cd: 'Contract Details',
    seats: 'Plantilla Seats', pos: 'Positions', off: 'Offices', pay: 'Pay Rates', users: 'Users', log: 'Change Log'
  },
  // Tabs added by upgradeSheets (UpgradeSheets.gs). The app still works without them, minus photos, causes and licenses.
  OPT: { photos: 'Photos', sepd: 'Separation Details', causes: 'Separation Causes', settings: 'Settings', lic: 'PRC Licenses' },
  DEFAULT_CAUSES: ['Retirement (compulsory, age 65)', 'Retirement (optional)', 'Resignation', 'Death', 'End of contract',
    'Transfer to another agency', 'Dropped from the rolls', 'Dismissal', 'Others'],
  MAX_IMAGE_CHARS: 49000,   // a Sheets cell holds up to 50,000 characters
  PUBLIC_ROLE: 'Editor',    // what public test-link visitors can do while the switch is On: Editor = view and edit
  // Our own IDs have no dashes: Employee Number 0001, Entry ID SH00001, Change ID NC0001
  EMP_PREFIX: '', EMP_DIGITS: 4, ENTRY_PREFIX: 'SH', ENTRY_DIGITS: 5, NAME_PREFIX: 'NC', NAME_DIGITS: 4,
  // Plantilla changes that keep the person where they currently work (a reassignment survives a step increment)
  KEEP_ASSIGNMENT: ['Step increment', 'Reclassification', 'Retitled', 'Retained'],
  // Columns stored as plain text, so IDs like 009-908-145 keep their exact look
  TEXT_COLS: {
    'Employees': ['Employee Number', 'Old Record ID', 'TIN'], 'Government IDs': ['Employee Number', 'ID Number'], 'Emails': ['Employee Number'],
    'Eligibilities': ['Employee Number'], 'Education': ['Employee Number'], 'PWD Records': ['Employee Number', 'PWD ID No.'],
    'Name Changes': ['Change ID', 'Employee Number'], 'Service History': ['Entry ID', 'Employee Number'],
    'Plantilla Details': ['Entry ID', 'Item Number'], 'Contract Details': ['Entry ID'], 'Photos': ['Employee Number'],
    'Plantilla Seats': ['Item Number', 'Office Code'],
    'Offices': ['Office Code', 'Parent Code'],
    'Separation Details': ['Entry ID'],
    'PRC Licenses': ['License ID', 'Employee Number', 'License Number']
  },
  // Division → Section → Unit. An office with no Level is a Division, so sheets from before the upgrade still work.
  ORG_LEVELS: ['Division', 'Section', 'Unit'],
  // Certificate of Employment. All of this is editable on the app's Admin page, not here.
  COE: { signatory: 'LEONISA M. DELA CRUZ', title: 'Administrative Officer IV', place: '' },
  // Yearly amounts and factors for the compensation breakdown. Settings rows override every one of them.
  PAY: { pera: 24000, clothing: 6000, cna: 25000, fieldHazard: 118800, cashGift: 5000, months1314: 2, yearEndMonths: 1, contractDays: 22 },
  ORDER_FOLDER: '1MVb_PHe2CiOUKcX5mbJNgYhPY4KmFTpP',   // scanned special orders land here
  LICENSE_FOLDER: '1BFWGeEXosU2b7FeVWD8QyyvANBbYi7Pw', // scanned PRC licenses land here
  LICENSE_PREFIX: 'LIC', LICENSE_DIGITS: 5,
  MAX_ORDER_CHARS: 14000000,                           // about 10 MB once base64 is unpacked
  ORDER_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  PLANTILLA_TYPES: ['Original (New)', 'Promotion', 'Reclassification', 'Retitled', 'Retained', 'Reemployment', 'Transfer', 'Step increment'],
  CONTRACT_TYPES: ['Contract (CoS / JO)', 'Contract renewal'],
  MOVE_TYPES: ['Reassignment', 'Designation (OIC)'],
  END_TYPES: ['Separation'],
  STATUSES: ['Permanent', 'Temporary', 'Coterminous', 'Contract of Service / Job Order', 'Contract of Service', 'Job Order'],
  ID_TYPES: ['Pag-IBIG', 'PhilHealth', 'GSIS BP No.', 'SSS', 'UMID'],
  NAME_REASONS: ['Marriage', 'Back to maiden name', 'Court order', 'Correction of record']
};

/* ───────────────────────── entry points ───────────────────────── */

/* ───────────────────────── web API for boerecords.online ─────────────────────────
   The page lives on GitHub Pages (boerecords.online) and talks to this script through doPost.
   Deploy as a Web app with  Execute as: Me  ·  Who has access: Anyone.
   Sign-in: type your DPWH email, get a 6-digit code by email, type it in. Who may sign in is the
   "Accounts" tab (Email, Name, Role, Active, Notes). No passwords and no Google account needed. */

var APP_WEB_ = false;   // true while answering a web request
var APP_ME_ = null;     // the signed-in account for this request, set by doPost after the pass checks out

const APP_ACC = {
  TAB: 'Accounts',
  HEADERS: ['Email', 'Name', 'Role', 'Active', 'Notes'],
  ROLES: ['Admin', 'Editor', 'Viewer'],
  DAYS: 7,              // a sign-in lasts this long on a device (Sign out ends it sooner)
  CODE_MIN: 10,         // an emailed code works this many minutes
  CODE_TRIES: 5,        // wrong codes allowed before a new code is needed
  RESEND_SEC: 60,       // wait between codes to the same email
  CODES_PER_HOUR: 5     // codes per email per hour
};

/* What the page may ask for once signed in. Anything not listed here can't be called from outside. */
const APP_API_ = {
  getBootstrap: () => getBootstrap(), getPhoto: a => getPhoto(a),
  saveNewHire: a => saveNewHire(a), saveJobChange: a => saveJobChange(a), saveNameChange: a => saveNameChange(a),
  savePersonal: a => savePersonal(a), savePhoto: a => savePhoto(a), separateEmployee: a => separateEmployee(a),
  saveSeat: a => saveSeat(a), saveOrderFile: a => saveOrderFile(a), removeOrderFile: a => removeOrderFile(a),
  saveLicense: a => saveLicense(a), removeLicense: a => removeLicense(a), saveOffice: a => saveOffice(a), deleteOffice: a => deleteOffice(a),
  updateEntry: a => updateEntry(a), deleteEntry: a => deleteEntry(a), deleteEmployee: a => deleteEmployee(a),
  setMasterPassword: a => setMasterPassword(a), saveSettings: a => saveSettings(a)
};

/* Opening the /exec link in a browser just says the server is up (and makes the Accounts tab the first time).
   It is plain JSON on purpose: no HTML page, so nothing here can be scripted. */
function doGet() {
  APP_WEB_ = true;
  const out = { ok: true, app: APP.NAME, message: 'The BOE Employee Database server is running. Open the app at boerecords.online.' };
  try { app_accounts_(app_ss_()); out.accountsTab = 'ready'; } catch (e) { out.ok = false; out.error = String(e && e.message || e); }
  return app_out_(out);
}

function doPost(e) {
  APP_WEB_ = true; APP_ME_ = null;
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return app_out_({ ok: false, error: 'The server could not read that request.' }); }
  const fn = app_s_(req.fn);
  try {
    if (fn === 'sendCode') return app_out_({ ok: true, result: app_sendCode_(req.arg || {}) });
    if (fn === 'verifyCode') return app_out_({ ok: true, result: app_verifyCode_(req.arg || {}) });
    APP_ME_ = app_checkToken_(req.token);
    if (fn === 'whoAmI') return app_out_({ ok: true, result: APP_ME_ });
    if (!Object.prototype.hasOwnProperty.call(APP_API_, fn)) throw new Error('Unknown request "' + fn + '".');
    return app_out_({ ok: true, result: APP_API_[fn](req.arg) });
  } catch (err) {
    return app_out_({ ok: false, error: String((err && err.message) || err), signIn: !!(err && err.signIn) });
  } finally {
    APP_ME_ = null;
  }
}
function app_out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ── the Accounts tab ── */
const APP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function app_accounts_(ss) {
  const sh = ss.getSheetByName(APP_ACC.TAB);
  const head = sh && sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => app_s_(h)) : [];
  if (!sh || head.indexOf('Email') < 0) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const again = ss.getSheetByName(APP_ACC.TAB);
      if (!again) app_makeAccounts_(ss);
      else app_migrateAccounts_(again);
    } finally { lock.releaseLock(); }
  }
  return app_read_(ss, APP_ACC.TAB);
}
/* Made the first time it's needed, filled with the people from the Users tab. Replace their emails with their DPWH emails. */
function app_makeAccounts_(ss) {
  const sh = ss.insertSheet(APP_ACC.TAB);
  const H = APP_ACC.HEADERS, rows = [], seen = {};
  let users = [];
  try { users = app_read_(ss, APP.T.users).rows; } catch (e) { users = []; }
  users.forEach(u => {
    const email = app_s_(u['Email']).toLowerCase();
    if (!APP_EMAIL_RE.test(email) || seen[email]) return;
    seen[email] = true;
    const role = APP_ACC.ROLES.indexOf(app_s_(u['Role'])) >= 0 ? app_s_(u['Role']) : 'Viewer';
    rows.push([email, app_s_(u['Name']), role, /^(no|n|false|inactive)$/i.test(app_s_(u['Active'])) ? 'No' : 'Yes', 'From the Users tab. Change it to their DPWH email.']);
  });
  if (!rows.length) {
    let owner = ''; try { owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { owner = ''; }
    rows.push([owner || 'yourname@dpwh.gov.ph', 'Administrator', 'Admin', 'Yes', 'Change to your DPWH email if needed']);
  }
  const body = Math.max(rows.length + 200, 300);
  if (sh.getMaxRows() < body + 1) sh.insertRowsAfter(sh.getMaxRows(), body + 1 - sh.getMaxRows());
  sh.getRange(1, 1, 1, H.length).setValues([H]).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  app_accFormat_(sh, body);
  if (rows.length) sh.getRange(2, 1, rows.length, H.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 220); sh.setColumnWidths(3, 2, 90); sh.setColumnWidth(5, 320);
  return sh;
}
function app_accFormat_(sh, body) {
  sh.getRange(2, 1, body, 1).setNumberFormat('@');
  sh.getRange(1, 1).setNote('Each person\'s DPWH email (e.g. juan.delacruz@dpwh.gov.ph). They sign in with a 6-digit code sent to it.');
  sh.getRange(1, 3).setNote('Admin = everything · Editor = can save changes · Viewer = can only look.\nChanging someone\'s role signs them out.');
  sh.getRange(1, 4).setNote('No = switched off (signed out at once, can\'t get a code)');
  sh.getRange(2, 3, body, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(APP_ACC.ROLES, true).setAllowInvalid(false).build());
  sh.getRange(2, 4, body, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build());
}
/* An Accounts tab from the short-lived username + password version: Username → Email (restored from Notes
   where it was made from the Users tab), and the Password column is removed. */
function app_migrateAccounts_(sh) {
  const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), sh.getLastColumn()).getValues();
  const head = v[0].map(h => app_s_(h));
  const cu = head.indexOf('Username'), cn = head.indexOf('Notes');
  if (cu < 0) throw new Error('The Accounts tab needs an "Email" column. Rename its first column to Email.');
  sh.getRange(1, cu + 1).setValue('Email');
  for (let i = 1; i < v.length; i++) {
    const u = app_s_(v[i][cu]); if (!u || APP_EMAIL_RE.test(u)) continue;
    const m = cn >= 0 ? app_s_(v[i][cn]).match(/\(([^()\s]+@[^()\s]+)\)/) : null;
    if (m) sh.getRange(i + 1, cu + 1).setValue(m[1].toLowerCase());
  }
  const cp = head.indexOf('Password');
  if (cp >= 0) sh.deleteColumn(cp + 1);
  sh.getRange(1, cu + 1).setNote('Each person\'s DPWH email (e.g. juan.delacruz@dpwh.gov.ph). They sign in with a 6-digit code sent to it.');
}
function app_accEmail_(a) { return app_s_(a['Email']).toLowerCase(); }
function app_accRole_(a) {
  const r = app_s_(a['Role']).toLowerCase();
  return APP_ACC.ROLES.find(x => x.toLowerCase() === r) || 'Viewer';
}
function app_accOff_(a) { return /^(no|n|false|inactive|off)$/i.test(app_s_(a['Active'])); }
function app_accMe_(a) {
  const e = app_accEmail_(a);
  return { email: e, username: e, name: app_s_(a['Name']) || e.split('@')[0], role: app_accRole_(a) };
}
function app_findAccount_(email) {
  return app_accounts_(app_ss_()).rows.find(r => app_accEmail_(r) === email) || null;
}

/* ── step 1: email a 6-digit code ── */
function app_sendCode_(p) {
  const email = app_s_(p.email).toLowerCase();
  if (!APP_EMAIL_RE.test(email)) throw new Error('Type your DPWH email address.');
  const a = app_findAccount_(email);
  if (!a) throw new Error('There is no account for ' + email + '. Ask the BOE administrator to add you.');
  if (app_accOff_(a)) throw new Error('This account is switched off. Ask the BOE administrator.');
  const cache = CacheService.getScriptCache(), now = Date.now();
  const last = Number(cache.get('otp-last:' + email) || 0);
  if (now - last < APP_ACC.RESEND_SEC * 1000) throw new Error('A code was just sent. Wait ' + Math.ceil((APP_ACC.RESEND_SEC * 1000 - (now - last)) / 1000) + ' seconds, then ask again.');
  const hour = Number(cache.get('otp-hour:' + email) || 0);
  if (hour >= APP_ACC.CODES_PER_HOUR) throw new Error('Too many codes for this email. Wait an hour, then try again.');
  const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
  const exp = now + APP_ACC.CODE_MIN * 60000;
  cache.put('otp:' + email, JSON.stringify({ h: app_codeHash_(email, code), exp: exp, tries: 0 }), APP_ACC.CODE_MIN * 60);
  const who = app_s_(a['Name']) || email.split('@')[0];
  MailApp.sendEmail({
    to: email, name: 'BOE Employee Database',
    subject: code + ' is your BOE Employee Database sign-in code',
    body: 'Hi ' + who + ',\n\nYour sign-in code is: ' + code + '\n\nIt works for ' + APP_ACC.CODE_MIN + ' minutes. If you did not ask for it, ignore this email.\n\nBureau of Equipment · DPWH',
    htmlBody: '<div style="font-family:Tahoma,Segoe UI,Arial,sans-serif;font-size:14px;color:#1b1b1b">' +
      '<p>Hi ' + app_html_(who) + ',</p><p>Your sign-in code for the <b>BOE Employee Database</b> is:</p>' +
      '<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0B3A75;margin:12px 0">' + code + '</p>' +
      '<p>It works for ' + APP_ACC.CODE_MIN + ' minutes. If you did not ask for it, ignore this email.</p>' +
      '<p style="color:#666;font-size:12px">Bureau of Equipment · Department of Public Works and Highways</p></div>'
  });
  cache.put('otp-last:' + email, String(now), APP_ACC.RESEND_SEC);
  cache.put('otp-hour:' + email, String(hour + 1), 3600);
  return { sent: true, email: email, minutes: APP_ACC.CODE_MIN, resend: APP_ACC.RESEND_SEC };
}
function app_codeHash_(email, code) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('otp|' + email + '|' + code, app_secret_()));
}
function app_html_(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── step 2: check the code and hand out a sign-in pass ── */
function app_verifyCode_(p) {
  const email = app_s_(p.email).toLowerCase(), code = app_s_(p.code).replace(/\D/g, '');
  if (!APP_EMAIL_RE.test(email) || code.length !== 6) throw new Error('Type the 6-digit code from the email.');
  const cache = CacheService.getScriptCache(), key = 'otp:' + email;
  let c = null; try { c = JSON.parse(cache.get(key) || 'null'); } catch (e) { c = null; }
  if (!c || !(c.exp > Date.now())) throw new Error('That code has expired. Ask for a new one.');
  if (c.tries >= APP_ACC.CODE_TRIES) { cache.remove(key); throw new Error('Too many wrong codes. Ask for a new one.'); }
  if (app_codeHash_(email, code) !== c.h) {
    c.tries++;
    const left = Math.max(1, Math.floor((c.exp - Date.now()) / 1000));
    if (c.tries >= APP_ACC.CODE_TRIES) cache.remove(key); else cache.put(key, JSON.stringify(c), left);
    Utilities.sleep(400);
    throw new Error(c.tries >= APP_ACC.CODE_TRIES ? 'Too many wrong codes. Ask for a new one.' : 'Wrong code. ' + (APP_ACC.CODE_TRIES - c.tries) + ' tries left.');
  }
  cache.remove(key);
  const a = app_findAccount_(email);
  if (!a) throw new Error('There is no account for ' + email + '.');
  if (app_accOff_(a)) throw new Error('This account is switched off. Ask the BOE administrator.');
  return { token: app_token_(email, a), me: app_accMe_(a), days: APP_ACC.DAYS };
}

/* A sign-in pass: "email|expiry" plus a signature only this script can make (a secret kept in Script Properties).
   The signature also covers the role, so changing someone's role in the Accounts tab signs them out. */
function app_token_(email, a) {
  const body = email + '|' + (Date.now() + APP_ACC.DAYS * 86400000);
  return Utilities.base64EncodeWebSafe(body) + '.' + app_sign_(body, a);
}
function app_sign_(body, a) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body + '|' + app_accRole_(a), app_secret_())).replace(/=+$/, '');
}
function app_secret_() {
  const P = PropertiesService.getScriptProperties();
  let s = P.getProperty('SIGNIN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); P.setProperty('SIGNIN_SECRET', s); }
  return s;
}
function app_checkToken_(token) {
  const out = msg => { const e = new Error(msg || 'Please sign in again.'); e.signIn = true; return e; };
  const t = app_s_(token), dot = t.indexOf('.');
  if (!t || dot < 1) throw out('Please sign in.');
  let body = '';
  try { body = Utilities.newBlob(Utilities.base64DecodeWebSafe(t.slice(0, dot))).getDataAsString(); } catch (e) { throw out(); }
  const bar = body.lastIndexOf('|'), email = body.slice(0, bar), exp = Number(body.slice(bar + 1));
  if (!email || !(exp > Date.now())) throw out('Your sign-in has expired. Please sign in again.');
  const a = app_findAccount_(email);
  if (!a || app_sign_(body, a) !== t.slice(dot + 1)) throw out();
  if (app_accOff_(a)) throw out('This account is switched off. Ask the BOE administrator.');
  return app_accMe_(a);
}

/* ▶ Run once from the editor */
function setupApp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  const missing = Object.keys(APP.T).map(k => APP.T[k]).filter(n => !ss.getSheetByName(n));
  if (missing.length) throw new Error('Run buildDatabase first. Missing tabs: ' + missing.join(', '));
  const me = Session.getEffectiveUser().getEmail();
  const users = app_read_(ss, APP.T.users).rows;
  if (me && !users.some(u => String(u['Email']).toLowerCase() === me.toLowerCase())) app_append_(ss, APP.T.users, { Email: me, Name: '', Role: 'Admin', Active: 'Yes' });
  app_log_(ss, me, 'App set up', '', 'setupApp');
  return app_say_('Setup done ✅', 'Next: Deploy → New deployment → Web app\n• Execute as: User accessing the web app\n• Who has access: Anyone with Google account');
}

/* ▶ Run this from the editor if the web app gets stuck. It loads what the app loads and reports what it finds.
   The report is returned and written to the execution log, so it works from the editor (no spreadsheet UI needed)
   and also pops a dialog when you happen to run it with the spreadsheet open. */
function checkApp() {
  const t0 = Date.now();
  const out = [];
  let d = null;
  try { d = getBootstrap(); }
  catch (e) { return app_say_('❌ The server side has a problem', String(e && e.stack || e)); }
  if (d.denied) return app_say_('⚠️ You are not in the Users tab', 'Signed in as ' + d.me.email + '. Add this email to the Users tab with Role = Admin.');

  // The page lives on GitHub (boerecords.online) now; this project only needs the .gs files.
  let acc = [];
  try { acc = app_accounts_(app_ss_()).rows; } catch (e) { acc = []; }
  const live = acc.filter(a => !app_accOff_(a));
  const bad = live.map(a => app_accEmail_(a)).filter(e => !APP_EMAIL_RE.test(e));
  const notDpwh = live.map(a => app_accEmail_(a)).filter(e => APP_EMAIL_RE.test(e) && !/@dpwh\.gov\.ph$/.test(e));
  let quota = '?'; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = 'not allowed yet (' + e.message + ')'; }
  out.push('Loaded in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s',
    '• ' + d.employees.length + ' employees, ' + d.hist.length + ' history entries',
    '• Data size: ' + Math.round(JSON.stringify(d).length / 1024) + ' KB',
    '• Extra tabs missing: ' + (d.needsUpgrade.length ? d.needsUpgrade.join(', ') + ' (run upgradeSheets)' : 'none'),
    '', 'Accounts tab: ' + live.length + ' active account(s), ' + live.filter(a => app_accRole_(a) === 'Admin').length + ' Admin',
    bad.length ? '• Not an email address (cannot sign in): ' + bad.join(', ') : '• Every active account has an email address',
    notDpwh.length ? '• Not a DPWH email: ' + notDpwh.join(', ') : '• All are @dpwh.gov.ph',
    '• Sign-in codes this script can still email today: ' + quota,
    '', 'The page is on GitHub, so no HTML file is needed here. After changing a .gs file: Deploy → Manage deployments → ✏️ → Version: New version → Deploy.');
  return app_say_('✅ Server side works', out.join('\n'));
}

/* Shows a message as a dialog when a spreadsheet UI is available, and always logs and returns it so it is
   readable from the Apps Script editor's execution log. Never throws just because there is no UI. */
function app_say_(title, body) {
  const text = title + '\n\n' + body;
  try { Logger.log(text); } catch (e) { /* ignore */ }
  try { SpreadsheetApp.getUi().alert(title, body, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* no spreadsheet UI, e.g. run from the editor */ }
  return text;
}

/* ───────────────────────── read ───────────────────────── */

function getBootstrap() {
  const ss = app_ss_();
  const me = app_user_(ss);
  if (me.role === 'None' || me.role === 'Inactive') return { denied: true, me: me, appName: APP.NAME, publicLinkOff: !me.email };
  const tz = ss.getSpreadsheetTimeZone();
  const T = APP.T;
  const pack = name => app_read_(ss, name).rows.map(r => app_clean_(r, tz));
  const log = pack(T.log).slice(-40).reverse();
  const O = APP.OPT, opt = name => app_readOpt_(ss, name).rows.map(r => app_clean_(r, tz));
  const missingOpt = Object.keys(O).map(k => O[k]).filter(n => !ss.getSheetByName(n));
  // Divisions → Sections → Units needs two extra columns on the Offices tab
  const offHead = app_read_(ss, APP.T.off).headers;
  if (offHead.indexOf('Parent Code') < 0 || offHead.indexOf('Level') < 0) missingOpt.push('Offices tree');
  if (app_read_(ss, APP.T.hist).headers.indexOf('Order File') < 0) missingOpt.push('Order File column');
  if (app_read_(ss, APP.T.pos).headers.indexOf('Technical / Non-Technical') < 0) missingOpt.push('Positions technical column');
  const settings = {};
  opt(O.settings).forEach(r => { settings[app_s_(r['Key'])] = app_s_(r['Value']); });
  const thumbs = {};
  opt(O.photos).forEach(r => { if (r['Thumb']) thumbs[r['Employee Number']] = r['Thumb']; });
  const causes = opt(O.causes).map(r => app_s_(r['Cause'])).filter(Boolean);
  return {
    me: me, appName: APP.NAME, agency: settings['Agency Name'] || APP.AGENCY, department: settings['Department'] || 'Department of Public Works and Highways',
    logo: settings['Logo'] || '', logo2: settings['Logo 2'] || '',
    coe: { signatory: settings['COE Signatory'] || APP.COE.signatory, title: settings['COE Signatory Title'] || APP.COE.title, place: settings['COE Place'] || APP.COE.place },
    amounts: app_payRates_(settings),
    orderFolder: app_orderFolderId_(settings),
    licenseFolder: app_licenseFolderId_(settings),
    lic: opt(O.lic),
    publicLink: /^(on|yes|true)$/i.test(settings['Public Test Link'] || ''), retireAge: APP.RETIRE_AGE, needsUpgrade: missingOpt, thumbs: thumbs, sepd: opt(O.sepd),
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    employees: pack(T.emp), ids: pack(T.ids), emails: pack(T.emails), elig: pack(T.elig), edu: pack(T.edu), pwd: pack(T.pwd), names: pack(T.names),
    hist: pack(T.hist), pd: pack(T.pd), cd: pack(T.cd), seats: pack(T.seats), pos: pack(T.pos), off: pack(T.off), pay: pack(T.pay),
    log: log,
    users: me.role !== 'Admin' ? [] : APP_ME_
      ? app_accounts_(ss).rows.map(a => ({ email: app_accEmail_(a), name: app_s_(a['Name']), role: app_accRole_(a), active: app_accOff_(a) ? 'No' : 'Yes' }))
      : pack(T.users).map(u => ({ email: app_s_(u['Email']), name: app_s_(u['Name']), role: app_s_(u['Role']) || 'Viewer', active: app_s_(u['Active']) || 'Yes' })),
    signIn: !!APP_ME_,
    lists: { plantillaTypes: APP.PLANTILLA_TYPES, contractTypes: APP.CONTRACT_TYPES, moveTypes: APP.MOVE_TYPES, endTypes: APP.END_TYPES,
             statuses: APP.STATUSES, idTypes: APP.ID_TYPES, reasons: APP.NAME_REASONS, causes: causes.length ? causes : APP.DEFAULT_CAUSES }
  };
}

/* The yearly amounts a Certificate of Employment adds up. A Settings row wins over the built-in number. */
function app_payRates_(settings) {
  const num = (key, fallback) => { const v = app_s_(settings[key]).replace(/[, ]/g, ''); return v !== '' && !isNaN(v) ? Number(v) : fallback; };
  const P = APP.PAY;
  return { pera: num('COE PERA', P.pera), clothing: num('COE Clothing', P.clothing), cna: num('COE CNA', P.cna),
    fieldHazard: num('COE Field Hazard', P.fieldHazard), cashGift: num('COE Cash Gift', P.cashGift),
    months1314: num('COE Months 13 14', P.months1314), yearEndMonths: num('COE Year End Months', P.yearEndMonths),
    contractDays: num('COE Contract Days Per Month', P.contractDays) };
}
function app_orderFolderId_(settings) {
  const v = app_s_(settings['Order Files Folder']) || APP.ORDER_FOLDER;
  const m = v.match(/[-\w]{25,}/);                  // accepts a bare id or a pasted Drive link
  return m ? m[0] : '';
}
function app_licenseFolderId_(settings) {
  const v = app_s_(settings['License Files Folder']) || APP.LICENSE_FOLDER;
  const m = v.match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

/* ───────────────────────── write: new hire ───────────────────────── */

function saveNewHire(p) {
  return app_write_('New hire', ss => {
    const P = p.person || {};
    app_require_(P.last, 'Last name'); app_require_(P.first, 'First name'); app_require_(p.job && p.job.date, 'Effective date');
    const eid = app_nextId_(ss, APP.T.emp, 'Employee Number', APP.EMP_PREFIX, APP.EMP_DIGITS);
    const made = app_seatFromForm_(ss, p.job, p.password);
    // The person goes in FIRST: Service History's Employee Number dropdown only accepts numbers already in Employees.
    // If anything after this fails, app_write_ takes every row back out, so a failed hire leaves nothing behind.
    app_append_(ss, APP.T.emp, {
      'Employee Number': eid, 'Old Record ID': '', 'Last Name': app_up_(P.last), 'First Name': app_up_(P.first), 'Middle Name': app_up_(P.middle),
      'Suffix': app_up_(P.suffix), 'Sex': P.sex || '', 'Birthday': app_date_(P.birthday), 'TIN': app_s_(P.tin), 'Photo Link': app_s_(P.photo)
    });
    const entry = app_addJob_(ss, eid, p.job, true);
    app_syncPersonExtras_(ss, eid, p);
    return { id: eid, record: eid, details: app_up_(P.last) + ', ' + app_up_(P.first) + ' → ' + entry + made };
  });
}

/* ───────────────────────── write: job change ───────────────────────── */

function saveJobChange(p) {
  return app_write_('Job change', ss => {
    app_require_(p.employeeId, 'Employee'); app_require_(p.date, 'Effective date'); app_require_(p.changeType, 'Change type');
    app_findOne_(ss, APP.T.emp, 'Employee Number', p.employeeId);
    const made = app_seatFromForm_(ss, p, p.password);
    const entry = app_addJob_(ss, p.employeeId, p, false);
    return { id: p.employeeId, record: p.employeeId, details: p.changeType + ' on ' + p.date + ' → ' + entry + made };
  });
}

/* ───────────────────────── write: name change ───────────────────────── */

function saveNameChange(p) {
  return app_write_('Name change', ss => {
    app_require_(p.employeeId, 'Employee'); app_require_(p.newLast, 'New last name'); app_require_(p.date, 'Date effective');
    const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', p.employeeId);
    const oldLast = app_s_(emp.row['Last Name']), newLast = app_up_(p.newLast);
    if (oldLast === newLast) throw new Error('The new last name is the same as the current one.');
    const cid = app_nextId_(ss, APP.T.names, 'Change ID', APP.NAME_PREFIX, APP.NAME_DIGITS);
    app_append_(ss, APP.T.names, { 'Change ID': cid, 'Employee Number': p.employeeId, 'Old Last Name': oldLast, 'New Last Name': newLast,
      'Date Effective': app_date_(p.date), 'Reason': p.reason || '', 'Document / Reference': app_s_(p.document) });
    app_setCell_(emp, 'Last Name', newLast);
    return { id: p.employeeId, record: p.employeeId, details: oldLast + ' → ' + newLast + ' (' + (p.reason || 'no reason given') + ')' };
  });
}

/* ───────────────────────── write: personal info ───────────────────────── */

function savePersonal(p) {
  return app_write_('Personal info edited', ss => {
    app_require_(p.employeeId, 'Employee');
    const P = p.person || {};
    app_require_(P.last, 'Last name'); app_require_(P.first, 'First name');
    const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', p.employeeId);
    const before = app_s_(emp.row['Last Name']);
    const fields = { 'Last Name': app_up_(P.last), 'First Name': app_up_(P.first), 'Middle Name': app_up_(P.middle), 'Suffix': app_up_(P.suffix),
      'Sex': P.sex || '', 'Birthday': app_date_(P.birthday), 'TIN': app_s_(P.tin) };
    if (P.photo !== undefined) fields['Photo Link'] = app_s_(P.photo);
    Object.keys(fields).forEach(k => app_setCell_(emp, k, fields[k]));
    app_syncPersonExtras_(ss, p.employeeId, p);
    return { id: p.employeeId, record: p.employeeId,
      details: before !== fields['Last Name'] ? 'Last name corrected: ' + before + ' → ' + fields['Last Name'] : 'Details updated' };
  });
}

/* ───────────────────────── write: users (Admin only) ───────────────────────── */

function saveUser(p) {
  const ss = app_ss_();
  const me = app_user_(ss);
  if (me.role !== 'Admin') throw new Error('Only an Admin can add or change users.');
  const email = app_s_(p.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const role = ['Admin', 'Editor', 'Viewer'].indexOf(p.role) >= 0 ? p.role : 'Viewer';
  const active = p.active === 'No' ? 'No' : 'Yes';
  if (email === me.email && (role !== 'Admin' || active === 'No')) throw new Error('You can\'t remove your own Admin access. Ask another Admin to do it.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Someone else is saving right now. Please try again in a few seconds.');
  try {
    const t = app_read_(ss, APP.T.users);
    const row = t.rows.find(r => String(r['Email']).trim().toLowerCase() === email);
    if (row) {
      const found = { sh: t.sh, headers: t.headers, row: row };
      app_setCell_(found, 'Name', app_s_(p.name)); app_setCell_(found, 'Role', role); app_setCell_(found, 'Active', active);
    } else {
      app_append_(ss, APP.T.users, { 'Email': email, 'Name': app_s_(p.name), 'Role': role, 'Active': active });
    }
    app_log_(ss, me.email, row ? 'User changed' : 'User added', email, role + ' · active: ' + active);
    SpreadsheetApp.flush();
    return { ok: true, id: email, data: getBootstrap() };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── photos ───────────────────────── */

function getPhoto(employeeId) {
  const ss = app_ss_();
  const me = app_user_(ss);
  if (me.role === 'None' || me.role === 'Inactive') throw new Error('No access.');
  const row = app_readOpt_(ss, APP.OPT.photos).rows.find(r => r['Employee Number'] === app_empNo_(employeeId));
  return row ? app_s_(row['Photo']) : '';
}

/* photo and thumb are small JPEGs made in the browser; an empty photo removes it */
function savePhoto(p) {
  return app_write_('Photo updated', ss => {
    const sh = ss.getSheetByName(APP.OPT.photos);
    if (!sh) throw new Error('Photos are not set up yet. Ask an Admin to run upgradeSheets once.');
    const eid = app_empNo_(p.employeeId);
    app_findOne_(ss, APP.T.emp, 'Employee Number', eid);
    if (p.photo) { app_image_(p.photo, 'Photo'); app_image_(p.thumb, 'Thumbnail'); }
    app_replaceRows_(ss, APP.OPT.photos, eid, p.photo ? [{ 'Employee Number': eid, 'Photo': p.photo, 'Thumb': p.thumb, 'Updated': new Date() }] : []);
    return { id: eid, record: eid, details: p.photo ? 'New photo' : 'Photo removed', action: p.photo ? 'Photo updated' : 'Photo removed' };
  });
}

/* ───────────────────────── separation (the Remove button) ───────────────────────── */

function separateEmployee(p) {
  return app_write_('Separated', ss => {
    app_require_(p.employeeId, 'Employee'); app_require_(p.date, 'Date of separation'); app_require_(p.cause, 'Cause');
    const eid = app_empNo_(p.employeeId);
    const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', eid).row;
    const cur = app_current_(ss, eid);
    if (cur && cur.hist['Change Type'] === 'Separation') throw new Error('This person is already separated.');
    const entry = app_addJob_(ss, eid, { changeType: 'Separation', date: p.date, order: p.order, remarks: p.cause + (p.notes ? ' — ' + p.notes : '') }, false);
    if (ss.getSheetByName(APP.OPT.sepd)) app_append_(ss, APP.OPT.sepd, { 'Entry ID': entry, 'Cause': app_s_(p.cause), 'Notes': app_s_(p.notes) });
    return { id: eid, record: eid, details: app_s_(emp['Last Name']) + ', ' + app_s_(emp['First Name']) + ' · ' + p.cause + ' on ' + p.date + ' → ' + entry };
  });
}

/* ───────────────────────── new plantilla seats ───────────────────────── */

/* A vacant seat made from the Plantilla Seats page. Needs the master password. */
function saveSeat(p) {
  return app_write_('Seat created', ss => {
    app_checkPassword_(p.password);
    const item = app_createSeat_(ss, p.seat || {}, p.newPosition);
    return { id: item, record: item, details: 'New plantilla seat ' + item + ' (' + (p.newPosition ? p.newPosition.title : (p.seat || {}).position) + ')' };
  });
}

/* When a hire/change form says "new seat", check the password and the step, then make the seat. Returns a note for the log. */
function app_seatFromForm_(ss, j, password) {
  if (!j || !j.newSeat) return '';
  app_checkPassword_(password);
  const step = Number(j.step);
  if (!(step >= 1 && step <= 8)) throw new Error('Salary step must be a number from 1 to 8.');
  j.item = app_createSeat_(ss, j.newSeat, j.newPosition);
  return ' (new seat ' + j.item + (j.newPosition ? ', new position ' + app_s_(j.newPosition.title) : '') + ')';
}

/* Adds a row to Plantilla Seats, and to Positions first when the position is new. Item numbers keep their dashes. */
function app_createSeat_(ss, seat, np) {
  const item = app_s_(seat.item).toUpperCase().replace(/\s+/g, '');
  app_require_(item, 'Item number of the new seat');
  app_require_(seat.office, 'Office of the new seat');
  if (app_read_(ss, APP.T.seats).rows.some(r => app_s_(r['Item Number']).toUpperCase() === item)) throw new Error('Item ' + item + ' already exists. Pick it from the list instead.');
  const positions = app_read_(ss, APP.T.pos).rows;
  let title = app_s_(seat.position);
  if (np) {
    title = app_s_(np.title);
    app_require_(title, 'Title of the new position');
    const sg = Number(np.sg);
    if (!(sg >= 1 && sg <= 33) || Math.round(sg) !== sg) throw new Error('Salary grade must be a whole number from 1 to 33.');
    if (positions.some(r => app_s_(r['Position Title']).toLowerCase() === title.toLowerCase())) throw new Error('Position "' + title + '" already exists. Pick it from the list instead.');
    app_append_(ss, APP.T.pos, { 'Position Title': title, 'Salary Grade': sg, 'Level': np.level ? Number(np.level) : '', 'Occupational Group': app_s_(np.group) });
  } else {
    app_require_(title, 'Position of the new seat');
    if (!positions.some(r => r['Position Title'] === title)) throw new Error('Position "' + title + '" is not in Positions.');
  }
  const auth = app_s_(seat.auth) === '' ? '' : Number(seat.auth);
  if (auth !== '' && !(auth >= 0)) throw new Error('Authorized monthly must be a number.');
  const seatOffice = app_officeCode_(ss, seat.office);
  const offRow = app_read_(ss, APP.T.off).rows.find(r => app_s_(r['Office Code']) === seatOffice);
  if (offRow && app_orgLevel_(offRow) !== 'Division')
    throw new Error('A plantilla seat belongs to a division. "' + seatOffice + '" is a ' + app_orgLevel_(offRow).toLowerCase() + '. Pick its division, then assign the person to the ' + app_orgLevel_(offRow).toLowerCase() + '.');
  app_append_(ss, APP.T.seats, { 'Item Number': item, 'Position Title': title, 'Office Code': seatOffice, 'Functional Title': app_s_(seat.functional), 'Authorized Monthly (PHP)': auth });
  return item;
}

/* Make sure a plantilla item exists, adding a minimal seat if it doesn't. Used when backfilling
   history with an item that isn't in the registry yet. The position must already be in Positions. */
function app_ensureSeat_(ss, item, position, office) {
  item = app_s_(item).toUpperCase().replace(/\s+/g, '');
  app_require_(item, 'Item number');
  const found = app_read_(ss, APP.T.seats).rows.find(r => app_s_(r['Item Number']).toUpperCase() === item);
  if (found) return app_s_(found['Item Number']);
  app_require_(position, 'Position (needed to add the new item ' + item + ')');
  if (!app_read_(ss, APP.T.pos).rows.some(r => app_s_(r['Position Title']) === position))
    throw new Error('Position "' + position + '" is not in Positions, so item ' + item + ' can\'t be added. Pick a position that already exists.');
  app_append_(ss, APP.T.seats, { 'Item Number': item, 'Position Title': position,
    'Office Code': office ? app_officeCode_(ss, office) : '', 'Functional Title': '', 'Authorized Monthly (PHP)': '' });
  return item;
}

/* ───────────────────────── scanned special orders ───────────────────────── */

/* Puts the scanned order in the Drive folder and writes its link into the entry's "Order File" cell.
   The file is created by whoever the web app runs as, and shared so anyone with the link can view it. */
function saveOrderFile(p) {
  return app_write_('Order file attached', ss => {
    app_require_(p.entryId, 'Entry');
    const h = app_findOne_(ss, APP.T.hist, 'Entry ID', p.entryId);
    if (h.headers.indexOf('Order File') < 0) throw new Error('The Service History tab has no "Order File" column yet. Ask an Admin to run upgradeSheets once.');
    const type = app_s_(p.mimeType).toLowerCase();
    if (APP.ORDER_TYPES.indexOf(type) < 0) throw new Error('Attach a PDF, JPG or PNG. That file is a ' + (type || 'kind we don\'t know') + '.');
    const b64 = String(p.bytes || '').replace(/^data:[^,]*,/, '');
    if (!b64) throw new Error('The file didn\'t come through. Please pick it again.');
    if (b64.length > APP.MAX_ORDER_CHARS) throw new Error('That file is bigger than 10 MB. Scan it at a lower quality, or split it.');

    const settings = {};
    app_readOpt_(ss, APP.OPT.settings).rows.forEach(r => { settings[app_s_(r['Key'])] = app_s_(r['Value']); });
    const folderId = app_orderFolderId_(settings);
    if (!folderId) throw new Error('No Drive folder is set for order files. Put one on the Admin page.');
    let folder;
    try { folder = DriveApp.getFolderById(folderId); }
    catch (e) { throw new Error('Could not open the Drive folder for order files. Check the folder link on the Admin page, and that this account can open it.'); }

    const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', h.row['Employee Number']).row;
    const name = app_orderName_(p, h.row, emp, type);
    const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), type, name));
    let shared = true;
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { shared = false; }                    // some Drive policies forbid link sharing; keep the file anyway
    app_undo_(() => { try { file.setTrashed(true); } catch (e) { /* already gone */ } });

    const before = app_s_(h.row['Order File']);
    app_setCell_(h, 'Order File', file.getUrl());
    return { id: p.entryId, record: p.entryId, action: before ? 'Order file replaced' : 'Order file attached',
      details: name + (shared ? '' : ' (stored, but this Drive could not make it link-viewable)') };
  });
}

/* Removes the link and sends the file to the Drive bin. Needs the master password: it is a record. */
function removeOrderFile(p) {
  return app_write_('Order file removed', ss => {
    app_checkPassword_(p.password);
    const h = app_findOne_(ss, APP.T.hist, 'Entry ID', p.entryId);
    const url = app_s_(h.row['Order File']);
    if (!url) throw new Error('That entry has no order file.');
    const m = url.match(/[-\w]{25,}/);
    let name = url;
    if (m) { try { const f = DriveApp.getFileById(m[0]); name = f.getName(); f.setTrashed(true); app_undo_(() => f.setTrashed(false)); } catch (e) { /* already gone from Drive */ } }
    app_setCell_(h, 'Order File', '');
    return { id: p.entryId, record: p.entryId, details: name + ' moved to the Drive bin' };
  });
}

/* ───────────────────────── PRC licenses ───────────────────────── */
/* Add or edit one license row (one row per license, so renewals and expired ones all stay).
   An optional scan is uploaded to the license Drive folder. Editors may do this; delete needs the password. */
function saveLicense(p) {
  return app_write_('License saved', ss => {
    app_require_(p.employeeId, 'Employee');
    app_findOne_(ss, APP.T.emp, 'Employee Number', p.employeeId);
    if (!ss.getSheetByName(APP.OPT.lic)) throw new Error('The "PRC Licenses" tab is not there yet. Ask an Admin to run upgradeSheets once.');
    app_require_(p.profession, 'Profession / license');
    const reg = app_date_(p.regDate), val = app_date_(p.validUntil);   // throws on a bad date, '' when blank
    const licId = app_s_(p.licenseId) || app_nextId_(ss, APP.OPT.lic, 'License ID', APP.LICENSE_PREFIX, APP.LICENSE_DIGITS);
    const isNew = !app_s_(p.licenseId);
    const row = { 'License ID': licId, 'Employee Number': app_empNo_(p.employeeId), 'Profession / License': app_s_(p.profession),
      'License Number': app_s_(p.number), 'Registration Date': reg, 'Valid Until': val, 'Remarks': app_s_(p.remarks) };

    const b64 = String(p.bytes || '').replace(/^data:[^,]*,/, '');
    if (b64) {
      const type = app_s_(p.mimeType).toLowerCase();
      if (APP.ORDER_TYPES.indexOf(type) < 0) throw new Error('Attach a PDF, JPG or PNG. That file is a ' + (type || 'kind we don\'t know') + '.');
      if (b64.length > APP.MAX_ORDER_CHARS) throw new Error('That file is bigger than 10 MB. Scan it at a lower quality, or split it.');
      const settings = {};
      app_readOpt_(ss, APP.OPT.settings).rows.forEach(r => { settings[app_s_(r['Key'])] = app_s_(r['Value']); });
      const folderId = app_licenseFolderId_(settings);
      if (!folderId) throw new Error('No Drive folder is set for license files. Put one on the Admin page.');
      let folder;
      try { folder = DriveApp.getFolderById(folderId); }
      catch (e) { throw new Error('Could not open the Drive folder for license files. Check the folder link on the Admin page, and that this account can open it.'); }
      const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', p.employeeId).row;
      const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[type] || '';
      const tidy = v => app_s_(v).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
      const name = [licId, app_empNo_(p.employeeId) + ' ' + tidy(emp['Last Name']), tidy(p.profession), tidy(p.number)].filter(Boolean).join(' - ').slice(0, 180) + ext;
      const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), type, name));
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* some Drives forbid link sharing; keep the file */ }
      app_undo_(() => { try { file.setTrashed(true); } catch (e) { /* already gone */ } });
      row['License File'] = file.getUrl();
    }
    app_upsert_(ss, APP.OPT.lic, 'License ID', licId, row);   // merges only the keys given, so an edit without a new scan keeps the old file
    return { id: p.employeeId, record: licId, action: isNew ? 'License added' : 'License updated',
      details: app_s_(p.profession) + (app_s_(p.number) ? ' ' + app_s_(p.number) : '') + ' → ' + app_empNo_(p.employeeId) };
  });
}

/* Delete one license row and bin its scan. Needs the master password: it is a record. */
function removeLicense(p) {
  return app_write_('License removed', ss => {
    app_checkPassword_(p.password);
    const t = app_read_(ss, APP.OPT.lic);
    const row = t.rows.find(r => app_s_(r['License ID']) === app_s_(p.licenseId));
    if (!row) throw new Error('That license row was not found.');
    const eid = app_s_(row['Employee Number']);
    const url = app_s_(row['License File']);
    let name = app_s_(row['Profession / License']) + (app_s_(row['License Number']) ? ' ' + app_s_(row['License Number']) : '');
    if (url) { const m = url.match(/[-\w]{25,}/); if (m) { try { const f = DriveApp.getFileById(m[0]); name = f.getName(); f.setTrashed(true); app_undo_(() => f.setTrashed(false)); } catch (e) { /* already gone */ } } }
    app_deleteWhere_(ss, APP.OPT.lic, 'License ID', [app_s_(p.licenseId)]);
    return { id: eid, record: p.licenseId, details: name + ' removed' };
  });
}

/* A file name you can read in the Drive folder on its own: SH00123 - 0001 ILAO - Reassignment - SO 12 s 2026.pdf */
function app_orderName_(p, row, emp, type) {
  const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[type] || '';
  const tidy = v => app_s_(v).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const parts = [app_s_(row['Entry ID']), app_s_(row['Employee Number']) + ' ' + tidy(emp['Last Name']),
    tidy(row['Change Type']), tidy(row['Order / Reference'])].filter(Boolean);
  return parts.join(' - ').slice(0, 180) + ext;
}

/* ▶ Run from the editor to see which Drive folder is in use and whether this account can write to it. */
function checkDrive() {
  const ss = app_ss_();
  const settings = {};
  app_readOpt_(ss, APP.OPT.settings).rows.forEach(r => { settings[app_s_(r['Key'])] = app_s_(r['Value']); });
  const id = app_orderFolderId_(settings);
  const out = [];
  out.push('Folder id: ' + (id || '(none set)'));
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      out.push('✅ Opened "' + f.getName() + '"');
      out.push('Files in it: ' + (() => { let n = 0; const it = f.getFiles(); while (it.hasNext() && n < 500) { it.next(); n++; } return n; })());
      const probe = f.createFile(Utilities.newBlob('test', 'text/plain', 'boe-write-test.txt'));
      let owner = '';
      try { owner = probe.getOwner() ? probe.getOwner().getEmail() : '(a shared drive owns it)'; } catch (e) { owner = '(a shared drive owns it)'; }
      out.push('✅ Can create files here. New files are owned by: ' + owner);
      out.push(owner.indexOf('shared drive') >= 0
        ? 'This folder is in a Shared drive, so every upload belongs to the organisation. Nothing more to set up.'
        : 'This folder is in My Drive, so an upload belongs to whoever is signed in to the web app.');
      try { probe.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); out.push('✅ Link sharing is allowed.'); }
      catch (e) { out.push('⚠️ This Drive will not let files be shared by link. Order files will be stored but only people with folder access can open them.'); }
      probe.setTrashed(true);
    } catch (e) { out.push('❌ ' + e.message); }
  }
  const text = out.join('\n');
  Logger.log(text);
  return text;
}

/* ───────────────────────── divisions, sections and units ───────────────────────── */

/* The level of an office row. Blank counts as Division, so a sheet from before the upgrade still works. */
function app_orgLevel_(row) {
  const v = app_s_(row && row['Level']);
  return APP.ORG_LEVELS.indexOf(v) >= 0 ? v : 'Division';
}

/* Add or edit a division, section or unit. Needs the master password: it changes the org structure. */
function saveOffice(p) {
  return app_write_('Office saved', ss => {
    app_checkPassword_(p.password);
    const code = app_up_(p.code).replace(/\s+/g, '');
    app_require_(code, 'Code');
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) throw new Error('A code can use letters, numbers and dashes only, like FED-PPS. Got: ' + code);
    const name = app_s_(p.name);
    app_require_(name, 'Name');
    const level = app_s_(p.level);
    if (APP.ORG_LEVELS.indexOf(level) < 0) throw new Error('Level must be Division, Section or Unit.');
    const parent = app_up_(p.parent).replace(/\s+/g, '');
    const t = app_read_(ss, APP.T.off);
    if (t.headers.indexOf('Level') < 0 || t.headers.indexOf('Parent Code') < 0)
      throw new Error('The Offices tab has no "Parent Code" and "Level" columns yet. Ask an Admin to run upgradeSheets once.');
    const rows = t.rows;
    const mine = rows.find(r => app_up_(r['Office Code']) === code) || null;

    if (level === 'Division') {
      if (parent) throw new Error('A division is the top level, so it has no parent office.');
    } else {
      app_require_(parent, 'Parent office');
      if (parent === code) throw new Error('An office cannot sit under itself.');
      const pr = rows.find(r => app_up_(r['Office Code']) === parent);
      if (!pr) throw new Error('Parent office "' + parent + '" was not found in the Offices tab.');
      const want = level === 'Section' ? 'Division' : 'Section';
      const got = app_orgLevel_(pr);
      if (got !== want) throw new Error('A ' + level.toLowerCase() + ' sits under a ' + want.toLowerCase() + ', but "' + parent + '" is a ' + got.toLowerCase() + '.');
    }
    const kids = rows.filter(r => app_up_(r['Parent Code']) === code);
    if (mine && kids.length && level === 'Unit')
      throw new Error(code + ' has ' + kids.length + ' office(s) under it, so it can\'t become a unit. Move or remove them first.');
    if (mine && kids.length && level === 'Division' && app_orgLevel_(mine) !== 'Division')
      throw new Error('Moving ' + code + ' up to a division would leave the offices under it at the wrong level. Move them first.');

    if (mine) {
      const found = { sh: t.sh, headers: t.headers, row: mine };
      const before = app_s_(mine['Office Name']);
      app_setCell_(found, 'Office Name', name);
      app_setCell_(found, 'Parent Code', parent);
      app_setCell_(found, 'Level', level);
      return { id: code, record: code, action: 'Office edited',
        details: code + ' · ' + (before !== name ? before + ' → ' + name : name) + ' · ' + level + (parent ? ' under ' + parent : '') };
    }
    app_append_(ss, APP.T.off, { 'Office Code': code, 'Office Name': name, 'Old Org Code': '', 'Parent Code': parent, 'Level': level });
    return { id: code, record: code, action: 'Office added', details: level + ' ' + code + ' — ' + name + (parent ? ' under ' + parent : '') };
  });
}

/* Remove a section or unit nothing is using. Needs the master password. */
function deleteOffice(p) {
  return app_write_('Office removed', ss => {
    app_checkPassword_(p.password);
    const code = app_up_(p.code);
    const t = app_read_(ss, APP.T.off);
    const mine = t.rows.find(r => app_up_(r['Office Code']) === code);
    if (!mine) throw new Error('Office "' + code + '" was not found.');
    const kids = t.rows.filter(r => app_up_(r['Parent Code']) === code);
    if (kids.length) throw new Error(code + ' still has ' + kids.length + ' office(s) under it: ' + kids.map(r => app_s_(r['Office Code'])).join(', ') + '.');
    const used = app_read_(ss, APP.T.hist).rows.filter(r => app_up_(r['Office Code']) === code).length;
    if (used) throw new Error(code + ' is used by ' + used + ' service history row(s). Move those people to another office first.');
    const seats = app_read_(ss, APP.T.seats).rows.filter(r => app_up_(r['Office Code']) === code).length;
    if (seats) throw new Error(code + ' still holds ' + seats + ' plantilla seat(s). Move them to another office first.');
    app_deleteRowSafe_(t.sh, mine._row);
    return { id: code, record: code, details: app_orgLevel_(mine) + ' ' + code + ' — ' + app_s_(mine['Office Name']) + ' removed' };
  });
}

/* ───────────────────────── master password actions ───────────────────────── */

/* Fix a Service History entry (and its details). Needs the master password. */
function updateEntry(p) {
  return app_write_('History entry edited', ss => {
    app_checkPassword_(p.password);
    app_require_(p.entryId, 'Entry');
    const h = app_findOne_(ss, APP.T.hist, 'Entry ID', p.entryId);
    const eid = h.row['Employee Number'], type = app_s_(p.changeType) || h.row['Change Type'];
    const all = APP.PLANTILLA_TYPES.concat(APP.CONTRACT_TYPES, APP.MOVE_TYPES, APP.END_TYPES, ['Start of service']);
    if (all.indexOf(type) < 0) throw new Error('Unknown change type: ' + type);
    if (p.position && !app_readOpt_(ss, APP.T.pos).rows.some(r => r['Position Title'] === p.position)) throw new Error('Position "' + p.position + '" is not in Positions.');
    const before = [h.row['Effective Date'] instanceof Date ? Utilities.formatDate(h.row['Effective Date'], ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : h.row['Effective Date'],
      h.row['Change Type'], h.row['Position Title'], h.row['Office Code']].join(' · ');
    const set = { 'Effective Date': p.date ? app_date_(p.date) : '', 'Change Type': type, 'Appointment Status': app_s_(p.status),
      'Office Code': app_s_(p.office) ? app_officeCode_(ss, p.office) : '', 'Position Title': app_s_(p.position),
      'Order / Reference': app_s_(p.order), 'Remarks': app_s_(p.remarks) };
    Object.keys(set).forEach(k => app_setCell_(h, k, set[k]));
    if (p.item !== undefined && app_s_(p.item)) {
      // Allow any item (even one held by someone else today — this is history). Add it if new.
      const item = app_ensureSeat_(ss, p.item, app_s_(p.position), app_s_(p.office));
      const step = Number(p.step);
      if (!(step >= 1 && step <= 8)) throw new Error('Salary step must be a number from 1 to 8.');
      app_upsert_(ss, APP.T.pd, 'Entry ID', p.entryId, { 'Entry ID': p.entryId, 'Item Number': item, 'Salary Step': step });
    }
    if (p.daily !== undefined && app_s_(p.daily)) {
      if (!(Number(p.daily) > 0)) throw new Error('Daily rate must be more than zero.');
      app_upsert_(ss, APP.T.cd, 'Entry ID', p.entryId, { 'Entry ID': p.entryId, 'Daily Rate (PHP)': Number(p.daily), 'Nature of Work': app_s_(p.work),
        'Source of Fund': app_s_(p.fund), 'Technical / Non-Technical': app_s_(p.tech) });
    }
    if (p.cause !== undefined && ss.getSheetByName(APP.OPT.sepd)) {
      app_upsert_(ss, APP.OPT.sepd, 'Entry ID', p.entryId, { 'Entry ID': p.entryId, 'Cause': app_s_(p.cause), 'Notes': app_s_(p.notes) });
    }
    return { id: eid, record: p.entryId, details: 'Was: ' + before + ' → now: ' + [p.date, type, p.position, p.office].join(' · ') };
  });
}

/* Remove a Service History entry and its details. Needs the master password. */
function deleteEntry(p) {
  return app_write_('History entry deleted', ss => {
    app_checkPassword_(p.password);
    const h = app_findOne_(ss, APP.T.hist, 'Entry ID', p.entryId).row;
    const tz = ss.getSpreadsheetTimeZone();
    const snap = [p.entryId, h['Employee Number'], h['Effective Date'] instanceof Date ? Utilities.formatDate(h['Effective Date'], tz, 'yyyy-MM-dd') : h['Effective Date'],
      h['Change Type'], h['Position Title'], h['Office Code']].join(' · ');
    // If this was their newest entry, the one before it becomes current again. Don't let that put two people in one seat.
    const eid = h['Employee Number'];
    const rest = app_read_(ss, APP.T.hist).rows.filter(r => r['Employee Number'] === eid).sort(app_byDateDesc_);
    if (rest.length > 1 && rest[0]['Entry ID'] === p.entryId) {
      const back = app_read_(ss, APP.T.pd).rows.find(r => r['Entry ID'] === rest[1]['Entry ID']);
      const other = back ? app_holders_(ss)[back['Item Number']] : '';
      if (other && other !== eid) throw new Error('Can\'t delete this: it would put ' + eid + ' back in item ' + back['Item Number'] +
        ', which ' + other + ' holds now. Edit the entry instead, or move ' + other + ' first.');
    }
    [APP.T.pd, APP.T.cd, APP.OPT.sepd, APP.T.hist].forEach(t => app_deleteWhere_(ss, t, 'Entry ID', [p.entryId]));
    return { id: h['Employee Number'], record: p.entryId, details: 'Deleted: ' + snap };
  });
}

/* Delete a person completely (for records made by mistake). Admin + master password. */
function deleteEmployee(p) {
  return app_write_('Employee deleted permanently', (ss, me) => {
    if (me.role !== 'Admin') throw new Error('Only an Admin can delete a person permanently.');
    app_checkPassword_(p.password);
    const eid = app_empNo_(p.employeeId);
    const emp = app_findOne_(ss, APP.T.emp, 'Employee Number', eid).row;
    const entries = app_read_(ss, APP.T.hist).rows.filter(r => r['Employee Number'] === eid).map(r => r['Entry ID']);
    [APP.T.pd, APP.T.cd, APP.OPT.sepd].forEach(t => app_deleteWhere_(ss, t, 'Entry ID', entries));
    [APP.T.hist, APP.T.ids, APP.T.emails, APP.T.elig, APP.T.edu, APP.T.pwd, APP.T.names, APP.OPT.photos, APP.T.emp]
      .forEach(t => app_deleteWhere_(ss, t, 'Employee Number', [eid]));
    return { id: '', record: eid, details: app_s_(emp['Last Name']) + ', ' + app_s_(emp['First Name']) + ' and ' + entries.length + ' history entries' };
  });
}

/* ───────────────────────── admin settings ───────────────────────── */

function setMasterPassword(p) {
  return app_write_('Master password changed', (ss, me) => {
    if (me.role !== 'Admin') throw new Error('Only an Admin can change the master password.');
    app_checkPassword_(p.current);
    if (!app_s_(p.next)) throw new Error('The new master password can\'t be empty.');
    PropertiesService.getScriptProperties().setProperty('MASTER_PASSWORD', app_s_(p.next));
    return { id: '', record: '', details: 'Changed (the password itself is never logged)' };
  });
}

function saveSettings(p) {
  return app_write_('Settings changed', (ss, me) => {
    if (me.role !== 'Admin') throw new Error('Only an Admin can change settings.');
    if (!ss.getSheetByName(APP.OPT.settings)) throw new Error('Settings are not set up yet. Run upgradeSheets once.');
    const changed = [];
    if (p.agency !== undefined) { app_upsert_(ss, APP.OPT.settings, 'Key', 'Agency Name', { 'Key': 'Agency Name', 'Value': app_s_(p.agency) }); changed.push('agency name'); }
    if (p.department !== undefined) { app_upsert_(ss, APP.OPT.settings, 'Key', 'Department', { 'Key': 'Department', 'Value': app_s_(p.department) }); changed.push('department'); }
    if (p.publicLink !== undefined) {
      app_upsert_(ss, APP.OPT.settings, 'Key', 'Public Test Link', { 'Key': 'Public Test Link', 'Value': p.publicLink === 'On' ? 'On' : 'Off' });
      changed.push('public test link ' + (p.publicLink === 'On' ? 'ON' : 'off'));
    }
    if (p.logo !== undefined) {
      if (p.logo) app_image_(p.logo, 'Logo');
      app_upsert_(ss, APP.OPT.settings, 'Key', 'Logo', { 'Key': 'Logo', 'Value': p.logo || '' }); changed.push(p.logo ? 'logo' : 'logo removed');
    }
    if (p.logo2 !== undefined) {
      if (p.logo2) app_image_(p.logo2, 'Second logo');
      app_upsert_(ss, APP.OPT.settings, 'Key', 'Logo 2', { 'Key': 'Logo 2', 'Value': p.logo2 || '' }); changed.push(p.logo2 ? 'second logo' : 'second logo removed');
    }
    // The certificate's signatory, where it is issued, the yearly amounts, and where order files go
    [['coeSignatory', 'COE Signatory'], ['coeTitle', 'COE Signatory Title'], ['coePlace', 'COE Place'],
     ['pera', 'COE PERA'], ['clothing', 'COE Clothing'], ['cna', 'COE CNA'], ['fieldHazard', 'COE Field Hazard'],
     ['cashGift', 'COE Cash Gift'], ['months1314', 'COE Months 13 14'], ['yearEndMonths', 'COE Year End Months'],
     ['contractDays', 'COE Contract Days Per Month'], ['orderFolder', 'Order Files Folder'], ['licenseFolder', 'License Files Folder']].forEach(pair => {
      if (p[pair[0]] === undefined) return;
      app_upsert_(ss, APP.OPT.settings, 'Key', pair[1], { 'Key': pair[1], 'Value': app_s_(p[pair[0]]) });
      changed.push(pair[1].toLowerCase());
    });
    return { id: '', record: '', details: changed.join(', ') };
  });
}

/* ───────────────────────── job + extras helpers ───────────────────────── */

function app_addJob_(ss, eid, j, isFirst) {
  const type = j.changeType || (j.kind === 'contract' ? 'Contract (CoS / JO)' : 'Original (New)');
  const isContract = APP.CONTRACT_TYPES.indexOf(type) >= 0 || (isFirst && j.kind === 'contract');
  const isPlantilla = APP.PLANTILLA_TYPES.indexOf(type) >= 0 && !isContract;
  const isMove = APP.MOVE_TYPES.indexOf(type) >= 0, isEnd = APP.END_TYPES.indexOf(type) >= 0;
  if (!isContract && !isPlantilla && !isMove && !isEnd) throw new Error('Unknown change type: ' + type);

  const cur = isFirst ? null : app_current_(ss, eid);
  let office = j.office, position = j.position, status = j.status;

  if (isPlantilla) {
    app_require_(j.item, 'Plantilla item number');
    const seat = app_findOne_(ss, APP.T.seats, 'Item Number', j.item).row;
    position = seat['Position Title'];
    // Where they work: picked on the form, else keep the current assignment (step increment etc.), else the seat's own office
    const keepHere = cur && APP.KEEP_ASSIGNMENT.indexOf(type) >= 0 ? cur.hist['Office Code'] : '';
    office = app_s_(j.assign) || keepHere || seat['Office Code'];
    status = status || 'Permanent';
    const step = Number(j.step);
    if (!(step >= 1 && step <= 8)) throw new Error('Salary step must be a number from 1 to 8.');
    // No vacancy block: a past job can point at an item someone holds today. Real same-day
    // double-bookings surface on the dashboard's "Records to fix" instead of being refused here.
  } else if (isContract) {
    app_require_(office, 'Office'); app_require_(position, 'Position');
    if (!(Number(j.daily) > 0)) throw new Error('Daily rate must be more than zero.');
    status = status || 'Contract of Service / Job Order';
  } else if (isMove) {
    if (!cur) throw new Error('This person has no current job to reassign.');
    office = office || cur.hist['Office Code']; position = position || cur.hist['Position Title']; status = cur.hist['Appointment Status'];
  } else if (isEnd) {
    office = ''; position = ''; status = '';
  }

  const entry = app_nextId_(ss, APP.T.hist, 'Entry ID', APP.ENTRY_PREFIX, APP.ENTRY_DIGITS);
  app_append_(ss, APP.T.hist, { 'Entry ID': entry, 'Employee Number': eid, 'Effective Date': app_date_(j.date), 'Change Type': type,
    'Appointment Status': status || '', 'Office Code': isEnd ? '' : app_officeCode_(ss, office),
    'Position Title': position || '', 'Order / Reference': app_s_(j.order), 'Remarks': app_s_(j.remarks), 'Source Reference': 'Web app' });

  if (isPlantilla) app_append_(ss, APP.T.pd, { 'Entry ID': entry, 'Item Number': j.item, 'Salary Step': Number(j.step) });
  if (isContract) app_append_(ss, APP.T.cd, { 'Entry ID': entry, 'Daily Rate (PHP)': Number(j.daily), 'Nature of Work': app_s_(j.work),
    'Source of Fund': app_s_(j.fund), 'Technical / Non-Technical': app_s_(j.tech) });
  if (isMove && cur) {   // a reassignment keeps the person's seat or contract terms
    if (cur.pd) app_append_(ss, APP.T.pd, { 'Entry ID': entry, 'Item Number': cur.pd['Item Number'], 'Salary Step': cur.pd['Salary Step'] });
    if (cur.cd) app_append_(ss, APP.T.cd, { 'Entry ID': entry, 'Daily Rate (PHP)': cur.cd['Daily Rate (PHP)'], 'Nature of Work': cur.cd['Nature of Work'],
      'Source of Fund': cur.cd['Source of Fund'], 'Technical / Non-Technical': cur.cd['Technical / Non-Technical'] });
  }
  return entry;
}

/* Government IDs, eligibilities, education, PWD: rewrite this person's rows to match the form */
function app_syncPersonExtras_(ss, eid, p) {
  if (p.ids) {
    const want = Object.keys(p.ids).filter(t => app_s_(p.ids[t])).map(t => ({ 'Employee Number': eid, 'ID Type': t, 'ID Number': app_s_(p.ids[t]) }));
    app_replaceRows_(ss, APP.T.ids, eid, want);
  }
  if (p.emails) {
    const list = p.emails.map(x => ({ email: app_s_(x.email).toLowerCase(), active: !!x.active })).filter(x => x.email);
    list.forEach(x => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) throw new Error('"' + x.email + '" doesn\'t look like an email address.'); });
    if (list.length && !list.some(x => x.active)) list[0].active = true;
    let seenActive = false;
    app_replaceRows_(ss, APP.T.emails, eid, list.map(x => {
      const on = x.active && !seenActive; if (on) seenActive = true;
      return { 'Employee Number': eid, 'Email': x.email, 'Active': on ? 'Yes' : 'No' };
    }));
  }
  if (p.elig) {
    const old = app_read_(ss, APP.T.elig).rows.filter(r => r['Employee Number'] === eid);
    const want = p.elig.map(x => app_s_(x)).filter(Boolean).map(name => {
      const keep = old.find(r => String(r['Eligibility / Exam']) === name);
      return keep ? { 'Employee Number': eid, 'Eligibility / Exam': name, 'Result': keep['Result'], 'Date': keep['Date'], 'Notes': keep['Notes'] }
                  : { 'Employee Number': eid, 'Eligibility / Exam': name, 'Result': name === 'CPE' ? 'Pass' : '', 'Date': '', 'Notes': '' };
    });
    app_replaceRows_(ss, APP.T.elig, eid, want);
  }
  // Education: a list of degrees, each with its school and year. A plain p.degree string still works.
  if (p.education !== undefined || p.degree !== undefined) {
    const list = p.education !== undefined ? p.education
      : (app_s_(p.degree) ? [{ degree: p.degree, school: (app_read_(ss, APP.T.edu).rows.filter(r => r['Employee Number'] === eid)[0] || {})['School'] || '' }] : []);
    const want = (list || []).map(x => ({
      'Employee Number': eid, 'Degree / Course': app_s_(x.degree), 'School': app_s_(x.school), 'Year Graduated': app_s_(x.year)
    })).filter(r => r['Degree / Course'] || r['School']);
    want.forEach(r => { if (r['Year Graduated'] && !/^\d{4}$/.test(r['Year Graduated'])) throw new Error('Year graduated should be four digits, like 2015. Got: ' + r['Year Graduated']); });
    app_replaceRows_(ss, APP.T.edu, eid, want);
  }
  if (p.pwd) {
    const has = app_s_(p.pwd.type) || app_s_(p.pwd.idNo);
    app_replaceRows_(ss, APP.T.pwd, eid, has ? [{ 'Employee Number': eid, 'PWD Type': app_s_(p.pwd.type), 'With PWD ID': app_s_(p.pwd.idNo) ? 'Y' : 'N',
      'PWD ID No.': app_s_(p.pwd.idNo) }] : []);
  }
}

/* The office code exactly as it is stored in Offices (works for OD and for old numbers like 41) */
function app_officeCode_(ss, v) {
  const row = app_read_(ss, APP.T.off).rows.find(r => String(r['Office Code']).trim() === String(v).trim());
  if (!row) throw new Error('Office "' + v + '" was not found in the Offices tab.');
  return row['Office Code'];
}

/* The person's newest Service History row plus its details */
function app_current_(ss, eid) {
  const hist = app_read_(ss, APP.T.hist).rows.filter(r => r['Employee Number'] === eid).sort(app_byDateDesc_);
  if (!hist.length) return null;
  const h = hist[0];
  const pd = app_read_(ss, APP.T.pd).rows.find(r => r['Entry ID'] === h['Entry ID']) || null;
  const cd = app_read_(ss, APP.T.cd).rows.find(r => r['Entry ID'] === h['Entry ID']) || null;
  return { hist: h, pd: pd, cd: cd };
}

/* item number → Employee Number of whoever holds it now */
function app_holders_(ss) {
  const latest = {};
  app_read_(ss, APP.T.hist).rows.slice().sort(app_byDateDesc_).forEach(r => { if (!latest[r['Employee Number']]) latest[r['Employee Number']] = r['Entry ID']; });
  const byEntry = {};
  app_read_(ss, APP.T.pd).rows.forEach(r => { byEntry[r['Entry ID']] = r['Item Number']; });
  const out = {};
  Object.keys(latest).forEach(eid => { const item = byEntry[latest[eid]]; if (item) out[item] = eid; });
  return out;
}

/* ───────────────────────── core sheet helpers ───────────────────────── */

function app_write_(action, fn) {
  const ss = app_ss_();
  const me = app_user_(ss);
  if (me.role !== 'Admin' && me.role !== 'Editor') throw new Error('Your role (' + me.role + ') can only view records. Ask an Admin to make you an Editor.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Someone else is saving right now. Please try again in a few seconds.');
  try {
    APP_UNDO_ = [];
    let res;
    try { res = fn(ss, me); }
    catch (e) { app_rollback_(); throw e; }   // all-or-nothing: take back whatever this save already wrote
    APP_UNDO_ = null;
    app_log_(ss, me.email, res.action || action, res.record, res.details);
    SpreadsheetApp.flush();
    return { ok: true, id: res.id, data: getBootstrap() };
  } finally {
    APP_UNDO_ = null;
    lock.releaseLock();
  }
}

/* ── Undo list for the save in progress ──
   Every row added, cell changed or row deleted during a save records how to put it back.
   If the save fails part-way, the steps run newest-first, so the sheet ends up exactly as it was. */
var APP_UNDO_ = null;
function app_undo_(step) { if (APP_UNDO_) APP_UNDO_.push(step); }
function app_rollback_() {
  const steps = APP_UNDO_ || [];
  APP_UNDO_ = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    try { steps[i](); } catch (e) { console.error('Could not take back one step of a failed save: ' + e); }
  }
  SpreadsheetApp.flush();
}

/* Writes values, and turns Google's "violates the data validation rules" into a message that names the tab and column */
function app_put_(range, values, headers) {
  try { range.setValues(values); }
  catch (e) {
    const m = String(e && e.message || e).match(/cell ([A-Z]+)(\d+) violates the data validation/i);
    if (!m) throw e;
    const col = m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
    const v = (values[Number(m[2]) - range.getRow()] || [])[col - range.getColumn()];
    const shown = Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v);
    throw new Error('The "' + range.getSheet().getName() + '" tab refused "' + shown + '" in its ' + (headers[col - 1] || 'column ' + m[1]) +
      ' column (cell ' + m[1] + m[2] + '), because that column only accepts values from its dropdown list. Nothing was saved.');
  }
}

/* Deletes one row but remembers it, so a failed save can put it back in the same place */
function app_deleteRowSafe_(sh, r) {
  const w = Math.max(1, sh.getLastColumn());
  const rg = sh.getRange(r, 1, 1, w);
  const vals = rg.getValues(), fmts = rg.getNumberFormats();
  sh.deleteRow(r);
  app_undo_(() => { sh.insertRowAfter(r - 1); const back = sh.getRange(r, 1, 1, w); back.setNumberFormats(fmts); back.setValues(vals); });
}

function app_ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run setupApp once from the Apps Script editor.');
  return ss;
}

function app_user_(ss) {
  if (APP_ME_) return APP_ME_;                                        // a signed-in web request
  if (APP_WEB_) return { email: '', name: '', role: 'None' };        // a web request without a valid sign-in gets nothing
  // Run from the Apps Script editor (setupApp, checkApp…): only the owner and editors of the script can do that
  const email = String(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  const users = app_read_(ss, APP.T.users).rows;
  const u = users.find(r => String(r['Email']).trim().toLowerCase() === email);
  let role = u ? String(u['Role'] || 'Viewer') : 'None';
  if (u && /^(no|n|false|inactive)$/i.test(app_s_(u['Active']))) role = 'Inactive';
  if (!users.length && email) role = 'Admin';
  // Public test link (Execute as: Me, Who has access: Anyone): visitors have no email. Let them in only while the switch is On.
  if (!email && app_publicOn_(ss)) return { email: '', name: 'Visitor', role: APP.PUBLIC_ROLE, isPublic: true };
  return { email: email, name: u ? app_s_(u['Name']) : '', role: email ? role : 'None' };
}
/* The Admin page's "Public test link" switch, kept in the Settings tab */
function app_publicOn_(ss) {
  const sh = ss.getSheetByName(APP.OPT.settings);
  if (!sh) return false;
  const row = app_read_(ss, APP.OPT.settings).rows.find(r => app_s_(r['Key']) === 'Public Test Link');
  return !!row && /^(on|yes|true)$/i.test(app_s_(row['Value']));
}

function app_read_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing. Run buildDatabase first.');
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 1 || cols < 1) return { sh: sh, headers: [], rows: [] };
  const v = sh.getRange(1, 1, last, cols).getValues();
  const headers = v[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === '') continue;
    const o = { _row: i + 1 };
    headers.forEach((h, j) => { if (h) o[h] = h === 'Employee Number' ? app_empNo_(v[i][j]) : v[i][j]; });
    rows.push(o);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function app_append_(ss, name, obj) {
  const sh = ss.getSheetByName(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  (APP.TEXT_COLS[name] || []).forEach(h => { const c = headers.indexOf(h); if (c >= 0) sh.getRange(row, c + 1).setNumberFormat('@'); });
  const range = sh.getRange(row, 1, 1, headers.length);
  app_put_(range, [headers.map(h => obj[h] === undefined || obj[h] === null ? '' : obj[h])], headers);
  app_undo_(() => range.clearContent());
}

/* Delete this person's rows in a tab and write the wanted ones */
function app_replaceRows_(ss, name, eid, wanted) {
  const t = app_read_(ss, name);
  t.rows.filter(r => r['Employee Number'] === eid).map(r => r._row).sort((a, b) => b - a).forEach(r => app_deleteRowSafe_(t.sh, r));
  wanted.forEach(o => app_append_(ss, name, o));
}

function app_findOne_(ss, name, key, value) {
  const t = app_read_(ss, name);
  const row = t.rows.find(r => String(r[key]).trim() === String(value).trim());
  if (!row) throw new Error(key + ' "' + value + '" was not found in ' + name + '.');
  return { sh: t.sh, headers: t.headers, row: row };
}

function app_setCell_(found, header, value) {
  const c = found.headers.indexOf(header);
  if (c < 0) return;
  const cell = found.sh.getRange(found.row._row, c + 1);
  if ((APP.TEXT_COLS[found.sh.getName()] || []).indexOf(header) >= 0) cell.setNumberFormat('@');
  const old = found.row[header];
  app_put_(cell, [[value === undefined || value === null ? '' : value]], found.headers);
  app_undo_(() => cell.setValue(old === undefined || old === null ? '' : old));
}

function app_nextId_(ss, name, key, prefix, digits) {
  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d+)$');
  app_read_(ss, name).rows.forEach(r => {
    const m = String(r[key]).trim().match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + String(max + 1).padStart(digits, '0');
}

function app_log_(ss, email, action, record, details) {
  try { app_append_(ss, APP.T.log, { 'Timestamp': new Date(), 'User': email || 'unknown', 'Action': action, 'Record': record || '', 'Details': details || '' }); }
  catch (e) { /* logging must never block a save */ }
}

function app_clean_(row, tz) {
  const o = {};
  Object.keys(row).forEach(k => {
    const v = row[k];
    o[k] = Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, k === 'Timestamp' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd')) : v;
  });
  return o;
}

function app_byDateDesc_(a, b) {
  const da = a['Effective Date'], db = b['Effective Date'];
  const ta = da instanceof Date || Object.prototype.toString.call(da) === '[object Date]' ? da.getTime() : (da ? new Date(da).getTime() : -Infinity);
  const tb = db instanceof Date || Object.prototype.toString.call(db) === '[object Date]' ? db.getTime() : (db ? new Date(db).getTime() : -Infinity);
  if (tb !== ta) return tb - ta;
  return String(b['Entry ID']).localeCompare(String(a['Entry ID']));
}

function app_date_(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Dates must look like 2026-10-13. Got: ' + s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);   // noon avoids time-zone date shifts
}
/* 1 → "0001" in case a cell lost its text format */
function app_empNo_(v) {
  const t = app_s_(v);
  return /^\d+$/.test(t) ? t.padStart(APP.EMP_DIGITS, '0') : t;
}
function app_s_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function app_up_(v) { return app_s_(v).toUpperCase(); }
function app_require_(v, label) { if (v === undefined || v === null || String(v).trim() === '') throw new Error(label + ' is required.'); }

/* ───────────────────────── small helpers for the new actions ───────────────────────── */

function app_checkPassword_(pw) {
  const real = PropertiesService.getScriptProperties().getProperty('MASTER_PASSWORD') || '1';
  if (String(pw === undefined || pw === null ? '' : pw) !== real) throw new Error('Wrong master password.');
}

function app_readOpt_(ss, name) {
  return ss.getSheetByName(name) ? app_read_(ss, name) : { sh: null, headers: [], rows: [] };
}

function app_deleteWhere_(ss, name, key, values) {
  if (!values.length || !ss.getSheetByName(name)) return 0;
  const t = app_read_(ss, name);
  const rows = t.rows.filter(r => values.indexOf(String(r[key]).trim()) >= 0).map(r => r._row).sort((a, b) => b - a);
  rows.forEach(r => app_deleteRowSafe_(t.sh, r));
  return rows.length;
}

function app_upsert_(ss, name, key, value, obj) {
  const t = app_read_(ss, name);
  const row = t.rows.find(r => String(r[key]).trim() === String(value).trim());
  if (!row) return app_append_(ss, name, obj);
  const found = { sh: t.sh, headers: t.headers, row: row };
  Object.keys(obj).forEach(k => app_setCell_(found, k, obj[k]));
}

function app_image_(dataUrl, label) {
  const v = String(dataUrl || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(v)) throw new Error(label + ' must be a JPG or PNG picture.');
  if (v.length > APP.MAX_IMAGE_CHARS) throw new Error(label + ' is too big to store. Try a smaller picture.');
}
