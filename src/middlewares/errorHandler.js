// Middleware xử lý 404 Not Found
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Middleware xử lý lỗi toàn cục
export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Lỗi hệ thống';

  // Xử lý lỗi trùng lặp Unique Index của MongoDB (E11000) - Idempotency Duplicate Detection
  if (err.code === 11000) {
    statusCode = 409; // Conflict
    const field = Object.keys(err.keyPattern || {})[0] || 'Dữ liệu';
    if (field === 'adSessionId' || field === 'idempotencyKey') {
      message = 'Giao dịch hoặc phiên xem quảng cáo này đã được nhận thưởng trước đó.';
    } else {
      message = `${field} đã tồn tại trong hệ thống.`;
    }
  }

  // Xử lý lỗi sai định dạng MongoDB ObjectId (CastError)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = 'Định dạng ID không hợp lệ';
  }

  // Xử lý lỗi Mongoose Validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // Xử lý lỗi JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token xác thực không hợp lệ';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

