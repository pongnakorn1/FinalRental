import express from 'express';
import * as addressController from './address.controller.js';
// แก้ไข: ระบุชื่อไฟล์ auth.middleware.js และ import ฟังก์ชัน authenticateToken
import { authenticateToken } from '../../middleware/auth.middleware.js'; 

const router = express.Router();

// แก้ไข: ใช้ authenticateToken เป็น middleware
router.put('/update', authenticateToken, addressController.updateUserAddress); 
router.get('/me', authenticateToken, addressController.getAddress);

export default router;