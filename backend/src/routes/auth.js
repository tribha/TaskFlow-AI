import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { createUser, findUserByEmail } from '../data/store.js';
import { getJwtSecret } from '../lib/jwt.js';

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const createAuthRateLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' },
});
const registerRateLimiter = createAuthRateLimiter();
const loginRateLimiter = createAuthRateLimiter();

function isRequestBody(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}

function isValidEmail(email) {
  return email.length <= 254 && emailPattern.test(email);
}

router.post('/register', registerRateLimiter, async (req, res) => {
  if (!isRequestBody(req.body)) {
    return res.status(400).json({ message: 'Request body must be an object.' });
  }

  const { name: rawName, email: rawEmail, password } = req.body;

  if (typeof rawName !== 'string') {
    return res.status(400).json({ message: 'Name must be a string.' });
  }

  const name = rawName.trim();
  if (!name) {
    return res.status(400).json({ message: 'Name is required.' });
  }

  if (name.length > 100) {
    return res.status(400).json({ message: 'Name must be 100 characters or fewer.' });
  }

  if (typeof rawEmail !== 'string') {
    return res.status(400).json({ message: 'Email must be a string.' });
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address of 254 characters or fewer.' });
  }

  if (typeof password !== 'string') {
    return res.status(400).json({ message: 'Password must be a string.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }

  if (password.length > 128) {
    return res.status(400).json({ message: 'Password must be 128 characters or fewer.' });
  }

  try {
    if (await findUserByEmail(email)) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const user = await createUser({ name, email, password });
    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: '7d',
    });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'User already exists.' });
    }

    return res.status(500).json({ message: 'Unable to register at this time.' });
  }
});

router.post('/login', loginRateLimiter, async (req, res) => {
  if (!isRequestBody(req.body)) {
    return res.status(400).json({ message: 'Request body must be an object.' });
  }

  const { email: rawEmail, password } = req.body;

  if (typeof rawEmail !== 'string') {
    return res.status(400).json({ message: 'Email must be a string.' });
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address of 254 characters or fewer.' });
  }

  if (typeof password !== 'string') {
    return res.status(400).json({ message: 'Password must be a string.' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Password is required.' });
  }

  if (password.length > 128) {
    return res.status(400).json({ message: 'Password must be 128 characters or fewer.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: '7d',
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch {
    return res.status(500).json({ message: 'Unable to log in at this time.' });
  }
});

export default router;
