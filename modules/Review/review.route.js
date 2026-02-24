import express from "express";
import { createReview, getProductReviews } from "./review.controller.js";
import { authenticateToken } from "../../middleware/auth.middleware.js"; // อย่าลืม Middleware เช็ค Token

const router = express.Router();

// POST: http://localhost:3000/api/reviews
// บังคับผ่าน authenticateToken เพื่อให้รู้ว่าใครเป็นคนรีวิว
router.post("/", authenticateToken, createReview);

// GET: http://localhost:3000/api/reviews/product/24
router.get("/product/:product_id", getProductReviews);

export default router;