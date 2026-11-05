import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../lib/server.mjs';
const env={SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public-key'};
async function request(route,method='GET',body,token,remote=async()=>{throw Error('unexpected fetch');}){
 const handler=createHandler(env,remote);
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
