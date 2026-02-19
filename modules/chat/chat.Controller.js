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
    }, // <-- อย่าลืมลูกน้ำตรงนี้

    // 3. ย้าย getChatList เข้ามาไว้ในนี้
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
             -- เชื่อมตาราง users เพื่อหาข้อมูลคู่สนทนา
             JOIN public.users u ON u.id = (
                CASE 
                    -- ถ้าเราเป็นคนส่ง (sender_id = userId) คู่สนทนาคืออีกคนใน room_id
                    WHEN m.sender_id = $3 THEN 
                        CAST(REPLACE(REPLACE(m.room_id, 'chat_', ''), CONCAT($3, '_'), '') AS INTEGER)
                    -- ถ้าคนอื่นส่งมา partner_id ก็คือ sender_id ของเขานั่นเอง
                    ELSE m.sender_id 
                END
             )
             WHERE m.room_id LIKE $1 OR m.room_id LIKE $2
             ORDER BY m.room_id, m.created_at DESC`,
            [`%_${userId}`, `chat_${userId}_%`, userId]
        );
        
        // เรียงลำดับแชทที่มีความเคลื่อนไหวล่าสุดไว้บนสุด
        const sortedList = result.rows.sort((a, b) => b.created_at - a.created_at);
        
        res.json({ success: true, data: sortedList });
    } catch (error) {
        console.error('Get Chat List Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}
};

export default chatController;