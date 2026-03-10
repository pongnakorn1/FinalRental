import {
    createShop,
    getAllShops,
    getMyShop,
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
router.get('/me', authenticateToken, getMyShop);
router.get('/:id', getShopById);

export default router;
