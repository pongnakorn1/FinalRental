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
        const [rows] = await pool.execute(
            `SELECT m1.* FROM public.messages m1
             INNER JOIN (
                SELECT room_id, MAX(id) as max_id
                FROM public.messages
                WHERE room_id LIKE ? -- ค้นหาห้องที่มี userId นี้ เช่น %_21_% หรือ %_21
                GROUP BY room_id
             ) m2 ON m1.id = m2.max_id
             ORDER BY m1.id DESC`,
            [`%${userId}%`]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;