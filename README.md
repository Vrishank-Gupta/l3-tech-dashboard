# L3 Support Tracker

Static app — no server, no build step. Database hosted on Supabase (free).  
Every `git push` to GitHub auto-deploys via Netlify.

---

## Initial setup (~15 minutes, once only)

### 1. Create the database on Supabase

1. Sign up free at https://supabase.com → **New project**
2. Left sidebar → **SQL Editor** → **New query**
3. Paste the contents of `supabase-setup.sql` → **Run**
4. Go to **Project Settings → API**  
   Copy: **Project URL** and **anon / public** key

### 2. Add credentials

Open `public/config.js` and fill in your values:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
```

Then create a **private** repository at https://github.com/new  
(keep it private so your Supabase key isn't public)

```bash
git remote add origin https://github.com/YOUR_USERNAME/l3-support-tracker.git
git push -u origin main
```

### 4. Connect Netlify

1. Sign up free at https://netlify.com
2. **Add new site → Import an existing project → GitHub**
3. Pick the `l3-support-tracker` repo
4. Build settings (Netlify usually auto-detects from `netlify.toml`):
   - Build command: *(leave blank)*
   - Publish directory: `public`
5. **Deploy site** → you get a URL like `https://l3-tracker-abc123.netlify.app`

Share that URL with the team. Done.

---

## Ongoing workflow

Edit any file locally → push → Netlify redeploys in ~10 seconds.

```bash
git add .
git commit -m "describe what changed"
git push
```

That's it.

---

## File structure

```
├── netlify.toml           ← tells Netlify to serve public/
├── supabase-setup.sql     ← run once in Supabase SQL Editor
├── README.md
└── public/
    ├── config.js          ← Supabase credentials
    ├── index.html
    ├── styles.css
    └── app.js
```

---

## Features

| Feature | How it works |
|---------|-------------|
| Pendency days | Calculated live: `today − First Referred Date`. Auto-increments every day. |
| Colour coding | Green 0–6 · Yellow 7–14 · Orange 15–29 · Red 30+ |
| Search | Searches Ticket ID, Fault Code, Fault Code L1/L2, Tech Person Name |
| Sort | Toggle between Pendency ↓ and Newest First |
| All fields optional | Nothing is mandatory |
