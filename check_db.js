import pool from './pool.js';
async function check() {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", tables.rows.map(r => r.table_name));
    
    const usersCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log("Users Columns:", usersCols.rows.map(r => r.column_name));
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
