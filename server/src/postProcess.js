const NOISE_PATTERNS = [
  /\[(music|applause|laughter|noise|silence)\]/gi,
  /\((music|applause|laughter|noise|silence)\)/gi,
  /<\|[^>]+?\|>/g
];

export function postProcessTranscript(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let text = rawText;

  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

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
  const paragraphs = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(' '));
  }

  return paragraphs.join('\n\n');
}
