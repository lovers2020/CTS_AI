# Ctrl + AI 배포 전 테스트 계획

## 보안 / 인증

- Firebase 설정이 비어 있는 로컬 주소에서 `admin / 123123` 로그인과 로컬 회원가입 → 로그아웃 → 재로그인이 동작하는지 확인한다.
- Firebase 설정이 비어 있는 배포 주소에서는 로컬 미리보기 인증이 활성화되지 않는지 확인한다.
- Firebase Auth Email/Password provider 활성화 후 아이디 회원가입이 성공하고 Auth 사용자와 UID 기반 `members` 문서가 생성되는지 확인한다.
- 로그아웃 후 `resources`, `sessions`, `questions`, `site/stats` Firestore 직접 읽기가 거부되는지 확인한다.
- 로그인 후 위 컬렉션 읽기가 허용되는지 확인한다.
- 로그인하지 않은 상태에서 `questions`, `members` 문서 생성이 거부되는지 확인한다.
- 다른 UID를 `ownerUid` 또는 `userUid`로 넣어 `questions`, `members`를 생성하려 할 때 거부되는지 확인한다.
- Firebase 연결 환경에서 브라우저 `localStorage`에 앱 자체 비밀번호나 비밀번호 해시가 저장되지 않는지 확인한다.

## XSS / 데이터 렌더링

- Firestore `title`, `summary`, `tag`, `owner`에 `<img src=x onerror=alert(1)>`를 넣어도 텍스트로 표시되는지 확인한다.
- Firestore `href`에 `javascript:alert(1)`, `#\" onclick=alert(1)`을 넣어도 링크가 `#join`으로 제한되는지 확인한다.
- Firestore `accent`에 `url(...)`, `red; background:url(...)`를 넣어도 기본 색상으로 대체되는지 확인한다.

## 접근성

- 키보드만으로 로그인, 회원가입, 로그아웃, 메뉴 열기/닫기, 경로 메뉴 이동, 질문 등록/닫기가 가능한지 확인한다.
- 모바일 메뉴 버튼의 `aria-expanded`가 열림/닫힘 상태에 따라 변경되는지 확인한다.
- 검색 입력이 스크린리더에서 “자료 검색”으로 인식되는지 확인한다.
- `prefers-reduced-motion: reduce` 환경에서 히어로 캔버스가 반복 애니메이션을 실행하지 않는지 확인한다.

## 경로 라우팅

- 로그인 후 `/resources`, `/schedule`, `/questions`, `/members`, `/about`로 이동했을 때 각 경로에 맞는 화면만 렌더링되는지 확인한다.
- 각 경로에서 새로고침해도 Vercel rewrite를 통해 404 없이 같은 화면이 복원되는지 확인한다.
- 브라우저 뒤로가기/앞으로가기에서 현재 경로, 활성 메뉴, 목록 제목이 함께 바뀌는지 확인한다.
- 로그아웃 상태에서 `/resources`, `/schedule`, `/questions`, `/members` 직접 접근 시 로그인 화면이 표시되고, 로그인 후 요청한 경로 또는 기본 자료실 경로로 이동하는지 확인한다.
- `/styles.css`, `/scripts/app.js`, `/scripts/firebase.js`가 하위 경로 새로고침 후에도 정상 로드되는지 확인한다.

## 반응형 / 배포

- 360px, 390px, 768px, 1024px, 1440px 폭에서 로그인 화면, 헤더, 모바일 메뉴, 카드 목록, 질문 다이얼로그가 깨지지 않는지 확인한다.
- Vercel 배포 후 응답 헤더에 `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`가 포함되는지 확인한다.
- 브라우저 콘솔에서 CSP 차단 오류가 없는지 확인하고, Firebase 요청 도메인이 누락되면 `vercel.json`의 `connect-src`를 조정한다.


## 추가 확인 항목: 멤버 관리 / Firebase 단일 데이터 소스

- Firebase 설정이 없는 배포 주소에서는 로컬 미리보기 인증이 활성화되지 않는지 확인합니다.
- Firebase 설정 후 `resources`, `sessions`, `questions`, `members`, `site/stats` 데이터가 Firestore 값 그대로 표시되는지 확인합니다.
- Firestore에 데이터가 없을 때 샘플 카드가 대신 표시되지 않고 빈 상태가 표시되는지 확인합니다.
- 일반 member 계정으로 멤버 목록은 조회되지만 정보 수정 버튼이 표시되지 않는지 확인합니다.
- `members/{uid}.role = admin`, `status = active`인 계정으로 로그인하면 멤버 정보 수정 버튼과 수정 dialog가 표시되는지 확인합니다.
- admin이 멤버의 이름, 팀, 이메일, 관심 분야, 상태, 권한, 메시지를 수정했을 때 Firestore 문서가 갱신되고 화면 목록도 즉시 갱신되는지 확인합니다.
- Firestore Rules에서 일반 member의 `members/{uid}` update 요청이 거부되고, admin의 update 요청만 허용되는지 Emulator로 확인합니다.

## 일정 / 달력 기능

- `/schedule`에서 월간 달력이 표시되고 이전 달, 다음 달, 오늘 버튼이 동작하는지 확인합니다.
- 일정 등록 버튼을 눌렀을 때 날짜, 시작 시간, 종료 시간, 일정명, 목적, 내용, 장소, 분류 입력 dialog가 표시되는지 확인합니다.
- 종료 시간이 시작 시간보다 빠르거나 같을 때 저장이 차단되는지 확인합니다.
- 정상 일정을 저장하면 Firestore `sessions` 문서가 생성되고, 해당 월 달력과 이번 달 일정 목록에 즉시 반영되는지 확인합니다.
- Firestore Rules에서 로그아웃 사용자의 `sessions` create가 거부되고, 로그인 사용자의 유효한 `sessions` create만 허용되는지 Emulator로 확인합니다.
- 360px 모바일 폭에서 달력이 세로 일정 목록 형태로 깨지지 않고 표시되는지 확인합니다.

- 기존 링크 호환을 위해 `/sessions` 직접 접근 시 `/schedule`과 동일한 일정 관리 화면이 렌더링되는지 확인합니다.
- 일정 분류(회의, 외근/출장, 휴가, 재택 근무, 개인 일정)에 따라 달력 색상과 범례가 일치하는지 확인합니다.
