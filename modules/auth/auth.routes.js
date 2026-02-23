import express from 'express';
import { register, login, uploadKYC } from './auth.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js'; // มั่นใจว่า path ถูกต้อง
import { requestOTP, verifyOTP } from './otp.controller.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// 1. ตั้งค่าการเก็บไฟล์รูป KYC
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/kyc/'); // ต้องสร้างโฟลเดอร์นี้รอไว้ด้วยนะครับ
  },
  filename: (req, file, cb) => {
    // ตั้งชื่อไฟล์ใหม่เพื่อป้องกันชื่อซ้ำ: kyc-userId-timestamp.jpg
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // จำกัด 5MB ตามแผน KYC-1-001
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: File upload only supports the following filetypes - " + filetypes));
  }
});

// --- Routes เดิม ---
router.post('/register', register);
router.post('/login', login);

// OTP Routes 
router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyOTP);


// --- เพิ่ม Route สำหรับ KYC ---
// ใช้ verifyToken เพื่อดึง req.user.id มาใช้ใน controller
router.post(
  '/upload-kyc', 
  authenticateToken, 
  upload.fields([
    { name: 'id_card_image', maxCount: 1 },
    { name: 'face_image', maxCount: 1 }
  ]), 
  uploadKYC
);

export default router;