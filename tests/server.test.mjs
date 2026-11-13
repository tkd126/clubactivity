import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../lib/server.mjs';
const env={SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public-key'};
async function request(route,method='GET',body,token,remote=async()=>{throw Error('unexpected fetch');}){
 const handler=createHandler({...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'},remote);
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.data=value;return this;}};
 await handler({method,url:'/api/'+route,headers:{...(token?{authorization:'Bearer '+token}:{}),host:'localhost'},body},res);
 return res;
}
const userFetch=async url=>new Response(JSON.stringify(url.includes('/auth/v1/user')?{id:'student-id'}:[{id:'student-id',role:'student',student_number:1}]),{status:200});
test('API denies requests without authentication',async()=>{assert.equal((await request('records')).statusCode,401);});
test('API denies student exports of teacher data and password resets',async()=>{
 assert.equal((await request('overview','GET',undefined,'token',userFetch)).statusCode,403);
 assert.equal((await request('reset-password','POST',{student_number:2},'token',userFetch)).statusCode,403);
});
test('API ignores forged student number when saving a record',async()=>{
 let saved;
 const remote=async(url,options)=>{
  if(url.includes('/rest/v1/records')) {saved=JSON.parse(options.body); return new Response(JSON.stringify([saved]),{status:200});}
  return userFetch(url);
 };
 const res=await request('records','POST',{date:'2026-11-05',period:1,activity:'만들기',student_number:2},'token',remote);
 assert.equal(res.statusCode,200); assert.equal(saved.student_number,1);assert.equal(saved.student_id,'student-id');
});
test('moving a record updates it in place and rejects occupied slots or unowned records',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const payload={date:'2026-11-06',period:2,activity:'만들기'};
 const body={...payload,record_id:id,student_id:'other',student_number:2};
 for(const [dbStatus,dbBody,expected] of [[200,[{id,...payload}],200],[409,{code:'23505'},409],[200,[],404]]){
  let calls=0;
  const remote=async(url,options)=>{
   if(!url.includes('/rest/v1/records'))return userFetch(url);
   calls++;
   assert.equal(url,'https://db.example/rest/v1/records?id=eq.'+id+'&student_id=eq.student-id');
   assert.equal(options.method,'PATCH');
   assert.equal(options.headers.Authorization,'Bearer token');
   assert.deepEqual(JSON.parse(options.body),payload);
   return new Response(JSON.stringify(dbBody),{status:dbStatus});
  };
  const res=await request('records','POST',body,'token',remote);
  assert.equal(res.statusCode,expected);
  assert.equal(calls,1);
  if(expected===200)assert.deepEqual(res.data.record,{id,...payload});
  if(expected===409)assert.match(res.data.error,/이미 기록/);
 }
});
test('creating a new record rejects an occupied slot without upserting',async()=>{
 const remote=async(url,options)=>{
  if(!url.includes('/rest/v1/records'))return userFetch(url);
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Prefer,'return=representation');
  return new Response(JSON.stringify({code:'23505'}),{status:409});
 };
 const res=await request('records','POST',{date:'2026-11-06',period:2,activity:'만들기',create_only:true},'token',remote);
 assert.equal(res.statusCode,409);
});
test('deleting a record is scoped to the authenticated student and validates the record ID',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 let deletes=0;
 const remote=async(url,options)=>{
  if(!url.includes('/rest/v1/records'))return userFetch(url);
  deletes++;
  assert.equal(options.method,'DELETE');
  assert.equal(options.headers.apikey,'sb_secret_fixture');
  assert.equal(url,'https://db.example/rest/v1/records?id=eq.'+id+'&student_id=eq.student-id');
  return new Response(null,{status:204});
 };
 assert.equal((await request('delete-record','POST',{record_id:id},undefined,remote)).statusCode,401);
 assert.equal((await request('delete-record','POST',{record_id:'invalid'},'token',remote)).statusCode,400);
 assert.equal(deletes,0);
 const res=await request('delete-record','POST',{record_id:id,student_id:'other'},'token',remote);
 assert.equal(res.statusCode,200);
 assert.equal(deletes,1);
});
test('API reports missing database configuration without leaking secrets',async()=>{
 const handler=createHandler({});
 const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.data=v;}};
 await handler({method:'GET',url:'/api/me',headers:{}},res);
 assert.equal(res.statusCode,503);assert.match(res.data.error,/설정/);
});
test('login rejects cross-origin requests',async()=>{
 const handler=createHandler(env);
 const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.data=v;}};
 await handler({method:'POST',url:'/api/login',headers:{origin:'https://evil.example',host:'localhost'},body:{number:1,password:'anything'}},res);
 assert.equal(res.statusCode,403);
});
