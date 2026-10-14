import Sanscript from '@indic-transliteration/sanscript';

const devanagariPattern = /\p{Script=Devanagari}/u;
const unsupportedScriptPattern = /[^\p{Script=Latin}\p{Number}\p{Punctuation}\p{White_Space}\p{Mark}\p{Symbol}]/u;
const wordPattern = /[\p{L}\p{M}]+|\d+/gu;
const smallNumbers = new Map();
const tens = new Map();
const ordinalNumbers = new Map();

function normalizeNumberWord(word) {
  return word.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function addNumberWords(value, aliases) {
  aliases.forEach((alias) => smallNumbers.set(normalizeNumberWord(alias), value));
}

function addTensWords(value, aliases) {
  aliases.forEach((alias) => tens.set(normalizeNumberWord(alias), value));
}

function addOrdinalWords(value, aliases) {
  aliases.forEach((alias) => ordinalNumbers.set(normalizeNumberWord(alias), value));
}

addNumberWords(0, ['zero', 'shunya', 'shoonya']);
addNumberWords(1, ['one', 'ek', 'eka']);
addNumberWords(2, ['two', 'do', 'dō']);
addNumberWords(3, ['three', 'teen', 'tīn', 'tina']);
addNumberWords(4, ['four', 'char', 'chaar', 'cāra', 'cara']);
addNumberWords(5, ['five', 'paanch', 'panch', 'pāñca', 'panca']);
addNumberWords(6, ['six', 'chhe', 'che', 'chhah']);
addNumberWords(7, ['seven', 'saat', 'sat', 'sāta', 'sata']);
addNumberWords(8, ['eight', 'aath', 'aat', 'āṭha', 'atha']);
addNumberWords(9, ['nine', 'nau', 'nava']);
addNumberWords(10, ['ten', 'dus', 'das', 'dasa']);
addNumberWords(11, ['eleven', 'gyarah', 'gyārah', 'gyaraha']);
addNumberWords(12, ['twelve', 'barah', 'bārah', 'bāraha']);
addNumberWords(13, ['thirteen', 'terah', 'teraha']);
addNumberWords(14, ['fourteen', 'chaudah', 'chaudaha']);
addNumberWords(15, ['fifteen', 'pandrah', 'pandrah']);
addNumberWords(16, ['sixteen', 'solah', 'solaha']);
addNumberWords(17, ['seventeen', 'satrah', 'satraha']);
addNumberWords(18, ['eighteen', 'atharah', 'atharaha']);
addNumberWords(19, ['nineteen', 'unnis', 'unnīsa']);

addTensWords(20, ['twenty', 'bees', 'bis', 'bīsa']);
addTensWords(30, ['thirty', 'tees', 'tis', 'tīsa']);
addTensWords(40, ['forty', 'chalis', 'chaalis', 'cālīsa']);
addTensWords(50, ['fifty', 'pachaas', 'pachas', 'pacāsa']);
addTensWords(60, ['sixty', 'saath', 'sath', 'sāṭha']);
addTensWords(70, ['seventy', 'sattar', 'sattara']);
addTensWords(80, ['eighty', 'assi', 'asī']);
addTensWords(90, ['ninety', 'nabbe', 'nabbē']);

[
  [21, ['ikkis', 'ikkīs']],
  [22, ['bais', 'baais', 'bāīs']],
  [23, ['teis', 'teīs']],
  [24, ['chaubis', 'caubis', 'caubīs']],
  [25, ['pachis', 'pachees', 'paccis', 'paccīs']],
  [26, ['chabbis', 'chabbīs']],
  [27, ['sattais', 'sattāīs']],
  [28, ['atthais', 'aṭṭhāīs']],
  [29, ['untis', 'untīs']],
].forEach(([value, aliases]) => addNumberWords(value, aliases));

[
  [1, ['first']],
  [2, ['second']],
  [3, ['third']],
  [4, ['fourth']],
  [5, ['fifth']],
  [6, ['sixth']],
  [7, ['seventh']],
  [8, ['eighth']],
  [9, ['ninth']],
  [10, ['tenth']],
  [11, ['eleventh']],
  [12, ['twelfth']],
  [13, ['thirteenth']],
  [14, ['fourteenth']],
  [15, ['fifteenth']],
  [16, ['sixteenth']],
  [17, ['seventeenth']],
  [18, ['eighteenth']],
  [19, ['nineteenth']],
  [20, ['twentieth']],
  [30, ['thirtieth']],
].forEach(([value, aliases]) => addOrdinalWords(value, aliases));

const numberScales = new Map([
  ['hundred', 100],
  ['sau', 100],
  ['thousand', 1000],
  ['hazaar', 1000],
  ['hazar', 1000],
  ['lakh', 100000],
  ['lac', 100000],
  ['million', 1000000],
]);
const numericContexts = new Set([
  'assignment', 'assignments', 'baje', 'bajey', 'call', 'calls', 'class', 'classes',
  'day', 'days', 'din', 'dino', 'dollar', 'dollars', 'ghanta', 'ghante', 'ghanton',
  'hour', 'hours', 'item', 'items', 'kg', 'kilo', 'kilogram', 'kilograms',
  'kilometer', 'kilometers', 'km', 'meeting', 'meetings', 'minute', 'minutes',
  'mahina', 'mahine', 'month', 'months', 'page', 'pages', 'percent', 'percentage',
  'pratishat', 'pm', 'am',
  'rupee', 'rupees', 'rupaya', 'rupaye', 'rupay', 'task', 'tasks', 'week', 'weeks',
  'year', 'years', 'saal', 'hafta', 'hafte', 'date', 'tareekh', 'tarikh', 'time', 'times',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);
const dateContexts = new Set([
  'date', 'tareekh', 'tarikh',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);
const quantityModifiers = new Set(['more', 'total']);
const actionWords = new Set(['complete', 'completed', 'finish', 'finished', 'kar', 'karna', 'karo', 'kare']);
const taskNouns = new Set(['assignment', 'assignments', 'task', 'tasks', 'work']);

function getNumberValue(word) {
  const normalized = normalizeNumberWord(word);
  if (smallNumbers.has(normalized)) return smallNumbers.get(normalized);
  return tens.get(normalized);
}

function parseNumberPhrase(words, startIndex) {
  const firstValue = getNumberValue(words[startIndex].value);
  const firstOrdinal = ordinalNumbers.get(normalizeNumberWord(words[startIndex].value));
  if (firstValue === undefined && firstOrdinal === undefined) return null;

  let value = firstValue ?? firstOrdinal;
  let isOrdinal = firstOrdinal !== undefined;
  let nextIndex = startIndex + 1;
  const nextWord = normalizeNumberWord(words[nextIndex]?.value || '');

  if (tens.has(normalizeNumberWord(words[startIndex].value))) {
    const nextValue = smallNumbers.get(nextWord) ?? ordinalNumbers.get(nextWord);
    if (nextValue > 0 && nextValue < 10) {
      value += nextValue;
      if (ordinalNumbers.has(nextWord)) isOrdinal = true;
      nextIndex += 1;
    }
  }

  const scaleWord = normalizeNumberWord(words[nextIndex]?.value || '');
  if (numberScales.has(scaleWord)) {
    value *= numberScales.get(scaleWord);
    nextIndex += 1;
    if (normalizeNumberWord(words[nextIndex]?.value || '') === 'and') nextIndex += 1;
    const remainder = getNumberValue(words[nextIndex]?.value || '');
    if (remainder !== undefined && remainder < 100) {
      value += remainder;
      nextIndex += 1;
      const remainderScale = normalizeNumberWord(words[nextIndex]?.value || '');
      if (remainderScale === 'hundred' || remainderScale === 'sau') {
        value = value - remainder + (remainder * 100);
        nextIndex += 1;
      }
    }
  }

  return { value, nextIndex, isOrdinal };
}

function isVerbDoContext(words, startIndex, nextIndex) {
  if (normalizeNumberWord(words[startIndex].value) !== 'do') return false;

  const noun = normalizeNumberWord(words[nextIndex]?.value || '');
  const following = normalizeNumberWord(words[nextIndex + 1]?.value || '');
  return taskNouns.has(noun) && actionWords.has(following);
}

function hasNumericContext(text, words, nextIndex, phraseEnd) {
  if (/^\s*%/u.test(text.slice(phraseEnd))) return true;

  let contextIndex = nextIndex;
  if (quantityModifiers.has(normalizeNumberWord(words[contextIndex]?.value || ''))) {
    contextIndex += 1;
  }

  const following = normalizeNumberWord(words[contextIndex]?.value || '');
  if (numericContexts.has(following)) return true;

  if (following === 'of') {
    const afterOf = normalizeNumberWord(words[contextIndex + 1]?.value || '');
    return dateContexts.has(afterOf);
  }

  return false;
}

function hasDateContext(words, nextIndex) {
  let contextIndex = nextIndex;
  if (normalizeNumberWord(words[contextIndex]?.value || '') === 'of') contextIndex += 1;
  return dateContexts.has(normalizeNumberWord(words[contextIndex]?.value || ''));
}

export function normalizeNumberWords(text) {
  const words = Array.from(text.matchAll(wordPattern), (match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const replacements = [];

  for (let index = 0; index < words.length; index += 1) {
    if (/^\d+$/u.test(words[index].value)) continue;
    const parsed = parseNumberPhrase(words, index);
    if (!parsed) continue;

    const phraseWords = words.slice(index, parsed.nextIndex);
    const isContiguousPhrase = phraseWords.every((word, phraseIndex) => (
      phraseIndex === 0 || /^[\s-]+$/u.test(text.slice(phraseWords[phraseIndex - 1].end, word.start))
    ));
    if (!isContiguousPhrase || isVerbDoContext(words, index, parsed.nextIndex)) continue;
    if (parsed.isOrdinal && !hasDateContext(words, parsed.nextIndex)) continue;
    if (!hasNumericContext(text, words, parsed.nextIndex, phraseWords.at(-1).end)) continue;

    replacements.push({
      start: words[index].start,
      end: phraseWords.at(-1).end,
      value: String(parsed.value),
    });
    index = parsed.nextIndex - 1;
  }

  return replacements.reduceRight(
    (result, replacement) => (
      `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`
    ),
    text,
  );
}

export function romanizeTranscript(value) {
  const text = String(value || '');
  const romanized = devanagariPattern.test(text)
    ? Sanscript.t(text, 'devanagari', 'iast')
    : text;

  if (unsupportedScriptPattern.test(romanized)) {
    throw new Error('Transcript could not be safely converted to Latin script.');
  }

  return normalizeNumberWords(romanized);
}

export function getRecognitionTranscript(event) {
  const transcript = Array.from(event.results || [])
    .map((result) => result?.[0]?.transcript || '')
    .filter(Boolean)
    .join(' ')
    .trim();
  return romanizeTranscript(transcript);
}

export async function transcribeRecording(audioBlob, transcribeAudio, onTranscript) {
  const result = await transcribeAudio(audioBlob);
  if (typeof result?.transcript !== 'string' || !result.transcript.trim()) {
    throw new Error('Transcription service returned no usable text.');
  }

  const transcript = romanizeTranscript(result.transcript.trim());
  onTranscript(transcript);
  return transcript;
}
