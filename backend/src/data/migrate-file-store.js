import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';

function resolveStorePath() {
  if (process.env.TASKFLOW_STORE_PATH) {
    return process.env.TASKFLOW_STORE_PATH;
  }

  const cwd = process.cwd();
  const backendDefault = path.resolve(cwd, 'data', 'store.json');
  const rootDefault = path.resolve(cwd, 'backend', 'data', 'store.json');

  return cwd.endsWith(path.sep + 'backend') ? backendDefault : rootDefault;
}

function asDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function migrateFileStore() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set before importing the file store.');
  }

  const storePath = resolveStorePath();
  if (!fs.existsSync(storePath)) {
    throw new Error(`File store not found at ${storePath}`);
  }

  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  if (!Array.isArray(store.users) || !Array.isArray(store.tasks)) {
    throw new Error('TaskFlow store is malformed.');
  }

  for (const user of store.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name,
        email: String(user.email).trim().toLowerCase(),
        passwordHash: user.passwordHash || user.password,
        createdAt: asDate(user.createdAt),
      },
      update: {
        name: user.name,
        email: String(user.email).trim().toLowerCase(),
        passwordHash: user.passwordHash || user.password,
      },
    });
  }

  for (const task of store.tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        userId: task.userId,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'Medium',
        category: task.category || 'General',
        dueDate: task.dueDate || null,
        status: task.status || 'todo',
        createdAt: asDate(task.createdAt),
      },
      update: {
        userId: task.userId,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'Medium',
        category: task.category || 'General',
        dueDate: task.dueDate || null,
        status: task.status || 'todo',
      },
    });
  }

  console.log(`Imported ${store.users.length} users and ${store.tasks.length} tasks from ${storePath}.`);
}

migrateFileStore()
  .catch((error) => {
    console.error('File store import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
