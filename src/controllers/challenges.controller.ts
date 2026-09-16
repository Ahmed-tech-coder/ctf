import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { compareFlag } from '../utils/security';
import { getChallengeFileStreamOrPath } from '../services/storage';

const submitFlagSchema = z.object({
  flag: z.string().min(1, 'رمز الـ Flag مطلوب ولا يمكن أن يكون فارغاً'),
});

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0];
  return param || '';
};

export const getChallenges = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const memberId = req.user?.id;

  const challenges = await prisma.challenge.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      category: true,
      points: true,
      maxAttempts: true,
      createdAt: true,
    },
    orderBy: { points: 'asc' },
  });

  let memberProgressMap = new Map<string, { attemptsUsed: number; solved: boolean; locked: boolean }>();
  if (memberId) {
    const progressList = await prisma.challengeProgress.findMany({
      where: { memberId },
      select: { challengeId: true, attemptsUsed: true, solved: true, locked: true },
    });
    progressList.forEach((p) => {
      memberProgressMap.set(p.challengeId, {
        attemptsUsed: p.attemptsUsed,
        solved: p.solved,
        locked: p.locked,
      });
    });
  }

  const result = challenges.map((ch) => {
    const prog = memberProgressMap.get(ch.id) || { attemptsUsed: 0, solved: false, locked: false };
    const attemptsRemaining = Math.max(0, ch.maxAttempts - prog.attemptsUsed);

    let state: 'AVAILABLE' | 'SOLVED' | 'LOCKED' | 'IN_PROGRESS' = 'AVAILABLE';
    if (prog.solved) {
      state = 'SOLVED';
    } else if (prog.locked || attemptsRemaining <= 0) {
      state = 'LOCKED';
    } else if (prog.attemptsUsed > 0) {
      state = 'IN_PROGRESS';
    }

    return {
      ...ch,
      attemptsUsed: prog.attemptsUsed,
      attemptsRemaining,
      solved: prog.solved,
      locked: prog.locked,
      state,
    };
  });

  res.json({
    success: true,
    challenges: result,
  });
};

export const getChallengeBySlug = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const slug = getParamString(req.params.slug);
  const memberId = req.user?.id;

  const challenge = await prisma.challenge.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      category: true,
      points: true,
      maxAttempts: true,
      status: true,
      createdAt: true,
    },
  });

  if (!challenge) {
    res.status(404).json({ success: false, message: 'التحدي المطلوب غير متاح أو غير منشور.' });
    return;
  }

  let progress = null;
  if (memberId) {
    const prog = await prisma.challengeProgress.findUnique({
      where: {
        memberId_challengeId: {
          memberId,
          challengeId: challenge.id,
        },
      },
      select: { attemptsUsed: true, solved: true, locked: true },
    });

    const attemptsUsed = prog ? prog.attemptsUsed : 0;
    const attemptsRemaining = Math.max(0, challenge.maxAttempts - attemptsUsed);
    const solved = prog ? prog.solved : false;
    const locked = prog ? (prog.locked || attemptsRemaining <= 0) : false;

    progress = {
      attemptsUsed,
      attemptsRemaining,
      solved,
      locked,
    };
  }

  res.json({
    success: true,
    challenge: {
      ...challenge,
      progress,
    },
  });
};

export const downloadChallengeFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = getParamString(req.params.id);

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { id: true, slug: true, filePath: true, fileData: true, status: true },
  });

  if (!challenge || challenge.status !== 'PUBLISHED') {
    res.status(404).json({ success: false, message: 'ملف التحدي غير موجود أو التحدي غير متاح.' });
    return;
  }

  try {
    if (challenge.fileData && challenge.fileData.length > 0) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${challenge.slug}_challenge.zip"`);
      res.send(Buffer.from(challenge.fileData));
      return;
    }

    const fileResult = await getChallengeFileStreamOrPath(challenge.filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${challenge.slug}_challenge.zip"`);

    if (fileResult.type === 'file') {
      res.sendFile(fileResult.data as string);
    } else if (fileResult.type === 'buffer') {
      res.send(fileResult.data as Buffer);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'فشل في تحميل ملف التحدي.' });
  }
};

