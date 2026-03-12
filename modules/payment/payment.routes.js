import express from 'express';
import { requireAdmin } from '../../middleware/role.middleware.js';
import {
    adminVerifyPayment,
    createPayment,
    getPendingVerifyBookings
} from './payment.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', authenticateToken, createPayment);

// ดูรายการสลิปที่รอตรวจสอบ (Admin)
router.get('/admin/pending-verify', authenticateToken, requireAdmin, getPendingVerifyBookings);


router.put(
  '/:id/admin-verify',
  authenticateToken,
  requireAdmin,
  adminVerifyPayment
);

export default router;
