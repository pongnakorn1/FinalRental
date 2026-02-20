export const requireAdmin = (req, res, next) => {

  // ❌ ยังไม่ได้ login
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  // ❌ ไม่ใช่ admin
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin only"
    });
  }

  next();
};
