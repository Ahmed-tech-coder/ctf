import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('[SERVER ERROR]', err);

  if (err instanceof ZodError) {
    const issueMessages = err.errors.map((e) => e.message).join('، ');
    res.status(400).json({
      success: false,
      message: `خطأ في البيانات المدخلة: ${issueMessages}`,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'السجل موجود بالفعل بهذه البيانات.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'السجل المطلوب غير موجود.',
      });
      return;
    }
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'حدث خطأ غير متوقع في الخادم.';

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة لاحقاً.'
      : message,
  });
};
