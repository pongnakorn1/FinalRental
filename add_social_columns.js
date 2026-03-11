import pool from './pool.js';

async function addSocialColumns() {
  try {
    console.log("Checking and adding social login columns...");
    
    // Add google_id
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`);
    console.log("✅ google_id added");
    
    // Add facebook_id
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255) UNIQUE`);
    console.log("✅ facebook_id added");
    
    // Add line_id
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS line_id VARCHAR(255) UNIQUE`);
    console.log("✅ line_id added");
    
    // Add kyc_status if missing (controller uses it)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'not_submitted'`);
    console.log("✅ kyc_status ensured");

    // Add is_suspended, suspension_reason if missing
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT`);
    console.log("✅ Suspension columns ensured");

    // Add profile_picture if missing
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT`);
    console.log("✅ profile_picture added");

    // Add password as NULLABLE for social users
    await pool.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
    console.log("✅ password column is now nullable (for social users)");

    console.log("🚀 All social columns are ready!");
  } catch (err) {
    console.error("❌ Error updating users table:", err.message);
  } finally {
    process.exit();
  }
}

addSocialColumns();
