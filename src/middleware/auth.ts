import { Request, Response, NextFunction } from 'express';
import { verifyMemberToken, verifyAdminToken, TokenPayload } from '../utils/security';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const requireMember = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'تسجيل الدخول مطلوب. يرجى تسجيل حساب أولاً.' });
    return;
  }

  try {
    const decoded = verifyMemberToken(token);
    if (decoded.role !== 'MEMBER') {
      res.status(403).json({ success: false, message: 'تم رفض الوصول. صلاحيات عضو مطلوبة.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' });
    return;
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'تسجيل دخول المسؤول مطلوب.' });
    return;
  }

  try {
    const decoded = verifyAdminToken(token);
    if (decoded.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'تم رفض الوصول. صلاحيات مسؤول مطلوبة.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'رمز جلسة المسؤول غير صالح أو منتهي الصلاحية.' });
    return;
  }
};
