import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecognitionTranscript,
  normalizeNumberWords,
  romanizeTranscript,
  transcribeRecording,
} from './voiceTranscription.js';

test('English speech retains standard English spelling', () => {
  const english = 'I have to go for DBMS class tomorrow at 10 am.';
  assert.equal(romanizeTranscript(english), english);
  assert.equal(getRecognitionTranscript({ results: [[{ transcript: english }]] }), english);
});

test('Hindi speech is rendered as readable Romanized Hindi', () => {
  const transcript = romanizeTranscript('कल मुझे फोन करना है');
  assert.match(transcript, /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{White_Space}\p{Mark}\p{Symbol}]+$/u);
  assert.match(transcript, /mujhe/i);
  assert.match(transcript, /phona/i);
  assert.match(transcript, /karan/i);
});

test('mixed Hinglish preserves English technical terms, names, dates, and numbers', () => {
  const transcript = romanizeTranscript('कल 10 बजे Rahul को DBMS और React API review करना है');
  assert.match(transcript, /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{White_Space}\p{Mark}\p{Symbol}]+$/u);
  assert.match(transcript, /10/);
  assert.match(transcript, /Rahul/);
  assert.match(transcript, /DBMS/);
  assert.match(transcript, /React API/);
});

test('clear Hindi, Hinglish, and English number words are formatted as digits', () => {
  assert.equal(normalizeNumberWords('Kal subah dus baje'), 'Kal subah 10 baje');
  assert.equal(romanizeTranscript('कल सुबह दस बजे'), 'kala subaha 10 baje');
  assert.equal(normalizeNumberWords('five tasks'), '5 tasks');
  assert.equal(normalizeNumberWords('teen assignments'), '3 assignments');
  assert.equal(normalizeNumberWords('twenty five minutes'), '25 minutes');
  assert.equal(normalizeNumberWords('one hundred and five tasks'), '105 tasks');
  assert.equal(normalizeNumberWords('paanch hazaar rupaye'), '5000 rupaye');
  assert.equal(normalizeNumberWords('pachis October ko'), '25 October ko');
  assert.equal(normalizeNumberWords('twenty fifth of October'), '25 of October');
  assert.equal(normalizeNumberWords('teen ghante aur do pratishat'), '3 ghante aur 2 pratishat');
});

test('number formatting is applied to browser and server transcripts', async () => {
  assert.equal(
    getRecognitionTranscript({ results: [[{ transcript: 'Kal subah dus baje' }]] }),
    'Kal subah 10 baje',
  );

  let voiceText = '';
  const transcript = await transcribeRecording(
    new Blob(['audio']),
    async () => ({ transcript: 'Kal subah dus baje Rahul ko DBMS class ke liye call karna hai.' }),
    (value) => { voiceText = value; },
  );
  assert.equal(transcript, 'Kal subah 10 baje Rahul ko DBMS class ke liye call karna hai.');
  assert.equal(voiceText, transcript);
});

test('do used as a verb is not converted to the number two', () => {
  const text = 'do assignments complete karna';
  assert.equal(normalizeNumberWords(text), text);
  assert.equal(normalizeNumberWords('do not schedule more tasks'), 'do not schedule more tasks');
});

test('existing numeric digits, dates, times, names, and acronyms stay intact', () => {
  const text = 'Kal subah 10 baje Rahul ko DBMS class hai; meeting on 5 October at 5 pm.';
  assert.equal(normalizeNumberWords(text), text);
});

test('number formatting does not merge unrelated numbers or rewrite nearby words', () => {
  const text = 'five tasks and twenty five minutes later, Rahul calls DBMS support';
  assert.equal(
    normalizeNumberWords(text),
    '5 tasks and 25 minutes later, Rahul calls DBMS support',
  );
  assert.equal(normalizeNumberWords('five tasks'), normalizeNumberWords(normalizeNumberWords('five tasks')));
  assert.equal(normalizeNumberWords('first task'), 'first task');
});

test('English words are not rewritten or converted to phonetic Devanagari', () => {
  const english = 'I have to go for DBMS class';
  const transcript = romanizeTranscript(english);
  assert.equal(transcript, english);
  assert.doesNotMatch(transcript, /\p{Script=Devanagari}/u);
});

test('Devanagari browser results are romanized without duplicate result chunks', () => {
  const resultEvent = {
    results: [
      [{ transcript: 'कल मुझे' }],
      [{ transcript: 'Maya को call करना है' }],
    ],
  };
  const firstPreview = getRecognitionTranscript(resultEvent);
  const repeatedPreview = getRecognitionTranscript(resultEvent);
  assert.equal(firstPreview, 'kala mujhe Maya ko call karanā hai');
  assert.equal(repeatedPreview, firstPreview);
  assert.doesNotMatch(firstPreview, /\p{Script=Devanagari}/u);
});

test('Devanagari transcription-service output is romanized before it reaches the editor', async () => {
  let voiceText = 'Existing editable transcript';
  const transcript = await transcribeRecording(
    new Blob(['audio']),
    async () => ({ transcript: 'कल 10 बजे Rahul को DBMS class भेजनी है' }),
    (value) => { voiceText = value; },
  );
  assert.equal(transcript, 'kala 10 baje Rahul ko DBMS class bhejanī hai');
  assert.equal(voiceText, transcript);
  assert.doesNotMatch(voiceText, /\p{Script=Devanagari}/u);
});

test('unsupported scripts fail explicitly instead of fabricating a Roman transcript', () => {
  assert.throws(() => romanizeTranscript('你好'), /could not be safely converted/);
});

test('unsafe transcription-service script leaves the existing transcript unchanged', async () => {
  let voiceText = 'Existing transcript';
  await assert.rejects(
    transcribeRecording(
      new Blob(['audio']),
      async () => ({ transcript: '你好' }),
      (value) => { voiceText = value; },
    ),
    /could not be safely converted/,
  );
  assert.equal(voiceText, 'Existing transcript');
});

test('failed audio fallback preserves the editable browser transcript', async () => {
  let voiceText = 'Browser transcript to review';
  await assert.rejects(
    transcribeRecording(new Blob(['audio']), async () => {
      throw new Error('service unavailable');
    }, (transcript) => { voiceText = transcript; }),
    /service unavailable/,
  );
  assert.equal(voiceText, 'Browser transcript to review');
});

test('audio improvement replaces the transcript only after usable Roman text is returned', async () => {
  let voiceText = 'Original browser transcript';
  const transcript = await transcribeRecording(
    new Blob(['audio']),
    async () => ({ transcript: ' सुधारा हुआ transcript ' }),
    (value) => { voiceText = value; },
  );
  assert.equal(transcript, 'sudhārā huā transcript');
  assert.equal(voiceText, transcript);

  await assert.rejects(
    transcribeRecording(new Blob(['audio']), async () => ({ transcript: '  ' }), (value) => { voiceText = value; }),
    /no usable text/,
  );
  assert.equal(voiceText, transcript);
});
