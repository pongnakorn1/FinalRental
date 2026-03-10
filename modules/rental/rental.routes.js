import express from 'express';
import {
  createRental,
  ownerApproveRental,
  updateRentalStatus,
  getWalletBalance,
  getTransactionHistory,
  getRenterRentals,
  getOwnerRentals
} from './rental.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

// ==========================================
// 📌 1. STATIC ROUTES (กลุ่มเส้นทางคงที่)
// ต้องวางไว้ด้านบนสุด เพื่อไม่ให้ติดเงื่อนไข :id
// ==========================================

// ดูยอดเงินใน Wallet ของตัวเอง
router.get('/wallet/balance', authenticateToken, getWalletBalance);

// ดูประวัติการเงิน (Transaction History)
router.get('/wallet/transactions', authenticateToken, getTransactionHistory);

// ดึงรายการที่ "เราไปเช่าคนอื่น"
router.get('/renter', authenticateToken, getRenterRentals);

// ดึงรายการที่ "มีคนมาเช่าของร้านเรา"
router.get('/owner', authenticateToken, getOwnerRentals);


// ==========================================
// 📌 2. ACTION ROUTES (กลุ่มการสร้างและแก้ไข)
// ==========================================

// สร้างรายการจอง (POST /)
router.post('/', authenticateToken, requireVerified, createRental);

// อนุมัติการเช่าโดยเจ้าของร้าน (:id)
router.put('/:id/owner-approve', authenticateToken, requireVerified, ownerApproveRental);

// อัปเดตสถานะตามลำดับ (ship, receive, return, verify)
router.put('/:id/status', authenticateToken, requireVerified, updateRentalStatus);

export default router;