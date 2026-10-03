import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('task routes isolate task reads and mutations by authenticated user', async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalStorePath = process.env.TASKFLOW_STORE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-task-auth-test-'));
  const storePath = path.join(tempDirectory, 'store.json');
  process.env.DATABASE_URL = '';
  process.env.TASKFLOW_STORE_PATH = storePath;
  process.env.JWT_SECRET = 'taskflow-task-auth-test-secret';
  fs.writeFileSync(storePath, JSON.stringify({ users: [], tasks: [] }));

  let server;

  try {
    const [{ default: authRoutes }, { default: taskRoutes }] = await Promise.all([
      import('./auth.js'),
      import('./tasks.js'),
    ]);
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/tasks', taskRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const register = async (name, email) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password: 'password123' }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };
    const userA = await register('User A', 'user-a@example.com');
    const userB = await register('User B', 'user-b@example.com');
    const request = async (user, method, route, body) => {
      const response = await fetch(`${baseUrl}/api/tasks${route}`, {
        method,
        headers: {
          authorization: `Bearer ${user.token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = response.status === 204 ? null : await response.json();
      return { response, payload };
    };

    const { payload: taskA } = await request(userA, 'POST', '/manual', {
      title: 'Task for A',
      userId: userB.user.id,
    });
    const { payload: taskB } = await request(userB, 'POST', '/manual', {
      title: 'Task for B',
      userId: userA.user.id,
    });

    await t.test('GET and summary contain only the authenticated user tasks', async () => {
      const userATasks = await request(userA, 'GET', '/');
      const userBTasks = await request(userB, 'GET', '/');
      assert.deepEqual(userATasks.payload.map((task) => task.id), [taskA.id]);
      assert.deepEqual(userBTasks.payload.map((task) => task.id), [taskB.id]);
      assert.equal(taskA.userId, userA.user.id);
      assert.equal(taskB.userId, userB.user.id);

      const userASummary = await request(userA, 'GET', '/summary');
      const userBSummary = await request(userB, 'GET', '/summary');
      assert.equal(userASummary.payload.total, 1);
      assert.equal(userBSummary.payload.total, 1);
    });

    await t.test('voice task creation derives ownership from the authenticated user', async () => {
      const voice = await request(userA, 'POST', '/voice', {
        transcript: 'I need to finish the project report tomorrow',
        userId: userB.user.id,
      });
      assert.equal(voice.response.status, 201);
      assert.equal(voice.payload.length, 1);
      assert.equal(voice.payload[0].userId, userA.user.id);

      const userBTasks = await request(userB, 'GET', '/');
      assert.deepEqual(userBTasks.payload.map((task) => task.id), [taskB.id]);

      const cleanup = await request(userA, 'DELETE', `/${voice.payload[0].id}`);
      assert.equal(cleanup.response.status, 204);
    });

    await t.test('cross-user updates and deletes return indistinguishable 404s', async () => {
      for (const [user, task] of [[userA, taskB], [userB, taskA]]) {
        const update = await request(user, 'PUT', `/${task.id}`, { title: 'Unauthorized change' });
        assert.equal(update.response.status, 404);
        assert.deepEqual(update.payload, { message: 'Task not found.' });

        const deletion = await request(user, 'DELETE', `/${task.id}`);
        assert.equal(deletion.response.status, 404);
        assert.deepEqual(deletion.payload, { message: 'Task not found.' });
      }
    });

    await t.test('users can update and delete their own tasks without changing ownership', async () => {
      const update = await request(userA, 'PUT', `/${taskA.id}`, {
        title: 'Updated task for A',
        userId: userB.user.id,
        id: 'forged-task-id',
        createdAt: 'forged-created-at',
      });
      assert.equal(update.response.status, 200);
      assert.equal(update.payload.id, taskA.id);
      assert.equal(update.payload.userId, userA.user.id);
      assert.equal(update.payload.title, 'Updated task for A');

      const userATasks = await request(userA, 'GET', '/');
      assert.deepEqual(userATasks.payload.map((task) => task.id), [taskA.id]);
      assert.equal(userATasks.payload[0].userId, userA.user.id);

      const deleteA = await request(userA, 'DELETE', `/${taskA.id}`);
      const deleteB = await request(userB, 'DELETE', `/${taskB.id}`);
      assert.equal(deleteA.response.status, 204);
      assert.equal(deleteB.response.status, 204);
    });
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalStorePath === undefined) {
      delete process.env.TASKFLOW_STORE_PATH;
    } else {
      process.env.TASKFLOW_STORE_PATH = originalStorePath;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});