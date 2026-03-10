import pool from '../../pool.js';

// ✅ เพิ่มฟังก์ชันตรวจสอบและอัปเกรด Schema อัตโนมัติ (เผื่อยังไม่มีคอลัมน์ image_url)
const ensureSchema = async () => {
    try {
        await pool.query(`
            ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;
        `);
    } catch (e) {
        console.error('Schema Update error (messages):', e);
    }
};
ensureSchema();

const chatController = {
    // 1. ส่งข้อความใหม่
    sendMessage: async (req, res) => {
        const { room_id, sender_id, message, image_url } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO public.messages (room_id, sender_id, message, image_url) VALUES ($1, $2, $3, $4) RETURNING id',
                [room_id, sender_id, message || null, image_url || null]
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

    // 🆕 อัปโหลดรูปภาพแชท
    uploadChatImage: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดรูปภาพ' });
            }
            const imageUrl = `/uploads/chat/${req.file.filename}`;
            res.json({ success: true, imageUrl });
        } catch (error) {
            console.error('Upload Chat Image Error:', error);
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

    // 3. ดึงรายการแชทของผู้ใช้ (Inbox)
    getChatList: async (req, res) => {
        const { userId } = req.params;
        try {
            // ดึงข้อความล่าสุดจากแต่ละห้องที่ผู้ใช้มีส่วนร่วม
            const result = await pool.query(
                `WITH LatestMessages AS (
                    SELECT 
                        room_id,
                        message,
                        image_url,
                        sender_id,
                        created_at,
                        ROW_NUMBER() OVER(PARTITION BY room_id ORDER BY created_at DESC) as rn
                    FROM public.messages
                    WHERE room_id LIKE 'chat\\_' || $1 || '\\_%' OR room_id LIKE '%\\_' || $1
                ),
                RoomStats AS (
                    SELECT room_id, COUNT(*) as msg_count 
                    FROM public.messages 
                    WHERE sender_id::text != '0'
                    GROUP BY room_id
                )
                SELECT 
                    lm.room_id,
                    lm.message as "lastMessage",
                    lm.image_url as "lastImageUrl",
                    lm.created_at as "lastMessageTime",
                    u.full_name as "otherUserName",
                    u.profile_picture as "otherUserAvatar",
                    u.id as "otherUserId"
                FROM LatestMessages lm
                JOIN public.users u ON (
                    (lm.room_id LIKE 'chat\\_' || u.id || '\\_%') OR 
                    (lm.room_id LIKE '%\\_' || u.id)
                )
                JOIN RoomStats rs ON lm.room_id = rs.room_id
                WHERE lm.rn = 1 AND u.id != $1::integer AND rs.msg_count > 0
                ORDER BY lm.created_at DESC`,
                [userId]
            );

            res.json({ success: true, data: result.rows });
        } catch (error) {
            console.error('Get Chat List Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // 4. ดึงข้อมูลสรุปการจองสำหรับหัวแชท
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
                    p.name AS product_name,
                    p.images AS product_images
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
    }
};

export default chatController;
