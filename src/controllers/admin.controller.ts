import { Response } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { prisma } from '../services/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { hashFlag } from '../utils/security';
import { uploadChallengeFile } from '../services/storage';

const createChallengeSchema = z.object({
  title: z.string().min(2, 'Title is required'),
  description: z.string().optional().default(''),
  category: z.string().min(2, 'Category is required'),
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

  const scoreAggregate = await prisma.member.aggregate({
    _avg: { score: true },
  });
  const averageScore = Math.round(scoreAggregate._avg.score || 0);

  const recentSubmissions = await prisma.submission.findMany({
    include: {
      member: { select: { id: true, fullName: true } },
      challenge: { select: { id: true, title: true, points: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 10,
  });

  const topMembers = await prisma.member.findMany({
    select: { id: true, fullName: true, score: true },
    orderBy: { score: 'desc' },
    take: 5,
  });

  const challengesWithSolves = await prisma.challenge.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      points: true,
      status: true,
      _count: {
        select: {
          submissions: {
            where: { result: 'CORRECT' },
          },
        },
      },
    },
    take: 10,
  });

  const mostSolved = challengesWithSolves
    .map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      points: c.points,
      status: c.status,
      solvesCount: c._count.submissions,
    }))
    .sort((a, b) => b.solvesCount - a.solvesCount)
    .slice(0, 5);

  const challengesWithIncorrect = await prisma.challenge.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      _count: {
        select: {
          submissions: {
            where: { result: 'INCORRECT' },
          },
        },
      },
    },
    take: 10,
  });

  const mostFailed = challengesWithIncorrect
    .map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      incorrectCount: c._count.submissions,
    }))
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
    include: {
      _count: {
        select: {
          progress: { where: { solved: true } },
          submissions: true,
        },
      },
      submissions: {
        where: { result: 'INCORRECT' },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const formatted = challenges.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    category: c.category,
    points: c.points,
    maxAttempts: c.maxAttempts,
    filePath: c.filePath,
    status: c.status,
    createdAt: c.createdAt,
    solvesCount: c._count.progress,
    totalSubmissions: c._count.submissions,
    incorrectSubmissions: c.submissions.length,
  }));

  res.json({
    success: true,
    challenges: formatted,
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
      description: data.description ?? '',
      category: data.category,
      points: data.points,
      maxAttempts: data.maxAttempts,
      flagHash,
      filePath: uploadResult.filePath,
      fileData: uploadResult.fileBuffer,
      status: data.status,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      points: true,
      maxAttempts: true,
      status: true,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Challenge created successfully.',
    challenge,
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
  let fileData = existing.fileData;
  if (req.file) {
    const uploadResult = await uploadChallengeFile(req.file);
    filePath = uploadResult.filePath;
    fileData = uploadResult.fileBuffer;
  }

  let flagHash = existing.flagHash;
  if (data.flag && data.flag.trim().length > 0) {
    flagHash = hashFlag(data.flag);
  }

  let slug = existing.slug;
  if (data.title && data.title !== existing.title) {
    slug = slugify(data.title, { lower: true, strict: true });
    const slugCheck = await prisma.challenge.findFirst({
      where: { slug, id: { not: id } },
    });
    if (slugCheck) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }
  }

  const updated = await prisma.challenge.update({
    where: { id },
    data: {
      title: data.title ?? existing.title,
      slug,
      description: data.description ?? existing.description,
      category: data.category ?? existing.category,
      points: data.points ?? existing.points,
      maxAttempts: data.maxAttempts ?? existing.maxAttempts,
      status: data.status ?? existing.status,
      flagHash,
      filePath,
      fileData,
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

  const existing = await prisma.challenge.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Challenge not found' });
    return;
  }

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

  const existing = await prisma.challenge.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Challenge not found' });
    return;
  }

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
    include: {
      _count: {
        select: {
          progress: { where: { solved: true } },
          submissions: true,
        },
      },
    },
    orderBy: { score: 'desc' },
  });

  const formatted = members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    score: m.score,
    createdAt: m.createdAt,
    solvedCount: m._count.progress,
    totalSubmissions: m._count.submissions,
  }));

  res.json({
    success: true,
    members: formatted,
  });
};

export const getAdminSubmissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const submissions = await prisma.submission.findMany({
    include: {
      member: { select: { id: true, fullName: true } },
      challenge: { select: { id: true, title: true, points: true, category: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  res.json({
    success: true,
    submissions,
  });
};

export const deleteAdminMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    res.status(404).json({ success: false, message: 'Member not found' });
    return;
  }

  await prisma.member.delete({ where: { id } });

  res.json({
    success: true,
    message: 'Member deleted successfully.',
  });
};

export const deleteAllAdminMembers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const result = await prisma.member.deleteMany();

  res.json({
    success: true,
    message: 'All members deleted successfully.',
    count: result.count,
  });
};