export const submitFlag = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const challengeId = getParamString(req.params.challengeId);
  const memberId = req.user?.id;

  if (!memberId) {
    res.status(401).json({ success: false, message: 'تسجيل دخول العضو مطلوب.' });
    return;
  }

  const { flag } = submitFlagSchema.parse(req.body);

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, points: true, maxAttempts: true, flagHash: true, status: true },
  });

  if (!challenge || challenge.status !== 'PUBLISHED') {
    res.status(404).json({ success: false, message: 'التحدي غير موجود أو غير متاح.' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    let progress = await tx.challengeProgress.findUnique({
      where: {
        memberId_challengeId: {
          memberId,
          challengeId,
        },
      },
    });

    if (!progress) {
      progress = await tx.challengeProgress.create({
        data: {
          memberId,
          challengeId,
          attemptsUsed: 0,
          solved: false,
          locked: false,
        },
      });
    }

    if (progress.solved) {
      return {
        status: 'ALREADY_SOLVED',
        message: 'لقد قمت بحل هذا التحدي مسبقاً!',
      };
    }

    if (progress.locked || progress.attemptsUsed >= challenge.maxAttempts) {
      return {
        status: 'LOCKED',
        message: 'التحدي مغلق. لقد استنفدت جميع المحاولات المتاحة.',
        attemptsRemaining: 0,
      };
    }

    const isCorrect = compareFlag(flag, challenge.flagHash);

    if (isCorrect) {
      const updatedProgress = await tx.challengeProgress.update({
        where: { id: progress.id },
        data: {
          solved: true,
          solvedAt: new Date(),
        },
      });

      const updatedMember = await tx.member.update({
        where: { id: memberId },
        data: {
          score: { increment: challenge.points },
        },
      });

      await tx.scoreHistory.create({
        data: {
          memberId,
          challengeId,
          points: challenge.points,
        },
      });

      await tx.submission.create({
        data: {
          memberId,
          challengeId,
          result: 'CORRECT',
        },
      });

      return {
        status: 'CORRECT',
        message: 'إجابة صحيحة! (Flag الصحيح)',
        pointsEarned: challenge.points,
        newTotalScore: updatedMember.score,
        attemptsRemaining: challenge.maxAttempts - updatedProgress.attemptsUsed,
      };
    } else {
      const newAttemptsUsed = progress.attemptsUsed + 1;
      const isNowLocked = newAttemptsUsed >= challenge.maxAttempts;

      await tx.challengeProgress.update({
        where: { id: progress.id },
        data: {
          attemptsUsed: newAttemptsUsed,
          locked: isNowLocked,
        },
      });

      await tx.submission.create({
        data: {
          memberId,
          challengeId,
          result: 'INCORRECT',
        },
      });

      const attemptsRemaining = Math.max(0, challenge.maxAttempts - newAttemptsUsed);

      return {
        status: isNowLocked ? 'LOCKED' : 'INCORRECT',
        message: isNowLocked
          ? 'التحدي مغلق. لقد استنفدت جميع المحاولات المتاحة.'
          : 'Flag غير صحيح. يرجى التأكد والمحاولة مرة أخرى.',
        attemptsRemaining,
      };
    }
  });

  if (result.status === 'CORRECT') {
    res.json({
      success: true,
      result: 'CORRECT',
      message: result.message,
      pointsEarned: result.pointsEarned,
      newTotalScore: result.newTotalScore,
      attemptsRemaining: result.attemptsRemaining,
    });
  } else if (result.status === 'ALREADY_SOLVED') {
    res.status(400).json({
      success: false,
      result: 'ALREADY_SOLVED',
      message: result.message,
    });
  } else if (result.status === 'LOCKED') {
    res.status(403).json({
      success: false,
      result: 'LOCKED',
      message: result.message,
      attemptsRemaining: 0,
    });
  } else {
    res.status(400).json({
      success: false,
      result: 'INCORRECT',
      message: result.message,
      attemptsRemaining: result.attemptsRemaining,
    });
  }
};
