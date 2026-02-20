import jwt from "jsonwebtoken";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ❌ ไม่มี header
  if (!authHeader) {
    return res.status(401).json({
      message: "Authorization header required",
    });
  }

  // ❌ แยก Bearer
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return res.status(401).json({
      message: "Invalid authorization format",
    });
  }

  const token = parts[1];

  // ❌ ไม่มี token
  if (!token) {
    return res.status(401).json({
      message: "Access token required",
    });
  }

  // ❌ ไม่มี SECRET
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set");
    return res.status(500).json({
      message: "Server configuration error",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ ตรวจ payload สำคัญ
    if (!decoded.id || !decoded.role) {
      return res.status(403).json({
        message: "Invalid token payload",
      });
    }

    // (Optional) ตรวจ kyc_status
    if (!decoded.kyc_status) {
      return res.status(403).json({
        message: "Invalid token payload",
      });
    }

    req.user = decoded; // { id, email, role, kyc_status }

    next();

  } catch (err) {
    return res.status(403).json({
      message: "Invalid or expired token",
    });
  }
};
