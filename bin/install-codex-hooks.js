#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import {dataDirectory} from '../src/paths.js';
import {installCodexUserHooks} from '../src/codex-hook-config.js';
console.log(JSON.stringify(await installCodexUserHooks(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),dataDirectory()),null,2));
