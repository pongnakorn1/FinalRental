import multer from 'multer';
import path from 'path';

// ตั้งค่าโฟลเดอร์สำหรับเก็บรูปโปรไฟล์
const storageProfile = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profiles/'); // ตรวจสอบให้แน่ใจว่าคุณมีโฟลเดอร์นี้ในโปรเจกต์แล้ว
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// สร้างตัวแปร uploadProfile เพื่อให้ auth.routes.js ดึงไปใช้ได้
export const uploadProfile = multer({ 
  storage: storageProfile,
  limits: { fileSize: 5 * 1024 * 1024 }, // จำกัดขนาด 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: อนุญาตแค่อัปโหลดไฟล์รูปภาพ (jpeg, jpg, png, webp) เท่านั้น"));
  }
});