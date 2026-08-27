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

// Kết nối MongoDB
connectDB();

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

// Trang chủ & Privacy Policy (Dành cho Google Play Console & người dùng)
app.get(['/', '/privacy-policy', '/privacy'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'privacy.html'));
});

// API Routes
app.use('/api', routes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Lắng nghe cổng khi chạy local (không chạy app.listen trên Vercel Serverless)
if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT);
}

export default app;
