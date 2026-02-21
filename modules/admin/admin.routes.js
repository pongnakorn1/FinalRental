import express from "express";
import { 
    viewPendingKYC, 
    approveRejectKYC, 
    suspendUser 
} from './admin.controller.js';

// ✅ ตัด verifyToken ออก และใช้ authenticateToken ตัวเดียวให้ครอบคลุม
import { authenticateToken } from "../../middleware/auth.middleware.js";
import { requireAdmin } from "../../middleware/role.middleware.js";

const router = express.Router();

// 🚀 เส้นทางสำหรับระงับผู้ใช้งาน (ใส่ requireAdmin ไว้เพื่อความปลอดภัย)
router.post('/suspend/:id', authenticateToken, requireAdmin, suspendUser);

// 📋 เส้นทางสำหรับดูรายการ KYC ที่รออนุมัติ
router.get(
  "/kyc/pending",
  authenticateToken,
  requireAdmin,
  viewPendingKYC
);

// ✅ เส้นทางสำหรับอนุมัติหรือปฏิเสธ KYC
router.patch(
  "/kyc/:id",
  authenticateToken,
  requireAdmin,
  approveRejectKYC
);

export default router;