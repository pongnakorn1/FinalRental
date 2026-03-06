import express from 'express';
import {
  createRental,
  ownerApproveRental,
  updateRentalStatus,
  getWalletBalance,      // <-- ฟังก์ชันใหม่
  getTransactionHistory, // <-- ฟังก์ชันใหม่
  getRenterRentals, // <--- เพิ่มชื่อนี้เข้าไป
  getOwnerRentals
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


// เพิ่ม 2 เส้นทางนี้เข้าไปครับ
router.get('/renter', authenticateToken, getRenterRentals); // สำคัญมาก: เพื่อให้แอปหน้า "รายการเช่า" ทำงานได้
router.get('/owner', authenticateToken, getOwnerRentals);   // สำหรับฝั่งร้านค้าดูรายการที่มีคนเช่า

export default router;