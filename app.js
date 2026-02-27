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

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. ตั้งค่าพื้นฐาน (CORS & Body Parser)
// ==========================================
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3001', 
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware สำหรับ Log Request (ย้ายมาไว้ด้านบนเพื่อดูทุก Request)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ==========================================
// 2. 🔥 ตั้งค่า Session (ต้องอยู่ก่อน Passport และ Routes)
// ==========================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true,        // ต้องเป็น true เมื่อรันบน Production (HTTPS)
    sameSite: 'none',    // สำคัญมากเพื่อให้ Redirect ข้ามโดเมนได้ (LINE -> Render)
    maxAge: 24 * 60 * 60 * 1000 // 1 วัน
  }
}));

// ==========================================
// 3. เริ่มต้นใช้งาน Passport
// ==========================================
app.use(passport.initialize());
app.use(passport.session());

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
processAutoRefunds(); // รันทันที 1 รอบตอนเปิดเครื่อง

// ==========================================
// 6. Centralized Error Handling (ไว้ท้ายสุด)
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