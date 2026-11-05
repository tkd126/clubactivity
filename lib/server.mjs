import {newPassword} from './password.mjs';
import {authorize,validateRecord} from './domain.mjs';
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function createHandler(env=process.env,remote=fetch) {
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
   if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY) throw new HttpError(503,'저장소 설정이 필요합니다. README의 Supabase·Vercel 설정을 확인해 주세요.');
   const base=env.SUPABASE_URL.replace(/\/$/,'');
   const url=new URL(req.url,'http://localhost');
   const route=(url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'')).replace(/^\/+|\/+$/g,'');
   const method=req.method||'GET';
   if(!['GET','POST'].includes(method)) throw new HttpError(405,'지원하지 않는 요청입니다.');
   if(method==='POST'&&req.headers.origin){
    let origin;try{origin=new URL(req.headers.origin).host;}catch{throw new HttpError(403,'허용되지 않은 요청입니다.');}
    if(origin!==req.headers.host) throw new HttpError(403,'허용되지 않은 요청입니다.');
   }
   let body=req.body??{};
   if(typeof body==='string') {if(body.length>20000) throw new HttpError(413,'내용이 너무 깁니다.');try{body=JSON.parse(body);}catch{throw new HttpError(400,'올바르지 않은 입력입니다.');}}
   if(!body||Array.isArray(body)||typeof body!=='object') throw new HttpError(400,'올바르지 않은 입력입니다.');
   async function call(path,{token,key=env.SUPABASE_ANON_KEY,method='GET',body,prefer}={}){
    const response=await remote(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw new HttpError(502,'저장소 응답을 읽을 수 없습니다.');}
    if(!response.ok){
     if(response.status===401||response.status===403) throw new HttpError(401,'로그인 정보가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.');
     if(response.status===429) throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
     if(response.status===400&&path.startsWith('/auth/')) throw new HttpError(400,'번호 또는 비밀번호를 확인해 주세요.');
     throw new HttpError(502,'저장소 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return data;
   }
   if(route==='login'&&method==='POST'){
    const isTeacher=body.role==='teacher';
    const number=Number(body.number);
    if((!isTeacher&&(!Number.isInteger(number)||number<1||number>27))||typeof body.password!=='string'||body.password.length>200) throw new HttpError(400,'번호와 비밀번호를 확인해 주세요.');
    const email=(isTeacher?'teacher':'student'+String(number).padStart(2,'0'))+'@'+(env.CLUB_LOGIN_DOMAIN||'club.example');
    const auth=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:body.password}});
    return res.status(200).json({access_token:auth.access_token,refresh_token:auth.refresh_token});
   }
   if(route==='refresh'&&method==='POST'){
    if(typeof body.refresh_token!=='string'||body.refresh_token.length>4096) throw new HttpError(400,'다시 로그인해 주세요.');
    const auth=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:body.refresh_token}});
    return res.status(200).json({access_token:auth.access_token,refresh_token:auth.refresh_token});
   }
   const token=req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
   if(!token) throw new HttpError(401,'먼저 로그인해 주세요.');
   const user=await call('/auth/v1/user',{token});
   if(!user?.id) throw new HttpError(401,'다시 로그인해 주세요.');
   const profiles=await call('/rest/v1/profiles?select=id,role,student_number&id=eq.'+encodeURIComponent(user.id),{token});
   const profile=profiles?.[0];
   if(!authorize(profile,'student')) throw new HttpError(403,'등록된 동아리 계정이 아닙니다.');
   const teacher=()=>{if(!authorize(profile,'teacher')) throw new HttpError(403,'교사만 사용할 수 있습니다.');};
   async function all(table,query=''){
    const rows=[];
    for(let offset=0;offset<100000;offset+=1000){
     const page=await call('/rest/v1/'+table+'?select=*'+query+'&order='+ (table==='profiles'?'student_number.asc':table==='remarks'?'student_number.asc':'date.asc,student_number.asc,period.asc')+'&limit=1000&offset='+offset,{token});
     rows.push(...page);if(page.length<1000)return rows;
    }
    throw new HttpError(413,'기록이 너무 많습니다. 관리자에게 문의해 주세요.');
   }
   if(route==='me'&&method==='GET') return res.status(200).json(profile);
   if(route==='logout'&&method==='POST'){await call('/auth/v1/logout?scope=local',{method:'POST',token});return res.status(200).json({ok:true});}
   if(route==='password'&&method==='POST'){
    if(typeof body.password!=='string'||body.password.length<10||body.password.length>128) throw new HttpError(400,'새 비밀번호는 10~128자로 입력해 주세요.');
    await call('/auth/v1/user',{method:'PUT',token,body:{password:body.password}});
    return res.status(200).json({ok:true});
   }
   if(route==='records'&&method==='GET'){
    const records=await all('records',profile.role==='student'?'&student_id=eq.'+encodeURIComponent(profile.id):'');
    return res.status(200).json({records});
   }
   if(route==='records'&&method==='POST'){
    if(profile.role!=='student') throw new HttpError(403,'학생 계정으로 작성해 주세요.');
    const checked=validateRecord(body);if(!checked.ok) throw new HttpError(400,checked.error);
    const saved=await call('/rest/v1/records?on_conflict=student_id,date,period',{method:'POST',token,prefer:'resolution=merge-duplicates,return=representation',body:{...checked.value,student_id:profile.id,student_number:profile.student_number}});
    return res.status(200).json({record:saved[0]});
   }
   if(route==='overview'&&method==='GET'){
    teacher();
    const [students,records,notes,remarks]=await Promise.all([all('profiles','&role=eq.student'),all('records'),all('teacher_notes'),all('remarks')]);
    return res.status(200).json({students,records,notes,remarks});
   }
   if(['notes','remarks'].includes(route)&&method==='POST'){
    teacher();
    const number=Number(body.student_number);
    if(!Number.isInteger(number)||number<1||number>27) throw new HttpError(400,'학생 번호를 확인해 주세요.');
    const field=route==='notes'?'note':'remark';
    if(typeof body[field]!=='string'||body[field].length>4000) throw new HttpError(400,'교사 기록은 4,000자 이내로 입력해 주세요.');
    let payload={student_number:number,[field]:body[field].trim()};
    if(route==='notes'){
     const checked=validateRecord({date:body.date,period:body.period,activity:'메모'});
     if(!checked.ok) throw new HttpError(400,checked.error);
     payload={...payload,date:body.date,period:body.period};
    }
    const table=route==='notes'?'teacher_notes':'remarks';
    const conflict=route==='notes'?'student_number,date,period':'student_number';
    const saved=await call('/rest/v1/'+table+'?on_conflict='+conflict,{method:'POST',token,body:payload,prefer:'resolution=merge-duplicates,return=representation'});
    return res.status(200).json({item:saved[0]});
   }
   if(route==='reset-password'&&method==='POST'){
    teacher();
    if(!env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503,'비밀번호 초기화용 서버 키 설정이 필요합니다.');
    const number=Number(body.student_number);if(!Number.isInteger(number)||number<1||number>27) throw new HttpError(400,'학생 번호를 확인해 주세요.');
    const target=await call('/rest/v1/profiles?select=id&role=eq.student&student_number=eq.'+number,{token});
    if(!target[0]) throw new HttpError(404,'등록되지 않은 학생입니다.');
    const password=newPassword();
    await call('/auth/v1/admin/users/'+encodeURIComponent(target[0].id),{method:'PUT',key:env.SUPABASE_SERVICE_ROLE_KEY,token:env.SUPABASE_SERVICE_ROLE_KEY,body:{password}});
    return res.status(200).json({password});
   }
   throw new HttpError(404,'요청한 기능을 찾을 수 없습니다.');
  }catch(error){
   const status=error.status||500;
   return res.status(status).json({error:error.status?error.message:'서버에 연결할 수 없습니다. 작성 내용을 유지한 채 잠시 후 다시 시도해 주세요.'});
  }
 };
}
