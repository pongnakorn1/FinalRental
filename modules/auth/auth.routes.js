import express from 'express';
import passport from 'passport'; 
import { register, login, uploadKYC, socialLogin } from './auth.controller.js'; 
import { authenticateToken } from '../../middleware/auth.middleware.js'; 
import { requestOTP, verifyOTP } from './otp.controller.js';
import multer from 'multer';
import path from 'path';

const router = express.Router(); // ✅ ประกาศตัวแปร router ก่อนเริ่มกำหนดเส้นทาง (Routes)

// --- [ 1. ตั้งค่า Multer สำหรับ KYC ] ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/kyc/'); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: File upload only supports images (jpeg, jpg, png)"));
  }
});

// --- [ 2. Routes สำหรับ Authentication ทั่วไป ] ---
router.post('/register', register);
router.post('/login', login);

// --- [ 3. Routes สำหรับ OTP (Twilio/Firebase) ] ---
router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyOTP);

// --- [ 4. Routes สำหรับ Social Login ] ---

// --- Google ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    socialLogin
);

// --- Facebook ---
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', 
    passport.authenticate('facebook', { failureRedirect: '/login', session: false }),
    socialLogin
);

// --- LINE ---
router.get('/line', passport.authenticate('line'));
router.get('/line/callback', 
    passport.authenticate('line', { failureRedirect: '/login', session: false }),
    socialLogin
);

// --- [ 5. Route สำหรับ KYC (ต้อง Login ก่อน) ] ---
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