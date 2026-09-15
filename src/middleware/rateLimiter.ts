import rateLimit from 'express-rate-limit';

export const flagSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP / user to 10 flag submissions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'لقد تجاوزت عدد محاولات إرسال الـ Flag المسموح بها. يرجى الانتظار دقيقة وتكرار المحاولة.',
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'عدد محاولات تسجيل الدخول كثيرة جداً. يرجى الانتظار والمحاولة لاحقاً.',
  },
});

export const apiGlobalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز الحد المسموح به لطلبات الـ API.',
  },
});
