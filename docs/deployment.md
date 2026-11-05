# 운영 배포

- 운영 주소: https://clubactivity-seven.vercel.app
- GitHub: https://github.com/tkd126/clubactivity
- Vercel 프로젝트: tkd126s-projects / clubactivity
- Supabase 프로젝트: clubactivity
- 배포일: 2026-11-05 (한국시간)

## 적용한 구성

Supabase에 profiles / records / teacher_notes / remarks 테이블과 RLS를 적용했다. 공개 회원가입을 비활성화하고 교사 1명·학생 27명 계정을 관리자 도구로 생성했다. 연결 키는 Vercel의 Production Secret 환경변수에만 설정했다. 실제 연결 키, 교사 비밀번호, 학생 비밀번호 목록은 Git에서 제외한다.

서버는 Supabase Publishable/Secret 키를 지원한다. 환경변수 이름은 기존 호환성을 위해 SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY를 유지한다.

## 실제 서비스 검증

scripts/verify-deployment.mjs를 운영 사이트에서 실행하여 다음을 확인했다.

- 교사와 학생 1·2번 로그인 및 서버 프로필 확인
- 교사의 학생 27명 전체 조회
- 학생의 교사 전용 기능 접근 거절
- 공개 회원가입 비활성화
- 학생 기록 저장 및 동일 날짜·차시 수정 시 중복 방지
- API 번호 위조 요청을 인증한 본인 번호로 저장
- Supabase 직접 REST 요청의 다른 학생 기록 조회·수정 차단
- 직접 DB 삽입의 학생 번호 위조 차단
- 교사 메모·특기사항 저장 및 학생 조회 차단

고유 표식으로 만든 검증 자료만 finally에서 정리했다. 초기 학생 기록, 교사 메모, 특기사항은 모두 0건이다.

단위 테스트는 14개 통과했다. 마지막 브라우저 화면 재확인은 브라우저 제어 연결 지연으로 완료하지 못했지만, 실제 운영 사이트/API 응답과 데이터베이스 권한을 직접 검증했다.

## 다시 검증하기

로컬 .env.local과 관리자용 학생 초기 비밀번호 CSV가 있을 때만 실행한다.

```powershell
node --env-file=.env.local scripts/verify-deployment.mjs 학생비밀번호파일.csv
```

기존 검증 위치에 기록이 있으면 덮어쓰지 않고 중단한다. 생성한 검증 자료는 실행 종료 시 정리한다.
