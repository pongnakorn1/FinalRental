import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LineStrategy } from 'passport-line-auth';
import 'dotenv/config';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
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
    scope: ['profile', 'openid', 'email'], // openid กับ email ต้องขอสิทธิ์ใน Console ด้วยนะ
    botPrompt: 'normal'
  },
  async (accessToken, refreshToken, profile, done) => {
    // profile ของ LINE จะมีค่าเช่น profile.id, profile.displayName, profile.value (email)
    return done(null, profile);
  }
));

export default passport;