import express from "express";
// 1. รวมการ Import จาก Controller ทั้งหมดไว้ที่เดียว
import { 
    viewPendingKYC, 
    approveRejectKYC, 
    suspendUser,
    getForgotPasswordRequests, 
    adminResetPassword
} from './admin.controller.js';

import { 
    getAllDisputes, 
    getDisputeById, 
    decideDispute 
} from './dispute.controller.js'; 

// 2. Import Middleware
import { authenticateToken } from "../../middleware/auth.middleware.js";
import { requireAdmin } from "../../middleware/role.middleware.js";

const router = express.Router();

// ใช้ Middleware ตรวจสอบ Admin กับทุก Route ในไฟล์นี้เพื่อความปลอดภัย
router.use(authenticateToken);
router.use(requireAdmin);

// ==========================================
// 📌 ส่วนของ User Management & KYC
// ==========================================

// ดูรายการ KYC ที่รออนุมัติ
router.get("/kyc/pending", viewPendingKYC);

// อนุมัติหรือปฏิเสธ KYC
router.put("/kyc/:id", approveRejectKYC);

// ระงับการใช้งานผู้ใช้ (เปลี่ยนเป็น PATCH หรือ POST ตามที่คุณออกแบบ)
router.post('/suspend/:id', suspendUser);


// ==========================================
// 📌 ส่วนของ Dispute Judge (ระบบตัดสินข้อพิพาท)
// ==========================================

// 1. ดูรายการข้อพิพาททั้งหมด
router.get("/disputes", getAllDisputes);

// 2. ดูรายละเอียดหลักฐานรายเคส (AD-2-001)
router.get("/disputes/:id", getDisputeById);

// 3. ตัดสินข้อพิพาท (Approve/Refund/Reject)
router.patch("/disputes/:id/decide", decideDispute);

// ==========================================
// 📌 ส่วนของ Password Management (ใหม่)
// ==========================================

// 1. ดูรายการผู้ใช้ที่กด "ลืมรหัสผ่าน" และรอการช่วยเหลือ
router.get("/password-requests", getForgotPasswordRequests);

// 2. Admin ทำการกรอกรหัสใหม่ให้ผู้ใช้รายคน
router.post("/reset-user-password", adminResetPassword);

export default router;