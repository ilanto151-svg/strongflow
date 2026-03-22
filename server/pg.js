require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
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
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // therapists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS therapists (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      reset_token TEXT,
      reset_exp TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // make sure missing columns are added even if table already existed
  await pool.query(`
    ALTER TABLE therapists
    ADD COLUMN IF NOT EXISTS reset_token TEXT;
  `);

  await pool.query(`
    ALTER TABLE therapists
    ADD COLUMN IF NOT EXISTS reset_exp TEXT;
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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

  console.log('✅ Tables ready (patients + exercises + therapists + reports + share_pages)');
}

async function testPgConnection() {
  await initDB();
  const result = await pool.query('SELECT NOW() AS now');
  console.log('✅ Postgres connected:', result.rows[0].now);
}

module.exports = { pool, testPgConnection };