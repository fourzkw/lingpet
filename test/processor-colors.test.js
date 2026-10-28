import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('chroma processing preserves character colors and removes multichannel key spill', {skip:!process.env.BOARD_PET_TEST_PYTHON},async()=>{
  await promisify(execFile)(process.env.BOARD_PET_TEST_PYTHON,['test/processor-colors.py']);
});
