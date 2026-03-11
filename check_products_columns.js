import pool from './pool.js';

async function checkProductsTable() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products'
    `);
    console.log("Columns in products table:");
    res.rows.forEach(col => console.log(`${col.column_name}: ${col.data_type}`));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkProductsTable();
