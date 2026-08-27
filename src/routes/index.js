import { Router } from 'express';
import usersRouter from './usersRouter.js';
import adsRouter from './adsRouter.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'View2Earn Server is running smoothly',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// User routes (/api/users/register, /api/users/login, /api/users/profile, /api/users/reward, /api/users/history)
router.use('/users', usersRouter);

// Ad routes (/api/ads/start, /api/ads/complete)
router.use('/ads', adsRouter);

export default router;

