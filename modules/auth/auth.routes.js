import express from 'express';
import passport from 'passport'; 
import { register, login, uploadKYC, socialLogin, extractIDNumber, getMyProfile, updateProfile, requestPasswordReset } from './auth.controller.js'; 
import { authenticateToken } from '../../middleware/auth.middleware.js'; 
import { requestOTP, verifyOTP } from './otp.controller.js';
import multer from 'multer';
import { uploadProfile } from "../../middleware/multer.config.js"; // ตัวอย่าง path
import path from 'path';

const router = express.Router(); 



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
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Error: File upload only supports images (jpeg, jpg, png)"));
  }
});

// --- [ 2. Routes ทั่วไป ] ---
router.post('/register', register);
router.post('/login', login);
router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyOTP);
router.post('/google-vision', upload.single('id_image'), extractIDNumber);
router.post('/forgot-password-request', requestPasswordReset);
// --- [ 3. Social Login (Google, Facebook, LINE) ] ---

// --- Google ---
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: `${process.env.CLIENT_URL || ''}/login?error=google_failed`,
        session: false 
    }),
    socialLogin 
);

// --- Facebook ---
router.get('/facebook', passport.authenticate('facebook', { 
    scope: ['email'] 
}));




router.get('/facebook/callback', 
    passport.authenticate('facebook', { 
        failureRedirect: `${process.env.CLIENT_URL || ''}/login?error=facebook_failed`,
        session: false 
    }),
    socialLogin
);

// --- LINE ---
// ✅ แก้ไข: เพิ่ม scope เพื่อขอสิทธิ์เข้าถึง Email และ OpenID
router.get('/line', passport.authenticate('line', {
    scope: ['profile', 'openid', 'email'] 
})); 

router.get('/line/callback', 
    passport.authenticate('line', { 
        failureRedirect: `${process.env.CLIENT_URL || ''}/login?error=line_failed`, 
        session: false 
    }),
    socialLogin
);

// --- [ 4. Route สำหรับ KYC ] ---
router.post('/upload-kyc', authenticateToken, upload.fields([
    { name: 'id_card_image', maxCount: 1 },
    { name: 'face_image', maxCount: 1 }
  ]), uploadKYC
);

// 📌 ดูข้อมูลตัวเอง (ใช้ Token)
router.get('/me', authenticateToken, getMyProfile);



// ✅ อัปเดตโปรไฟล์ (เพิ่ม upload.single เพื่อรับรูปโปรไฟล์)
router.patch('/update-profile', authenticateToken, uploadProfile.single('profile_picture'), updateProfile);

export default router;
