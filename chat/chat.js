const express = require('express');
const router = express.Router();
const pool = require('../pool'); 

// 1. ส่งข้อความใหม่ (อิงตาม Column ในรูป pgAdmin)
router.post('/send', async (req, res) => {
    const { room_id, sender_id, message } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO public.messages (room_id, sender_id, message) VALUES (?, ?, ?)',
            [room_id, sender_id, message]
        );
        res.status(201).json({ success: true, message_id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. ดึงประวัติการแชทจาก room_id
router.get('/history/:room_id', async (req, res) => {
    const { room_id } = req.params;
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM public.messages WHERE room_id = ? ORDER BY id ASC',
            [room_id]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. ดึงรายการแชทล่าสุด (Chat List) สำหรับผู้ใช้คนนั้นๆ
router.get('/list/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // ดึงข้อความล่าสุดของทุกห้องที่ userId นี้เกี่ยวข้อง
        // ใช้ LIKE แบบระบุตำแหน่งขีดล่างเพื่อให้แม่นยำขึ้น
        const [rows] = await pool.execute(
    `SELECT m1.* FROM public.messages m1
     INNER JOIN (
        SELECT room_id, MAX(id) as max_id
        FROM public.messages
        -- เช็คว่ามี userId อยู่ในชื่อห้อง จะอยู่หน้า กลาง หรือหลัง ก็ต้องเจอ
        WHERE room_id LIKE ? 
        GROUP BY room_id
     ) m2 ON m1.id = m2.max_id
     ORDER BY m1.id DESC`,
    [`%${userId}%`] // ใช้แบบกว้างๆ ไปก่อนเพื่อเทสว่าข้อมูลมาไหม 
        );

        // --- ส่วนที่แก้เพื่อช่วย Frontend ---
        const formattedData = rows.map(chat => {
            // สมมติ room_id คือ "chat_10_45"
            const parts = chat.room_id.split('_'); // จะได้ ['chat', '10', '45']
            
            // หาว่า ID ไหนที่ไม่ใช่ userId ของเรา (ตัวนั้นคือคู่สนทนา)
            // เราเช็คทั้ง parts[1] และ parts[2] เพราะเราไม่รู้ว่าใคร ID น้อยกว่า/มากกว่า
            const partnerId = parts[1] == userId ? parts[2] : parts[1];

            return {
                ...chat,
                partner_id: partnerId, // ส่ง ID คู่สนทนาที่ถูกต้องไปให้เลย
                original_room_id: chat.room_id // เก็บไว้เผื่อต้องใช้
            };
        });

        res.json({ success: true, data: formattedData });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});