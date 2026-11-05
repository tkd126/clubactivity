# 차곡 · 동아리 활동 기록장

학생 27명이 자기 번호로 로그인하여 동아리 활동을 기록하고, 교사가 전체 기록을 살펴 누가기록·학생부 특기사항 작성용 자료를 내려받는 웹사이트입니다. ChatGPT Sites를 사용하지 않습니다. GitHub 저장소를 Vercel에 연결해 배포합니다.

## 포함된 기능

- 학생: 1~27번 번호 + 개인별 비밀번호, 날짜와 1·2차시 선택, 활동 내용 한 칸 작성, 이전 기록 조회·수정.
- 교사: 번호순 27명 목록, 날짜·차시·작성 여부·번호 필터, 미작성 현황, 전체 기간 조회, 학생별 기록 펼치기.
- 교사 전용 날짜·차시별 관찰 메모, 학생별 특기사항 초안 저장/복사, 학생 비밀번호 재발급.
- 현재 필터의 CSV 및 AI 요청문이 포함된 TXT 다운로드. 전체 AI 자료와 특기사항 CSV도 별도 제공.
- 학생이 미작성해도 교사 메모가 있으면 다운로드에 포함하고 '(학생 미작성)'으로 표시.
- Supabase Auth 로그인과 데이터베이스 RLS로 학생은 자기 기록만 조회·수정. 교사 메모/특기사항은 교사에게만 공개.
- 외부 라이브러리, 유료 AI API, 빌드 단계가 필요 없는 HTML/CSS/JavaScript + Vercel Node 함수.

## 처음 설정하기

### 1. Supabase 프로젝트 만들기

