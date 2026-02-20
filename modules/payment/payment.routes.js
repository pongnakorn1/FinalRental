import express from 'express';
import { requireAdmin } from '../../middleware/role.middleware.js';
import {
  createPayment,
  adminVerifyPayment
} from './payment.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', authenticateToken, createPayment);

router.put(
  '/:id/admin-verify',
  authenticateToken,
  requireAdmin,
  adminVerifyPayment
);

export default router;
