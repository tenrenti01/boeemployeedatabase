# BOE Employee Database

Employee records of the **Bureau of Equipment (DPWH)**: profiles, plantilla, service history, PRC licenses and certificates of employment.

It has three parts:

| Part | Where it runs | What it is |
|---|---|---|
| **boerecords.online** | GitHub Pages (this repo) | The front page. It only holds links, never employee data. |
| **Employee Database** (`edms/`) | Google Apps Script | The admin app. Sign-in with Google; only people in the `Users` tab get in. |
| **Complete your record** (`photoapp/`) | Google Apps Script | The page employees open (QR link) to add their photo, TIN, education and past assignments. |

All records stay in the BOE Google Sheet. Both apps read and write it from inside Google.

---

## Repo layout

```
index.html            Front page of boerecords.online
config.js             ⚙️ The two app links (paste your /exec links here)
app/                  boerecords.online/app    → opens the Employee Database
record/               boerecords.online/record → opens "Complete your record" (good for QR codes)
demo/                 boerecords.online/demo   → the app with MADE-UP people, for presentations
assets/               Logos and icons
CNAME                 Tells GitHub Pages the domain is boerecords.online

edms/                 Employee Database, Apps Script project
  App.gs                Backend (all server functions)
  Index.html            The page, READABLE MASTER (edit this one)
  BuildDatabase.gs      One-time: creates the sheet tabs
  UpgradeSheets.gs      Adds new tabs/columns to an existing sheet
  ChangeOfficeCodes.gs  Helper: rename office codes safely
  SheetXray.gs          Helper: inspect the sheet
  appsscript.json       Manifest (Asia/Manila, runs as the person signed in)
photoapp/             "Complete your record", its own Apps Script project
dist/Index.min.html   Paste-ready page for the edms project (built from edms/Index.html)
tools/
  onefile.py            Rebuilds dist/Index.min.html:  python3 tools/onefile.py
  RestoreBirthdays.gs   One-off: repair birthdays from an HR backup
```

---

## 1. Put the app links in `config.js`

1. In each Apps Script project: **Deploy ▸ Manage deployments**, then copy the **Web app URL** (it ends in `/exec`).
2. On GitHub, open `config.js` ▸ ✏️ Edit, paste each link between the quotes, then **Commit changes**.

```js
window.EDMS_URL   = 'https://script.google.com/macros/s/AKfyc.../exec';
window.RECORD_URL = 'https://script.google.com/macros/s/AKfyc.../exec';
```

Keep the quote marks. Until a link is set, its button says "Link not set yet".

## 2. Turn on GitHub Pages

GitHub Pages is free only for **public** repositories. This repo has no passwords or employee data in it, so it is safe to make public (Settings ▸ General ▸ Danger Zone ▸ Change visibility ▸ Public). To keep it private you need a paid GitHub plan.

1. **Settings ▸ Pages**
2. **Source:** Deploy from a branch · **Branch:** `main` · folder `/ (root)` ▸ **Save**
3. **Custom domain:** `boerecords.online` ▸ **Save** (the `CNAME` file already says this)

## 3. Point boerecords.online to GitHub (GoDaddy)

GoDaddy ▸ **My Products** ▸ boerecords.online ▸ **DNS** (Manage DNS):

1. **Delete** the existing `A` record for `@` (usually "Parked" or a WebsiteBuilder IP) and turn off any **Forwarding** for the domain.
2. **Add four `A` records**, Name `@`:

   | Type | Name | Value |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |

3. **Edit the `CNAME` record** with Name `www` so its value is `tenrenti01.github.io` (add it if missing).
4. Save. Changes usually show within an hour (up to 48 hours).
5. Back in **Settings ▸ Pages**, when the domain check turns green, tick **Enforce HTTPS** (the certificate can take up to an hour to appear).

Optional but recommended: **verify the domain** so nobody else can use it on GitHub. Your profile ▸ Settings ▸ Pages ▸ **Add a domain**, then add the `TXT` record GitHub shows you in GoDaddy DNS.

## 4. Updating the apps

1. **Employee Database:** paste each `edms/*.gs` into the matching file of its Apps Script project, and paste **`dist/Index.min.html`** into the `Index` HTML file.
2. **Complete your record:** paste the two `photoapp/` files into its own project.
3. Then **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**. Keep the same deployment so the `/exec` links never change.

Editing the files is not enough: the live link only updates after **New version**.

---

## ⚠️ Keep these right

- **Time zone.** The Sheet (File ▸ Settings) and both Apps Script projects (Project Settings ⚙) must all be **Asia/Manila**, or saved dates can shift by a day.
- **Master password.** It lives in the Employee Database project's Script Properties (`MASTER_PASSWORD`), never in the code. If it was never changed, it is still the starting value. Change it on the app's **Admin** page.
- **Access.** The app runs as the person signed in, so each user needs to be in the `Users` tab **and** have the spreadsheet shared with them.
- **Employee Number** is 4 digits stored as text (`0001`).
