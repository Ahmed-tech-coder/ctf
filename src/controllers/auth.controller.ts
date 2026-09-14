import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  signMemberToken,
  signAdminToken,
  comparePassword,
} from '../utils/security';

const memberRegisterSchema = z.object({
  fullName: z
    .string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Full name is too long')
    .refine((val) => {
      const parts = val.trim().split(/\s+/);
      return parts.length >= 3;
    }, 'Full name must consist of at least three parts (First Middle Last name).'),
});

const adminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fullName } = memberRegisterSchema.parse(req.body);

  const cleanName = fullName.trim().replace(/\s+/g, ' ');

  // Create member
  const member = await prisma.member.create({
    data: {
      fullName: cleanName,
      score: 0,
    },
  });

  const token = signMemberToken(member);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    token,
    member: {
      id: member.id,
      fullName: member.fullName,
      score: member.score,
      createdAt: member.createdAt,
    },
  });
};

export const getMemberMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const memberId = req.user?.id;
  if (!memberId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      progress: {
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              slug: true,
              category: true,
              difficulty: true,
              points: true,
            },
          },
        },
      },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 10,
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              points: true,
            },
          },
        },
      },
    },
  });

  if (!member) {
    res.status(404).json({ success: false, message: 'Member not found' });
    return;
  }

  // Calculate Rank
  // Sort order: score DESC, createdAt ASC
  const higherRankCount = await prisma.member.count({
    where: {
      OR: [
        { score: { gt: member.score } },
        {
          score: member.score,
          createdAt: { lt: member.createdAt },
        },
      ],
    },
  });

  const rank = higherRankCount + 1;

  // Published challenges count
  const totalPublishedChallenges = await prisma.challenge.count({
    where: { status: 'PUBLISHED' },
  });

  const solvedCount = member.progress.filter((p) => p.solved).length;
  const progressPercentage =
    totalPublishedChallenges > 0
      ? Math.round((solvedCount / totalPublishedChallenges) * 100)
      : 0;

  res.json({
    success: true,
    member: {
      id: member.id,
      fullName: member.fullName,
      score: member.score,
      rank,
      solvedCount,
      totalChallenges: totalPublishedChallenges,
      progressPercentage,
      progress: member.progress,
      recentSubmissions: member.submissions,
      createdAt: member.createdAt,
    },
  });
};

export const adminLogin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { email, password } = adminLoginSchema.parse(req.body);

  const admin = await prisma.admin.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!admin) {
    res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    return;
  }

  const isValidPassword = await comparePassword(password, admin.passwordHash);
  if (!isValidPassword) {
    res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    return;
  }

  const token = signAdminToken(admin);

  res.json({
    success: true,
    message: 'Admin login successful',
    token,
    admin: {
      id: admin.id,
      email: admin.email,
    },
  });
};
