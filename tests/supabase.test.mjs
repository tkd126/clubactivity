import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseHeaders} from '../lib/supabase.mjs';
test('opaque server keys use apikey instead of an invalid bearer JWT',()=>{
 assert.deepEqual(supabaseHeaders('sb_secret_example','sb_secret_example'),{apikey:'sb_secret_example'});
 assert.deepEqual(supabaseHeaders('sb_publishable_example','user.jwt.token'),{apikey:'sb_publishable_example',Authorization:'Bearer user.jwt.token'});
 assert.deepEqual(supabaseHeaders('legacy.jwt.key','legacy.jwt.key'),{apikey:'legacy.jwt.key',Authorization:'Bearer legacy.jwt.key'});
});
