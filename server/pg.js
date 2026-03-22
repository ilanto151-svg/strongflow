// pg.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ===== INIT DB =====
async function initDB() {
  // therapists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS therapists (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      reset_token TEXT,
      reset_exp TEXT,
      whatsapp_number TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE therapists
    ADD COLUMN IF NOT EXISTS reset_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE therapists
    ADD COLUMN IF NOT EXISTS reset_exp TEXT;
  `);

  await pool.query(`
    ALTER TABLE therapists
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
  `);

  // patients
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      therapist_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      dob TEXT,
      gender TEXT,
      diagnosis TEXT,
      medhistory TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      sort_order INTEGER DEFAULT 0,
      equipment TEXT DEFAULT '',
      environment TEXT DEFAULT '',
      comorbidities TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS equipment TEXT DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS comorbidities TEXT DEFAULT '';
  `);

  // exercises
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      instance_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      image TEXT DEFAULT '',
      description TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      sets TEXT DEFAULT '',
      reps TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      body_area TEXT DEFAULT '',
      weight TEXT DEFAULT '',
      rest TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      rpe INTEGER DEFAULT 5,
      img_data TEXT,
      img_url TEXT,
      link TEXT,
      intervals TEXT,
      target_hr TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS weight TEXT DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS rest TEXT DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS target_hr TEXT DEFAULT '';
  `);

  // reports
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      patient_id TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      fatigue INTEGER,
      pain INTEGER,
      wellbeing INTEGER,
      notes TEXT,
      session_rpe TEXT,
      session_data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS session_rpe TEXT;
  `);

  await pool.query(`
    ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS session_data TEXT;
  `);

  // share_pages
  await pool.query(`
    CREATE TABLE IF NOT EXISTS share_pages (
      token TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      therapist_id TEXT NOT NULL,
      html TEXT NOT NULL,
      filename TEXT,
      first_name TEXT,
      week_summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE share_pages
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  // patient_events
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patient_events (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      title TEXT NOT NULL,
      event_type TEXT DEFAULT '',
      event_mode TEXT NOT NULL DEFAULT 'one_time',
      exact_date TEXT,
      event_time TEXT DEFAULT '',
      recurrence_frequency_value INTEGER DEFAULT 1,
      recurrence_frequency_unit TEXT DEFAULT 'weeks',
      start_date TEXT,
      end_date TEXT,
      notes TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      priority TEXT DEFAULT 'info',
      show_in_weekly_reminders BOOLEAN DEFAULT TRUE,
      mark_exact_day_in_calendar BOOLEAN DEFAULT TRUE,
      pre_reminder_enabled BOOLEAN DEFAULT FALSE,
      pre_reminder_offset_value INTEGER DEFAULT 1,
      pre_reminder_offset_unit TEXT DEFAULT 'days',
      same_day_reminder_enabled BOOLEAN DEFAULT FALSE,
      post_reminder_enabled BOOLEAN DEFAULT FALSE,
      post_reminder_offset_value INTEGER DEFAULT 1,
      post_reminder_offset_unit TEXT DEFAULT 'weeks',
      send_email BOOLEAN DEFAULT FALSE,
      send_whatsapp BOOLEAN DEFAULT FALSE,
      notification_time TEXT DEFAULT '08:00',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE patient_events
    ADD COLUMN IF NOT EXISTS notification_time TEXT DEFAULT '08:00';
  `);

  // patient_event_occurrences
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patient_event_occurrences (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      occurrence_date TEXT NOT NULL,
      reminder_kind TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'in_app',
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMP,
      error_message TEXT,
      UNIQUE(event_id, occurrence_date, reminder_kind, channel)
    );
  `);

  // indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exercises_patient_day
    ON exercises(patient_id, day_key);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_reports_patient
    ON reports(patient_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_patients_therapist
    ON patients(therapist_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_share_pages_patient
    ON share_pages(patient_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_patient_events_patient
    ON patient_events(patient_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_patient_event_occurrences_event
    ON patient_event_occurrences(event_id);
  `);

  console.log('✅ Tables ready');
}

// ===== TEST CONNECTION =====
async function testPgConnection() {
  try {
    await initDB();
    const result = await pool.query('SELECT NOW() AS now');
    console.log('✅ Postgres connected:', result.rows[0].now);
  } catch (err) {
    console.error('❌ Postgres error:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testPgConnection };