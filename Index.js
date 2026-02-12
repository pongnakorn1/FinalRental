import 'dotenv/config';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = 3000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
});

app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

// 🔥 เชื่อมต่อ DB ตอนเริ่ม server
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
