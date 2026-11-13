import {validateRecord,csv,aiText,exportRows,recordCsv} from './domain.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const state={role:'student',profile:null,records:[],students:[],notes:[],remarks:[],view:'overview',date:today(),period:'all',status:'all',number:'all',editorRecordId:null,editorDate:today(),editorPeriod:1,dirty:new Set(),saving:false};
let session=null,refreshing=null,toastTimer;
try{session=JSON.parse(sessionStorage.getItem('chagok-session')||'null');}catch{sessionStorage.removeItem('chagok-session');}
function setSession(value){session=value;if(value)sessionStorage.setItem('chagok-session',JSON.stringify(value));else sessionStorage.removeItem('chagok-session');}
function toast(message,failure=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.toggle('failure',failure);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
async function api(route,{method='GET',body,retry=true}={}){
 let response;
 try{response=await fetch('/api/'+route,{method,cache:'no-store',headers:{...(session?{Authorization:'Bearer '+session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('연결이 끊어졌어요. 작성한 내용을 유지한 채 다시 시도해 주세요.');}
 const data=await response.json().catch(()=>({error:'서버 응답을 읽을 수 없습니다.'}));
 if(response.status===401&&retry&&session?.refresh_token&&!['login','refresh','logout'].includes(route)){
  if(!refreshing)refreshing=api('refresh',{method:'POST',body:{refresh_token:session.refresh_token},retry:false}).then(setSession).finally(()=>{refreshing=null;});
  try{await refreshing;}catch{throw Error('로그인이 만료되었습니다. 작성한 내용을 복사해 둔 뒤 다시 로그인해 주세요.');}
  return api(route,{method,body,retry:false});
 }
 if(!response.ok)throw Error(data.error||'요청에 실패했습니다.');
 return data;
}
function canLeave(){return !state.dirty.size||confirm('아직 저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?');}
window.addEventListener('beforeunload',event=>{if(state.dirty.size||state.saving){event.preventDefault();event.returnValue='';}});
async function saving(task){
 if(state.saving)return;
 state.saving=true;
 const controls=[...document.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);
 controls.forEach(([el])=>el.disabled=true);
 try{await task();}catch(error){toast(error.message,true);}finally{state.saving=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}
}
function numbers(selected='all',allLabel='전체 학생'){return (allLabel?'<option value="all">'+allLabel+'</option>':'')+Array.from({length:27},(_,i)=>'<option value="'+(i+1)+'"'+(String(selected)===String(i+1)?' selected':'')+'>'+(i+1)+'번</option>').join('');}
$('#login-number').innerHTML=numbers(1,null);
function selectRole(role){
 state.role=role;$('#number-label').hidden=role==='teacher';$('#login-number').required=role==='student';
 for(const name of ['student','teacher']){$('#'+name+'-tab').classList.toggle('active',role===name);$('#'+name+'-tab').setAttribute('aria-pressed',String(role===name));}
 $('#login-error').hidden=true;
}
$('#student-tab').onclick=()=>selectRole('student');$('#teacher-tab').onclick=()=>selectRole('teacher');
$('#toggle-password').onclick=()=>{const input=$('#login-password');input.type=input.type==='password'?'text':'password';$('#toggle-password').textContent=input.type==='password'?'보기':'숨기기';};
$('#login-form').onsubmit=async event=>{
 event.preventDefault();$('#login-error').hidden=true;
 await saving(async()=>{
  try{
   const result=await api('login',{method:'POST',body:{role:state.role,number:Number($('#login-number').value),password:$('#login-password').value}});
   setSession(result);await loadWorkspace();$('#login-password').value='';
  }catch(error){setSession(null);$('#login-error').textContent=error.message;$('#login-error').hidden=false;}
 });
};
async function loadData(){
 if(state.profile.role==='teacher'){
  const data=await api('overview');Object.assign(state,data);
 }else{const data=await api('records');state.records=data.records;}
}
async function loadWorkspace(){
 state.profile=await api('me');await loadData();
 state.editorRecordId=null;state.editorDate=today();state.editorPeriod=1;
 state.dirty.clear();$('#login-screen').hidden=true;$('#workspace').hidden=false;
 $('#account-name').textContent=state.profile.role==='teacher'?'교사 계정':state.profile.student_number+'번 학생';
 $('#main-nav').innerHTML=state.profile.role==='teacher'?'<button data-view="overview">활동 기록</button><button data-view="remarks">학생부 자료</button>':'<button class="active">나의 활동 기록</button>';
 $('#main-nav').querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
  if(!canLeave())return;state.dirty.clear();state.view=button.dataset.view;render();
 });
 render();
}
$('#logout').onclick=async()=>{
 if(!canLeave())return;
 await saving(async()=>{
  try{await api('logout',{method:'POST'});}catch{/* Local logout always clears this browser. */}
  setSession(null);state.profile=null;state.records=[];state.notes=[];state.remarks=[];state.students=[];state.dirty.clear();
  $('#workspace').hidden=true;$('#main-content').replaceChildren();$('#detail-body').replaceChildren();$('#login-screen').hidden=false;$('#login-password').value='';
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 });
};
$('#change-password').onclick=()=>{$('#password-form').reset();$('#password-error').textContent='';$('#password-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{if(!state.saving)$('#'+button.dataset.close).close();});
$('#password-form').onsubmit=async event=>{
 event.preventDefault();
 if($('#new-password').value!==$('#confirm-password').value){$('#password-error').textContent='두 비밀번호가 서로 달라요.';return;}
 await saving(async()=>{await api('password',{method:'POST',body:{password:$('#new-password').value}});$('#password-dialog').close();$('#password-form').reset();toast('비밀번호를 변경했습니다.');});
};
function render(){
 $('#page-breadcrumb').textContent=state.profile.role==='student'?'우리 동아리 / 나의 활동 기록':state.view==='remarks'?'우리 동아리 / 학생부 자료 준비':'우리 동아리 / 활동 기록 모아보기';
 $('#main-nav').querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));
 if(state.profile.role==='student')renderStudent();else if(state.view==='remarks')renderRemarks();else renderTeacher();
}
function heading(eyebrow,title,description,actions=''){return '<div class="page-heading"><div><h1>'+title+'</h1>'+(description?'<p>'+description+'</p>':'')+'</div>'+(actions?'<div class="heading-actions">'+actions+'</div>':'')+'</div>';}
function renderStudent(){
 const current=state.records.find(r=>r.id===state.editorRecordId);
 const ordered=[...state.records].sort((a,b)=>b.date.localeCompare(a.date)||b.period-a.period);
 $('#main-content').innerHTML=heading('', '활동 기록하기','날짜와 차시를 고르고, 어떤 활동을 했는지 적어 주세요.')+
 '<div class="student-layout"><section class="panel"><div class="panel-title"><h2>'+state.profile.student_number+'번 학생 · '+(current?'기록 수정':'새 기록')+'</h2>'+(current?'<button class="text-button" id="new-record" type="button">새 기록 쓰기</button>':'')+'</div>'+
 '<form id="record-form" class="editor"><div class="editor-date"><label>활동 날짜<input id="record-date" type="date" value="'+state.editorDate+'" required></label><label>활동 차시<select id="record-period"><option value="1"'+(state.editorPeriod===1?' selected':'')+'>1차시</option><option value="2"'+(state.editorPeriod===2?' selected':'')+'>2차시</option></select></label></div>'+
 '<div class="editor-section"><label for="activity">어떤 활동을 했나요?</label><textarea id="activity" maxlength="2000" required placeholder="오늘 한 동아리 활동을 적어 주세요.">'+esc(current?.activity||'')+'</textarea><div class="counter" id="activity-count">'+(current?.activity?.length||0)+' / 2,000</div></div>'+
 '<div class="editor-footer"><span class="muted" id="save-status">'+(current?'날짜, 차시, 활동 내용을 바꿀 수 있어요.':'나와 선생님만 볼 수 있어요.')+'</span><div class="record-actions">'+(current?'<button class="text-button" id="delete-record" type="button">기록 삭제</button>':'')+'<button class="primary" type="submit">'+(current?'수정 저장':'저장하기')+'</button></div></div></form></section>'+
 '<aside class="panel history-panel"><div class="panel-title"><h2>내가 쓴 기록</h2><span class="muted">'+ordered.length+'건</span></div><div class="history-list">'+(ordered.length?ordered.map(r=>'<button class="history-item '+(r===current?'active':'')+'" data-id="'+esc(r.id)+'"><div class="date">'+r.date+' · '+r.period+'차시 · 수정</div><div class="preview">'+esc(r.activity)+'</div></button>').join(''):'<div class="empty">아직 작성한 기록이 없어요.</div>')+'</div></aside></div>';
 const markDirty=()=>{state.dirty.add('record');$('#save-status').textContent='아직 저장하지 않았어요.';};
 $('#activity').oninput=()=>{markDirty();$('#activity-count').textContent=$('#activity').value.length+' / 2,000';};
 $('#record-date').oninput=markDirty;
 $('#record-period').onchange=markDirty;
 function openRecord(record){
  if(!canLeave())return;
  state.editorRecordId=record?.id??null;
  state.editorDate=record?.date??today();
  state.editorPeriod=record?.period??1;
  state.dirty.clear();renderStudent();
 }
 if(current){
  $('#new-record').onclick=()=>openRecord(null);
  $('#delete-record').onclick=async()=>{
   if(!confirm(current.date+' · '+current.period+'차시 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없어요.'))return;
   await saving(async()=>{
    await api('delete-record',{method:'POST',body:{record_id:current.id}});
    state.records=state.records.filter(r=>r.id!==current.id);
    state.dirty.clear();openRecord(null);
    toast('기록을 삭제했어요.');
   });
  };
 }
 document.querySelectorAll('.history-item').forEach(button=>button.onclick=()=>openRecord(state.records.find(r=>r.id===button.dataset.id)));
 $('#record-form').onsubmit=async event=>{
  event.preventDefault();
  const payload={date:$('#record-date').value,period:Number($('#record-period').value),activity:$('#activity').value};
  const checked=validateRecord(payload);if(!checked.ok){toast(checked.error,true);return;}
  await saving(async()=>{
   const {record}=await api('records',{method:'POST',body:{...payload,...(current?{record_id:current.id}:{create_only:true})}});
   state.records=state.records.filter(r=>r.id!==record.id);
   state.records.push(record);
   state.dirty.clear();openRecord(record);
   toast(current?'수정했어요.':'저장했어요.');
  });
 };
}
function filteredRecords(){return state.records.filter(r=>(!state.date||r.date===state.date)&&(state.period==='all'||r.period===Number(state.period))&&(state.number==='all'||r.student_number===Number(state.number)));}
function visibleStudents(){
 const records=filteredRecords();
 return Array.from({length:27},(_,i)=>i+1).filter(n=>(state.number==='all'||n===Number(state.number))&&(state.status==='all'||(state.status==='done'?records.some(r=>r.student_number===n):!records.some(r=>r.student_number===n))));
}
function renderTeacher(){
 const records=filteredRecords(),visible=visibleStudents();
 const count=new Set(records.map(r=>r.student_number)).size;
 const editable=state.date&&state.period!=='all';
 const actions='<button class="secondary" id="refresh-data">새로고침</button><button class="secondary" id="export-csv">CSV 다운로드</button><button class="primary" id="export-ai">AI용 자료 받기</button>';
 $('#main-content').innerHTML=heading('','학생 활동 기록','날짜와 차시별로 작성 내용을 확인하세요.',actions)+
 '<div class="stat-grid"><div class="stat-card"><span class="label">전체 학생</span><strong class="value">27<small>명</small></strong></div><div class="stat-card completed"><span class="label">작성</span><strong class="value">'+count+'<small>명</small></strong></div><div class="stat-card waiting"><span class="label">미작성</span><strong class="value">'+(27-count)+'<small>명</small></strong></div></div>'+
 '<section class="panel"><div class="panel-title"><h2>우리 동아리 활동 기록 <span class="muted">/ 27명</span></h2><span class="muted">학생 원문과 교사 관찰을 함께 확인하세요</span></div>'+
 '<div class="filters"><label class="date-filter">활동 날짜<input type="date" id="filter-date" value="'+esc(state.date)+'"></label><label class="period-filter">차시<select id="filter-period"><option value="all">전체 차시</option><option value="1">1차시</option><option value="2">2차시</option></select></label><label class="status-filter">작성 상태<select id="filter-status"><option value="all">전체 보기</option><option value="done">작성 학생</option><option value="wait">미작성 학생</option></select></label><label class="search-filter">학생 번호<select id="filter-number">'+numbers(state.number)+'</select></label><button class="text-button" id="all-dates">전체 기간</button><span class="spacer"></span><span class="filter-summary">'+visible.length+'명 · '+records.filter(r=>visible.includes(r.student_number)).length+'건의 기록</span></div>'+
 '<div class="table-wrap"><table class="student-table"><thead><tr><th class="col-number">학생</th><th class="col-status">작성 상태</th><th>활동 기록 · 학생 원문</th><th class="col-note">교사 관찰 메모</th><th class="col-action">더 보기</th></tr></thead><tbody>'+
 visible.map(n=>{
  const rows=records.filter(r=>r.student_number===n).sort((a,b)=>b.date.localeCompare(a.date)||a.period-b.period);
  const note=state.notes.find(note=>note.student_number===n&&note.date===state.date&&note.period===Number(state.period));
  const registered=state.students.some(s=>s.student_number===n);
  return '<tr><td><div class="number-cell"><span class="number-avatar">'+String(n).padStart(2,'0')+'</span><span class="student-number">'+n+'번</span></div></td><td><span class="badge '+(rows.length?'done':'wait')+'">'+(rows.length?'작성 완료':'미작성')+'</span></td><td>'+
  (rows.length?rows.slice(0,3).map(r=>'<div class="record-date">'+r.date+' · '+r.period+'차시</div><div class="record-activity">'+esc(r.activity)+'</div>').join('<hr class="record-divider">')+(rows.length>3?'<div class="record-sub">외 '+(rows.length-3)+'건 · 전체 기록에서 확인</div>':''):'<span class="no-record">'+(registered?'—':'계정 생성 필요')+'</span>')+
  '</td><td>'+(editable&&registered?'<textarea class="note-input" data-note="'+n+'" aria-label="'+n+'번 교사 관찰 메모" maxlength="4000" placeholder="학생에게 보이지 않는 교사 메모">'+esc(note?.note||'')+'</textarea><button class="note-save" data-save-note="'+n+'">메모 저장</button>':teacherNotes(n,rows))+'</td><td><div class="row-actions"><button data-detail="'+n+'">전체 기록 ↗</button>'+(registered?'<button data-reset="'+n+'">비밀번호 재발급</button>':'')+'</div></td></tr>';
 }).join('')+'</tbody></table>'+(visible.length?'':'<div class="empty">선택한 조건에 해당하는 학생이 없습니다.</div>')+'</div><div class="panel-footnote">'+(editable?'교사 메모는 선택한 날짜·차시에 저장됩니다.':'날짜와 특정 차시를 선택하면 교사 메모를 작성할 수 있습니다.')+' · 다운로드에는 현재 필터에 해당하는 학생의 저장된 기록이 담깁니다.</div></section>'+
 '<p class="toolbar-note">학생이 쓴 내용은 자기 보고 자료입니다. 누가기록과 특기사항에 사용하기 전 교사가 관찰한 사실과 대조해 주세요.</p>';
 for(const key of ['period','status','number'])$('#filter-'+key).value=state[key];
 for(const key of ['date','period','status','number'])$('#filter-'+key).onchange=event=>{
  if(!canLeave()){event.target.value=state[key];return;}state[key]=event.target.value;state.dirty.clear();renderTeacher();
 };
 $('#all-dates').onclick=()=>{if(!canLeave())return;state.date='';state.dirty.clear();renderTeacher();};
 $('#refresh-data').onclick=()=>refreshData();
 $('#export-csv').onclick=()=>exportData('csv');$('#export-ai').onclick=()=>exportData('ai');
 document.querySelectorAll('[data-note]').forEach(el=>el.oninput=()=>state.dirty.add('note-'+el.dataset.note));
 document.querySelectorAll('[data-save-note]').forEach(button=>button.onclick=async()=>{
  const n=Number(button.dataset.saveNote),input=$('[data-note="'+n+'"]');
  await saving(async()=>{
   const result=await api('notes',{method:'POST',body:{student_number:n,date:state.date,period:Number(state.period),note:input.value}});
   state.notes=state.notes.filter(r=>!(r.student_number===n&&r.date===state.date&&r.period===Number(state.period)));state.notes.push(result.item);state.dirty.delete('note-'+n);toast(n+'번 교사 메모를 저장했습니다.');
  });
 });
 bindStudentActions();
}
function teacherNotes(n,rows){
 const notes=state.notes.filter(note=>note.student_number===n&&(!state.date||note.date===state.date)&&(state.period==='all'||note.period===Number(state.period)));
 return notes.length?notes.map(note=>'<div class="record-date">'+note.date+' · '+note.period+'차시</div><div class="record-sub">'+esc(note.note||'(빈 메모)')+'</div>').join(''):'<span class="no-record">등록한 관찰 메모가 없습니다.</span>';
}
async function refreshData(){
 if(!canLeave())return;
 await saving(async()=>{await loadData();state.dirty.clear();render();toast('최신 기록을 불러왔습니다.');});
}
function bindStudentActions(){
 document.querySelectorAll('[data-detail]').forEach(button=>button.onclick=()=>showDetail(Number(button.dataset.detail)));
 document.querySelectorAll('[data-reset]').forEach(button=>button.onclick=async()=>{
  const n=Number(button.dataset.reset);if(!confirm(n+'번 학생의 비밀번호를 새로 발급할까요? 기존 비밀번호는 사용할 수 없게 됩니다.'))return;
  await saving(async()=>{const result=await api('reset-password',{method:'POST',body:{student_number:n}});$('#reset-value').textContent=result.password;$('#reset-dialog').showModal();});
 });
}
$('#reset-dialog').addEventListener('close',()=>$('#reset-value').textContent='');
async function copy(text){try{await navigator.clipboard.writeText(text);toast('복사했습니다.');}catch{toast('자동 복사가 지원되지 않습니다. 글을 선택해 직접 복사해 주세요.',true);}}
$('#copy-reset').onclick=()=>copy($('#reset-value').textContent);
function showDetail(n){
 const rows=exportRows(state.records,state.notes,[],{numbers:[n]});
 $('#detail-title').textContent=n+'번 학생 · 전체 '+rows.length+'건';
 $('#detail-body').innerHTML=rows.length?rows.map(r=>{
  const note=state.notes.find(note=>note.student_number===n&&note.date===r.date&&note.period===r.period);
  return '<article class="detail-record"><h3>'+r.date+' · '+r.period+'차시</h3><p>'+esc(r.activity)+'</p>'+(note?.note?'<p class="muted"><b>교사 관찰</b> '+esc(note.note)+'</p>':'')+'</article>';
 }).join(''):'<div class="empty">아직 작성한 기록이 없습니다.</div>';
 $('#detail-dialog').showModal();
}
function download(text,name,type){
 const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportData(format){
 if(state.dirty.size){toast('작성 중인 메모·초안을 먼저 저장해 주세요. 다운로드에는 저장된 내용만 포함됩니다.',true);return;}
 const numbers=visibleStudents(),records=exportRows(state.records,state.notes,state.remarks,{date:state.date,period:state.period,numbers});
 if(!records.length){toast('현재 범위에 다운로드할 활동 기록이나 교사 메모가 없습니다.',true);return;}
 const suffix=(state.date||'전체기간')+'_'+(state.period==='all'?'전체차시':state.period+'차시');
 if(format==='ai'){download(aiText(records,[],state.remarks.filter(r=>numbers.includes(r.student_number))),'동아리_AI자료_'+suffix+'.txt','text/plain;charset=utf-8');}
 else{
  download(recordCsv(records),'동아리_활동기록_'+suffix+'.csv','text/csv;charset=utf-8');
 }
 toast('자료를 다운로드했습니다.');
}
function renderRemarks(){
 $('#main-content').innerHTML=heading('SCHOOL RECORD PREPARATION','학생부 자료 준비','학생별 활동을 확인하고, AI로 다듬은 한 줄 특기사항을 검토해 보관하세요.','<button class="secondary" id="remarks-csv">↓ 특기사항 CSV</button><button class="primary" id="all-ai">↓ 전체 AI용 자료</button>')+
 '<div class="notice">① 전체 AI용 자료 받기 → ② 원하는 AI에 파일 전달 → ③ 사실을 확인하고 아래에 초안 보관 → ④ 복사하여 나이스에 입력<br>AI 요청문에는 날짜별 누가기록과 학생별 한 줄 특기사항을 구분해서 작성하도록 안내합니다.</div>'+
 '<section class="panel"><div class="panel-title"><h2>학생별 특기사항 초안</h2><span class="muted">나이스에 옮기기 전 교사 검토</span></div><div class="table-wrap"><table class="student-table remarks-table"><thead><tr><th class="col-number">학생</th><th class="col-status">활동 기록</th><th>한 줄 특기사항 초안</th><th class="col-action">자료 확인</th></tr></thead><tbody>'+
 Array.from({length:27},(_,i)=>{const n=i+1,r=state.remarks.find(r=>r.student_number===n),count=state.records.filter(r=>r.student_number===n).length;return '<tr><td><div class="number-cell"><span class="number-avatar">'+String(n).padStart(2,'0')+'</span><span class="student-number">'+n+'번</span></div></td><td><span class="badge '+(count?'done':'wait')+'">'+count+'건</span></td><td><textarea class="remark-input" data-remark="'+n+'" maxlength="4000" aria-label="'+n+'번 특기사항 초안" placeholder="활동 기록을 바탕으로 검토한 문장을 입력하세요.">'+esc(r?.remark||'')+'</textarea><div class="remark-meta"><span data-remark-counter="'+n+'">'+(r?.remark?.length||0)+'자 · '+new TextEncoder().encode(r?.remark||'').length+' UTF-8 Byte</span><div><button class="text-button" data-save-remark="'+n+'">초안 저장</button><button class="text-button" data-copy-remark="'+n+'">문장 복사</button></div></div></td><td><div class="row-actions"><button data-detail="'+n+'">전체 기록 ↗</button></div></td></tr>';}).join('')+
 '</tbody></table></div><div class="panel-footnote">표시된 UTF-8 바이트 수는 참고용입니다. 나이스의 실제 글자 수 표시와 입력 가능 분량을 확인하세요. 초안은 학생에게 공개되지 않습니다.</div></section>';
 document.querySelectorAll('[data-remark]').forEach(input=>input.oninput=()=>{const n=input.dataset.remark;state.dirty.add('remark-'+n);$('[data-remark-counter="'+n+'"]').textContent=input.value.length+'자 · '+new TextEncoder().encode(input.value).length+' UTF-8 Byte';});
 document.querySelectorAll('[data-save-remark]').forEach(button=>button.onclick=async()=>{
  const n=Number(button.dataset.saveRemark);
  if(!state.students.some(s=>s.student_number===n)){toast('먼저 학생 계정을 생성해 주세요.',true);return;}
  await saving(async()=>{const result=await api('remarks',{method:'POST',body:{student_number:n,remark:$('[data-remark="'+n+'"]').value}});state.remarks=state.remarks.filter(r=>r.student_number!==n);state.remarks.push(result.item);state.dirty.delete('remark-'+n);toast(n+'번 특기사항 초안을 저장했습니다.');});
 });
 document.querySelectorAll('[data-copy-remark]').forEach(button=>button.onclick=()=>{const value=$('[data-remark="'+button.dataset.copyRemark+'"]').value.trim();if(!value){toast('복사할 문장을 먼저 입력해 주세요.',true);return;}copy(value);});
 $('#remarks-csv').onclick=()=>{
  if(state.dirty.size){toast('작성 중인 초안을 먼저 저장해 주세요.',true);return;}
  download(csv([['학생 번호','특기사항 초안'],...Array.from({length:27},(_,i)=>[i+1,state.remarks.find(r=>r.student_number===i+1)?.remark||''])]),'동아리_특기사항_초안.csv','text/csv;charset=utf-8');
 };
 $('#all-ai').onclick=()=>{
  if(state.dirty.size){toast('작성 중인 초안을 먼저 저장해 주세요.',true);return;}
  if(!exportRows(state.records,state.notes).length){toast('다운로드할 활동 기록이나 교사 메모가 없습니다.',true);return;}
  download(aiText(state.records,state.notes,state.remarks),'동아리_전체_AI자료.txt','text/plain;charset=utf-8');
 };
 bindStudentActions();
}
if(session){loadWorkspace().catch(error=>{setSession(null);$('#login-error').textContent=error.message;$('#login-error').hidden=false;});}
