import { Request, Response } from 'express';
import { prisma } from '../services/prisma';

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  const members = await prisma.member.findMany({
    include: {
      progress: {
        where: { solved: true },
        select: { id: true, solvedAt: true },
      },
    },
    orderBy: [
      { score: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  const formattedLeaderboard = members.map((m) => {
    const solvedCount = m.progress.length;

    const lastSolvedAt = m.progress.reduce<Date | null>((latest, p) => {
      if (!p.solvedAt) return latest;
      const solvedDate = new Date(p.solvedAt);
      if (!latest || solvedDate > latest) return solvedDate;
      return latest;
    }, null);

    return {
      id: m.id,
      fullName: m.fullName,
      score: m.score,
      solvedCount,
      lastSolvedAt,
      registeredAt: m.createdAt,
    };
  });

  formattedLeaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
    const timeA = a.lastSolvedAt ? a.lastSolvedAt.getTime() : a.registeredAt.getTime();
    const timeB = b.lastSolvedAt ? b.lastSolvedAt.getTime() : b.registeredAt.getTime();
    return timeA - timeB;
  });

  const ranked = formattedLeaderboard.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));

  res.json({
    success: true,
    leaderboard: ranked,
  });
};
