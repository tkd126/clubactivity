import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord, csv, aiText, authorize, exportRows, recordCsv } from '../lib/domain.mjs';
test('validates real dates, periods and meaningful activity',()=>{
 assert.equal(validateRecord({date:'2026-02-30',period:1,activity:'활동'}).ok,false);
 assert.equal(validateRecord({date:'2026-02-28',period:3,activity:'활동'}).ok,false);
 assert.equal(validateRecord({date:'2026-02-28',period:1,activity:'  '}).ok,false);
 assert.equal(validateRecord({date:'2026-02-28',period:2,activity:'그림',participation:'색칠',learning:'협동'}).ok,true);
 assert.equal(validateRecord({date:'2026-02-28',period:1,activity:'가'.repeat(2001)}).ok,false);
});
test('CSV protects formulas and preserves quotes and newlines',()=>{
 const result=csv([['번호','내용'],[1,'=SUM(1,2)'],[2,'줄1\n줄2']]);
 assert.ok(result.startsWith('\ufeff'));
 assert.ok(result.includes("'=SUM(1,2)"));
 assert.ok(result.includes('"줄1\n줄2"'));
});
test('AI export orders students and forbids invented observations',()=>{
 const result=aiText([{student_number:2,date:'2026-11-05',period:2,activity:'발표'},{student_number:1,date:'2026-11-05',period:1,activity:'그림'}]);
 assert.ok(result.indexOf('1번')<result.indexOf('2번'));
 assert.ok(result.includes('추측하거나 만들어 내지'));
 assert.ok(result.includes('1차시'));
});
test('denies anonymous and student teacher access',()=>{
 assert.equal(authorize(null,'teacher'),false);
 assert.equal(authorize({role:'student',student_number:1},'teacher'),false);
 assert.equal(authorize({role:'teacher'},'teacher'),true);
 assert.equal(authorize({role:'student',student_number:1},'student'),true);
});
test('exports teacher-only observations while applying date, period and student filters',()=>{
 const notes=[
  {student_number:2,date:'2026-11-05',period:2,note:'친구와 협동함'},
  {student_number:1,date:'2026-11-04',period:1,note:'다른 날짜'},
  {student_number:3,date:'2026-11-05',period:2,note:'다른 학생'},
  {student_number:2,date:'2026-11-05',period:1,note:'다른 차시'}
 ];
 const rows=exportRows([],notes,[],{date:'2026-11-05',period:'2',numbers:[2]});
 assert.equal(rows.length,1);assert.equal(rows[0].note,'친구와 협동함');
 assert.equal(rows[0].activity,'(학생 미작성)');
 assert.ok(recordCsv(rows).includes('친구와 협동함'));
 assert.ok(aiText([],notes.slice(0,1)).includes('친구와 협동함'));
 assert.ok(aiText([],notes.slice(0,1)).includes('(학생 미작성)'));
});
test('merges student record and teacher observation without duplicating a session',()=>{
 const record={student_number:1,date:'2026-11-05',period:1,activity:'그림'};
 const rows=exportRows([record],[{...record,note:'직접 관찰'}],[{student_number:1,remark:'그림을 완성함.'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].remark,'그림을 완성함.');
 assert.equal(rows[0].activity,'그림');assert.equal(rows[0].note,'직접 관찰');
});
test('one-field activity flows through validation, CSV and AI without extra questions',()=>{
 const checked=validateRecord({date:'2026-11-05',period:1,activity:'  그림을 그렸어요.  '});
 assert.deepEqual(checked,{ok:true,value:{date:'2026-11-05',period:1,activity:'그림을 그렸어요.'}});
 const record={...checked.value,student_number:1};
 const text=aiText([record]),sheet=recordCsv([record]);
 assert.ok(text.includes('활동: 그림을 그렸어요.'));
 assert.ok(!text.includes('참여:'));assert.ok(!text.includes('배움:'));
 assert.ok(!sheet.includes('나의 참여'));assert.ok(!sheet.includes('배움과 느낌'));
});
