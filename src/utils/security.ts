import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Normalizes flag string safely (trims whitespace, preserves exact casing inside format like CTF{...}).
 */
export const normalizeFlag = (flag: string): string => {
  return flag.trim();
};

/**
 * Generates a secure SHA-256 hash of a normalized flag using the server secret salt.
 * The raw plaintext flag is NEVER saved in the database or exposed.
 */
export const hashFlag = (flag: string): string => {
  const normalized = normalizeFlag(flag);
  return crypto
    .createHmac('sha256', env.FLAG_SALT)
    .update(normalized)
    .digest('hex');
};

/**
 * Compares submitted raw flag hash with stored flag hash securely.
 */
export const compareFlag = (submittedFlag: string, storedHash: string): boolean => {
  const submittedHash = hashFlag(submittedFlag);
  // Timing-safe comparison to prevent side-channel timing attacks
  const bufferSubmitted = Buffer.from(submittedHash, 'utf8');
  const bufferStored = Buffer.from(storedHash, 'utf8');
  if (bufferSubmitted.length !== bufferStored.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferSubmitted, bufferStored);
};

/**
 * Password hashing for Admin authentication.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * JWT utilities for Member & Admin sessions.
 */
export interface TokenPayload {
  id: string;
  role: 'MEMBER' | 'ADMIN';
  email?: string;
  fullName?: string;
}

export const signMemberToken = (member: { id: string; fullName: string }): string => {
  const payload: TokenPayload = {
    id: member.id,
    role: 'MEMBER',
    fullName: member.fullName,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
};

export const signAdminToken = (admin: { id: string; email: string }): string => {
  const payload: TokenPayload = {
    id: admin.id,
    role: 'ADMIN',
    email: admin.email,
  };
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn: '1d' });
};

export const verifyMemberToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};

export const verifyAdminToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.ADMIN_JWT_SECRET) as TokenPayload;
};
