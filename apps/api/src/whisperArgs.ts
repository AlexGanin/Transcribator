interface WhisperArgReplacements {
  input: string;
  outputDir: string;
  clipTimestamps: string;
}

const CLIP_TIMESTAMP_FLAGS = new Set(['--clip-timestamps', '--clip_timestamps']);

export function buildWhisperArgs(rawArgs: string, replacements: WhisperArgReplacements): string[] {
  const args: string[] = [];

  for (const token of rawArgs.split(' ').filter(Boolean)) {
    const replaced = replacePlaceholders(token, replacements);

    if (token.includes('{clipTimestamps}') && !replacements.clipTimestamps) {
      const previous = args.at(-1);
      if (previous && CLIP_TIMESTAMP_FLAGS.has(previous)) {
        args.pop();
      }
      continue;
    }

    if (replaced) {
      args.push(replaced);
    }
  }

  return args;
}

function replacePlaceholders(token: string, replacements: WhisperArgReplacements): string {
  return token
    .replaceAll('{input}', replacements.input)
    .replaceAll('{outputDir}', replacements.outputDir)
    .replaceAll('{clipTimestamps}', replacements.clipTimestamps);
}
