import { Router } from 'express';
import usersRouter from './usersRouter.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'View2Earn Server is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

// User routes (/api/users/register, /api/users/login)
router.use('/users', usersRouter);

export default router;
