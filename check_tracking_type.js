import pool from './pool.js';
async function test() {
    try {
        const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings' AND column_name LIKE '%tracking%'`);
        console.table(res.rows);
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
test();
