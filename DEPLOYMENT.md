# OncoMove – Deployment Guide

## 🏗️ Project Structure

```
oncomove/
├── client/          # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── contexts/     AuthContext.jsx
│   │   ├── utils/        api.js, calendar.js
│   │   ├── constants.js
│   │   ├── styles/       main.css
│   │   ├── pages/        Login, TherapistDashboard, PatientDashboard
│   │   └── components/
│   │       ├── therapist/  ExercisePlan, ExerciseCard, ExerciseForm,
│   │       │               PatientManager, PatientModal, Reports, ShareProgram
│   │       ├── patient/    TodayView, WeekView, MonthView,
│   │       │               CheckInView, ProgressView
│   │       └── shared/     Modal, Lightbox
│   └── package.json
├── server/          # Node.js + Express backend
│   ├── index.js
│   ├── db.js         SQLite schema + demo seeding
│   ├── middleware/   auth.js (JWT)
│   ├── routes/       auth, patients, exercises, reports, therapist, share
│   └── package.json
├── package.json     # Root scripts
├── .env.example
└── .gitignore
```

---

## 🚀 Railway Deployment (Step-by-Step)

### Prerequisites
- GitHub account
- Railway account at [railway.app](https://railway.app)
- Free Railway plan is sufficient

---

### Step 1 — Push Code to GitHub

```bash
cd oncomove

# Initialize git repo
git init
git add .
git commit -m "Initial OncoMove commit"

# Create a new repo on GitHub (e.g. your-username/oncomove)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/oncomove.git
git branch -M main
git push -u origin main
```

---

### Step 2 — Create Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Click **Deploy from GitHub repo**
3. Select your `oncomove` repository
4. Railway will auto-detect it as a Node.js project

---

### Step 3 — Configure Build & Start Commands

In Railway dashboard → your service → **Settings** tab:

| Setting | Value |
|---|---|
| **Root Directory** | *(leave empty)* |
| **Build Command** | `cd client && npm install && npm run build && cd ../server && npm install` |
| **Start Command** | `cd server && node index.js` |

---

### Step 4 — Set Environment Variables

In Railway dashboard → **Variables** tab, add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | A long random string (e.g. 64 random characters) |
| `NODE_ENV` | `production` |

**Optional — for email password reset:**

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | Gmail App Password (not your main password) |
| `SMTP_FROM` | `OncoMove <your@gmail.com>` |

> **Tip:** Generate a strong JWT_SECRET with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

### Step 5 — Add Persistent Storage for SQLite

By default Railway services restart and lose the SQLite database. To persist data:

1. Railway dashboard → **New** → **Volume**
2. Attach the volume to your service
3. Set mount path: `/data`
4. Add environment variable: `DB_PATH=/data/oncomove.db`

The server automatically uses `DB_PATH` if set (otherwise falls back to `./oncomove.db`).

---

### Step 6 — Deploy

1. Railway will automatically deploy when you push to `git push origin main`
2. Watch the build log in Railway dashboard
3. Once deployed, click **View** to open your app URL (e.g. `https://oncomove-production.up.railway.app`)

---

## 💻 Local Development

### First-time setup

```bash
# Install all dependencies
cd oncomove/server && npm install
cd ../client && npm install

# Create environment file
cp .env.example .env
# Edit .env and set a JWT_SECRET
```

### Run in development mode

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd oncomove/server
node index.js
# Server runs on http://localhost:4000
```

**Terminal 2 — Frontend:**
```bash
cd oncomove/client
npm run dev
# App opens at http://localhost:5173
# API calls proxy to http://localhost:4000
```

Then open: **http://localhost:5173**

---

## 🔐 Demo Credentials

The app seeds demo data automatically on first run:

| Role | Field | Value |
|---|---|---|
| **Therapist** | Email | `demo@oncomove.com` |
| **Therapist** | Password | `demo1234` |
| **Patient** | Name | Miriam Levi |
| **Patient** | Phone | `0501234567` |
| **Patient** | Name | David Katz |
| **Patient** | Phone | `0507654321` |

> ⚠️ Change these credentials before going to production!

---

## 🗄️ Database

The app uses **SQLite** via `better-sqlite3`. Tables:

- `therapists` — therapist accounts (email, hashed password)
- `patients` — patient records (name, phone, email, DOB, diagnosis, etc.)
- `exercises` — exercise plans per patient per day
- `reports` — daily check-ins (fatigue, pain, wellbeing)

The database file is created automatically at startup.

---

## 🌐 App Features

### Therapist Portal
- Login with email + password
- Manage patients (add, edit, archive)
- Plan exercises per day (resistance, aerobic, other)
- Week & month calendar views
- Copy a program from one week to another
- View patient check-in reports
- Generate & share patient HTML programs (WhatsApp / Email)

### Patient Portal
- Login with phone number
- **Today** — exercises for the day with completion checkboxes
- **Week** — expandable 7-day view
- **Month** — calendar grid with exercise indicators
- **Check-in** — submit daily Fatigue / Pain / Wellbeing (0–10 RPE)
- **Progress** — line graphs (weekly / monthly / yearly)

---

## 📱 Responsive Design

| Screen | Layout |
|---|---|
| **Desktop** (>900px) | Sidebar always visible, top navigation, table layouts |
| **Tablet** (600–900px) | Collapsible sidebar, adapted layouts |
| **Mobile** (<600px) | Bottom tab bar, mobile exercise cards, compact grids |

---

## 🔄 Updating the App

```bash
# Make changes, then:
git add .
git commit -m "Description of changes"
git push origin main
# Railway auto-deploys
```

---

## ❓ Troubleshooting

**Build fails on Railway**
- Check that Build Command is exactly: `cd client && npm install && npm run build && cd ../server && npm install`
- Look at build logs for specific npm errors

**App shows blank page**
- Check that the `client/dist` folder is built (build command ran successfully)
- Verify Start Command: `cd server && node index.js`

**Database resets on every deploy**
- You need to add a Railway Volume (Step 5 above)
- Without a volume, data is lost on redeploy

**Login not working**
- Check JWT_SECRET is set in Railway Variables
- Try the demo credentials: `demo@oncomove.com` / `demo1234`

**Password reset emails not sending**
- SMTP variables must be set correctly
- For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833), not your main password
- Alternatively, use services like SendGrid or Resend

---

## 📁 Google Drive Upload (Optional)

The Share Program feature can upload patient programs to your Google Drive and generate a shareable Drive link.

### Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Enable APIs** → enable **Google Drive API**
3. **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: your Railway domain (e.g. `https://oncomove-production.up.railway.app`)
   - Also add `http://localhost:5173` for local development
4. Copy the **Client ID** (looks like `123456789.apps.googleusercontent.com`)
5. Add to Railway Variables:
   - `VITE_GOOGLE_CLIENT_ID` = your Client ID

### How it works

1. Therapist clicks **Share Program** → **Generate Link**
2. An instant hosted link is created (served from OncoMove itself)
3. Optionally click **↑ Upload** to save to Google Drive
4. After upload, the Drive link replaces the server link in WhatsApp/Email messages
5. Patients click the link → the HTML program opens immediately in their browser

> Without `VITE_GOOGLE_CLIENT_ID`, the Google Drive button will show a setup message. The server-hosted link still works without any Google setup.
