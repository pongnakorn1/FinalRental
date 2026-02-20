import express from 'express';
import {
  createRental,
  ownerApproveRental,
  updateRentalStatus
} from './rental.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  requireVerified,
  createRental
);

router.put(
  '/:id/owner-approve',
  authenticateToken,
  requireVerified,
  ownerApproveRental
);

router.put('/:id/status', authenticateToken, updateRentalStatus);

export default router;
