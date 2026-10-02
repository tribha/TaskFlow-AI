import jwt from 'jsonwebtoken';
import { findUserById } from '../data/store.js';
import { getJwtSecret } from '../lib/jwt.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (error) {
    if (error.code === 'JWT_SECRET_MISSING') {
      return res.status(500).json({ message: 'Server configuration error: JWT_SECRET is required.' });
    }
    throw error;
  }

  try {
    const decoded = jwt.verify(token, secret);
    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
