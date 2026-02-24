import express from 'express';
import moneyController from './money.controller.js';

const router = express.Router();

// Route สำหรับการเงิน
router.post('/bank/add', moneyController.addBankAccount); // ผูกบัญชี
router.post('/withdraw/request', moneyController.requestWithdraw); // ขอถอนเงิน
router.put('/admin/approve', moneyController.approveWithdraw);

export default router;