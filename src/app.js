import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from './config/db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { generalLimiter } from './middlewares/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadViewPart = (relativePath) => {
  const possiblePaths = [
    path.join(__dirname, 'views', relativePath),
    path.join(process.cwd(), 'src', 'views', relativePath),
    path.join(process.cwd(), 'views', relativePath),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch (e) {
      // Continue checking next path
    }
  }
  return '';
};

const renderAdminView = () => {
  let master = loadViewPart('admin.html');
  if (!master) return null;

  // 1. Chèn CSS
  const css = loadViewPart('admin/css/admin.css');
  if (css) master = master.replace('<!-- {{CSS}} -->', `<style>\n${css}\n</style>`);

  // 2. Chèn các phần giao diện HTML (Partials, Tabs, Modals)
  const htmlPartials = [
    { tag: '<!-- {{SIDEBAR}} -->', file: 'admin/sidebar.html' },
    { tag: '<!-- {{HEADER}} -->', file: 'admin/header.html' },
    { tag: '<!-- {{TAB_OVERVIEW}} -->', file: 'admin/tabs/overview.html' },
    { tag: '<!-- {{TAB_USERS}} -->', file: 'admin/tabs/users.html' },
    { tag: '<!-- {{TAB_WITHDRAWALS}} -->', file: 'admin/tabs/withdrawals.html' },
    { tag: '<!-- {{TAB_TRANSACTIONS}} -->', file: 'admin/tabs/transactions.html' },
    { tag: '<!-- {{TAB_SETTINGS}} -->', file: 'admin/tabs/settings.html' },
    { tag: '<!-- {{MODAL_USER}} -->', file: 'admin/modals/user.html' },
    { tag: '<!-- {{MODAL_VIETQR}} -->', file: 'admin/modals/vietqr.html' },
    { tag: '<!-- {{MODAL_REJECT}} -->', file: 'admin/modals/reject.html' },
  ];

  for (const p of htmlPartials) {
    const part = loadViewPart(p.file);
    if (part) master = master.replace(p.tag, part);
  }

  // 3. Chèn các file JavaScript chức năng
  const scriptPartials = [
    { tag: '<!-- {{JS_DASHBOARD}} -->', file: 'admin/js/dashboard.js' },
    { tag: '<!-- {{JS_WITHDRAWALS}} -->', file: 'admin/js/withdrawals.js' },
    { tag: '<!-- {{JS_REALTIME}} -->', file: 'admin/js/realtime.js' },
  ];

  for (const s of scriptPartials) {
    const script = loadViewPart(s.file);
    if (script) master = master.replace(s.tag, `<script>\n${script}\n</script>`);
  }

  return master;
};

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
  const html = loadViewPart('privacy.html');
  if (html) return res.type('html').send(html);
  res.status(404).send('Privacy Policy Page Not Found');
});

// Trang Quản trị Admin Dashboard (Tự động lắp ghép các module HTML/CSS/JS)
app.get(['/admin', '/admin/{*path}'], (req, res) => {
  const html = renderAdminView();
  if (html) return res.type('html').send(html);
  res.status(404).send('Admin Dashboard Page Not Found');
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

