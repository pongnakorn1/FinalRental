import express from 'express';
import { uploadChat } from '../../middleware/multer.config.js';
import chatController from './chat.Controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';

const router = express.Router();

// 1. ส่งข้อความใหม่
router.post('/send', chatController.sendMessage);

// 🆕 อัปโหลดรูปภาพในแชท
router.post('/upload-image', uploadChat.single('image'), chatController.uploadChatImage);

// 🆕 ทำเครื่องหมายว่าอ่านแล้ว
router.post('/mark-read', chatController.markAsRead);

// 🆕 ซ่อนแชท (ลบฝั่งตัวเอง)
router.post('/hide', authenticateToken, chatController.hideChat);

// 2. ดึงประวัติแชทตาม room_id
router.get('/history/:room_id', authenticateToken, chatController.getChatHistory);

// 3. ดึงรายการแชททั้งหมดของผู้ใช้ (Inbox)
router.get('/list/:userId', chatController.getChatList);

// 4. ดึงข้อมูลสรุปการจอง/คำสั่งซื้อ
router.get('/summary/:room_id', chatController.getBookingSummary);

export default router;