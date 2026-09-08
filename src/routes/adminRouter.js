import express from 'express';
import User from '../models/User.js';
import RewardTransaction from '../models/RewardTransaction.js';
import Referral from '../models/Referral.js';
import AdSession from '../models/AdSession.js';
import { notificationService } from '../services/notificationService.js';

const router = express.Router();

// GET /api/admin/stats - Thống kê tổng quan hệ thống
router.get('/stats', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const bannedUsers = await User.countDocuments({ status: 'banned' });

    const userAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalEarned: { $sum: '$totalEarned' },
          totalAdsWatched: { $sum: '$adsWatched' },
        },
      },
    ]);

    const stats = userAgg[0] || {
      totalBalance: 0,
      totalEarned: 0,
      totalAdsWatched: 0,
    };

    const totalReferrals = await Referral.countDocuments();
    const qualifiedReferrals = await Referral.countDocuments({ status: 'QUALIFIED' });
    const totalTransactions = await RewardTransaction.countDocuments();
    const totalAdSessions = await AdSession.countDocuments();

    // Lấy 5 người dùng mới đăng ký gần nhất
    const recentUsers = await User.find()
      .select('username email balance adsWatched referralCode createdAt status')
      .sort({ createdAt: -1 })
      .limit(5);

    // Lấy 5 giao dịch gần đây nhất
    const recentTransactions = await RewardTransaction.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalBalance: stats.totalBalance || 0,
        totalEarned: stats.totalEarned || 0,
        totalAdsWatched: stats.totalAdsWatched || 0,
        totalReferrals,
        qualifiedReferrals,
        totalTransactions,
        totalAdSessions,
        recentUsers,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users - Danh sách người dùng (Hỗ trợ tìm kiếm, lọc, phân trang)
router.get('/users', async (req, res, next) => {
  try {
    const { q, status, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (q) {
      const searchRegex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { username: searchRegex },
        { email: searchRegex },
        { referralCode: searchRegex },
      ];
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/:id - Chi tiết thông tin 1 người dùng
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    // Lấy 20 giao dịch gần đây của user
    const transactions = await RewardTransaction.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(20);

    // Lấy danh sách bạn bè mà user đã giới thiệu
    const referrals = await Referral.find({ referrerId: id })
      .populate('referredUserId', 'username email adsWatched createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        user,
        transactions,
        referrals,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id/status - Khóa hoặc Mở khóa tài khoản người dùng
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ (phải là active, suspended hoặc banned)',
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái người dùng thành ${status}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id/balance - Cộng / Trừ số dư tài khoản người dùng
router.put('/users/:id/balance', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, note } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền điều chỉnh phải là một số khác 0',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng',
      });
    }

    const balanceBefore = user.balance;
    const balanceAfter = Math.max(0, balanceBefore + numAmount);

    user.balance = balanceAfter;
    if (numAmount > 0) {
      user.totalEarned += numAmount;
    }
    await user.save();

    // Tạo bản ghi giao dịch điều chỉnh số dư từ Admin
    await RewardTransaction.create({
      userId: user._id,
      amount: Math.abs(numAmount),
      type: 'ADMIN_ADJUSTMENT',
      status: 'COMPLETED',
      balanceBefore,
      balanceAfter,
      metadata: {
        note: note || (numAmount > 0 ? 'Admin cộng tiền thưởng' : 'Admin trừ tiền tài khoản'),
      },
    });

    res.json({
      success: true,
      message: `Đã ${numAmount > 0 ? 'cộng' : 'trừ'} $${Math.abs(numAmount).toFixed(3)} cho người dùng ${user.username}`,
      data: {
        user: {
          id: user._id,
          username: user.username,
          balance: user.balance,
          totalEarned: user.totalEarned,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions - Danh sách toàn bộ giao dịch hệ thống
router.get('/transactions', async (req, res, next) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (status && status !== 'all') filter.status = status;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const total = await RewardTransaction.countDocuments(filter);
    const transactions = await RewardTransaction.find(filter)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/withdrawals - Danh sách chuyên biệt các yêu cầu rút tiền
router.get('/withdrawals', async (req, res, next) => {
  try {
    const { status, q, search, page = 1, limit = 20 } = req.query;
    const queryTerm = (q || search || '').trim();

    const filter = { type: 'WITHDRAWAL' };
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (queryTerm) {
      const regex = new RegExp(queryTerm, 'i');
      const matchedUsers = await User.find({
        $or: [{ username: regex }, { email: regex }],
      }).select('_id');
      const userIds = matchedUsers.map((u) => u._id);

      filter.$or = [
        { userId: { $in: userIds } },
        { 'metadata.bankName': regex },
        { 'metadata.accountNumber': regex },
        { 'metadata.accountHolder': regex },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const total = await RewardTransaction.countDocuments(filter);
    const withdrawals = await RewardTransaction.find(filter)
      .populate('userId', 'username email avatar balance')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Thống kê nhanh số lượng
    const pendingCount = await RewardTransaction.countDocuments({ type: 'WITHDRAWAL', status: 'PENDING' });
    const completedCount = await RewardTransaction.countDocuments({ type: 'WITHDRAWAL', status: 'COMPLETED' });
    const rejectedCount = await RewardTransaction.countDocuments({ type: 'WITHDRAWAL', status: 'REJECTED' });

    const pendingSumAgg = await RewardTransaction.aggregate([
      { $match: { type: 'WITHDRAWAL', status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingAmount = (pendingSumAgg[0] && pendingSumAgg[0].total) || 0;

    res.json({
      success: true,
      data: {
        withdrawals,
        transactions: withdrawals,
        stats: {
          pendingCount,
          completedCount,
          rejectedCount,
          pendingAmount,
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/notifications/stream - Server-Sent Events (SSE) đẩy thông báo rút tiền tức thì
router.get('/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Gửi thông báo kết nối thành công
  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

  const onNewWithdrawal = (data) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'new_withdrawal', data })}\n\n`);
    } catch (e) {
      // client disconnected
    }
  };

  notificationService.on('new_withdrawal', onNewWithdrawal);

  // Ping giữ kết nối mỗi 20s
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveInterval);
    }
  }, 20000);

  req.on('close', () => {
    notificationService.removeListener('new_withdrawal', onNewWithdrawal);
    clearInterval(keepAliveInterval);
  });
});

// PUT /api/admin/transactions/:id/status - Duyệt hoặc Từ chối yêu cầu giao dịch/rút tiền (Tự động hoàn tiền khi từ chối)
router.put('/transactions/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['COMPLETED', 'REJECTED', 'FAILED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái giao dịch không hợp lệ',
      });
    }

    const transaction = await RewardTransaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy giao dịch',
      });
    }

    const previousStatus = transaction.status;

    // Nếu từ chối lệnh rút tiền đang ở trạng thái PENDING -> Hoàn lại tiền vào ví user
    if (status === 'REJECTED' && transaction.type === 'WITHDRAWAL' && previousStatus === 'PENDING') {
      const user = await User.findById(transaction.userId);
      if (user) {
        user.balance += transaction.amount;
        await user.save();
      }
      if (!transaction.metadata) transaction.metadata = {};
      transaction.metadata.rejectReason = reason || 'Admin từ chối yêu cầu';
    }

    transaction.status = status;
    await transaction.save();

    res.json({
      success: true,
      message: status === 'COMPLETED'
        ? 'Đã duyệt yêu cầu rút tiền thành công'
        : status === 'REJECTED'
        ? 'Đã từ chối và hoàn lại số dư cho người dùng'
        : `Cập nhật trạng thái thành ${status}`,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
