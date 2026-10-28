import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
export function dataDirectory(override) {
  if (override) return path.resolve(override);
  if (process.env.BOARD_PET_DATA_DIR) return path.resolve(process.env.BOARD_PET_DATA_DIR);
  return process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'BoardAiPet') : path.join(os.homedir(), '.local', 'share', 'board-ai-pet');
}
export function endpointPath(dir) { return path.join(dir, 'endpoint.json'); }