1. [Supabase](https://supabase.com/)에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 [supabase/schema.sql](supabase/schema.sql) 전체를 실행합니다.
3. Authentication 설정에서 **새 사용자 회원가입(Allow new users to sign up)**을 끕니다. 학생 계정은 아래 도구가 관리자 권한으로 만듭니다.
4. 프로젝트 설정의 API Keys에서 Project URL, **Publishable key**, **Secret key**를 확인합니다. 새 키 방식과 기존 JWT 형식 anon/service_role 키를 모두 지원합니다.
5. 비밀번호 인증에 MFA를 추가하지 않은 전용 프로젝트로 설정합니다. 메일 확인 없이 관리자 도구로 미리 생성한 계정을 이용합니다.

학생용 내부 로그인 주소는 student01@club.example ~ student27@club.example, 교사용 주소는 teacher@club.example입니다. 메일을 보내지 않으며, 학생은 이 주소를 알거나 입력할 필요가 없습니다.

### 2. 로컬 환경변수 준비

Node.js 22 이상이 필요합니다. 프로젝트 폴더에서 PowerShell로 실행합니다.

```powershell
Copy-Item .env.example .env.local
```

`.env.local`을 열어 다음 값을 채웁니다.

| 변수 | 내용 |
| --- | --- |
| SUPABASE_URL | Supabase Project URL |
| SUPABASE_ANON_KEY | Publishable key (기존 anon 키도 지원) |
| SUPABASE_SERVICE_ROLE_KEY | Secret key (기존 service_role 키도 지원) |
| CLUB_LOGIN_DOMAIN | club.example 그대로 사용 가능 |
| TEACHER_PASSWORD | 교사용 고유 비밀번호, 12자 이상 |

**service_role 키와 .env.local은 GitHub에 올리지 마세요.** 서버 환경변수로만 사용합니다. 브라우저에는 키를 전달하지 않습니다.

### 3. 교사·학생 계정 생성

```powershell
node --env-file=.env.local scripts/provision.mjs
```

교사 1명과 학생 27명을 생성하며, 학생별 임의의 비밀번호를 `student-credentials-날짜.csv` 파일에 저장합니다. 각 학생에게 **자기 번호와 자기 비밀번호만** 나눠 주세요. 비밀번호 목록은 Git에서 제외되며 교사만 보관합니다.

다시 실행해도 기존 비밀번호는 바꾸지 않습니다. 새로 생성한 학생만 새 CSV에 나타납니다. 기존 학생 비밀번호를 잊은 경우 교사 화면에서 재발급합니다. 도중에 실패해도 기존 사용자 데이터를 삭제하지 않습니다. 동일 프로젝트를 여러 학급·여러 학년에 재사용하지 말고 새 학급에는 별도 프로젝트를 만드세요.

교사 비밀번호를 잊었다면 Supabase의 사용자 관리에서 teacher@club.example 계정을 찾아 비밀번호를 재설정하세요. `TEACHER_PASSWORD` 환경변수 수정만으로 기존 계정 비밀번호가 바뀌지는 않습니다.

### 4. 로컬 실행

```powershell
node scripts/dev.mjs
```

브라우저에서 [로컬 기록장](http://127.0.0.1:3000)을 엽니다. 설치 명령이나 npm 없이 실행할 수 있습니다.

저장소 없이 화면만 확인하려면 다음 명령을 사용합니다.

```powershell
node scripts/ui-fixture.mjs
```

[가상 자료 미리보기](http://127.0.0.1:3001)에서 학생·교사 비밀번호는 모두 `1234`입니다. 미리보기는 27명 모두 미작성 상태에서 시작합니다. 직접 작성한 내용만 메모리에 저장하며 서버를 종료하면 초기화됩니다. **배포되는 사이트에서는 이 비밀번호와 가상 자료가 작동하지 않습니다.**

### 5. GitHub → Vercel 배포

1. GitHub에 저장소를 만들고 이 프로젝트를 업로드합니다. 비밀번호 CSV와 `.env.local`은 제외합니다.
2. Vercel의 Add New Project에서 저장소를 가져옵니다.
3. Framework Preset은 **Other**, Root Directory는 프로젝트 루트로 선택합니다.
4. `vercel.json`의 Output Directory **public**, API rewrite 설정을 그대로 사용합니다. 별도 Build Command는 필요 없습니다.
5. Vercel 환경변수에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLUB_LOGIN_DOMAIN`을 추가합니다. 사용하려는 Production/Preview 환경에 각각 적용합니다. **TEACHER_PASSWORD는 Vercel에 넣지 않습니다.**
6. Deploy를 누릅니다. 환경변수를 나중에 변경했다면 Redeploy가 필요합니다.
7. 배포 URL에서 교사 로그인 후 27명 계정을 확인합니다. 학생 두 명의 별도 브라우저로 기록을 저장하고 상대방 기록이 보이지 않는지 점검한 후 학생들에게 안내합니다.

도메인으로 접속하는 페이지 자체는 공개지만 모든 기록 API는 인증과 역할 검사를 요구합니다. 계정 없는 방문자는 기록을 볼 수 없습니다. API 인증 응답은 캐시하지 않습니다.

## 수업에서 사용하는 순서

1. 학생은 번호와 비밀번호로 접속합니다.
2. 실제 활동 날짜와 1차시/2차시를 선택해 기록합니다. 두 차시를 했다면 각각 작성합니다.
3. 교사는 활동 기록 모아보기에서 날짜와 차시를 골라 작성 여부와 원문을 확인합니다. 날짜를 비우거나 ‘전체 기간’을 누르면 모든 날짜를 볼 수 있습니다.
4. 날짜와 특정 차시를 선택하면 해당 차시의 교사 관찰 메모를 작성할 수 있습니다. 메모를 저장한 뒤 다운로드합니다.
5. ‘AI용 자료 받기’는 현재 필터의 기록을 받습니다. ‘학생부 자료 준비 → 전체 AI용 자료’는 모든 날짜·학생 기록을 받습니다.
6. 원하는 AI에 TXT 파일을 첨부합니다. 파일 안에 날짜·차시별 누가기록과 학생별 한 줄 특기사항을 나누어 작성하는 요청문이 들어 있습니다.
7. 생성된 문장을 학생 원문과 교사 관찰에 대조합니다. 확인한 특기사항을 학생별 초안 칸에 저장하고 ‘문장 복사’로 나이스에 옮깁니다.

AI에 자동 전송하지 않습니다. 다운로드된 CSV는 나이스 업로드 양식이 아닌 원본 검토용이며, 나이스 직접 연동은 없습니다. UTF-8 Byte 표시는 참고용입니다. 나이스의 실제 입력 분량은 나이스 화면에서 확인하세요. 학생 자기 보고만으로 참여 태도·성취를 단정하지 않도록 AI 요청문에 포함했습니다.

## 검증

```powershell
node --test
node --check public/app.js
node --check lib/server.mjs
```

테스트는 날짜·차시·길이, CSV 수식 주입, AI 자료 정렬, 미인증 접근, 학생의 교사 기능 접근 차단, 저장 시 학생 번호 위조 방지, 미설정 오류와 교차 출처 요청을 검사합니다. API 테스트와 가상 자료 서버는 실제 Supabase의 RLS 검증을 대체하지 않습니다.

이번 작업의 실행 결과와 미확인 범위는 [docs/verification.md](docs/verification.md)에 기록했습니다.

### 연결 후 권한 확인

- 학생 1번/2번을 서로 다른 브라우저 프로필에서 로그인합니다. 각각 기록을 저장하고 상대방 기록이 목록에 없는지 확인합니다.
- 학생 토큰으로 /api/overview 및 /api/reset-password를 요청하면 403이어야 합니다.
- Supabase anon 키와 학생 토큰으로 REST records 테이블을 직접 조회해도 해당 학생 행만 반환되어야 합니다. teacher_notes 및 remarks에는 행이 반환되지 않아야 합니다.
- 학생이 다른 학생 번호로 저장을 요청해도 API는 인증한 본인 번호로 저장합니다. DB에 직접 다른 번호로 insert/update하면 RLS에 의해 거절되어야 합니다.
- 교사는 모든 학생 기록과 교사 메모를 조회할 수 있어야 합니다.

## 운영 참고

- 한 Supabase 프로젝트당 교사 1명과 학생 27명인 한 동아리를 대상으로 합니다. 학교 이름/실명/학적 정보는 입력받지 않습니다.
- 로그인 토큰은 해당 탭의 sessionStorage에 저장됩니다. 공용 기기에서는 사용 후 로그아웃하고 탭을 닫아 주세요.
- 활동 삭제 기능은 실수로 원문을 지우지 않도록 제공하지 않습니다. 학생은 기존 내용을 수정할 수 있습니다. 저장 중 화면 전환을 잠그고, 미저장 내용이 있는 화면을 떠날 때 확인합니다.
- 여러 기기에서 같은 기록을 동시에 수정하면 마지막 저장 내용이 남습니다. 변경 이력/자동 충돌 병합은 제공하지 않습니다.
- 다운로드한 파일에는 학생 원문이 포함됩니다. 교사가 보관하고 AI 전달 전에 내용이 적절한지 검토하세요.
- Supabase 프로젝트의 백업·보관 기간은 학교 운영 기준에 맞게 관리하세요.

구현 참고: [Supabase RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth REST](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Vercel 환경변수](https://vercel.com/docs/environment-variables).
