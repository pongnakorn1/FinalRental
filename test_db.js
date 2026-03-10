import pool from './config/db.js';

async function testDB() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables in DB:", res.rows.map(r => r.table_name));
    
    // Check columns of 'users'
    const usersCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log("Users Columns:", usersCols.rows.map(r => `${r.column_name} (${r.data_type})`));

    // Check columns of 'bookings' if exists
    if (res.rows.some(r => r.table_name === 'bookings')) {
      const bookingsCols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'bookings'
      `);
      console.log("Bookings Columns:", bookingsCols.rows.map(r => `${r.column_name} (${r.data_type})`));
    }

    process.exit(0);
  } catch (err) {
    console.error("DB Test Error:", err);
    process.exit(1);
  }
}

testDB();
