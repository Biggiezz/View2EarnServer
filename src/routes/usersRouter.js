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

    // Kiểm tra dữ liệu đầu vào
    if (!username || !password || !email) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp username, password và email',
      });
    }

    // Kiểm tra trùng username hoặc email
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

    // Mã hoá mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo người dùng mới
    const user = await User.create({
      username,
      password: hashedPassword,
      email,
      avatar: avatar || '',
      phone: phone || '',
    });

    // Trả về thông tin (không bao gồm password)
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

    // Tìm kiếm user theo username hoặc email
    const user = await User.findOne(
      username ? { username } : { email }
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại',
      });
    }

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác',
      });
    }

    // Trả về thông tin đăng nhập thành công
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

export default router;
