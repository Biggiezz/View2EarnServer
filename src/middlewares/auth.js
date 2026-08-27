import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token = null;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-access-token']) {
      token = req.headers['x-access-token'];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy token xác thực. Vui lòng đăng nhập.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    
    // Gắn thông tin user tối thiểu vào req để tránh overhead query DB không cần thiết ở mọi request
    req.user = {
      _id: decoded.id,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã bị chỉnh sửa.',
    });
  }
};

// Middleware tùy chọn: Cho phép request đi qua kể cả không có token (fallback backward compatibility), nhưng nếu có token thì parse
export const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-access-token']) {
      token = req.headers['x-access-token'];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
      req.user = { _id: decoded.id };
    }
  } catch (_) {
    // Ignore invalid token in optional mode
  }
  next();
};
