import express from 'express';
import {
  createRental,
  ownerApproveRental,
  updateRentalStatus,
  getWalletBalance,      // <-- ฟังก์ชันใหม่
  getTransactionHistory  // <-- ฟังก์ชันใหม่
} from './rental.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

// 1. สำหรับผู้เช่า: สร้างรายการจอง (ต้อง Login และ Verify แล้ว)
router.post(
  '/',
  authenticateToken,
  requireVerified,
  createRental
);

// 2. สำหรับเจ้าของร้าน: อนุมัติการเช่า (ต้อง Login และ Verify แล้ว)
router.put(
  '/:id/owner-approve',
  authenticateToken,
  requireVerified,
  ownerApproveRental
);

// 3. สำหรับทั้งสองฝ่าย: อัปเดตสถานะตามลำดับ (ship, receive, return, verify)
// แนะนำให้ใส่ requireVerified ไปด้วย เพื่อให้มั่นใจว่าคู่สัญญาทั้งสองฝ่ายตัวตนชัดเจน
router.put(
  '/:id/status', 
  authenticateToken, 
  requireVerified, 
  updateRentalStatus
);

// 4. ดูยอดเงินใน Wallet ของตัวเอง
router.get(
  '/wallet/balance',
  authenticateToken,
  getWalletBalance
);

// 5. ดูประวัติการเงิน (Transaction History)
router.get(
  '/wallet/transactions',
  authenticateToken,
  getTransactionHistory
);

export default router;