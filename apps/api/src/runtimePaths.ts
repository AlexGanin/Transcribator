import path from 'node:path';

export const ROOT_DIR = path.resolve(process.cwd(), '../..');
export const DEFAULT_RUNTIME_DIR = path.join(ROOT_DIR, 'runtime');
export const DEFAULT_DB_PATH = path.join(DEFAULT_RUNTIME_DIR, 'transcribator.sqlite');
