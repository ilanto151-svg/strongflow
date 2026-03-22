// db.js
const { pool } = require('./pg');
const bcrypt = require('bcryptjs');

// ===== INIT DB =====
async function initDB() {
  // כאן אנחנו משתמשים באותו init של pg.js
  // אין צורך לשכפל טבלאות
  return true;
}

// ===== SEED DEMO (אם ריק) =====
async function seedDemo() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM therapists');
  
  if (rows[0].count === 0) {
    const hash = bcrypt.hashSync('demo1234', 10);

    await pool.query(`
      INSERT INTO therapists (id, name, email, password)
      VALUES ($1, $2, $3, $4)
    `, ['t1', 'Dr. Sarah Cohen', 'demo@oncomove.com', hash]);

    await pool.query(`
      INSERT INTO patients (id, therapist_id, name, phone, email, dob, gender, diagnosis, medhistory, notes, status, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, ['p1','t1','Miriam Levi','0501234567','miriam@example.com','1970-01-15','Female','Breast Cancer — Stage II','','','active',1]);

    await pool.query(`
      INSERT INTO patients (id, therapist_id, name, phone, email, dob, gender, diagnosis, medhistory, notes, status, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, ['p2','t1','David Katz','0521234568','david@example.com','1963-05-20','Male','Colorectal Cancer — Stage III','','','active',2]);

    console.log('✅ Demo seeded');
  }
}

// ===== INIT ALL =====
async function initAll() {
  await initDB();
  await seedDemo();
}

module.exports = {
  pool,
  initAll,
};