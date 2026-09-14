import { Router } from 'express';
import {
  getChallenges,
  getChallengeBySlug,
  downloadChallengeFile,
  submitFlag,
} from '../controllers/challenges.controller';
import { requireMember } from '../middleware/auth';
import { flagSubmissionLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/', getChallenges);
router.get('/:slug', getChallengeBySlug);
router.get('/:id/download', requireMember, downloadChallengeFile);
router.post('/:challengeId/submit', requireMember, flagSubmissionLimiter, submitFlag);

export default router;
