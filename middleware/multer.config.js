import fs from 'fs'; // 🟢 Import มาแล้ว ต้องเอามาใช้ด้วยครับ
import multer from 'multer';
import path from 'path';

// ตั้งค่าโฟลเดอร์สำหรับเก็บรูปโปรไฟล์
const storageProfile = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/profiles/';
    
    // 🛠️ จุดที่แก้ไข: เช็คว่ามีโฟลเดอร์หรือยัง ถ้ายังไม่มีให้สร้างเลย!
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 📸 ตั้งค่าโฟลเดอร์สำหรับเก็บรูปแจ้งสินค้าเสียหาย
const storageDamage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/damages/';
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'damage-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadDamage = multer({ 
  storage: storageDamage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// 💬 ตั้งค่าโฟลเดอร์สำหรับเก็บรูปในแชท
const storageChat = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/chat/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadChat = multer({
  storage: storageChat,
  limits: { fileSize: 5 * 1024 * 1024 }
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