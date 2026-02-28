import rateLimit from "express-rate-limit";

/**
 * Standard rate limiter for most API endpoints
 * 100 requests per 15 minutes per IP
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for sensitive operations (auth, payments)
 * 10 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Generous limiter for public endpoints (health checks, static content)
 * 300 requests per 15 minutes per IP
 */
export const generousLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Rate limit exceeded." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * SMS/Call limiter to prevent abuse
 * 5 requests per hour per IP
 */
export const communicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Communication rate limit exceeded. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});
