import pool from '../../pool.js';

export const updateUserAddress = async (req, res) => {
    try {
        const { 
            name, phone, province, district, 
            sub_district, postcode, house_no 
        } = req.body;

        // ดึง userId จาก middleware authenticateToken
        const userId = req.user?.id; 

        if (!userId) {
            return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
        }

        const addressObj = {
            name, phone, province, district, 
            sub_district, postcode, house_no
        };

        const addressData = JSON.stringify(addressObj);

        // ✅ แก้ไข: PostgreSQL ใช้ $1, $2 แทน ?
        const sql = "UPDATE users SET address = $1 WHERE id = $2";
        await pool.query(sql, [addressData, userId]);

        res.status(200).json({
            success: true,
            message: "บันทึกที่อยู่เรียบร้อยแล้ว",
            data: addressObj
        });

    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAddress = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        // ✅ แก้ไข: PostgreSQL ใช้ $1 และ pg-pool จะคืนค่าผลลัพธ์ใน property .rows
        const sql = "SELECT address FROM users WHERE id = $1";
        const result = await pool.query(sql, [userId]);
        const rows = result.rows; 

        if (rows.length === 0 || !rows[0].address) {
            return res.status(200).json({}); 
        }

        const addressData = JSON.parse(rows[0].address);
        res.status(200).json(addressData);
    } catch (error) {
        console.error("Get Error:", error);
        res.status(500).json({ error: error.message });
    }
};