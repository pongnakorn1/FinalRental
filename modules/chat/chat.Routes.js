import express from 'express';
// นำเข้า chatController แบบ ES Module 
// (ตรวจสอบชื่อไฟล์ให้ตรงกับที่คุณสร้าง เช่น chat.controller.js)
import chatController from './chat.Controller.js'; 

const router = express.Router();

// กำหนดเส้นทาง (Path) สำหรับ Postman
// URL: http://localhost:3000/api/chat/send
router.post('/send', chatController.sendMessage);

// URL: http://localhost:3000/api/chat/history/:room_id
router.get('/history/:room_id', chatController.getChatHistory);

// URL: http://localhost:3000/api/chat/list/:userId
router.get('/list/:userId', chatController.getChatList);

export default router;