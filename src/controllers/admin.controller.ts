import { Response } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { prisma } from '../services/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { hashFlag } from '../utils/security';
import { uploadChallengeFile } from '../services/storage';

const createChallengeSchema = z.object({
  title: z.string().min(2, 'Title is required'),
  description: z.string().min(5, 'Description is required'),
  category: z.string().min(2, 'Category is required'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'EXPERT']),
  points: z.coerce.number().int().positive('Points must be a positive integer'),
  maxAttempts: z.coerce.number().int().positive('Max attempts must be a positive integer'),
  flag: z.string().min(1, 'Flag is required'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
});

const updateChallengeSchema = createChallengeSchema.partial().extend({
  flag: z.string().optional(),
});

export const getAdminDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const totalMembers = await prisma.member.count();
  const totalChallenges = await prisma.challenge.count();
  const totalSolves = await prisma.submission.count({ where: { result: 'CORRECT' } });
  const totalSubmissions = await prisma.submission.count();
  const totalIncorrectAttempts = await prisma.submission.count({ where: { result: 'INCORRECT' } });

  const avgScoreAggregate = await prisma.member.aggregate({
    _avg: { score: true },
  });
  const averageScore = Math.round(avgScoreAggregate._avg.score || 0);

  // Recent Submissions (last 10)
  const recentSubmissions = await prisma.submission.findMany({
    take: 10,
    orderBy: { submittedAt: 'desc' },
    include: {
      member: { select: { id: true, fullName: true } },
      challenge: { select: { id: true, title: true, points: true } },
    },
  });

  // Top 5 Members
  const topMembers = await prisma.member.findMany({
    take: 5,
    orderBy: { score: 'desc' },
    select: { id: true, fullName: true, score: true },
  });

  // Most Solved Challenges
  const challengesWithSolves = await prisma.challenge.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      difficulty: true,
      points: true,
      status: true,
      submissions: {
        where: { result: 'CORRECT' },
      },
    },
  });

  const mostSolved = [...challengesWithSolves]
    .map((c) => ({ ...c, solvesCount: c.submissions.length }))
    .sort((a, b) => b.solvesCount - a.solvesCount)
    .slice(0, 5);

  // Most Failed Challenges
  const challengesWithFailures = await prisma.challenge.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      difficulty: true,
      submissions: {
        where: { result: 'INCORRECT' },
      },
    },
  });

  const mostFailed = [...challengesWithFailures]
    .map((c) => ({ ...c, incorrectCount: c.submissions.length }))
    .sort((a, b) => b.incorrectCount - a.incorrectCount)
    .slice(0, 5);

  res.json({
    success: true,
    stats: {
      totalMembers,
      totalChallenges,
      totalSolves,
      totalSubmissions,
      totalIncorrectAttempts,
      averageScore,
    },
    recentSubmissions,
    topMembers,
    mostSolved,
    mostFailed,
  });
};

export const getAdminChallenges = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const challenges = await prisma.challenge.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      submissions: {
        select: { result: true },
      },
      progress: {
        where: { solved: true },
        select: { id: true },
      },
    },
  });

  const result = challenges.map((ch) => {
    const solvesCount = ch.progress.length;
    const totalSubmissions = ch.submissions.length;
    const incorrectSubmissions = ch.submissions.filter((s) => s.result === 'INCORRECT').length;

    return {
      id: ch.id,
      title: ch.title,
      slug: ch.slug,
      description: ch.description,
      category: ch.category,
      difficulty: ch.difficulty,
      points: ch.points,
      maxAttempts: ch.maxAttempts,
      filePath: ch.filePath,
      status: ch.status,
      solvesCount,
      totalSubmissions,
      incorrectSubmissions,
      createdAt: ch.createdAt,
    };
  });

  res.json({
    success: true,
    challenges: result,
  });
};

export const createChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Challenge ZIP file is required.' });
    return;
  }

  const data = createChallengeSchema.parse(req.body);

  const uploadResult = await uploadChallengeFile(req.file);

  let slug = slugify(data.title, { lower: true, strict: true });
  const existingSlug = await prisma.challenge.findUnique({ where: { slug } });
  if (existingSlug) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const flagHash = hashFlag(data.flag);

  const challenge = await prisma.challenge.create({
    data: {
      title: data.title,
      slug,
      description: data.description,
      category: data.category,
      difficulty: data.difficulty,
      points: data.points,
      maxAttempts: data.maxAttempts,
      flagHash,
      filePath: uploadResult.filePath,
      status: data.status,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Challenge created successfully.',
    challenge: {
      id: challenge.id,
      title: challenge.title,
      slug: challenge.slug,
      category: challenge.category,
      difficulty: challenge.difficulty,
      points: challenge.points,
      maxAttempts: challenge.maxAttempts,
      status: challenge.status,
    },
  });
};

export const updateChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const data = updateChallengeSchema.parse(req.body);

  const existing = await prisma.challenge.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Challenge not found' });
    return;
  }

  let filePath = existing.filePath;
  if (req.file) {
    const uploadResult = await uploadChallengeFile(req.file);
    filePath = uploadResult.filePath;
  }

  let flagHash = existing.flagHash;
  if (data.flag && data.flag.trim().length > 0) {
    flagHash = hashFlag(data.flag);
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = slugify(data.title, { lower: true, strict: true });
  }

  const updated = await prisma.challenge.update({
    where: { id },
    data: {
      title: data.title ?? existing.title,
      slug,
      description: data.description ?? existing.description,
      category: data.category ?? existing.category,
      difficulty: data.difficulty ?? existing.difficulty,
      points: data.points ?? existing.points,
      maxAttempts: data.maxAttempts ?? existing.maxAttempts,
      status: data.status ?? existing.status,
      flagHash,
      filePath,
    },
  });

  res.json({
    success: true,
    message: 'Challenge updated successfully.',
    challenge: updated,
  });
};

export const deleteChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge) {
    res.status(404).json({ success: false, message: 'Challenge not found' });
    return;
  }

  await prisma.challenge.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Challenge deleted successfully.',
  });
};

export const publishChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const challenge = await prisma.challenge.update({
    where: { id },
    data: { status: 'PUBLISHED' },
  });

  res.json({
    success: true,
    message: `Challenge "${challenge.title}" published.`,
    challenge,
  });
};

export const unpublishChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const challenge = await prisma.challenge.update({
    where: { id },
    data: { status: 'DRAFT' },
  });

  res.json({
    success: true,
    message: `Challenge "${challenge.title}" unpublished (set to draft).`,
    challenge,
  });
};

export const getAdminMembers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const members = await prisma.member.findMany({
    orderBy: { score: 'desc' },
    include: {
      progress: {
        where: { solved: true },
        select: { id: true },
      },
      submissions: {
        select: { id: true },
      },
    },
  });

  const result = members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    score: m.score,
    solvedCount: m.progress.length,
    totalSubmissions: m.submissions.length,
    createdAt: m.createdAt,
  }));

  res.json({
    success: true,
    members: result,
  });
};

export const getAdminSubmissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const submissions = await prisma.submission.findMany({
    orderBy: { submittedAt: 'desc' },
    include: {
      member: { select: { id: true, fullName: true } },
      challenge: { select: { id: true, title: true, points: true, category: true } },
    },
  });

  res.json({
    success: true,
    submissions,
  });
};
