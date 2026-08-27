import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import AdSession from "../models/AdSession.js";
import RewardTransaction from "../models/RewardTransaction.js";
import User from "../models/User.js";
import { protect } from "../middlewares/auth.js";
import { rewardLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

// Server-configured reward policy (Server Authority)
const REWARD_CONFIG = {
  DEFAULT_REWARD: parseFloat(process.env.DEFAULT_AD_REWARD || "0.001"),
  MIN_WATCH_SECONDS: parseInt(process.env.MIN_AD_WATCH_SECONDS || "5", 10), // Giới hạn thời gian xem tối thiểu để chống bot
};

// Helper: Tạo JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || "secretkey", {
    expiresIn: "30d",
  });
};

/**
 * POST /api/ads/start
 * Khởi tạo phiên xem quảng cáo hợp lệ từ Server
 */
router.post("/start", protect, rewardLimiter, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const placementId = req.body.placementId || "rewarded_video_main";

    const sessionId = `ad_${crypto.randomUUID()}`;

    const adSession = await AdSession.create({
      sessionId,
      userId,
      placementId,
      rewardAmount: REWARD_CONFIG.DEFAULT_REWARD,
      status: "STARTED",
      startedAt: new Date(),
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    });

    res.status(201).json({
      success: true,
      message: "Khởi tạo phiên quảng cáo thành công",
      data: {
        sessionId: adSession.sessionId,
        placementId: adSession.placementId,
        rewardAmount: adSession.rewardAmount,
        startedAt: adSession.startedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ads/complete
 * Xác thực phiên xem quảng cáo, kiểm tra anti-cheat, ghi Ledger và cộng tiền Atomic
 */
router.post("/complete", protect, rewardLimiter, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin sessionId của quảng cáo",
      });
    }

    // 1. Tìm AdSession và xác thực quyền sở hữu
    const adSession = await AdSession.findOne({ sessionId, userId });

    if (!adSession) {
      return res.status(404).json({
        success: false,
        message:
          "Không tìm thấy phiên quảng cáo hợp lệ hoặc không thuộc về bạn",
      });
    }

    // 2. Chống duplicate: Kiểm tra trạng thái session
    if (adSession.status === "REWARDED") {
      return res.status(409).json({
        success: false,
        message: "Phiên quảng cáo này đã được nhận thưởng trước đó",
      });
    }

    if (adSession.status !== "STARTED") {
      return res.status(400).json({
        success: false,
        message: `Trạng thái phiên quảng cáo không hợp lệ (${adSession.status})`,
      });
    }

    // 3. Anti-Cheat: Kiểm tra thời gian xem tối thiểu
    const now = new Date();
    const durationSeconds = Math.floor(
      (now.getTime() - new Date(adSession.startedAt).getTime()) / 1000,
    );

    if (durationSeconds < REWARD_CONFIG.MIN_WATCH_SECONDS) {
      adSession.status = "INVALID";
      adSession.durationSeconds = durationSeconds;
      await adSession.save();

      return res.status(400).json({
        success: false,
        message: `Thời gian xem quảng cáo chưa đạt yêu cầu tối thiểu (${durationSeconds}s / ${REWARD_CONFIG.MIN_WATCH_SECONDS}s)`,
      });
    }

    // 4. Server Authority: Số tiền thưởng do server chỉ định
    const amount = adSession.rewardAmount || REWARD_CONFIG.DEFAULT_REWARD;

    // 5. Ghi nhận Ledger Transaction với Unique Index trên adSessionId (Idempotency Barrier)
    // Nếu có 2 requests song song vượt qua bước check, Unique Index sẽ chặn tại đây
    const transaction = await RewardTransaction.create({
      userId,
      amount,
      type: "AD_REWARD",
      adSessionId: sessionId,
      status: "COMPLETED",
      metadata: {
        ip: req.ip || req.headers["x-forwarded-for"] || "",
        placementId: adSession.placementId,
        durationSeconds,
      },
    });

    // 6. Cập nhật trạng thái AdSession sang REWARDED
    adSession.status = "REWARDED";
    adSession.completedAt = now;
    adSession.durationSeconds = durationSeconds;
    await adSession.save();

    // 7. Atomic update số dư người dùng
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { balance: amount, totalEarned: amount },
        $set: { lastRewardAt: now },
      },
      { returnDocument: "after" },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản người dùng",
      });
    }

    res.status(200).json({
      success: true,
      message: `Chúc mừng bạn đã nhận được +$${amount.toFixed(2)} từ việc xem quảng cáo!`,
      data: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
        phone: updatedUser.phone,
        balance: updatedUser.balance ?? 0,
        totalEarned: updatedUser.totalEarned ?? 0,
        transactionId: transaction._id,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
