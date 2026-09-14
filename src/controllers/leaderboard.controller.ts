import { Request, Response } from 'express';
import { prisma } from '../services/prisma';

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  const members = await prisma.member.findMany({
    select: {
      id: true,
      fullName: true,
      score: true,
      createdAt: true,
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

  // Map and sort members according to:
  // 1. Score DESC
  // 2. Solved challenges DESC
  // 3. Earliest solvedAt / createdAt ASC
  const formattedLeaderboard = members.map((m) => {
    const solvedCount = m.progress.length;
    // Find latest solvedAt timestamp if any
    const lastSolvedAt = m.progress.reduce<Date | null>((latest, p) => {
      if (!p.solvedAt) return latest;
      if (!latest || p.solvedAt > latest) return p.solvedAt;
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

  // Assign ranks
  const ranked = formattedLeaderboard.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));

  res.json({
    success: true,
    leaderboard: ranked,
  });
};
