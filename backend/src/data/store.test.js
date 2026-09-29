import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const tempStore = path.join(process.cwd(), 'backend', 'src', 'data', 'tmp-store.test.json');

async function loadModule() {
  process.env.TASKFLOW_STORE_PATH = tempStore;
  const uniqueUrl = new URL(`./store.js?ts=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(uniqueUrl);
}

test('persist users and tasks to disk', async () => {
  fs.writeFileSync(tempStore, JSON.stringify({ users: [], tasks: [] }));

  const { createUser, addTask, findUserByEmail, getUserTasks } = await loadModule();

  const user = await createUser({
    name: 'Tester',
    email: 'tester@example.com',
    password: 'secret123',
  });

  await addTask({
    userId: user.id,
    title: 'Persist my task',
    description: 'This must survive restarts',
    priority: 'High',
    category: 'Work',
    dueDate: 'Today',
    status: 'todo',
  });

  assert.equal((await findUserByEmail('tester@example.com'))?.email, 'tester@example.com');
  assert.equal((await getUserTasks(user.id)).length, 1);

  const saved = JSON.parse(fs.readFileSync(tempStore, 'utf8'));
  assert.equal(saved.users.length, 1);
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.tasks[0].title, 'Persist my task');

  fs.unlinkSync(tempStore);
  delete process.env.TASKFLOW_STORE_PATH;
});
