import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Trang chủ & Privacy Policy (Phục vụ tĩnh nhanh chóng không cần DB)
app.get(['/', '/privacy-policy', '/privacy'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'privacy.html'));
});

// Middleware kết nối DB trước khi xử lý API (cực kỳ quan trọng cho Vercel Serverless)
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Database connection error: ${error.message}`,
    });
  }
});

// API Routes
app.use('/api', routes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Lắng nghe cổng khi chạy local
if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT);
}

export default app;
