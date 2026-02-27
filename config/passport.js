import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LineStrategy } from 'passport-line-v2';
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
    channelID: process.env.LINE_CHANNEL_ID,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    callbackURL: process.env.LINE_CALLBACK_URL,
    // ✅ ใส่ scope ครบถ้วนเพื่อขอสิทธิ์ OpenID และ Email
    scope: ['profile', 'openid'],
    // บางครั้ง LINE ต้องการ botPrompt หรืออื่นๆ แต่เบื้องต้นแค่นี้เพียงพอครับ
  },
  async (accessToken, refreshToken, profile, done) => {
    // ใน profile ของ v2 จะมีฟิลด์ email มาให้เลยถ้าตั้งค่าถูกต้อง
    return done(null, profile);
  }
));

export default passport;