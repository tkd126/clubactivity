// Uses only self-created, uniquely tagged records and removes them in finally.
// Run: node --env-file=.env.local scripts/verify-deployment.mjs <credential CSV>
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {supabaseHeaders} from '../lib/supabase.mjs';
const base=process.env.SUPABASE_URL;
const publicKey=process.env.SUPABASE_ANON_KEY;
const adminKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin=process.env.DEPLOYMENT_URL||'https://clubactivity-seven.vercel.app';
const credentialFile=process.argv[2];
if(!base||!publicKey||!adminKey||!credentialFile)throw Error('환경변수와 학생 비밀번호 CSV 경로가 필요합니다.');
const passwords=new Map((await readFile(credentialFile,'utf8')).split(/\r?\n/).map(line=>line.match(/^"(\d+)","([^"]+)"$/)).filter(Boolean).map(m=>[Number(m[1]),m[2]]));
const marker='deployment-check-'+randomUUID();
const date='1900-01-01';
let recordId,noteCreated=false,remarkCreated=false;
async function db(path,{method='GET',token,admin=false,body}={}){
 const key=admin?adminKey:publicKey;
 const response=await fetch(base+path,{method,headers:{...supabaseHeaders(key,admin?adminKey:token),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 return {status:response.status,data:await response.json().catch(()=>null)};
}
async function api(route,{method='GET',token,body}={}){
 const response=await fetch(origin+'/api/'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 return {status:response.status,data:await response.json().catch(()=>null)};
}
function status(result,expected,message){assert.equal(result.status,expected,message+' (HTTP '+result.status+')');}
try{
 const logins=await Promise.all([1,2,'teacher'].map(number=>api('login',{method:'POST',body:{role:number==='teacher'?'teacher':'student',number:number==='teacher'?null:number,password:number==='teacher'?process.env.TEACHER_PASSWORD:passwords.get(number)}})));
 logins.forEach(r=>status(r,200,'운영 로그인'));
 const [one,two,teacher]=logins.map(r=>r.data.access_token);
 const [p1,p2,pt]=await Promise.all([one,two,teacher].map(token=>api('me',{token})));
 [p1,p2,pt].forEach(r=>status(r,200,'운영 프로필'));
 assert.equal(p1.data.student_number,1);assert.equal(p2.data.student_number,2);assert.equal(pt.data.role,'teacher');
 console.log('PASS: 운영 교사 및 학생 1·2번 로그인');
 const overview=await api('overview',{token:teacher});status(overview,200,'교사 전체 조회');assert.equal(overview.data.students.length,27);
 status(await api('overview',{token:one}),403,'학생의 교사 기능 차단');
 const ownProfiles=await db('/rest/v1/profiles?select=id,student_number',{token:one});
 status(ownProfiles,200,'DB 학생 프로필 조회');assert.equal(ownProfiles.data.length,1);assert.equal(ownProfiles.data[0].student_number,1);
 const signup=await db('/auth/v1/settings');status(signup,200,'회원가입 설정');assert.equal(signup.data.disable_signup,true,'공개 회원가입 비활성화');
 console.log('PASS: 교사 27명 조회 / 학생 교사 기능 차단 / 회원가입 비활성화');
 const before=await db('/rest/v1/records?select=id&student_id=eq.'+p1.data.id+'&date=eq.'+date+'&period=eq.1',{token:teacher});status(before,200,'검증 위치 확인');assert.equal(before.data.length,0,'기존 기록을 덮어쓰지 않습니다.');
 const saved=await api('records',{method:'POST',token:one,body:{date,period:1,activity:marker,student_number:2}});
 status(saved,200,'운영 기록 저장');recordId=saved.data.record.id;
 assert.equal(saved.data.record.student_number,1,'번호 위조 요청은 본인 번호로 저장');
 const other=await db('/rest/v1/records?select=id&id=eq.'+recordId,{token:two});status(other,200,'타 학생 직접 REST 조회');assert.equal(other.data.length,0);
 const tamper=await db('/rest/v1/records?id=eq.'+recordId,{method:'PATCH',token:two,body:{activity:'unexpected-change'}});
 assert.ok(tamper.status===200||tamper.status===403);if(tamper.status===200)assert.equal(tamper.data.length,0);
 const teacherRead=await db('/rest/v1/records?select=activity&id=eq.'+recordId,{token:teacher});status(teacherRead,200,'교사 원문 조회');assert.equal(teacherRead.data[0].activity,marker);
 const forged=await db('/rest/v1/records',{method:'POST',token:one,body:{student_id:p1.data.id,student_number:2,date,period:2,activity:marker}});
 status(forged,403,'직접 DB 번호 위조 차단');
 const edited=await api('records',{method:'POST',token:one,body:{date,period:1,activity:marker+'-edited'}});
 status(edited,200,'동일 차시 수정');assert.equal(edited.data.record.id,recordId);
 console.log('PASS: 기록 저장·수정 / 번호 위조 차단 / 다른 학생의 직접 조회·수정 차단');
 const existingNote=overview.data.notes.some(r=>r.student_number===1&&r.date===date&&r.period===1);
 assert.equal(existingNote,false,'기존 교사 메모를 덮어쓰지 않습니다.');
 const note=await api('notes',{method:'POST',token:teacher,body:{student_number:1,date,period:1,note:marker}});status(note,200,'교사 메모 저장');noteCreated=true;
 const privateNotes=await db('/rest/v1/teacher_notes?select=note&student_number=eq.1&date=eq.'+date,{token:one});status(privateNotes,200,'학생의 교사 메모 조회');assert.equal(privateNotes.data.length,0);
 if(!overview.data.remarks.some(r=>r.student_number===27)){
  const remark=await api('remarks',{method:'POST',token:teacher,body:{student_number:27,remark:marker}});status(remark,200,'특기사항 저장');remarkCreated=true;
  const privateRemarks=await db('/rest/v1/remarks?select=remark&student_number=eq.27',{token:two});status(privateRemarks,200,'학생의 특기사항 조회');assert.equal(privateRemarks.data.length,0);
 }
 console.log('PASS: 운영 교사 메모·특기사항 저장 / 학생에게 비공개');
}finally{
 if(recordId){const removed=await db('/rest/v1/records?id=eq.'+recordId,{method:'DELETE',admin:true});status(removed,200,'자체 생성 검증 기록 정리');}
 if(noteCreated){const removed=await db('/rest/v1/teacher_notes?student_number=eq.1&date=eq.'+date+'&period=eq.1&note=eq.'+encodeURIComponent(marker),{method:'DELETE',admin:true});status(removed,200,'자체 생성 검증 메모 정리');}
 if(remarkCreated){const removed=await db('/rest/v1/remarks?student_number=eq.27&remark=eq.'+encodeURIComponent(marker),{method:'DELETE',admin:true});status(removed,200,'자체 생성 검증 초안 정리');}
}
console.log('검증 완료. 자체 생성한 검증 자료를 모두 정리했습니다.');
