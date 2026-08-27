import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import RewardTransaction from '../models/RewardTransaction.js';
import { protect, optionalAuth } from '../middlewares/auth.js';
import { authLimiter, rewardLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Server-controlled default reward
const DEFAULT_REWARD_AMOUNT = parseFloat(process.env.DEFAULT_AD_REWARD || '0.50');
const MAX_ALLOWED_REWARD = 1.00;

// Helper: Tạo JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '30d',
  });
};

/**
 * POST /api/users/register - Đăng ký tài khoản
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, password, email, avatar, phone } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp username, password và email',
      });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Query tối ưu với lean và projection
    const existingUser = await User.findOne({
      $or: [{ username: trimmedUsername }, { email: trimmedEmail }],
    }).select('_id username email').lean();

    if (existingUser) {
      const field = existingUser.username === trimmedUsername ? 'Username' : 'Email';
      return res.status(400).json({
        success: false,
        message: `${field} đã tồn tại trong hệ thống`,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username: trimmedUsername,
      password: hashedPassword,
      email: trimmedEmail,
      avatar: avatar || '',
      phone: (phone || '').trim(),
      balance: 0,
      totalEarned: 0,
      status: 'active',
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        balance: user.balance ?? 0,
        totalEarned: user.totalEarned ?? 0,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/login - Đăng nhập tài khoản
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập username/email và password',
      });
    }

    const query = username ? { username: username.trim() } : { email: email.trim().toLowerCase() };
    const user = await User.findOne(query)
      .select('_id username email password avatar phone balance totalEarned status')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu không chính xác',
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị khóa do vi phạm chính sách',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản hoặc mật khẩu không chính xác',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        balance: user.balance ?? 0,
        totalEarned: user.totalEarned ?? 0,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/profile - Lấy thông tin tài khoản hiện tại từ JWT
 */
router.get('/profile', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin thành công',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        balance: user.balance ?? 0,
        totalEarned: user.totalEarned ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/profile/:id - Lấy thông tin user (Bảo vệ: Chỉ chính chủ xem được)
 */
router.get('/profile/:id', protect, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() !== id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập thông tin tài khoản này',
      });
    }

    const user = await User.findById(id).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thông tin thành công',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        balance: user.balance ?? 0,
        totalEarned: user.totalEarned ?? 0,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/reward - Nhận tiền thưởng sau khi xem quảng cáo (Reward Ads)
 * Tích hợp Idempotency, Server Authority, Atomic Update và Rate Limiting
 */
router.post('/reward', optionalAuth, rewardLimiter, async (req, res, next) => {
  try {
    const { userId: bodyUserId, adSessionId, transactionId, idempotencyKey } = req.body;
    
    // Ưu tiên userId từ JWT Token nếu có; nếu không fallback lấy từ body (hỗ trợ client cũ)
    const targetUserId = req.user ? req.user._id : bodyUserId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin xác thực tài khoản (userId hoặc Bearer token)',
      });
    }

    // 1. Server Authority: Khóa chặt giá trị thưởng, không cho phép client tùy ý quyết định
    const amount = DEFAULT_REWARD_AMOUNT;

    // 2. Định danh duy nhất (Idempotency Identifier)
    const effectiveSessionId = adSessionId || transactionId || idempotencyKey || null;

    // 3. Nếu có identifier, tạo RewardTransaction trước để chặn duplicate bằng Unique Sparse Index
    let ledgerRecord = null;
    if (effectiveSessionId) {
      ledgerRecord = await RewardTransaction.create({
        userId: targetUserId,
        amount,
        type: 'AD_REWARD',
        adSessionId: effectiveSessionId,
        status: 'COMPLETED',
        metadata: {
          ip: req.ip || req.headers['x-forwarded-for'] || '',
          source: 'users_reward_endpoint',
        },
      });
    }

    // 4. Atomic Update số dư người dùng
    const now = new Date();
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      {
        $inc: { balance: amount, totalEarned: amount },
        $set: { lastRewardAt: now },
      },
      { returnDocument: 'after' }
    ).select('-password');

    if (!updatedUser) {
      // Rollback transaction record nếu user không tồn tại
      if (ledgerRecord) {
        await RewardTransaction.findByIdAndDelete(ledgerRecord._id);
      }
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản người dùng',
      });
    }

    // Nếu không có sessionId gửi lên từ trước, tạo ledger record để lưu vết
    if (!ledgerRecord) {
      await RewardTransaction.create({
        userId: targetUserId,
        amount,
        type: 'AD_REWARD',
        status: 'COMPLETED',
        metadata: {
          ip: req.ip || req.headers['x-forwarded-for'] || '',
          source: 'users_reward_endpoint_direct',
        },
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
        token: generateToken(updatedUser._id),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/history - Lấy lịch sử nhận thưởng và giao dịch (Có Pagination)
 */
router.get('/history', protect, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      RewardTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RewardTransaction.countDocuments({ userId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        transactions,
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

