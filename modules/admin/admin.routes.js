import express from 'express';
import { viewPendingKYC, approveRejectKYC } from './admin.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireAdmin } from '../../middleware/role.middleware.js';

const router = express.Router();

router.get('/kyc/pending',
  authenticateToken,
  requireAdmin,
  viewPendingKYC
);

router.put('/kyc/:id',
  authenticateToken,
  requireAdmin,
  approveRejectKYC
);

export default router;
