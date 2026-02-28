import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LineStrategy } from 'passport-line-auth';
import { jwtDecode } from "jwt-decode";
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
    channelID: process.env.LINE_LOGIN_CHANNEL_ID,
    channelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    callbackURL: "https://finalrental.onrender.com/api/auth/line/callback",
    scope: ['profile', 'openid', 'email'],
    profileFields: ['id', 'displayName', 'emails', 'pictureUrl']
  },
  function(accessToken, refreshToken, params, profile, cb) {
    try {
        // ✨ แกะอีเมลจาก id_token ที่อยู่ใน params
        if (params.id_token) {
            const decoded = jwtDecode(params.id_token);
            profile.email = decoded.email; // 👈 เอาอีเมลจริงไปแปะไว้ใน profile
        }
        
        console.log("✅ Decoded Email:", profile.email); // เช็คใน Log อีกที
        return cb(null, profile);
    } catch (error) {
        console.error("JWT Decode Error:", error);
        return cb(error, null);
    }
  }
));

export default passport;