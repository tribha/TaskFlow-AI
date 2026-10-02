import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('production CORS is restricted and only auth endpoints are rate limited', async () => {
  const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-security-test-'));
  const port = await getAvailablePort();
  const allowedOrigin = 'https://taskflow-frontend.example';
  const child = spawn(process.execPath, ['src/app.js'], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      DATABASE_URL: '',
      FRONTEND_URL: allowedOrigin,
      JWT_SECRET: 'taskflow-security-test-secret',
      NODE_ENV: 'production',
      PORT: String(port),
      TASKFLOW_STORE_PATH: path.join(tempDirectory, 'store.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let childOutput = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { childOutput += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { childOutput += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`Test server exited before becoming ready: ${childOutput}`);
      }

      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.equal(ready, true, `Test server did not become ready: ${childOutput}`);

    const allowedCors = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'GET',
      },
    });
    assert.equal(allowedCors.headers.get('access-control-allow-origin'), allowedOrigin);

    const arbitraryCors = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'GET',
      },
    });
    assert.equal(arbitraryCors.headers.get('access-control-allow-origin'), null);

    for (let request = 0; request < 11; request += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'missing@example.com', password: 'password123' }),
      });
      assert.equal(response.status, request < 10 ? 401 : 429);
    }

    for (let request = 0; request < 11; request += 1) {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, request < 10 ? 400 : 429);
    }

    for (let request = 0; request < 11; request += 1) {
      const healthResponse = await fetch(`${baseUrl}/api/health`);
      const tasksResponse = await fetch(`${baseUrl}/api/tasks`);
      assert.equal(healthResponse.status, 200);
      assert.equal(tasksResponse.status, 401);
    }
  } finally {
    child.kill();
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});