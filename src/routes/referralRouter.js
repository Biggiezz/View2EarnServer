import { Router } from 'express';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import RewardTransaction from '../models/RewardTransaction.js';
import { protect } from '../middlewares/auth.js';
import { rewardLimiter } from '../middlewares/rateLimiter.js';
import { generateUniqueReferralCode, claimReferralCode } from '../services/referralService.js';

const router = Router();

/**
 * GET /api/referral/me
 * Lấy thông tin mã giới thiệu, share link và thống kê cá nhân của user
 */
router.get('/me', protect, async (req, res, next) => {
  try {
    const userId = req.user._id;

    let user = await User.findById(userId).select('referralCode username balance').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    // Nếu người dùng chưa có referralCode, tự động tạo mới
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = await generateUniqueReferralCode();
      await User.findByIdAndUpdate(userId, { referralCode });
    }

    // Aggregation thống kê số dư và trạng thái referral từ DB tối ưu với Index
    const statsResult = await Referral.aggregate([
      { $match: { referrerId: userId } },
      {
        $group: {
          _id: null,
          totalInvited: { $sum: 1 },
          qualified: {
            $sum: {
              $cond: [{ $in: ['$status', ['QUALIFIED', 'REWARDED']] }, 1, 0],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $in: ['$status', ['PENDING', 'REGISTERED']] }, 1, 0],
            },
          },
        },
      },
    ]);

    // Tính tổng số tiền thưởng thu được từ Referral
    const totalEarnedResult = await RewardTransaction.aggregate([
      { $match: { userId, type: 'REFERRAL_REWARD', status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const stats = statsResult[0] || { totalInvited: 0, qualified: 0, pending: 0 };
    const totalEarned = totalEarnedResult[0] ? totalEarnedResult[0].total : 0;
    const shareLink = `${process.env.APP_BASE_URL || 'https://view2earn.app'}/invite/${referralCode}`;

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        shareLink,
        totalInvited: stats.totalInvited,
        qualified: stats.qualified,
        pending: stats.pending,
        totalEarned,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referral/claim
 * Nhập mã giới thiệu của bạn bè
 */
router.post('/claim', protect, rewardLimiter, async (req, res, next) => {
  try {
    const { referralCode } = req.body;
    const referredUserId = req.user._id;

    const referral = await claimReferralCode({ referredUserId, referralCode });

    res.status(200).json({
      success: true,
      message: 'Nhập mã giới thiệu thành công!',
      data: {
        referralId: referral._id,
        status: referral.status,
        requiredAds: referral.requiredAds,
        completedAds: referral.completedAds,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

/**
 * GET /api/referral/stats
 * Lấy danh sách thống kê các tài khoản đã được giới thiệu
 */
router.get('/stats', protect, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [referrals, totalCount] = await Promise.all([
      Referral.find({ referrerId: userId })
        .populate('referredUserId', 'username avatar createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Referral.countDocuments({ referrerId: userId }),
    ]);

    const formattedReferrals = referrals.map((r) => ({
      referralId: r._id,
      referredUser: r.referredUserId
        ? {
            username: r.referredUserId.username,
            avatar: r.referredUserId.avatar,
            registeredAt: r.referredUserId.createdAt,
          }
        : null,
      status: r.status,
      completedAds: r.completedAds,
      requiredAds: r.requiredAds,
      rewardAmount: r.rewardAmount,
      createdAt: r.createdAt,
      qualifiedAt: r.qualifiedAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        referrals: formattedReferrals,
        pagination: {
          currentPage: page,
          limit,
          totalRecords: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
