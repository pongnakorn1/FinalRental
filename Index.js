import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------- DATABASE CONNECTION ----------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
});

// --------- ROOT ROUTE ----------------
app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

// --------- START SERVER ----------------
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


// ======================================================
// 🔐 AUTH SECTION
// ======================================================


// --------- REGISTER ----------------
app.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, address, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, address, password, role, kyc_status)
       VALUES ($1, $2, $3, $4, $5, 'user', 'not_submitted')
       RETURNING id, full_name, email, role, kyc_status`,
      [full_name, email, phone, address, hashedPassword]
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


// --------- LOGIN ----------------
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_status: user.kyc_status
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        kyc_status: user.kyc_status
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});


// ======================================================
// 🛡 MIDDLEWARE SECTION
// ======================================================


// --------- AUTHENTICATE TOKEN ----------------
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


// --------- KYC APPROVED ONLY ----------------
const requireVerified = (req, res, next) => {
  if (req.user.kyc_status !== 'approved') {
    return res.status(403).json({
      message: "Please complete KYC verification"
    });
  }
  next();
};


// ======================================================
// 🔎 TEST ROUTES
// ======================================================


// --------- PROFILE (Protected) ----------------
app.get('/profile', authenticateToken, (req, res) => {
  res.json({
    message: "Protected route working",
    user: req.user
  });
});


// --------- ADMIN TEST ----------------
app.get('/admin-test', authenticateToken, requireAdmin, (req, res) => {
  res.json({ message: "Welcome Admin 👑" });
});


// --------- VERIFIED TEST ----------------
app.get('/rent-test', authenticateToken, requireVerified, (req, res) => {
  res.json({ message: "You are KYC approved ✅" });
});
