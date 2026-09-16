import { Router } from 'express';
import multer from 'multer';
import { adminLogin } from '../controllers/auth.controller';
import {
  getAdminDashboard,
  getAdminChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  publishChallenge,
  unpublishChallenge,
  getAdminMembers,
  deleteAdminMember,
  deleteAllAdminMembers,
  getAdminSubmissions,
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed for challenge downloads.'));
    }
  },
});

const router = Router();

// Auth
router.post('/auth/login', authRateLimiter, adminLogin);

// Protected Admin Routes
router.get('/dashboard', requireAdmin, getAdminDashboard);
router.get('/challenges', requireAdmin, getAdminChallenges);
router.post('/challenges', requireAdmin, upload.single('file'), createChallenge);
router.patch('/challenges/:id', requireAdmin, upload.single('file'), updateChallenge);
router.delete('/challenges/:id', requireAdmin, deleteChallenge);
router.post('/challenges/:id/publish', requireAdmin, publishChallenge);
router.post('/challenges/:id/unpublish', requireAdmin, unpublishChallenge);
router.get('/members', requireAdmin, getAdminMembers);
router.delete('/members', requireAdmin, deleteAllAdminMembers);
router.delete('/members/:id', requireAdmin, deleteAdminMember);
router.get('/submissions', requireAdmin, getAdminSubmissions);


export default router;
