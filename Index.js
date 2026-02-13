import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
//import pool from './pool.js';


const { Pool } = pg;

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
//-------Register-----------------------------------------------------
app.post('/register', async (req, res) => {
  try {
    const { username, email, phone, address, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users 
       (username, email, phone, address, password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email`,
      [username, email, phone, address, hashedPassword]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});
//-------login----------------------------------------------------
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ หา user
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // 2️⃣ เช็ค password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3️⃣ สร้าง token
    const token = jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role,
    is_verified: user.is_verified
  },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);

    res.json({
      message: "Login successful",
      token,
      user: {
  id: user.id,
  username: user.username,
  role: user.role,
  is_verified: user.is_verified,
  verification_status: user.verification_status
}
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});
// --------- AUTH MIDDLEWARE CreateToken----------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  });
};

// --------- ADMIN ONLY ----------------
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

// --------- VERIFIED ONLY ----------------
const requireVerified = (req, res, next) => {
  if (!req.user.is_verified) {
    return res.status(403).json({
      message: "Please verify your identity first"
    });
  }
  next();
};

//-------CheckToken-----------------------------------------------
app.get('/profile', authenticateToken, (req, res) => {
  res.json({
    message: "Protected route working",
    user: req.user
  });
});
