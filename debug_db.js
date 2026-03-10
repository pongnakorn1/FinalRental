import pool from './pool.js';

async function checkBookings() {
  try {
    const res = await pool.query("SELECT id, status, renter_id, slip_image FROM bookings");
    console.log("All Bookings:", res.rows);
    
    const pending = await pool.query("SELECT id, status FROM bookings WHERE status = 'waiting_admin_verify'");
    console.log("Pending Admin Verify:", pending.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkBookings();
