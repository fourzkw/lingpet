import os from 'node:os';
import path from 'node:path';
import {installCursorUserHooks} from '../src/cursor-hook-config.js';
const root=path.join(os.homedir(),'.cursor');
console.log(JSON.stringify(await installCursorUserHooks(path.join(root,'hooks.json'),path.join(root,'plugins/local/board-pet'))));
