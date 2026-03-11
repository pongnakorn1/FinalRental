import pool from './pool.js';

async function migrateSoftDelete() {
  try {
    console.log("🚀 Starting migration: Adding is_deleted column to products...");
    
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
    `);

    console.log("✅ Migration successful: is_deleted column added (if not existed).");
  } catch (err) {
    console.error("❌ Migration failed:");
    console.error(err);
  } finally {
    process.exit();
  }
}

migrateSoftDelete();
