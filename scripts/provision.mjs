import {newPassword} from '../lib/password.mjs';
import {writeFile,appendFile} from 'node:fs/promises';
import {csv} from '../lib/domain.mjs';
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,TEACHER_PASSWORD}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!TEACHER_PASSWORD||TEACHER_PASSWORD.length<12||TEACHER_PASSWORD.includes('CHANGE_TO'))
 throw Error('.env.local의 Supabase URL, 관리자 키, 12자 이상의 고유한 교사 비밀번호를 확인하세요.');
const base=SUPABASE_URL.replace(/\/$/,'');
const domain=process.env.CLUB_LOGIN_DOMAIN||'club.example';
async function request(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error('계정 설정 실패 (HTTP '+response.status+'). Supabase URL/키 및 schema.sql 실행 여부를 확인하세요.');
 return data;
}
const users=[];
for(let page=1;;page++){
 const data=await request('/auth/v1/admin/users?page='+page+'&per_page=100');
 users.push(...(data.users||[]));if(!data.users||data.users.length<100)break;
}
const file='student-credentials-'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';
await writeFile(file,csv([['번호','최초 비밀번호']])+'\r\n',{flag:'wx',mode:0o600});
for(let n=0;n<=27;n++){
 const teacher=n===0;
 const email=(teacher?'teacher':'student'+String(n).padStart(2,'0'))+'@'+domain;
 let user=users.find(u=>u.email===email);
 if(!user){
  const password=teacher?TEACHER_PASSWORD:newPassword();
  const result=await request('/auth/v1/admin/users','POST',{email,password,email_confirm:true});
  user=result.user||result;
  if(!teacher)await appendFile(file,csv([[n,password]]).slice(1)+'\r\n');
 }
 await request('/rest/v1/profiles?on_conflict=id','POST',{id:user.id,role:teacher?'teacher':'student',student_number:teacher?null:n});
 console.log(teacher?'교사 계정 준비 완료':n+'번 계정 준비 완료');
}
console.log('완료: 새로 생성한 학생 비밀번호는 '+file+'에 저장했습니다. 기존 계정 비밀번호는 변경하지 않았습니다. 파일은 교사만 보관하세요.');
