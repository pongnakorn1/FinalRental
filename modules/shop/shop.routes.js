import express from 'express';
import {
  createShop,
  getAllShops,
  getShopById
} from './shop.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  requireVerified,
  createShop
);

router.get('/', getAllShops);
router.get('/:id', getShopById);

export default router;
