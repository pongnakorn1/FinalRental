import express from 'express';
import 'dotenv/config';
import path from 'path'; 
import { fileURLToPath } from 'url';
import cors from 'cors'; 

import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import shopRoutes from './modules/shop/shop.routes.js';
import productRoutes from './modules/product/product.routes.js';
import rentalRoutes from './modules/rental/rental.routes.js';
import paymentRoutes from './modules/payment/payment.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. ตั้งค่า CORS ให้รองรับทั้งการพัฒนาและการใช้งานจริง
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3001', 
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Static Folder สำหรับรูปภาพ (ใช้ path.resolve เพื่อความแม่นยำของพาธ)
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Middleware สำหรับ Log Request (ช่วยให้ Debug ง่ายขึ้นเวลาหน้าบ้านเรียก API)
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

// 3. Centralized Error Handling (ดักจับ Error ทุกอย่างในที่เดียว)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

export default app;