import express from "express";
// รวมการ Import จาก admin.controller.js ให้เป็นชุดเดียว
import {
    adminResetPassword,
    approvePasswordReset,
    approveRejectKYC,
    getAllTransactions,
    getAllUsers,
    getForgotPasswordRequests,
    suspendUser,
    viewPendingKYC,
    viewAllKYC // เพิ่มตัวนี้เข้าไปด้วยถ้ามีใน controller
} from './admin.controller.js';

import {
    decideDispute,
    getAllDisputes,
    getDisputeById
} from './dispute.controller.js';

// Import Middleware
import { authenticateToken } from "../../middleware/auth.middleware.js";
import { requireAdmin } from "../../middleware/role.middleware.js";

const router = express.Router();

// ใช้ Middleware ตรวจสอบความเป็น Admin กับทุก Route ในไฟล์นี้
router.use(authenticateToken);
router.use(requireAdmin);

// ==========================================
// 📌 User Management & KYC
// ==========================================
router.get("/kyc/pending", viewPendingKYC);
router.get("/kyc/all", viewAllKYC);
router.put("/kyc/:id", approveRejectKYC);
router.post('/suspend/:id', suspendUser);

// ==========================================
// 📌 Dispute Management (ระบบตัดสินข้อพิพาท)
// ==========================================
router.get("/disputes", getAllDisputes);
router.get("/disputes/:id", getDisputeById);
router.patch("/disputes/:id/decide", decideDispute);

// ==========================================
// 📌 Password & User Management
// ==========================================
router.get("/password-requests", getForgotPasswordRequests);
router.patch("/password-requests/:id/approve", approvePasswordReset);
router.post("/reset-user-password", adminResetPassword);

router.get("/users", getAllUsers);
router.get("/transactions", getAllTransactions);

export default router;