require('dotenv').config();
const { Pool } = require('pg');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

async function testPgConnection() {
  const result = await pool.query('SELECT NOW() AS now');
  console.log('✅ Postgres connected:', result.rows[0].now);
}

module.exports = { pool, testPgConnection };
