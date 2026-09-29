import rateLimit from 'express-rate-limit';

// applies to /api/auth/login and /api/auth/register — limits brute-force password guessing
// and mass fake-account creation. 10 attempts per 15 minutes per IP is generous for a real
// user who mistypes a password a few times, but useless for an automated attack script.
//
// DEMO-DAY NOTE: an exhibition booth gets many repeated login/register attempts from
// different visitors in a short window — even 200 could theoretically be reached on a
// busy day. Set DEMO_MODE=true in .env to skip this limiter entirely for the day of your
// presentation, then remove it afterwards to go back to the strict production limit.
const isDemoMode = process.env.DEMO_MODE === 'true';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 700,
  message: { message: 'Too many attempts from this IP, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDemoMode,
});