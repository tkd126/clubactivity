// UI 검사 전용 가상 저장소. Vercel 함수에서 불러오지 않습니다.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {createHandler} from '../lib/server.mjs';
const profiles=[{id:'teacher',role:'teacher',student_number:null},...Array.from({length:27},(_,i)=>({id:'student'+(i+1),role:'student',student_number:i+1}))];
const records=[];
const tables={profiles,records,teacher_notes:[],remarks:[]};
async function fakeFetch(input,options={}){
 const url=new URL(input),token=options.headers?.Authorization?.replace('Bearer ','');
 const body=options.body?JSON.parse(options.body):{};
 const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
 if(url.pathname==='/auth/v1/token'){
  if(body.password!=='1234'&&!body.refresh_token)return reply({},400);
  const id=body.refresh_token?.replace('fixture-','')||(body.email.startsWith('teacher@')?'teacher':'student'+Number(body.email.match(/student(\d+)/)?.[1]));
  return reply({access_token:'fixture-'+id,refresh_token:'fixture-'+id});
 }
 if(url.pathname==='/rest/v1/records'&&options.method==='DELETE'&&options.headers?.apikey==='fake-service-key'){
  const index=records.findIndex(row=>url.searchParams.get('id')==='eq.'+row.id&&url.searchParams.get('student_id')==='eq.'+row.student_id);
  if(index>=0)records.splice(index,1);
  return new Response(null,{status:204});
 }
 const id=token?.replace('fixture-',''),profile=profiles.find(p=>p.id===id);
 if(!profile)return reply({},401);
 if(url.pathname==='/auth/v1/user')return reply({id});
 if(url.pathname==='/auth/v1/logout')return reply({});
 const table=url.pathname.split('/').pop();let data=tables[table];if(!data)return reply({},404);
 const duplicate=()=>reply({code:'23505'},409);
 if(table==='records'&&options.method==='PATCH'){
  const index=data.findIndex(row=>row.student_id===id&&url.searchParams.get('id')==='eq.'+row.id);
  if(index<0)return reply([]);
  if(data.some((row,i)=>i!==index&&row.student_id===id&&row.date===body.date&&row.period===body.period))return duplicate();
  data[index]={...data[index],...body,updated_at:new Date().toISOString()};
  return reply([data[index]]);
 }
 if(options.method==='POST'){
  const conflict=url.searchParams.get('on_conflict')?.split(',')||[];
  const index=conflict.length?data.findIndex(row=>conflict.every(key=>row[key]===body[key])):-1;
  if(table==='records'&&!conflict.length&&data.some(row=>row.student_id===id&&row.date===body.date&&row.period===body.period))return duplicate();
  const row={...(index>=0?data[index]:{id:crypto.randomUUID()}),...body,updated_at:new Date().toISOString()};
  if(index>=0)data[index]=row;else data.push(row);return reply([row]);
 }
 if(profile.role==='student'){
  if(table==='profiles')data=data.filter(p=>p.id===id);
  else if(table==='records')data=data.filter(r=>r.student_id===id);
  else return reply([],403);
 }
 for(const [key,value]of url.searchParams){if(value.startsWith('eq.'))data=data.filter(row=>String(row[key])===value.slice(3));}
 const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
 return reply(data.slice(offset,offset+limit));
}
const handler=createHandler({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fake-public-key',SUPABASE_SERVICE_ROLE_KEY:'fake-service-key'},fakeFetch);
const root=resolve('public');
http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
 if(req.url.startsWith('/api/')){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000){res.status(413).json({error:'너무 긴 요청'});return;}}
  try{req.body=raw?JSON.parse(raw):{};}catch{return res.status(400).json({error:'잘못된 요청'});}
  return handler(req,res);
 }
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))throw Error('forbidden');
  let data=await readFile(file);
  if(extname(file)==='.html')data=Buffer.from(data.toString().replace('<body>','<body><div class="fixture-banner">미리보기 · 학생 27명 / 실제 저장소 미연결</div>'));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(data);
 }catch{res.statusCode=404;res.end('Not found');}
}).listen(3001,'127.0.0.1',()=>console.log('가상 자료 UI 검사: http://127.0.0.1:3001 / 비밀번호 1234'));
