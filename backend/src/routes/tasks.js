import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { addTask, deleteTask, getUserTasks, updateTask } from '../data/store.js';
import { parseVoiceTranscript } from '../services/taskParser.js';
import {
  isSupportedAudioType,
  TranscriptionServiceError,
  transcribeAudio,
} from '../services/transcriptionService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE, files: 1, fields: 0 },
});
const transcriptionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many transcription requests. Please try again later.' },
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const tasks = await getUserTasks(req.user.id);
  return res.json(tasks);
});

router.get('/summary', async (req, res) => {
  const tasks = await getUserTasks(req.user.id);
  const summary = {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    inProgress: tasks.filter((task) => task.status === 'in-progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    highPriority: tasks.filter((task) => task.priority === 'High').length,
  };

  return res.json(summary);
});

router.post('/manual', async (req, res) => {
  const { title, description, priority, category, dueDate, status } = req.body || {};

  if (!title) {
    return res.status(400).json({ message: 'Task title is required.' });
  }

  const task = await addTask({
    userId: req.user.id,
    title,
    description: description || '',
    priority: priority || 'Medium',
    category: category || 'General',
    dueDate: dueDate || null,
    status: status || 'todo',
  });

  return res.status(201).json(task);
});

router.post('/voice', async (req, res) => {
  const { transcript } = req.body || {};

  if (!transcript) {
    return res.status(400).json({ message: 'Transcript text is required.' });
  }

  const parsedTasks = parseVoiceTranscript(transcript).map((task) => ({
    ...task,
    userId: req.user.id,
  }));

  const savedTasks = await Promise.all(parsedTasks.map((task) => addTask(task)));
  return res.status(201).json(savedTasks);
});

router.post('/transcribe', transcriptionRateLimiter, (req, res, next) => {
  uploadAudio.single('audio')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'Audio file must be 15 MB or smaller.' });
      return;
    }

    res.status(400).json({ message: 'Audio upload is invalid. Please try another recording.' });
  });
}, async (req, res) => {
  if (!req.file || req.file.size === 0) {
    return res.status(400).json({ message: 'A non-empty audio file is required.' });
  }

  if (!isSupportedAudioType(req.file.mimetype)) {
    return res.status(415).json({ message: 'Unsupported audio file type.' });
  }

  try {
    const result = await transcribeAudio(req.file);
    return res.json(result);
  } catch (error) {
    if (error instanceof TranscriptionServiceError) {
      return res.status(error.status).json({ message: error.message });
    }

    return res.status(502).json({ message: 'Audio transcription service failed. Please try again.' });
  }
});

router.put('/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const tasks = await getUserTasks(req.user.id);
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const updatedTask = await updateTask(taskId, req.user.id, req.body);
  if (!updatedTask) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  return res.json(updatedTask);
});

router.delete('/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const tasks = await getUserTasks(req.user.id);
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return res.status(404).json({ message: 'Task not found.' });
  }

  const deleted = await deleteTask(taskId, req.user.id);
  return deleted ? res.status(204).send() : res.status(404).json({ message: 'Task not found.' });
});

export default router;
