import {
    createRental,
    getOwnerRentals,
    getRentalById,
    getRenterRentals,
    getTransactionHistory,
    getWalletBalance,
    ownerApproveRental,
    reportDamage,
    updateRentalStatus
} from './rental.controller.js';

import { authenticateToken } from '../../middleware/auth.middleware.js';
import { uploadDamage } from '../../middleware/multer.config.js';
import { requireVerified } from '../../middleware/verified.middleware.js';

const router = express.Router();

// ==========================================

// 📌 1. STATIC ROUTES (กลุ่มเส้นทางคงที่)
// ต้องวางไว้ด้านบนสุด เพื่อไม่ให้ติดเงื่อนไข :id
// ==========================================

// ดูยอดเงินใน Wallet ของตัวเอง
router.get('/wallet/balance', authenticateToken, getWalletBalance);

// ดูประวัติการเงิน (Transaction History)
router.get('/wallet/transactions', authenticateToken, getTransactionHistory);

// ดึงรายการที่ "เราไปเช่าคนอื่น"
router.get('/renter', authenticateToken, getRenterRentals);

// ดึงรายการที่ "มีคนมาเช่าของร้านเรา"
router.get('/owner', authenticateToken, getOwnerRentals);

// ดูรายการเช่าแบบระบุ ID (ต้องวางไว้ด้านล่าง Static Routes)
router.get('/:id', authenticateToken, getRentalById);



// ==========================================
// 📌 2. ACTION ROUTES (กลุ่มการสร้างและแก้ไข)
// ==========================================

// สร้างรายการจอง (POST /)
router.post('/', authenticateToken, requireVerified, createRental);

// อนุมัติการเช่าโดยเจ้าของร้าน (:id)
router.put('/:id/owner-approve', authenticateToken, requireVerified, ownerApproveRental);

// อัปเดตสถานะตามลำดับ (ship, receive, return, verify)
router.put('/:id/status', authenticateToken, requireVerified, updateRentalStatus);

// แจ้งสินค้าเสียหาย (ใหม่) - รองรับอัปโหลดรูปภาพ 3 รูป
router.post('/:id/damage-report', authenticateToken, uploadDamage.array('images', 3), reportDamage);

export default router;