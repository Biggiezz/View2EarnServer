import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from './config/db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { generalLimiter } from './middlewares/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Trang chủ & Privacy Policy (Phục vụ tĩnh nhanh chóng không cần DB)
app.get(['/', '/privacy-policy', '/privacy'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'privacy.html'));
});

// Middleware kết nối DB trước khi xử lý API (cực kỳ quan trọng cho Vercel Serverless & High Concurrency)
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

// Áp dụng Rate Limiter chung cho API
app.use('/api', generalLimiter);

// API Routes
app.use('/api', routes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Lắng nghe cổng và quản lý Graceful Shutdown khi chạy Standalone Node.js
let server = null;

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`[View2Earn Server] Running on port ${PORT} (PID: ${process.pid})`);
  });

  // Graceful Shutdown Handler
  const gracefulShutdown = async (signal) => {
    console.log(`\n[View2Earn Server] Received ${signal}. Starting graceful shutdown...`);
    
    if (server) {
      server.close(async () => {
        console.log('[View2Earn Server] HTTP server closed.');
        try {
          await disconnectDB();
          console.log('[View2Earn Server] Graceful shutdown completed cleanly.');
          process.exit(0);
        } catch (err) {
          console.error('[View2Earn Server] Error during DB disconnection:', err);
          process.exit(1);
        }
      });

      // Bắt buộc dừng nếu quá 10 giây
      setTimeout(() => {
        console.error('[View2Earn Server] Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception] thrown:', error);
    gracefulShutdown('uncaughtException');
  });
}

export default app;

