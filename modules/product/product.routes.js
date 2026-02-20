import express from 'express';
import {
  createProduct,
  getAllProducts,
  getProductsByShop,
  updateProduct,
  deleteProduct
} from './product.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

// 📌 สร้างสินค้า (ต้อง login + KYC)
router.post('/', authenticateToken, requireVerified, createProduct);

// 📌 ดูสินค้าทั้งหมด
router.get('/', getAllProducts);

// 📌 ดูสินค้าตามร้าน
router.get('/shop/:shop_id', getProductsByShop);

// 📌 แก้สินค้า
router.put('/:id', authenticateToken, requireVerified, updateProduct);

// 📌 ลบสินค้า
router.delete('/:id', authenticateToken, requireVerified, deleteProduct);

export default router;
