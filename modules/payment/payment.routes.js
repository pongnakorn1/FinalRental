import express from 'express';
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
  adminVerifyPayment
);

export default router;
