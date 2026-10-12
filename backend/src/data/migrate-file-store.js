import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

export function filterDemoFixtureRecords(store) {
  const demoUserIds = new Set(
    store.users
      .filter((user) => user.id === 'user-demo' || String(user.email).trim().toLowerCase() === 'demo@example.com')
      .map((user) => user.id),
  );
  demoUserIds.add('user-demo');

  return {
    users: store.users.filter((user) => !demoUserIds.has(user.id)),
    tasks: store.tasks.filter((task) => !demoUserIds.has(task.userId)),
  };
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

  const importableStore = filterDemoFixtureRecords(store);

  for (const user of importableStore.users) {
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

  for (const task of importableStore.tasks) {
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

  console.log(`Imported ${importableStore.users.length} users and ${importableStore.tasks.length} tasks from ${storePath}.`);
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  import('dotenv/config')
    .then(migrateFileStore)
    .catch((error) => {
      console.error('File store import failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
