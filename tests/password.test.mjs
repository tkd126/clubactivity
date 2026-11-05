import test from 'node:test';
import assert from 'node:assert/strict';
import {newPassword} from '../lib/password.mjs';
import {csv} from '../lib/domain.mjs';
test('generated passwords are CSV-safe and preserve the exact authentication value',()=>{
 for(let i=0;i<100;i++){
  const value=newPassword();
  assert.match(value,/^[A-Za-z][A-Za-z0-9_-]{16}$/);
  assert.equal(csv([[value]]),'\ufeff"'+value+'"');
 }
});
