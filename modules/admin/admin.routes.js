import express from "express";
import { 
    viewPendingKYC, 
    approveRejectKYC, 
    suspendUser 
} from './admin.controller.js';
  viewPendingKYC, 
  approveRejectKYC 
} from './admin.controller.js';

// เพิ่มการ import ฟังก์ชันจาก dispute controller ที่เราเพิ่งสร้าง
import { 
  getAllDisputes, 
  getDisputeById, 
  decideDispute 
} from './dispute.controller.js'; 

// ✅ ตัด verifyToken ออก และใช้ authenticateToken ตัวเดียวให้ครอบคลุม
import { authenticateToken } from "../../middleware/auth.middleware.js";
import { requireAdmin } from "../../middleware/role.middleware.js";

const router = express.Router();

// 🚀 เส้นทางสำหรับระงับผู้ใช้งาน (ใส่ requireAdmin ไว้เพื่อความปลอดภัย)
router.post('/suspend/:id', authenticateToken, requireAdmin, suspendUser);

// 📋 เส้นทางสำหรับดูรายการ KYC ที่รออนุมัติ
// --- ส่วนของ KYC (เดิม) ---
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

// --- ส่วนของ Dispute Judge (เพิ่มใหม่ AD-2) ---
// 1. ดูรายการข้อพิพาททั้งหมด
router.get(
  "/disputes",
  authenticateToken,
  requireAdmin,
  getAllDisputes
);

// 2. ดูรายละเอียดหลักฐานรายเคส (AD-2-001)
router.get(
  "/disputes/:id",
  authenticateToken,
  requireAdmin,
  getDisputeById
);

// 3. ตัดสินข้อพิพาท (Approve/Refund/Reject)
router.patch(
  "/disputes/:id/decide",
  authenticateToken,
  requireAdmin,
  decideDispute
);

export default router;