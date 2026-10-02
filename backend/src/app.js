import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import { getJwtSecret } from './lib/jwt.js';

dotenv.config();
getJwtSecret();

const app = express();
const port = process.env.PORT || 5001;
const configuredFrontendOrigin = process.env.FRONTEND_URL
  ? new URL(process.env.FRONTEND_URL).origin
  : null;

function isAllowedOrigin(origin) {
  if (!origin) {
    return false;
  }

  if (origin === configuredFrontendOrigin) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === origin
      && parsedOrigin.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TaskFlow AI backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

app.listen(port, () => {
  console.log(`TaskFlow AI backend running on http://localhost:${port}`);
});
