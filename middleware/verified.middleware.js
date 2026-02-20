export const requireVerified = (req, res, next) => {

  // ❌ ยังไม่ได้ login / ไม่มี user
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  // ❌ ยังไม่ผ่าน KYC
  if (req.user.kyc_status !== "approved") {
    return res.status(403).json({
      message: "Please complete KYC verification"
    });
  }

  next();
};
