require('dotenv').config();
const { Pool } = require('pg');

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// 🔥 יצירת טבלה אוטומטית
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

  console.log('✅ Patients table ready');
}

async function testPgConnection() {
  await initDB(); // 🔥 חשוב מאוד
  const result = await pool.query('SELECT NOW()');
  console.log('✅ Postgres connected:', result.rows[0].now);
}

module.exports = { pool, testPgConnection };