import express from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireAdmin } from '../../middleware/role.middleware.js';
import { uploadSlip } from '../../middleware/multer.config.js';
import moneyController from './money.controller.js';

const router = express.Router();

// Route สำหรับการเงิน
router.post('/bank/add', authenticateToken, moneyController.addBankAccount); // ผูกบัญชี
router.post('/withdraw/request', authenticateToken, moneyController.requestWithdraw); // ขอถอนเงิน

// Admin Routes
router.get('/admin/withdraw-pending', authenticateToken, requireAdmin, moneyController.getPendingWithdrawals);
router.get('/admin/withdrawals/pending', authenticateToken, requireAdmin, moneyController.getPendingWithdrawals); // รองรับทั้งสองแบบ ใน frontend
router.put('/admin/approve', authenticateToken, requireAdmin, moneyController.approveWithdraw);

export default router;
