import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';

const useDatabase = () => Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '');

const resolveStorePath = () => {
  if (process.env.TASKFLOW_STORE_PATH) {
    return process.env.TASKFLOW_STORE_PATH;
  }

  const cwd = process.cwd();
  const backendDefault = path.resolve(cwd, 'data', 'store.json');
  const rootDefault = path.resolve(cwd, 'backend', 'data', 'store.json');

  return cwd.endsWith(path.sep + 'backend') ? backendDefault : rootDefault;
};

const ensureStoreFile = (filePath) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ users: [], tasks: [] }, null, 2));
  }
};

const buildSeedData = () => ({
  users: [
    {
      id: 'user-demo',
      name: 'Demo User',
      email: 'demo@example.com',
      password: bcrypt.hashSync('password123', 10),
      createdAt: new Date().toISOString(),
    },
  ],
  tasks: [
    {
      id: 'task-1',
      userId: 'user-demo',
      title: 'Finish Java assignment',
      description: 'Complete the assignment and submit it before the deadline.',
      priority: 'High',
      dueDate: 'Tomorrow',
      category: 'Study',
      status: 'todo',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-2',
      userId: 'user-demo',
      title: 'Call Rahul about project',
      description: 'Discuss the status and next steps of the project.',
      priority: 'Medium',
      dueDate: null,
      category: 'Communication',
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-3',
      userId: 'user-demo',
      title: 'Submit DBMS assignment',
      description: 'Upload the DBMS assignment before Friday.',
      priority: 'Medium',
      dueDate: 'Friday',
      category: 'Study',
      status: 'completed',
      createdAt: new Date().toISOString(),
    },
  ],
});

let legacyStore;

const getLegacyStore = () => {
  if (legacyStore) {
    return legacyStore;
  }

  const storePath = resolveStorePath();
  const storeAlreadyExisted = fs.existsSync(storePath);
  ensureStoreFile(storePath);

  const raw = fs.readFileSync(storePath, 'utf8');
  const parsed = raw ? JSON.parse(raw) : { users: [], tasks: [] };
  if (!Array.isArray(parsed.users) || !Array.isArray(parsed.tasks)) {
    throw new Error('TaskFlow store is malformed.');
  }

  legacyStore = storeAlreadyExisted ? parsed : { ...buildSeedData(), ...parsed };
  if (!storeAlreadyExisted && legacyStore.users.length === 0 && legacyStore.tasks.length === 0) {
    const defaultData = buildSeedData();
    legacyStore.users = defaultData.users;
    legacyStore.tasks = defaultData.tasks;
    fs.writeFileSync(storePath, JSON.stringify(legacyStore, null, 2));
  }

  return legacyStore;
};

const persistLegacyStore = () => {
  const store = getLegacyStore();
  fs.writeFileSync(resolveStorePath(), JSON.stringify(store, null, 2));
};

const fileFindUserByEmail = (email) => {
  const { users } = getLegacyStore();
  const normalized = String(email).trim().toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalized) || null;
};

const fileFindUserById = (id) => getLegacyStore().users.find((user) => user.id === id) || null;

const fileCreateUser = ({ name, email, password }) => {
  const { users } = getLegacyStore();
  const newUser = {
    id: `user-${Date.now()}`,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    password: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  persistLegacyStore();
  return newUser;
};

const fileGetUserTasks = (userId) => getLegacyStore().tasks.filter((task) => task.userId === userId);

const fileAddTask = (task) => {
  const { tasks } = getLegacyStore();
  const newTask = {
    ...task,
    id: task.id || `task-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  persistLegacyStore();
  return newTask;
};

const fileUpdateTask = (taskId, updates) => {
  const { tasks } = getLegacyStore();
  const taskIndex = tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return null;

  tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
  persistLegacyStore();
  return tasks[taskIndex];
};

const fileDeleteTask = (taskId) => {
  const { tasks } = getLegacyStore();
  const taskIndex = tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) return false;

  tasks.splice(taskIndex, 1);
  persistLegacyStore();
  return true;
};

const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email.toLowerCase(),
    password: user.passwordHash || user.password,
    createdAt: user.createdAt,
  };
};

const normalizeTask = (task) => {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    category: task.category,
    dueDate: task.dueDate ?? null,
    status: task.status,
    createdAt: task.createdAt,
  };
};

export async function findUserByEmail(email) {
  if (!useDatabase()) {
    return fileFindUserByEmail(email);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  return normalizeUser(user);
}

export async function findUserById(id) {
  if (!useDatabase()) {
    return fileFindUserById(id);
  }

  const user = await prisma.user.findUnique({
    where: { id },
  });

  return normalizeUser(user);
}

export async function createUser({ name, email, password }) {
  if (!useDatabase()) {
    return fileCreateUser({ name, email, password });
  }

  const sanitizedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  const newUser = await prisma.user.create({
    data: {
      name: sanitizedName,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  return normalizeUser(newUser);
}

export async function getUserTasks(userId) {
  if (!useDatabase()) {
    return fileGetUserTasks(userId);
  }

  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }],
  });

  return tasks.map(normalizeTask);
}

export async function addTask(task) {
  if (!useDatabase()) {
    return fileAddTask(task);
  }

  const newTask = await prisma.task.create({
    data: {
      userId: task.userId,
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'Medium',
      category: task.category || 'General',
      dueDate: task.dueDate || null,
      status: task.status || 'todo',
    },
  });

  return normalizeTask(newTask);
}

export async function updateTask(taskId, updates) {
  if (!useDatabase()) {
    return fileUpdateTask(taskId, updates);
  }

  try {
    const { userId, createdAt, id, ...safeUpdates } = updates || {};

    const currentTask = await prisma.task.findUnique({ where: { id: taskId } });
    if (!currentTask) {
      return null;
    }

    const data = { ...safeUpdates };

    if (data.dueDate === undefined) {
      data.dueDate = currentTask.dueDate;
    }

    if (data.title === undefined) {
      data.title = currentTask.title;
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data,
    });

    return normalizeTask(updatedTask);
  } catch (error) {
    return null;
  }
}

export async function deleteTask(taskId) {
  if (!useDatabase()) {
    return fileDeleteTask(taskId);
  }

  try {
    await prisma.task.delete({
      where: { id: taskId },
    });
    return true;
  } catch (error) {
    return false;
  }
}