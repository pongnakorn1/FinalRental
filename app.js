import express from 'express';
import 'dotenv/config';
import path from 'path'; 
import { fileURLToPath } from 'url';
import cors from 'cors'; 
import session from 'express-session';
import passport from './config/passport.js';

// Import Routes
import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import shopRoutes from './modules/shop/shop.routes.js';
import productRoutes from './modules/product/product.routes.js';
import rentalRoutes from './modules/rental/rental.routes.js';
import paymentRoutes from './modules/payment/payment.routes.js';
import chatRoutes from './modules/chat/chat.Routes.js';
import moneyRoutes from './modules/money/money.routes.js';
import autoRefundRoutes from "./modules/Interval/setInterval.route.js";
import { processAutoRefunds } from "./modules/Interval/setInterval.controller.js";
import reviewRoutes from "./modules/Review/review.route.js";
import addressRoutes from "./modules/address/address.routes.js";

const app = express();

// ตั้งค่า Path สำหรับ ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. ตั้งค่าพื้นฐาน (CORS & Body Parser)
// ==========================================
// แก้ไข: รวม CORS เป็นอันเดียว และระบุ Origin ให้ชัดเจน
app.use(cors({
  origin: [
    'http://localhost:8082', 
    'http://localhost:3001', 
    'http://localhost:3000',
    process.env.CLIENT_URL // อย่าลืมใส่ URL ของหน้าเว็บคุณใน Render Env
  ].filter(Boolean), // กรองค่าที่เป็น undefined ออก
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware สำหรับ Log Request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ==========================================
// 2. 🔥 ตั้งค่า Session (สำหรับ Passport)
// ==========================================
app.set('trust proxy', 1); // สำคัญสำหรับ Render

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // เป็น true เมื่ออยู่บน HTTPS (Render)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 
  }
}));

// ==========================================
// 3. เริ่มต้นใช้งาน Passport
// ==========================================
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// ==========================================
// 4. API Routes
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/money', moneyRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/interval", autoRefundRoutes);
app.use("/api/address", addressRoutes);


// Static Folder สำหรับรูปภาพ
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

// ==========================================
// 5. ระบบ Cron Job / Auto Refund
// ==========================================
const ONE_HOUR = 60 * 60 * 1000;
setInterval(processAutoRefunds, ONE_HOUR);
// processAutoRefunds(); // เปิดคอมเมนต์นี้ถ้าต้องการรันทันทีที่ Start Server

// ==========================================
// 6. Centralized Error Handling
// ==========================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

export default app;