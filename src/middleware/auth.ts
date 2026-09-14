import { Request, Response, NextFunction } from 'express';
import { verifyMemberToken, verifyAdminToken, TokenPayload } from '../utils/security';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const requireMember = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required. Please register or log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyMemberToken(token);
    if (decoded.role !== 'MEMBER') {
      res.status(403).json({ success: false, message: 'Access denied. Member privileges required.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
    return;
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Admin authentication required.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAdminToken(token);
    if (decoded.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired admin session token.' });
    return;
  }
};
