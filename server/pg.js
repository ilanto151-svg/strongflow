require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
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

  console.log('✅ Tables ready (patients + exercises)');
}

async function testPgConnection() {
  await initDB();
  const result = await pool.query('SELECT NOW() AS now');
  console.log('✅ Postgres connected:', result.rows[0].now);
}

module.exports = { pool, testPgConnection };