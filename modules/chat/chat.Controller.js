import pool from '../../pool.js';

// ✅ เพิ่มฟังก์ชันตรวจสอบและอัปเกรด Schema อัตโนมัติ
const ensureSchema = async () => {
    try {
        await pool.query(`
            ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
            
            CREATE TABLE IF NOT EXISTS public.chat_hides (
                id SERIAL PRIMARY KEY,
                room_id VARCHAR(255) NOT NULL,
                user_id INTEGER NOT NULL,
                hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_id, user_id)
            );
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
                'INSERT INTO public.messages (room_id, sender_id, message, image_url, is_read) VALUES ($1, $2, $3, $4, FALSE) RETURNING id',
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
        const userId = req.user ? req.user.id : null; // ดึงจาก Token ถ้ามี
        try {
            // ดึงเวลาที่ซ่อนล่าลุด
            let hideTime = '1970-01-01 00:00:00';
            if (userId) {
                const hideRes = await pool.query('SELECT hidden_at FROM public.chat_hides WHERE room_id = $1 AND user_id = $2', [room_id, userId]);
                if (hideRes.rowCount > 0) {
                    hideTime = hideRes.rows[0].hidden_at;
                }
            }

            const result = await pool.query(
                'SELECT * FROM public.messages WHERE room_id = $1 AND created_at > $2 ORDER BY created_at ASC',
                [room_id, hideTime]
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

    // 🆕 ทำเครื่องหมายว่าอ่านแล้ว
    markAsRead: async (req, res) => {
        const { room_id, userId } = req.body;
        try {
            // อัปเดตข้อความที่คนอื่นส่งมาให้เรา (sender_id != userId) ให้เป็นอ่านแล้ว (is_read = true)
            await pool.query(
                'UPDATE public.messages SET is_read = TRUE WHERE room_id = $1 AND sender_id::text != $2::text AND is_read = FALSE',
                [room_id, userId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Mark As Read Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // 3. ดึงรายการแชทของผู้ใช้ (Inbox)
    getChatList: async (req, res) => {
        const { userId } = req.params;
        try {
            // ดึงข้อความล่าสุด และนับจำนวนข้อความที่ยังไม่ได้อ่าน
            // กรองออกถ้าห้องนั้นถูกซ่อน (hidden_at) และไม่มีข้อความใหม่กว่า hidden_at
            const result = await pool.query(
                `WITH UserHides AS (
                    SELECT room_id, hidden_at 
                    FROM public.chat_hides 
                    WHERE user_id = $1
                ),
                LatestMessages AS (
                    SELECT 
                        m.room_id,
                        m.message,
                        m.image_url,
                        m.sender_id,
                        m.created_at,
                        m.is_read,
                        ROW_NUMBER() OVER(PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
                    FROM public.messages m
                    LEFT JOIN UserHides uh ON m.room_id = uh.room_id
                    WHERE (m.room_id LIKE 'chat\\_' || $1 || '\\_%' OR m.room_id LIKE '%\\_' || $1)
                    AND (uh.hidden_at IS NULL OR m.created_at > uh.hidden_at)
                ),
                UnreadCounts AS (
                    SELECT m.room_id, COUNT(*) as unread_count
                    FROM public.messages m
                    LEFT JOIN UserHides uh ON m.room_id = uh.room_id
                    WHERE (m.room_id LIKE 'chat\\_' || $1 || '\\_%' OR m.room_id LIKE '%\\_' || $1)
                    AND m.sender_id::text != $1::text
                    AND m.is_read = FALSE
                    AND (uh.hidden_at IS NULL OR m.created_at > uh.hidden_at)
                    GROUP BY m.room_id
                ),
                RoomStats AS (
                    SELECT m.room_id, COUNT(*) as msg_count 
                    FROM public.messages m
                    LEFT JOIN UserHides uh ON m.room_id = uh.room_id
                    WHERE m.sender_id::text != '0'
                    AND (uh.hidden_at IS NULL OR m.created_at > uh.hidden_at)
                    GROUP BY m.room_id
                )
                SELECT 
                    lm.room_id,
                    lm.message as "lastMessage",
                    lm.image_url as "lastImageUrl",
                    lm.created_at as "lastMessageTime",
                    lm.is_read as "lastIsRead",
                    lm.sender_id as "lastSenderId",
                    COALESCE(uc.unread_count, 0) as "unreadCount",
                    u.full_name as "otherUserName",
                    u.profile_picture as "otherUserAvatar",
                    u.id as "otherUserId"
                FROM LatestMessages lm
                JOIN public.users u ON (
                    (lm.room_id LIKE 'chat\\_' || u.id || '\\_%') OR 
                    (lm.room_id LIKE '%\\_' || u.id)
                )
                JOIN RoomStats rs ON lm.room_id = rs.room_id
                LEFT JOIN UnreadCounts uc ON lm.room_id = uc.room_id
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

    // 🆕 ซ่อนแชท (ลบฝั่งตัวเอง)
    hideChat: async (req, res) => {
        const { room_id, userId } = req.body;
        try {
            await pool.query(
                `INSERT INTO public.chat_hides (room_id, user_id, hidden_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (room_id, user_id) 
                 DO UPDATE SET hidden_at = CURRENT_TIMESTAMP`,
                [room_id, userId]
            );
            res.json({ success: true, message: 'ซ่อนการสนทนาเรียบร้อย' });
        } catch (error) {
            console.error('Hide Chat Error:', error);
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
