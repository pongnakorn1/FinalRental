import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LineStrategy } from 'passport-line-auth';
import 'dotenv/config';

console.log("Current Callback URL:", process.env.GOOGLE_CALLBACK_URL);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email'] // เพิ่มบรรทัดนี้เข้าไปตรงนี้ด้วยครับ
  },
  async (accessToken, refreshToken, profile, done) => {
    // ส่งข้อมูล profile ไปให้ controller
    return done(null, profile);
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails'] // ขอข้อมูลที่จำเป็น
  },
  async (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }
));

passport.use(new LineStrategy({
    channelID: process.env.LINE_CHANNEL_ID,      // แก้จาก CLIENT_ID เป็น CHANNEL_ID
    channelSecret: process.env.LINE_CHANNEL_SECRET, // แก้จาก CLIENT_SECRET เป็น CHANNEL_SECRET
    callbackURL: process.env.LINE_CALLBACK_URL,
    scope: ['profile', 'openid', 'email'],
    // สำคัญ: บาง Strategy ของ LINE อาจต้องการสิทธิ์เพิ่มเติมเพื่อดึง Email
},
async (accessToken, refreshToken, params, profile, done) => {
    try {
        // LINE บางครั้งส่ง email มาใน params.id_token (ขึ้นอยู่กับ Library ที่ใช้)
        // แต่ปกติ profile.emails[0].value จะมีค่าถ้าตั้งค่าใน Console ถูกต้อง
        return done(null, profile);
    } catch (err) {
        return done(err, null);
    }
}));

export default passport;