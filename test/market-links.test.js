import test from 'node:test';
import assert from 'node:assert/strict';
import {githubLinks} from '../src/market/links.js';
test('repository links restrict destinations to GitHub and encode release tags',()=>{
 assert.deepEqual(githubLinks('fourzkw/jade-dragon-mage','v1.0.0'),{repository:'https://github.com/fourzkw/jade-dragon-mage',release:'https://github.com/fourzkw/jade-dragon-mage/releases/tag/v1.0.0'});
 assert.equal(githubLinks('alice/pet','feature/a?b').release,'https://github.com/alice/pet/releases/tag/feature%2Fa%3Fb');
 for(const repo of ['https://evil.test','alice/../secret','alice/pet?x=1','alice/pet#fragment','alice/pet/extra'])assert.throws(()=>githubLinks(repo,'v1'));
});
