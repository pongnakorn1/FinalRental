import express from 'express';
// ตรวจสอบชื่อไฟล์ให้ตรงกับที่คุณสร้าง (แนะนำให้ใช้ chatController.js ตัวเล็กทั้งหมดถ้าเป็นไปได้)
import chatController from './chat.Controller.js'; 

const router = express.Router();

// 1. ส่งข้อความใหม่
// URL: POST http://localhost:3000/api/chat/send
router.post('/send', chatController.sendMessage);

// 2. ดึงประวัติแชทตาม room_id
// URL: GET http://localhost:3000/api/chat/history/:room_id
router.get('/history/:room_id', chatController.getChatHistory);

// 3. ดึงรายการแชททั้งหมดของผู้ใช้ (Inbox)
// URL: GET http://localhost:3000/api/chat/list/:userId
router.get('/list/:userId', chatController.getChatList);

// 4. ดึงข้อมูลสรุปการจอง/คำสั่งซื้อ (สำหรับแสดงที่หัวแชทตามรูปบรีฟ)
// URL: GET http://localhost:3000/api/chat/summary/:room_id
router.get('/summary/:room_id', chatController.getBookingSummary);

export default router;