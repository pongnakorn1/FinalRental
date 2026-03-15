import http from 'http';
import 'dotenv/config'
import { Server } from 'socket.io';
import app from './app.js';
import pool from './config/db.js';

// กำหนด Port (Render จะกำหนดค่านี้ให้เองอัตโนมัติ)
const PORT = process.env.PORT || 3000;

// 1. สร้าง HTTP Server หุ้ม Express App (จำเป็นสำหรับ Socket.io)
const server = http.createServer(app);

// 2. ตั้งค่า Socket.io พร้อมจัดการ CORS สำหรับ Render
const io = new Server(server, {
  cors: {
    // ดึงค่า URL หน้าบ้านจาก Environment Variable ที่ตั้งใน Render
    origin: process.env.CLIENT_URL || "http://localhost:8082", 
    credentials: true
  },
  // บังคับใช้ websocket และ polling เพื่อความเสถียรบน Render Free Tier
  transports: ['websocket', 'polling'] 
});

// 3. ระบบรับ-ส่งข้อความ Real-time
io.on('connection', (socket) => {
  console.log('🔌 ยินดีต้อนรับ (Socket ID):', socket.id);

  // เมื่อ User เข้าหน้าแชท (ต้องสั่งจาก Frontend)
  socket.on('join_room', (room_id) => {
    socket.join(room_id);
    console.log(`🏠 User เข้าห้อง: ${room_id}`);
  });

  // เมื่อมีการส่งข้อความ
  socket.on('send_message', async (data) => {
    const { room_id, sender_id, message } = data;
    
    try {
      // ✅ 1. บันทึกลงตาราง messages ใน Database ทันที
      // มั่นใจว่าคุณมีตาราง public.messages พร้อมคอลัมน์เหล่านี้
      await pool.query(
        'INSERT INTO public.messages (room_id, sender_id, message) VALUES ($1, $2, $3)',
        [room_id, sender_id, message]
      );

      // ✅ 2. ส่งข้อมูลไปหาทุกคนในห้อง (Room) เดียวกันแบบ Real-time
      // ใส่ Timestamp ไปด้วยเพื่อให้หน้าบ้านแสดงเวลาได้
      io.to(room_id).emit('receive_message', {
        ...data,
        created_at: new Date()
      });
      
      console.log(`📩 ข้อความจาก ${sender_id} ในห้อง ${room_id}: ${message}`);
    } catch (err) {
      console.error('❌ ไม่สามารถบันทึกข้อความได้:', err);
      // ส่ง Error กลับไปหาผู้ส่ง (ถ้าต้องการ)
      socket.emit('error_message', { message: 'ส่งข้อความล้มเหลว' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ การเชื่อมต่อ Socket หลุด');
  });
});

// 4. สั่งรันผ่าน server.listen (ห้ามใช้ app.listen เด็ดขาด)
server.listen(PORT, async () => {
  try {
    const client = await pool.connect();
    
    // Auto-migrate newly added columns one by one to avoid breaking the whole query
    const columnsToFix = [
      { name: 'proof_before_shipping', type: 'TEXT', cast: 'TEXT' },
      { name: 'outbound_tracking_number', type: 'VARCHAR(255)', cast: 'VARCHAR' },
      { name: 'outbound_shipping_company', type: 'VARCHAR(255)', cast: 'VARCHAR' },
      { name: 'proof_after_receiving', type: 'TEXT', cast: 'TEXT' },
      { name: 'proof_before_return', type: 'TEXT', cast: 'TEXT' },
      { name: 'inbound_tracking_number', type: 'VARCHAR(255)', cast: 'VARCHAR' },
      { name: 'inbound_shipping_company', type: 'VARCHAR(255)', cast: 'VARCHAR' }
    ];

    for (const col of columnsToFix) {
      try {
        await client.query(`
          ALTER TABLE bookings 
          ALTER COLUMN ${col.name} TYPE ${col.type} USING ${col.name}::${col.cast}
        `);
      } catch (err) {
        // ถ้าคอลัมน์ยังไม่มี ให้สร้างใหม่
        try {
          await client.query(`ALTER TABLE bookings ADD COLUMN ${col.name} ${col.type}`);
        } catch (addErr) {
          console.error(`Failed to alter or add ${col.name}:`, addErr.message);
        }
      }
    }
    
    console.log('✅ Auto-migrated schema columns successfully.');
    client.release();
    
    console.log('✅ ฐานข้อมูลพร้อมใช้งาน');
    console.log(`🚀 Real-time Server ออนไลน์บนพอร์ต ${PORT}`);
  } catch (err) {
    console.error('❌ เชื่อมต่อฐานข้อมูลล้มเหลว:', err);
  }
});