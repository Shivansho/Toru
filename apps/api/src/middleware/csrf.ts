import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Always set a CSRF token cookie if not present
  let token = req.cookies['csrfToken'];
  if (!token) {
    token = crypto.randomUUID();
    res.cookie('csrfToken', token, {
      httpOnly: false, // Must be readable by frontend JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }

  // Only protect state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // In tests, we bypass
  if (process.env.NODE_ENV === 'test') {
     return next();
  }

  // Validate the token
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== token) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  next();
};
