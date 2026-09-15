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
    .min(3, 'الاسم يجب أن لا يقل عن 3 أحرف')
    .max(100, 'الاسم طويل جداً')
    .refine((val) => {
      const parts = val.trim().split(/\s+/);
      return parts.length >= 3;
    }, 'يجب أن يتكون الاسم الكامل من 3 أجزاء على الأقل (الاسم الأول والأوسط والعائلة).'),
});

const adminLoginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: z.string().min(6, 'كلمة المرور يجب أن لا تقل عن 6 أحرف'),
});

export const registerMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fullName } = memberRegisterSchema.parse(req.body);
  const cleanName = fullName.trim().replace(/\s+/g, ' ');

  const member = await prisma.member.create({
    data: {
      fullName: cleanName,
      score: 0,
    },
  });

  const token = signMemberToken(member);

  res.status(201).json({
    success: true,
    message: 'تم التسجيل بنجاح',
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
    res.status(401).json({ success: false, message: 'غير مصرح به' });
    return;
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    res.status(404).json({ success: false, message: 'العضو غير موجود' });
    return;
  }

  // Fetch progress with challenge details
  const progressRows = await prisma.challengeProgress.findMany({
    where: { memberId },
    include: {
      challenge: {
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          points: true,
        },
      },
    },
  });

  // Fetch recent submissions with challenge details
  const recentSubmissions = await prisma.submission.findMany({
    where: { memberId },
    include: {
      challenge: {
        select: {
          id: true,
          title: true,
          points: true,
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
    take: 10,
  });

  // Calculate Rank (score DESC, createdAt ASC)
  const higherRankCount = await prisma.member.count({
    where: {
      OR: [
        { score: { gt: member.score } },
        {
          AND: [
            { score: member.score },
            { createdAt: { lt: member.createdAt } },
          ],
        },
      ],
    },
  });

  const rank = higherRankCount + 1;

  // Total published challenges count
  const totalPub = await prisma.challenge.count({
    where: { status: 'PUBLISHED' },
  });

  const solvedCount = progressRows.filter((p) => p.solved).length;
  const progressPercentage =
    totalPub > 0 ? Math.round((solvedCount / totalPub) * 100) : 0;

  res.json({
    success: true,
    member: {
      id: member.id,
      fullName: member.fullName,
      score: member.score,
      rank,
      solvedCount,
      totalChallenges: totalPub,
      progressPercentage,
      progress: progressRows,
      recentSubmissions,
      createdAt: member.createdAt,
    },
  });
};

export const adminLogin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { email, password } = adminLoginSchema.parse(req.body);

  const admin = await prisma.admin.findFirst({
    where: {
      email: {
        equals: email.trim(),
        mode: 'insensitive',
      },
    },
  });

  if (!admin) {
    res.status(401).json({ success: false, message: 'بيانات دخول المسؤول غير صحيحة' });
    return;
  }

  const isValidPassword = await comparePassword(password, admin.passwordHash);
  if (!isValidPassword) {
    res.status(401).json({ success: false, message: 'بيانات دخول المسؤول غير صحيحة' });
    return;
  }

  const token = signAdminToken(admin);

  res.json({
    success: true,
    message: 'تم تسجيل دخول المسؤول بنجاح',
    token,
    admin: {
      id: admin.id,
      email: admin.email,
    },
  });
};
