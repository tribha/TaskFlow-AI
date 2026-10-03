import express from 'express';
import { addTask, deleteTask, getUserTasks, updateTask } from '../data/store.js';
import { parseVoiceTranscript } from '../services/taskParser.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

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
