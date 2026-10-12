import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function createIsolatedStore(t) {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalStorePath = process.env.TASKFLOW_STORE_PATH;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-store-test-'));
  const storePath = path.join(tempDirectory, 'store.json');
  process.env.DATABASE_URL = '';
  process.env.TASKFLOW_STORE_PATH = storePath;

  t.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalStorePath === undefined) delete process.env.TASKFLOW_STORE_PATH;
    else process.env.TASKFLOW_STORE_PATH = originalStorePath;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  const uniqueUrl = new URL(`./store.js?ts=${Date.now()}-${Math.random()}`, import.meta.url);
  return { store: await import(uniqueUrl), storePath };
}

test('new file stores initialize empty and do not create the demo account', async (t) => {
  const { store, storePath } = await createIsolatedStore(t);
  assert.equal(await store.findUserByEmail('demo@example.com'), null);
  assert.deepEqual(await store.getUserTasks('user-demo'), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, 'utf8')), { users: [], tasks: [] });
});

test('creating a user does not create tasks', async (t) => {
  const { store, storePath } = await createIsolatedStore(t);
  const user = await store.createUser({
    name: 'Tester',
    email: 'tester@example.com',
    password: 'secret123',
  });

  assert.deepEqual(await store.getUserTasks(user.id), []);
  const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(saved.users.length, 1);
  assert.equal(saved.users[0].email, 'tester@example.com');
  assert.deepEqual(saved.tasks, []);
});

test('persist users and manually created tasks to disk', async (t) => {
  const { store, storePath } = await createIsolatedStore(t);
  const user = await store.createUser({
    name: 'Tester',
    email: 'tester@example.com',
    password: 'secret123',
  });

  await store.addTask({
    userId: user.id,
    title: 'Persist my task',
    description: 'This must survive restarts',
    priority: 'High',
    category: 'Work',
    dueDate: 'Today',
    status: 'todo',
  });

  assert.equal((await store.findUserByEmail('tester@example.com'))?.email, 'tester@example.com');
  assert.equal((await store.getUserTasks(user.id)).length, 1);

  const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(saved.users.length, 1);
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.tasks[0].title, 'Persist my task');
});

test('demo fixture filtering preserves non-demo users and their tasks', async () => {
  const { filterDemoFixtureRecords } = await import('./migrate-file-store.js');
  const realUser = { id: 'user-real', email: 'real@example.com' };
  const demoUser = { id: 'user-demo', email: 'demo@example.com' };
  const realTask = { id: 'task-real', userId: realUser.id };
  const demoTask = { id: 'task-1', userId: demoUser.id };
  const filtered = filterDemoFixtureRecords({
    users: [demoUser, realUser],
    tasks: [demoTask, realTask],
  });

  assert.deepEqual(filtered, { users: [realUser], tasks: [realTask] });

  const fixturePath = new URL('../../data/store.json', import.meta.url);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.deepEqual(fixture.users.map((user) => user.email), ['rahul@example.com']);
  assert.deepEqual(fixture.tasks.map((task) => task.userId), [fixture.users[0].id]);
});
