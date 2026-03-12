import pool from './config/db.js';

const createDisputesTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS disputes (
                id SERIAL PRIMARY KEY,
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                raised_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
                description TEXT,
                images TEXT, -- Store JSON string of image paths
                status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'resolved_refund', 'resolved_payout', 'rejected'
                admin_comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Disputes table created successfully");
        process.exit();
    } catch (err) {
        console.error("❌ Error creating disputes table:", err.message);
        process.exit(1);
    }
};

createDisputesTable();
