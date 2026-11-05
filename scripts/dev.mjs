import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {createHandler} from '../lib/server.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const handler=createHandler();
const root=resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res;};
 res.json=data=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
 if(req.url.startsWith('/api/')){
  let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>20000){res.status(413).json({error:'요청이 너무 큽니다.'});return;}}req.body=raw?JSON.parse(raw):{};}catch{res.status(400).json({error:'올바르지 않은 입력입니다.'});return;}
  return handler(req,res);
 }
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))throw Error('forbidden');
  const data=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('동아리 기록장: http://127.0.0.1:'+(process.env.PORT||3000)));
