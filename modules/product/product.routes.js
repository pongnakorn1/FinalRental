import express from 'express';
import {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct
} from './product.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

router.post('/', authenticateToken, requireVerified, createProduct);
router.get('/', getAllProducts);
router.put('/:id', authenticateToken, requireVerified, updateProduct);
router.delete('/:id', authenticateToken, requireVerified, deleteProduct);

export default router;
