const NOISE_PATTERNS: RegExp[] = [
  /\[(music|applause|laughter|noise|silence)\]/gi,
  /\((music|applause|laughter|noise|silence)\)/gi,
  /<\|[^>]+?\|>/g
];

export function postProcessTranscript(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let text = rawText;

  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  text = removeRepeatedShortPhraseRuns(text);

  text = text
    .replace(/\b(\S+)(\s+\1\b){2,}/gi, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?])(?=\S)/g, '$1 ')
    .replace(/\s*\n+\s*/g, '\n')
    .trim();

  if (!text) {
    return '';
  }

  text = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const clean = sentence.trim();
      if (!clean) return '';
      const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
      return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    })
    .filter(Boolean)
    .join(' ');

  const sentences = text.split(/(?<=[.!?])\s+/);
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }

  return paragraphs.join('\n\n');
}

function removeRepeatedShortPhraseRuns(text: string): string {
  const parts = text.match(/\n+|[^.!?\n]+[.!?]?/g) || [];
  const result: string[] = [];

  for (let index = 0; index < parts.length;) {
    const part = parts[index] || '';
    if (/^\n+$/.test(part)) {
      result.push(part);
      index += 1;
      continue;
    }

    const normalized = normalizeShortPhrase(part);
    if (!normalized || !isShortPhrase(normalized)) {
      result.push(part);
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < parts.length && normalizeShortPhrase(parts[nextIndex] || '') === normalized) {
      nextIndex += 1;
    }

    const repeatCount = nextIndex - index;
    if (repeatCount >= 4) {
      index = nextIndex;
      continue;
    }

    result.push(...parts.slice(index, nextIndex));
    index = nextIndex;
  }

  return result.join(' ');
}

function normalizeShortPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isShortPhrase(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && value.length <= 40;
}

export function summarizeTranscript(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return '';
  }

  const selected: string[] = [];
  const targetCount = Math.min(6, Math.max(3, Math.ceil(sentences.length * 0.12)));

  const firstSentence = sentences[0];
  if (firstSentence) {
    selected.push(firstSentence);
  }

  if (sentences.length > 3) {
    const middleSentence = sentences[Math.floor(sentences.length / 3)];
    if (middleSentence) {
      selected.push(middleSentence);
    }
  }

  if (sentences.length > 6) {
    const laterSentence = sentences[Math.floor((sentences.length * 2) / 3)];
    if (laterSentence) {
      selected.push(laterSentence);
    }
  }

  for (const sentence of sentences) {
    if (selected.length >= targetCount) break;
    if (!selected.includes(sentence)) {
      selected.push(sentence);
    }
  }

  return selected
    .slice(0, 6)
    .map((sentence) => `- ${sentence}`)
    .join('\n');
}
