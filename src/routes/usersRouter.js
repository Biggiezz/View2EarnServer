import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = Router();

// Helper: Tạo JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '30d',
  });
};

// POST /api/users/register - Đăng ký tài khoản
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, avatar, phone } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp username, password và email',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      const field = existingUser.username === username ? 'Username' : 'Email';
      return res.status(400).json({
        success: false,
        message: `${field} đã tồn tại trong hệ thống`,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      password: hashedPassword,
      email,
      avatar: avatar || '',
      phone: phone || '',
      balance: 0,
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
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi đăng ký',
    });
  }
});

// POST /api/users/login - Đăng nhập tài khoản
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập username/email và password',
      });
    }

    const user = await User.findOne(
      username ? { username } : { email }
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác',
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
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi đăng nhập',
    });
  }
});

// GET /api/users/profile/:id - Lấy thông tin user & số dư
router.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
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
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thông tin user',
    });
  }
});

// POST /api/users/reward - Nhận tiền thưởng sau khi xem quảng cáo (Reward Ads)
router.post('/reward', async (req, res) => {
  try {
    const { userId, rewardAmount } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin userId',
      });
    }

    const amount = typeof rewardAmount === 'number' && rewardAmount > 0 ? rewardAmount : 0.5;

    // Sử dụng returnDocument: 'after' thay cho deprecated { new: true }
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amount } },
      { returnDocument: 'after' }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản người dùng',
      });
    }

    res.status(200).json({
      success: true,
      message: `Chúc mừng bạn đã nhận được +$${amount.toFixed(2)} từ việc xem quảng cáo!`,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        balance: user.balance ?? 0,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cộng tiền thưởng',
    });
  }
});

export default router;
