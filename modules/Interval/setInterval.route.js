import express from "express";
import { triggerAutoRefundManual } from "./setInterval.controller.js";

const router = express.Router();

// POST: http://localhost:3000/api/interval/trigger
router.post("/trigger", triggerAutoRefundManual);

export default router;