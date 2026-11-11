# BOE Employee Database

Employee records of the **Bureau of Equipment (DPWH)**: profiles, plantilla, service history, PRC licenses and certificates of employment.

| Part | Where it runs | What it is |
|---|---|---|
| **The app** (`index.html`) | GitHub Pages: boerecords.online | Everything you see. Changes here go live about a minute after they're pushed. |
| **The server** (`edms/App.gs`) | Google Apps Script | Reads and writes the Google Sheet. The page talks to it through its `/exec` link. |
| **The data** | The BOE Google Sheet | All records. Nothing is stored on GitHub. |
| **Complete your record** (`photoapp/`) | Google Apps Script | The page employees open (QR link) to add their photo, TIN, education and past assignments. |

People sign in with a **username and password** from the **Accounts** tab of the Google Sheet. No Google account is needed.

---

## Repo layout

```
index.html            The app (built from edms/Index.html, do not edit by hand)
config.js             ⚙️ The server link (EDMS_API) and the photo app link (RECORD_URL)
record/               boerecords.online/record → opens "Complete your record" (good for QR codes)
demo/                 boerecords.online/demo   → the app with MADE-UP people, for presentations
assets/               Logos and icons

edms/                 The server's Apps Script project
  App.gs                Server: sign-in, and every read and save
  Index.html            The app's READABLE MASTER (edit this one, then run tools/build.py)
  BuildDatabase.gs      One-time: creates the sheet tabs
  UpgradeSheets.gs      Adds new tabs/columns to an existing sheet
  ChangeOfficeCodes.gs  Helper: rename office codes safely
  SheetXray.gs          Helper: inspect the sheet
  appsscript.json       Manifest (Asia/Manila, runs as the owner, open to anyone)
photoapp/             "Complete your record", its own Apps Script project
tools/
  build.py              Rebuilds index.html from edms/Index.html:  python3 tools/build.py
  minify.py             Used by build.py
  RestoreBirthdays.gs   One-off: repair birthdays from an HR backup
```

---

## Accounts (the Accounts tab)

| Username | Password | Name | Role | Active | Notes |
|---|---|---|---|---|---|
| jdelacruz | (typed by the admin) | Juan Dela Cruz | Editor | Yes | |

- **Role:** `Admin` = everything · `Editor` = can save changes · `Viewer` = can only look.
- **Active:** `No` switches someone off. They are signed out at once.
- A blank password means that person can't sign in.
- Changing someone's password or role signs them out on every device.
- 5 wrong passwords lock that username for 15 minutes.
- A sign-in lasts 7 days on a device, or until **Sign out** (top right).

The tab is created automatically the first time the server runs, filled with the people from the old `Users` tab (username = the part of their email before `@`). Keep the sheet **unshared**: the server runs as you, so staff never need access to the sheet itself, and only you can see the passwords.

---

## One-time setup

1. **Server:** in the Employee Database's Apps Script project, replace `App.gs` with `edms/App.gs` and save.
2. **Deploy:** **Deploy ▸ Manage deployments ▸ ✏️ Edit**. Set **Execute as: Me** and **Who has access: Anyone**, **Version: New version**, then **Deploy**. (If those two settings can't be changed there, use **New deployment ▸ Web app** with the same settings.) Copy the **Web app URL** (ends in `/exec`).
3. **Check it:** open that URL in a browser. It should say *"The BOE Employee Database server is running"*. This also creates the **Accounts** tab.
4. **Passwords:** in the sheet's **Accounts** tab, type a password for each person who may sign in.
5. **Link:** on GitHub, open `config.js` ▸ ✏️ Edit, paste the URL between the quotes on the `EDMS_API` line, then **Commit changes**.
6. Open the site and sign in.

## Updating later

- **Page changes** (looks, forms, reports, PDFs): edit `edms/Index.html`, run `python3 tools/build.py`, then push. Live in about a minute. No Apps Script deploy needed.
- **Server changes** (`edms/App.gs`): paste it into Apps Script, then **Deploy ▸ Manage deployments ▸ ✏️ ▸ New version ▸ Deploy**. Keep the same deployment so the `/exec` link never changes.

## Domain: boerecords.online (GoDaddy)

1. GitHub: **Settings ▸ Pages**. Source: Deploy from a branch · `main` · `/ (root)`.
2. GoDaddy ▸ **My Products** ▸ boerecords.online ▸ **DNS**:
   - Delete the existing `A` record for `@` ("Parked") and turn off any **Forwarding**.
   - Add four `A` records, Name `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - Set the `CNAME` record named `www` to `tenrenti01.github.io`.
3. Back in **Settings ▸ Pages ▸ Custom domain**, type `boerecords.online` and click **Save** (GitHub adds a `CNAME` file). When the check turns green, tick **Enforce HTTPS**.

---

## ⚠️ Keep these right

- **Time zone.** The Sheet (File ▸ Settings) and both Apps Script projects (Project Settings ⚙) must all be **Asia/Manila**, or saved dates can shift by a day.
- **Master password** (for editing or deleting history entries) lives in Script Properties (`MASTER_PASSWORD`). If it was never changed, it is still the starting value. Change it on the app's **Admin** page.
- **Sign-in secret.** The server signs each sign-in with a secret it keeps in Script Properties (`SIGNIN_SECRET`). Deleting that property signs everyone out.
- **Employee Number** is 4 digits stored as text (`0001`).
