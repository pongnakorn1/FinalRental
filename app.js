import express from 'express';
import 'dotenv/config';
import path from 'path'; 
import { fileURLToPath } from 'url';
import cors from 'cors'; 
import passport from 'passport'; // มีอยู่แล้ว เยี่ยมครับ!

// ✅ เพิ่ม 1: Import ไฟล์ตั้งค่า Google Strategy
// ต้องชี้ path ไปที่ไฟล์ที่คุณเขียน passport.use(new GoogleStrategy(...)) ไว้
import './config/passport.js';

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

app.use("/api/interval", autoRefundRoutes);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. ตั้งค่า CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3001', 
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ เพิ่ม 2: สั่งให้ Passport เริ่มทำงาน (สำคัญมาก!)
// ต้องวางไว้ก่อนการเรียกใช้งาน API Routes
app.use(passport.initialize());

// 2. Static Folder สำหรับรูปภาพ
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Middleware สำหรับ Log Request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/money', moneyRoutes);
app.use("/api/reviews", reviewRoutes);


// ระบบเวลา
const ONE_HOUR = 60 * 60 * 1000;
setInterval(processAutoRefunds, ONE_HOUR);
// รันทันที 1 รอบตอนเปิดเครื่องเพื่อเคลียร์ค้างเก่า
processAutoRefunds();

// 3. Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

export default app;