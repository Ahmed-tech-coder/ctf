import { Router } from 'express';
import { registerMember, getMemberMe } from '../controllers/auth.controller';
import { requireMember } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, registerMember);
router.get('/me', requireMember, getMemberMe);

export default router;
