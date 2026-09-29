function normalizeText(value) {
  return String(value || '').trim();
}

function detectPriority(text) {
  const lower = text.toLowerCase();
  if (/urgent|asap|immediately|very important|important|critical/.test(lower)) return 'High';
  if (/whenever possible|later|optional|can wait|low priority/.test(lower)) return 'Low';
  return 'Medium';
}

function detectDueDate(text) {
  const lower = text.toLowerCase();
  if (/today/.test(lower)) return 'Today';
  if (/tomorrow/.test(lower)) return 'Tomorrow';
  if (/friday/.test(lower)) return 'Friday';
  if (/monday/.test(lower)) return 'Monday';
  if (/tuesday/.test(lower)) return 'Tuesday';
  if (/wednesday/.test(lower)) return 'Wednesday';
  if (/thursday/.test(lower)) return 'Thursday';
  if (/saturday/.test(lower)) return 'Saturday';
  if (/sunday/.test(lower)) return 'Sunday';
  if (/next week/.test(lower)) return 'Next week';
  if (/by .*\d{1,2}\s*(am|pm)/.test(lower)) return 'Specific time';
  return null;
}

function inferCategory(text) {
  const lower = text.toLowerCase();
  if (/call|message|email|meet|chat/.test(lower)) return 'Communication';
  if (/assignment|study|exam|project|report|homework/.test(lower)) return 'Study';
  if (/travel|trip|booking|flight/.test(lower)) return 'Travel';
  if (/shopping|buy|purchase/.test(lower)) return 'Shopping';
  if (/work|client|meeting|deliver/.test(lower)) return 'Work';
  return 'General';
}

export function parseVoiceTranscript(transcript) {
  const cleanTranscript = normalizeText(transcript);
  if (!cleanTranscript) {
    return [];
  }

  const segments = cleanTranscript
    .split(/(?:,|\n|\band\b|\.|;)+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  return segments.map((segment, index) => {
    const cleanedTitle = segment
      .replace(/^(i need to|i have to|please|can you|need to|kindly)\s+/i, '')
      .replace(/[.?!]+$/, '')
      .trim();

    return {
      id: `voice-${Date.now()}-${index}`,
      title: cleanedTitle || `Task ${index + 1}`,
      description: cleanedTitle,
      priority: detectPriority(segment),
      dueDate: detectDueDate(segment),
      category: inferCategory(segment),
      status: 'todo',
    };
  });
}
