import 'dotenv/config';
import pool from './config/db.js';

async function check() {
  try {
    const res = await pool.query("SELECT * FROM bookings WHERE id = 171");
    console.log("Booking 171 data:", res.rows[0]);
    
    if (res.rows[0]) {
      const uRes = await pool.query("SELECT wallet FROM users WHERE id = $1", [res.rows[0].owner_id]);
      console.log("Owner wallet:", uRes.rows[0]);
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
check();
