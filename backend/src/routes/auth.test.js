import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';

test('auth routes validate input and preserve secure authentication behavior', async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalStorePath = process.env.TASKFLOW_STORE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-auth-test-'));
  const storePath = path.join(tempDirectory, 'store.json');
  const jwtSecret = 'taskflow-auth-test-secret';

  process.env.DATABASE_URL = '';
  process.env.TASKFLOW_STORE_PATH = storePath;
  process.env.JWT_SECRET = jwtSecret;
  fs.writeFileSync(storePath, JSON.stringify({ users: [], tasks: [] }));

  let server;

  try {
    const [{ default: authRoutes }, { default: taskRoutes }] = await Promise.all([
      import('./auth.js'),
      import('../routes/tasks.js'),
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
    const post = async (route, body) => {
      const response = await fetch(`${baseUrl}/api/auth/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { response, payload: await response.json() };
    };

    await t.test('rejects invalid registration bodies and fields', async () => {
      const malformedBody = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([]),
      });
      assert.equal(malformedBody.status, 400);

      const cases = [
        [{ email: 'person@example.com', password: 'password123' }, 'Name must be a string.'],
        [{ name: '   ', email: 'person@example.com', password: 'password123' }, 'Name is required.'],
        [{ name: 'x'.repeat(101), email: 'person@example.com', password: 'password123' }, 'Name must be 100 characters or fewer.'],
        [{ name: 'Person', email: 'not-an-email', password: 'password123' }, 'Enter a valid email address of 254 characters or fewer.'],
        [{ name: 'Person', email: 'person@example.com', password: 'short' }, 'Password must be at least 8 characters long.'],
        [{ name: 'Person', email: 'person@example.com', password: 'p'.repeat(129) }, 'Password must be 128 characters or fewer.'],
      ];

      for (const [body, message] of cases) {
        const { response, payload } = await post('register', body);
        assert.equal(response.status, 400);
        assert.equal(payload.message, message);
      }
    });

    await t.test('normalizes email and registers with bcrypt hash and valid JWT', async () => {
      const password = '  password123  ';
      const { response, payload } = await post('register', {
        name: '  Test Person  ',
        email: '  Person.One@Example.COM  ',
        password,
      });

      assert.equal(response.status, 201);
      assert.deepEqual(Object.keys(payload).sort(), ['token', 'user']);
      assert.deepEqual(payload.user, {
        id: payload.user.id,
        name: 'Test Person',
        email: 'person.one@example.com',
      });

      const claims = jwt.verify(payload.token, jwtSecret);
      assert.deepEqual(Object.keys(claims).sort(), ['email', 'exp', 'iat', 'id']);
      assert.equal(claims.id, payload.user.id);
      assert.equal(claims.email, payload.user.email);
      assert.equal(claims.exp - claims.iat, 604800);

      const savedStore = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      const savedUser = savedStore.users.find((user) => user.email === payload.user.email);
      assert.notEqual(savedUser.password, password);
      assert.equal(await bcrypt.compare(password, savedUser.password), true);

      const tasksResponse = await fetch(`${baseUrl}/api/tasks`, {
        headers: { authorization: `Bearer ${payload.token}` },
      });
      assert.equal(tasksResponse.status, 200);
      assert.deepEqual(await tasksResponse.json(), []);

      const duplicate = await post('register', {
        name: 'Another Name',
        email: ' PERSON.ONE@example.com ',
        password: 'password456',
      });
      assert.equal(duplicate.response.status, 409);
      assert.equal(duplicate.payload.message, 'User already exists.');
    });

    await t.test('validates login and keeps invalid credentials indistinguishable', async () => {
      const invalidCases = [
        [{ password: 'password123' }, 'Email must be a string.'],
        [{ email: 'bad-email', password: 'password123' }, 'Enter a valid email address of 254 characters or fewer.'],
        [{ email: 'person.one@example.com', password: '' }, 'Password is required.'],
        [{ email: 'person.one@example.com', password: 'p'.repeat(129) }, 'Password must be 128 characters or fewer.'],
      ];

      for (const [body, message] of invalidCases) {
        const { response, payload } = await post('login', body);
        assert.equal(response.status, 400);
        assert.equal(payload.message, message);
      }

      const wrongPassword = await post('login', {
        email: 'person.one@example.com',
        password: 'incorrect-password',
      });
      const unknownEmail = await post('login', {
        email: 'unknown@example.com',
        password: 'incorrect-password',
      });
      assert.equal(wrongPassword.response.status, 401);
      assert.equal(unknownEmail.response.status, 401);
      assert.equal(wrongPassword.payload.message, 'Invalid email or password.');
      assert.equal(unknownEmail.payload.message, 'Invalid email or password.');

      const valid = await post('login', {
        email: '  PERSON.ONE@EXAMPLE.COM ',
        password: '  password123  ',
      });
      assert.equal(valid.response.status, 200);
      assert.deepEqual(Object.keys(valid.payload).sort(), ['token', 'user']);
      assert.equal(jwt.verify(valid.payload.token, jwtSecret).email, 'person.one@example.com');
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