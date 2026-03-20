// server/db.js
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'oncomove.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS therapists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT 'Dr. Sarah Cohen',
    email       TEXT UNIQUE,
    password    TEXT NOT NULL,
    reset_token TEXT,
    reset_exp   INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patients (
    id           TEXT PRIMARY KEY,
    therapist_id TEXT NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    phone        TEXT,
    email        TEXT,
    dob          TEXT,
    gender       TEXT,
    diagnosis    TEXT,
    medhistory   TEXT,
    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id           TEXT PRIMARY KEY,
    patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    day_key      INTEGER NOT NULL,
    instance_id  TEXT NOT NULL,
    type         TEXT NOT NULL,
    name         TEXT NOT NULL,
    image        TEXT DEFAULT '',
    description  TEXT DEFAULT '',
    equipment    TEXT DEFAULT '',
    sets         TEXT DEFAULT '',
    reps         TEXT DEFAULT '',
    duration     TEXT DEFAULT '',
    body_area    TEXT DEFAULT '',
    weight       TEXT DEFAULT '',
    rest         TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    rpe          INTEGER DEFAULT 5,
    img_data     TEXT,
    img_url      TEXT,
    link         TEXT,
    intervals    TEXT,
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id           TEXT PRIMARY KEY,
    patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    day_key      INTEGER NOT NULL,
    fatigue      INTEGER,
    pain         INTEGER,
    wellbeing    INTEGER,
    notes        TEXT DEFAULT '',
    session_rpe  TEXT,
    submitted_at TEXT DEFAULT (datetime('now')),
    UNIQUE(patient_id, day_key)
  );

  CREATE TABLE IF NOT EXISTS share_pages (
    token        TEXT PRIMARY KEY,
    patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    therapist_id TEXT NOT NULL,
    html         TEXT NOT NULL,
    filename     TEXT NOT NULL,
    first_name   TEXT NOT NULL,
    week_summary TEXT NOT NULL DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ex_patient_day ON exercises(patient_id, day_key);
  CREATE INDEX IF NOT EXISTS idx_rep_patient    ON reports(patient_id);
  CREATE INDEX IF NOT EXISTS idx_pt_therapist   ON patients(therapist_id);
  CREATE INDEX IF NOT EXISTS idx_share_patient  ON share_pages(patient_id);
`);

// ── Seed demo data if empty ───────────────────────────────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM therapists').get();
if (count.c === 0) {
  const hash = bcrypt.hashSync('demo1234', 10);
  db.prepare('INSERT INTO therapists (id,name,email,password) VALUES (?,?,?,?)')
    .run('t1', 'Dr. Sarah Cohen', 'demo@oncomove.com', hash);

  db.prepare(`INSERT INTO patients (id,therapist_id,name,phone,email,dob,gender,diagnosis,medhistory,notes,status,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('p1','t1','Miriam Levi','0501234567','miriam@example.com','1970-01-15','Female','Breast Cancer — Stage II','','','active',1);
  db.prepare(`INSERT INTO patients (id,therapist_id,name,phone,email,dob,gender,diagnosis,medhistory,notes,status,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('p2','t1','David Katz','0521234568','david@example.com','1963-05-20','Male','Colorectal Cancer — Stage III','','','active',2);

  console.log('✅ Demo seeded. Login: demo@oncomove.com / demo1234  |  Patients: 0501234567 / 0521234568');
}
try { db.exec(`ALTER TABLE exercises ADD COLUMN weight TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE exercises ADD COLUMN rest TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE patients ADD COLUMN equipment TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE patients ADD COLUMN environment TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE reports ADD COLUMN session_data TEXT`); } catch {}
try { db.exec(`ALTER TABLE exercises ADD COLUMN target_hr TEXT DEFAULT ''`); } catch {}

// ── Therapist settings additions ─────────────────────────────────────────────
try { db.exec(`ALTER TABLE therapists ADD COLUMN whatsapp_number TEXT DEFAULT ''`); } catch {}

// ── Clinical event additions ──────────────────────────────────────────────────
try { db.exec(`ALTER TABLE patient_events ADD COLUMN notification_time TEXT DEFAULT '08:00'`); } catch {}

// ── Patient profile additions ─────────────────────────────────────────────────
try { db.exec(`ALTER TABLE patients ADD COLUMN comorbidities TEXT DEFAULT ''`); } catch {}

// ── Clinical events tables ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS patient_events (
    id                            TEXT PRIMARY KEY,
    patient_id                    TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    title                         TEXT NOT NULL,
    event_type                    TEXT DEFAULT '',
    event_mode                    TEXT NOT NULL DEFAULT 'one_time',
    exact_date                    TEXT,
    event_time                    TEXT DEFAULT '',
    recurrence_frequency_value    INTEGER DEFAULT 1,
    recurrence_frequency_unit     TEXT DEFAULT 'weeks',
    start_date                    TEXT,
    end_date                      TEXT,
    notes                         TEXT DEFAULT '',
    category                      TEXT DEFAULT 'other',
    priority                      TEXT DEFAULT 'info',
    show_in_weekly_reminders      INTEGER DEFAULT 1,
    mark_exact_day_in_calendar    INTEGER DEFAULT 1,
    pre_reminder_enabled          INTEGER DEFAULT 0,
    pre_reminder_offset_value     INTEGER DEFAULT 1,
    pre_reminder_offset_unit      TEXT DEFAULT 'days',
    same_day_reminder_enabled     INTEGER DEFAULT 0,
    post_reminder_enabled         INTEGER DEFAULT 0,
    post_reminder_offset_value    INTEGER DEFAULT 1,
    post_reminder_offset_unit     TEXT DEFAULT 'weeks',
    send_email                    INTEGER DEFAULT 0,
    send_whatsapp                 INTEGER DEFAULT 0,
    is_active                     INTEGER DEFAULT 1,
    created_at                    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patient_event_occurrences (
    id               TEXT PRIMARY KEY,
    event_id         TEXT NOT NULL REFERENCES patient_events(id) ON DELETE CASCADE,
    occurrence_date  TEXT NOT NULL,
    reminder_kind    TEXT NOT NULL,
    channel          TEXT NOT NULL DEFAULT 'in_app',
    status           TEXT NOT NULL DEFAULT 'pending',
    sent_at          TEXT,
    error_message    TEXT,
    UNIQUE(event_id, occurrence_date, reminder_kind, channel)
  );

  CREATE INDEX IF NOT EXISTS idx_pev_patient  ON patient_events(patient_id);
  CREATE INDEX IF NOT EXISTS idx_peo_event    ON patient_event_occurrences(event_id);
`);

// ── Treatment scheduling tables ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS patient_treatments (
    id                   TEXT PRIMARY KEY,
    patient_id           TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    treatment_type       TEXT DEFAULT '',
    frequency_value      INTEGER NOT NULL DEFAULT 1,
    frequency_unit       TEXT NOT NULL DEFAULT 'weeks',
    start_date           TEXT NOT NULL,
    last_treatment_date  TEXT,
    notes                TEXT DEFAULT '',
    is_active            INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS treatment_reminder_rules (
    id                  TEXT PRIMARY KEY,
    treatment_id        TEXT NOT NULL REFERENCES patient_treatments(id) ON DELETE CASCADE,
    trigger_type        TEXT NOT NULL DEFAULT 'after',
    offset_value        INTEGER NOT NULL DEFAULT 0,
    offset_unit         TEXT NOT NULL DEFAULT 'days',
    message             TEXT NOT NULL DEFAULT '',
    repeat_each_cycle   INTEGER NOT NULL DEFAULT 1,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS treatment_reminder_occurrences (
    id               TEXT PRIMARY KEY,
    rule_id          TEXT NOT NULL REFERENCES treatment_reminder_rules(id) ON DELETE CASCADE,
    occurrence_date  TEXT NOT NULL,
    dismissed_at     TEXT,
    UNIQUE(rule_id, occurrence_date)
  );

  CREATE INDEX IF NOT EXISTS idx_pt_treatments ON patient_treatments(patient_id);
  CREATE INDEX IF NOT EXISTS idx_trr_treatment ON treatment_reminder_rules(treatment_id);
  CREATE INDEX IF NOT EXISTS idx_tro_rule      ON treatment_reminder_occurrences(rule_id);
`);

module.exports = db;
