const TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = 'gpt-transcribe';
const TRANSCRIPTION_TIMEOUT_MS = 30_000;
const TRANSCRIPTION_PROMPT = [
  'This audio contains productivity tasks and reminders.',
  'The speaker may mix Hindi and English (Hinglish) in the same sentence.',
  'Write the entire transcript only in the Latin/Roman alphabet.',
  'Render spoken Hindi as readable Romanized Hindi/Hinglish and spoken English with standard English spelling.',
  'Do not write English words phonetically in Devanagari and do not translate Hindi into English.',
  'When a clearly spoken word represents a numerical value, write it using numeric digits, including Hindi number words and compound numbers.',
  'Preserve the original meaning, names, numbers, times, dates, acronyms, and product or technical terms exactly.',
  'Do not invent words or tasks that were not spoken.',
].join(' ');

const supportedAudioTypes = new Map([
  ['audio/aac', 'aac'],
  ['audio/flac', 'flac'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'mp4'],
  ['audio/m4a', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'webm'],
  ['audio/x-m4a', 'm4a'],
  ['audio/x-wav', 'wav'],
]);

export class TranscriptionServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isSupportedAudioType(mimeType) {
  return supportedAudioTypes.has(String(mimeType || '').split(';')[0].trim().toLowerCase());
}

export async function transcribeAudio(file) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new TranscriptionServiceError(503, 'Audio transcription is not configured.');
  }

  const mimeType = String(file.mimetype).split(';')[0].trim().toLowerCase();
  const extension = supportedAudioTypes.get(mimeType);
  if (!extension) {
    throw new TranscriptionServiceError(400, 'Unsupported audio file type.');
  }

  const formData = new FormData();
  formData.append('file', new Blob([file.buffer], { type: mimeType }), `recording.${extension}`);
  formData.append('model', TRANSCRIPTION_MODEL);
  formData.append('language', 'hi');
  formData.append('prompt', TRANSCRIPTION_PROMPT);

  let response;
  try {
    response = await fetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new TranscriptionServiceError(504, 'Audio transcription timed out. Please try again.');
    }
    throw new TranscriptionServiceError(502, 'Audio transcription service failed. Please try again.');
  }

  if (response.status === 429) {
    throw new TranscriptionServiceError(503, 'Audio transcription is busy. Please try again later.');
  }

  if (response.status === 400 || response.status === 422) {
    throw new TranscriptionServiceError(400, 'The audio could not be read. Try another recording.');
  }

  if (!response.ok) {
    throw new TranscriptionServiceError(502, 'Audio transcription service failed. Please try again.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new TranscriptionServiceError(502, 'Audio transcription service returned an invalid response.');
  }

  if (typeof result?.text !== 'string' || !result.text.trim()) {
    throw new TranscriptionServiceError(502, 'Audio transcription service returned no transcript.');
  }

  return {
    transcript: result.text.trim(),
    model: TRANSCRIPTION_MODEL,
  };
}
