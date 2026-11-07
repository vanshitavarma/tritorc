/**
 * Lightweight, dependency-free in-memory rate limiter middleware.
 * Protects against rapid-fire scanning denial of service and API quota abuse.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 120; // 120 requests per minute per IP

const ipRequestMap = new Map();

// Periodic cleanup every 2 minutes
globalThis.setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestMap.entries()) {
    if (now > record.resetTime) {
      ipRequestMap.delete(ip);
    }
  }
}, 2 * 60 * 1000).unref();

export const rateLimiter = (req, res, next) => {
  // Allow unrestricted health checks
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  const clientIp =
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  const now = Date.now();
  let record = ipRequestMap.get(clientIp);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + WINDOW_MS };
    ipRequestMap.set(clientIp, record);
  } else {
    record.count++;
  }

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

  if (record.count > MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    return res.status(429).json({
      success: false,
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests from this IP address. Please retry after ${retryAfterSeconds} seconds.`,
    });
  }

  next();
};
