import pool from '../../pool.js';

const chatController = {
    // 1. ส่งข้อความใหม่
    sendMessage: async (req, res) => {
        const { room_id, sender_id, message } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO public.messages (room_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id',
                [room_id, sender_id, message]
            );
            res.status(201).json({ 
                success: true, 
                message_id: result.rows[0].id 
            });
        } catch (error) {
            console.error('Send Message Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // 2. ดึงประวัติแชทตาม room_id
    getChatHistory: async (req, res) => {
        const { room_id } = req.params;
        try {
            const result = await pool.query(
                'SELECT * FROM public.messages WHERE room_id = $1 ORDER BY created_at ASC',
                [room_id]
            );
            res.json({ 
                success: true, 
                data: result.rows 
            });
        } catch (error) {
            console.error('Get History Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // 3. ดึงรายการแชทของผู้ใช้
    getChatList: async (req, res) => {
        const { userId } = req.params;
        try {
            const result = await pool.query(
                `SELECT DISTINCT ON (m.room_id) 
                    m.id, 
                    m.room_id, 
                    m.message, 
                    m.created_at,
                    u.full_name AS partner_name,
                    u.profile_picture AS partner_avatar,
                    u.id AS partner_id
                 FROM public.messages m
                 JOIN public.users u ON u.id = (
                    CASE 
                        WHEN m.sender_id = $3 THEN 
                            CAST(REPLACE(REPLACE(m.room_id, 'chat_', ''), CONCAT($3, '_'), '') AS INTEGER)
                        ELSE m.sender_id 
                    END
                 )
                 WHERE m.room_id LIKE $1 OR m.room_id LIKE $2
                 ORDER BY m.room_id, m.created_at DESC`,
                [`%_${userId}`, `chat_${userId}_%`, userId]
            );
            
            const sortedList = result.rows.sort((a, b) => b.created_at - a.created_at);
            res.json({ success: true, data: sortedList });
        } catch (error) {
            console.error('Get Chat List Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }, // เพิ่มคอมม่าตรงนี้เพื่อเชื่อมฟังก์ชันถัดไป

    // 4. ดึงข้อมูลสรุปการจองสำหรับหัวแชท (ย้ายเข้ามาอยู่ใน object แล้ว)
    getBookingSummary: async (req, res) => {
    const { room_id } = req.params;
    try {
        const result = await pool.query(
            `SELECT 
                b.id AS booking_id,
                b.total_price,
                b.status,
                b.start_date,
                b.end_date,
                p.name AS product_name -- แก้เป็น p.name ให้ตรงกับ DB
             FROM public.bookings b
             JOIN public.products p ON b.product_id = p.id
             WHERE b.room_id = $1 
             ORDER BY b.created_at DESC LIMIT 1`,
            [room_id]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'ไม่พบข้อมูลการจองสำหรับห้องนี้' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Get Summary Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}}

export default chatController;