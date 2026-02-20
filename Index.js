import app from './app.js';
import pool from './config/db.js';

const PORT = 3000;

app.listen(PORT, async () => {
  try {
    await pool.connect();
    console.log('✅ Connected to Database');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('❌ Database connection failed');
    console.error(err);
  }
});
