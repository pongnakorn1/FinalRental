import pool from './pool.js';

async function checkUsersTable() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log("Columns in users table:");
    res.rows.forEach(col => console.log(`${col.column_name}: ${col.data_type}`));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkUsersTable();
