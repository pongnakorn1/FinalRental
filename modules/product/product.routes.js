import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
    createProduct, 
    getAllProducts, 
    getProductsByShop, 
    getMyProducts,
    updateProduct, 
    deleteProduct, 
    toggleProductStatus 
} from './product.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';  

const router = express.Router();

// --- [ ตั้งค่า Multer สำหรับรูปสินค้าหลายรูป ] ---
const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/temp';
        // ตรวจสอบและสร้างโฟลเดอร์ถ้ายังไม่มี
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'raw-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: tempStorage,
    limits: { 
        fileSize: 25 * 1024 * 1024, // 25MB ต่อไฟล์
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("รองรับเฉพาะไฟล์รูปภาพเท่านั้น (jpg, png, webp)"));
    }
});

// 📌 สร้างสินค้า (ใช้ .array เพื่อรับรูป 4-10 รูป ฟิลด์ชื่อ 'product_images')
router.post(
    '/', 
    authenticateToken, 
    requireVerified, 
    upload.array('product_images', 10), // ✅ รับได้สูงสุด 10 รูป
    createProduct
);

// 📌 สร้างสินค้า (ต้อง login + KYC)
router.post('/', authenticateToken, requireVerified, createProduct);

// 📌 1. ดึงสินค้าของตัวเอง (ต้องอยู่ก่อน /:id เพื่อไม่ให้สับสน)
router.get('/me', authenticateToken, getMyProducts);

// 📌 ดูสินค้าทั้งหมด
router.get('/', getAllProducts);

// 📌 ดูสินค้าตามร้าน
router.get('/shop/:shop_id', getProductsByShop);

// 📌 แก้สินค้า
router.put('/:id', authenticateToken, requireVerified, updateProduct);

// 📌 ลบสินค้า
router.delete('/:id', authenticateToken, requireVerified, deleteProduct);

// 📌 สลับสถานะการให้เช่า
router.patch('/:id/toggle', authenticateToken, toggleProductStatus);

// 📌 ถ้าเพื่อนอยากได้แบบระบุ ID ของใครก็ได้ใน URL (เช่น /api/products/user/5)
router.get('/user/:id', getProductsByUserId);

export default router;
