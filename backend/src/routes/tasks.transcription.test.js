import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('audio transcription is authenticated, bounded, mocked, and never creates tasks', async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalStorePath = process.env.TASKFLOW_STORE_PATH;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-transcription-test-'));
  const storePath = path.join(tempDirectory, 'store.json');
  process.env.DATABASE_URL = '';
  process.env.TASKFLOW_STORE_PATH = storePath;
  process.env.JWT_SECRET = 'taskflow-transcription-test-secret';
  process.env.OPENAI_API_KEY = 'test-only-openai-key';
  fs.writeFileSync(storePath, JSON.stringify({ users: [], tasks: [] }));

  let server;
  let providerMode = 'success';
  let providerRequest;
  globalThis.fetch = async (input, options) => {
    if (String(input) !== 'https://api.openai.com/v1/audio/transcriptions') {
      return originalFetch(input, options);
    }

    providerRequest = options;
    if (providerMode === 'timeout') {
      const error = new Error('private provider failure');
      error.name = 'TimeoutError';
      throw error;
    }
    if (providerMode === 'rate-limit') {
      return new Response(JSON.stringify({ error: { message: 'private provider details' } }), { status: 429 });
    }
    if (providerMode === 'bad-audio') {
      return new Response(JSON.stringify({ error: { message: 'private provider details' } }), { status: 400 });
    }
    if (providerMode === 'failure') {
      return new Response(JSON.stringify({ error: { message: 'private provider details' } }), { status: 500 });
    }
    return new Response(JSON.stringify({ text: 'कल Maya को report भेजनी है at 5 pm.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

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
    const registerResponse = await originalFetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Transcription Tester',
        email: 'transcription@example.com',
        password: 'password123',
      }),
    });
    assert.equal(registerResponse.status, 201);
    const { token } = await registerResponse.json();
    const audioRequest = async (formData = new FormData(), authorization = `Bearer ${token}`) => {
      const response = await originalFetch(`${baseUrl}/api/tasks/transcribe`, {
        method: 'POST',
        headers: authorization ? { authorization } : {},
        body: formData,
      });
      return { response, payload: await response.json() };
    };
    const audioForm = (data = 'fake webm audio', type = 'audio/webm') => {
      const formData = new FormData();
      formData.append('audio', new Blob([data], { type }), 'recording.webm');
      return formData;
    };

    await t.test('rejects unauthenticated requests before processing audio', async () => {
      const { response, payload } = await audioRequest(audioForm(), '');
      assert.equal(response.status, 401);
      assert.deepEqual(payload, { message: 'Authentication required.' });
    });

    await t.test('returns the mocked transcript and sends Hinglish-aware hints to the provider', async () => {
      const { response, payload } = await audioRequest(audioForm());
      assert.equal(response.status, 200);
      assert.deepEqual(payload, {
        transcript: 'कल Maya को report भेजनी है at 5 pm.',
        model: 'gpt-transcribe',
      });
      assert.equal(providerRequest.method, 'POST');
      assert.equal(providerRequest.headers.Authorization, 'Bearer test-only-openai-key');
      assert.equal(providerRequest.body.get('model'), 'gpt-transcribe');
      assert.equal(providerRequest.body.get('language'), 'hi');
      assert.match(providerRequest.body.get('prompt'), /mix Hindi and English/);
      assert.match(providerRequest.body.get('prompt'), /only in the Latin\/Roman alphabet/);
      assert.match(providerRequest.body.get('prompt'), /Romanized Hindi\/Hinglish/);
      assert.match(providerRequest.body.get('prompt'), /standard English spelling/);
      assert.match(providerRequest.body.get('prompt'), /do not translate Hindi into English/);
      assert.match(providerRequest.body.get('prompt'), /write it using numeric digits/);
      assert.match(providerRequest.body.get('prompt'), /compound numbers/);
      assert.match(providerRequest.body.get('prompt'), /acronyms/);
      assert.match(providerRequest.body.get('prompt'), /Do not invent words or tasks/);
    });

    await t.test('rejects missing, empty, unsupported, malformed, and oversized audio safely', async () => {
      const missing = await audioRequest();
      assert.equal(missing.response.status, 400);
      assert.equal(missing.payload.message, 'A non-empty audio file is required.');

      const empty = await audioRequest(audioForm('', 'audio/webm'));
      assert.equal(empty.response.status, 400);

      const unsupported = await audioRequest(audioForm('not audio', 'text/plain'));
      assert.equal(unsupported.response.status, 415);
      assert.equal(unsupported.payload.message, 'Unsupported audio file type.');

      providerMode = 'bad-audio';
      const malformed = await audioRequest(audioForm());
      assert.equal(malformed.response.status, 400);
      assert.match(malformed.payload.message, /audio could not be read/);
      assert.doesNotMatch(JSON.stringify(malformed.payload), /private provider details/);
      providerMode = 'success';

      const oversizedForm = new FormData();
      oversizedForm.append('audio', new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], {
        type: 'audio/webm',
      }), 'recording.webm');
      const oversized = await audioRequest(oversizedForm);
      assert.equal(oversized.response.status, 413);
      assert.equal(oversized.payload.message, 'Audio file must be 15 MB or smaller.');
    });

    await t.test('returns safe configuration, timeout, rate-limit, and provider errors', async () => {
      process.env.OPENAI_API_KEY = '';
      const missingKey = await audioRequest(audioForm());
      assert.equal(missingKey.response.status, 503);
      assert.equal(missingKey.payload.message, 'Audio transcription is not configured.');
      process.env.OPENAI_API_KEY = 'test-only-openai-key';

      providerMode = 'timeout';
      const timeout = await audioRequest(audioForm());
      assert.equal(timeout.response.status, 504);
      assert.doesNotMatch(JSON.stringify(timeout.payload), /private provider failure/);

      providerMode = 'rate-limit';
      const rateLimit = await audioRequest(audioForm());
      assert.equal(rateLimit.response.status, 503);
      assert.doesNotMatch(JSON.stringify(rateLimit.payload), /private provider details/);

      providerMode = 'failure';
      const failure = await audioRequest(audioForm());
      assert.equal(failure.response.status, 502);
      assert.doesNotMatch(JSON.stringify(failure.payload), /private provider details/);
      providerMode = 'success';
    });

    await t.test('does not create tasks and transcription requests are rate limited', async () => {
      const tasksBefore = await originalFetch(`${baseUrl}/api/tasks`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.deepEqual(await tasksBefore.json(), []);

      let limited = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { response } = await audioRequest(audioForm());
        if (response.status === 429) {
          limited = true;
          break;
        }
      }
      assert.equal(limited, true);

      const tasksAfter = await originalFetch(`${baseUrl}/api/tasks`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.deepEqual(await tasksAfter.json(), []);
    });
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalStorePath === undefined) delete process.env.TASKFLOW_STORE_PATH;
    else process.env.TASKFLOW_STORE_PATH = originalStorePath;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
