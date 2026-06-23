# Ctrl + AI

AI 활용법 정보 공유를 위한 사내 동호회 홈페이지입니다. Vercel에서 정적 사이트로 배포하고, Firebase Auth와 Firestore를 연결해 로그인 사용자만 자료, 일정, 질문, 멤버 데이터를 읽고 질문을 등록할 수 있도록 보완했습니다. 화면에 표시되는 자료/일정/질문/멤버 데이터는 Firebase를 단일 데이터 소스로 사용합니다.

## 로컬 실행

```powershell
python -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다. 경로 기반 라우팅을 확인하려면 `http://localhost:4173/resources`, `http://localhost:4173/schedule`, `http://localhost:4173/questions`, `http://localhost:4173/members`, `http://localhost:4173/about`도 직접 열어 확인합니다. Firebase 설정이 없을 때는 로컬 주소에서만 개발용 인증이 활성화됩니다. 기본 관리자 계정은 `admin / 123123`이며 멤버 수정 UI를 확인할 수 있습니다. 로컬 미리보기 계정과 세션은 현재 브라우저 탭의 `sessionStorage`에만 저장되며, 배포 주소에서는 사용되지 않습니다.

## Firebase 연결

1. Firebase Console에서 Web App을 생성합니다.
2. Authentication에서 Email/Password provider를 활성화합니다.
3. Firestore Database를 생성합니다.
4. `scripts/firebase.js`의 `firebaseConfig` 값을 Firebase 콘솔의 웹 앱 설정값으로 채웁니다.

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Firebase 웹 API 키는 클라이언트에 포함될 수 있지만, 운영 배포 전에는 Firebase Console/Google Cloud Console에서 API key restriction, authorized domains, 사용량 한도, App Check 적용 여부를 검토하세요.

화면에서는 이메일이 아닌 아이디로 로그인합니다. Firebase Auth 내부에서는 아이디를 `<아이디>@ctrl-ai.local` 형식으로 변환합니다. 운영 환경의 `admin` 계정은 Firebase Authentication에 `admin@ctrl-ai.local`로 생성한 뒤 대응하는 `members/{uid}` 문서의 `role`을 `admin`, `status`를 `active`로 지정해야 합니다.

## Firestore 보안 규칙 배포

`firebase.json`이 `firestore.rules`를 가리키도록 추가되어 있습니다.

```powershell
firebase deploy --only firestore:rules
```

Vercel 배포는 Firestore Rules를 자동으로 배포하지 않습니다. 정적 사이트 배포와 별도로 위 명령을 실행해야 합니다.

## Firestore 컬렉션

### `resources`

로그인 사용자만 읽을 수 있습니다. 클라이언트에서는 `href`를 페이지 내부 앵커 형식으로 제한합니다. Firebase 미설정 상태에서는 샘플 자료로 대체하지 않고 빈 목록을 표시합니다.

```json
{
  "title": "회의록을 액션 아이템으로 바꾸는 프롬프트",
  "summary": "회의 메모에서 결정 사항, 담당자, 기한을 분리합니다.",
  "tag": "프롬프트",
  "owner": "전략기획팀",
  "date": "2026-06-17",
  "href": "#knowledge",
  "accent": "#b7ff4a"
}
```

### `sessions`

`/schedule` 화면은 카드 목록이 아니라 좌측 사이드바가 있는 일정 관리 화면과 월간 달력으로 표시됩니다. `/sessions`는 기존 링크 호환용으로 `/schedule`과 같은 화면을 렌더링합니다. 로그인 사용자는 일정 등록 dialog에서 날짜, 시작/종료 시간, 일정명, 목적, 내용, 장소, 분류를 입력해 Firestore에 저장할 수 있습니다.

```json
{
  "date": "2026-06-24",
  "startTime": "12:20",
  "endTime": "13:20",
  "title": "프롬프트 리뷰 클리닉",
  "purpose": "팀별 프롬프트 품질 기준을 맞춥니다.",
  "summary": "각자 쓰던 프롬프트를 가져와 함께 다듬습니다.",
  "tag": "회의",
  "location": "라운지 B",
  "owner": "홍길동",
  "ownerUid": "firebase-auth-uid",
  "status": "scheduled",
  "createdAt": "serverTimestamp"
}
```

### `questions`

질문 생성은 Firebase Auth 로그인 사용자만 가능합니다. 클라이언트는 `ownerUid`를 현재 사용자 UID로 저장하고, Firestore Rules도 `request.auth.uid`와 일치하는지 확인합니다.

```json
{
  "title": "고객 메일 답장 초안 톤을 일정하게 유지하려면?",
  "summary": "팀원별 표현 차이를 줄이는 템플릿을 찾고 있습니다.",
  "tag": "메일",
  "owner": "홍길동",
  "ownerUid": "firebase-auth-uid",
  "status": "open",
  "createdAt": "serverTimestamp"
}
```

### `members`

배포 환경에서는 Firebase Auth 계정을 먼저 생성한 뒤 가입 신청 정보를 저장합니다. 비밀번호와 비밀번호 해시는 Firestore나 앱의 localStorage에 저장하지 않습니다. Firebase 미설정 로컬 미리보기에서만 테스트 계정의 비밀번호 해시를 현재 탭의 sessionStorage에 보관합니다. 새 탭이나 브라우저 재시작 후에는 테스트 계정을 다시 만들어야 합니다.

```json
{
  "userUid": "firebase-auth-uid",
  "username": "honggildong",
  "name": "홍길동",
  "team": "기획팀",
  "email": "name@company.com",
  "interest": "업무 자동화",
  "message": "주간 보고서 초안 자동화를 해보고 싶습니다.",
  "status": "active",
  "role": "member",
  "createdAt": "serverTimestamp"
}
```

멤버 목록은 로그인 사용자에게 표시됩니다. 멤버 정보 수정은 `role`이 `admin`이고 `status`가 `active`인 사용자만 가능합니다. 운영 초기에 최초 관리자 권한을 부여하려면 Firebase Console에서 해당 사용자의 `members/{uid}` 문서를 찾아 아래처럼 변경하세요.

```json
{
  "role": "admin",
  "status": "active"
}
```

### `site/stats`

```json
{
  "members": 36
}
```

## 보완 내역

- 로그인 화면을 아이디 기반으로 구성하고, 로그인 폼 텍스트를 medium 굵기 중심으로 정리했습니다.
- 로컬 미리보기에서는 `admin / 123123` 기본 관리자 계정을 유지합니다.
- 로그인 후 멤버 목록 경로(`/members`)를 추가하고, admin 사용자에게 멤버 정보 수정 기능을 제공합니다.
- 자료/일정/질문/멤버 화면은 각각 `/resources`, `/schedule`, `/questions`, `/members` 경로에서 Firebase 데이터를 기준으로 렌더링하며, 샘플 fallback 데이터를 제거했습니다.
- `/schedule`은 좌측 사이드바와 월간 달력 UI로 표시하고, 로그인 사용자가 날짜/시간/일정명/목적/내용/장소/분류를 입력해 일정을 등록할 수 있습니다.
- 배포 환경에서는 Firebase Auth 기반 회원가입/로그인/로그아웃 흐름을 사용합니다. 로그인 후에는 `members/{uid}` 프로필을 읽어 이름과 팀 정보를 복원합니다.
- Firestore 읽기/질문 작성/가입 신청 작성을 인증 사용자 기준으로 제한했습니다.
- Vercel 보안 헤더에 CSP, Permissions-Policy, HSTS를 추가했습니다.
- 검색 입력의 접근 가능한 이름, 모바일 메뉴의 `aria-expanded`/`aria-controls`를 추가했습니다.
- `prefers-reduced-motion` 사용자는 히어로 캔버스 애니메이션이 반복 실행되지 않도록 수정했습니다.
- Firestore 데이터에서 렌더링되는 앵커와 accent 색상을 허용 패턴으로 제한했습니다.

## 경로 구조

기존 한 페이지 내부 탭 전환 대신 History API 기반 경로 렌더링을 사용합니다. 일정 메뉴는 `/schedule`을 기본 경로로 사용합니다. Vercel 새로고침 대응을 위해 `vercel.json`에 각 경로 rewrite를 추가했습니다.

| 경로 | 화면 | 인증 |
| --- | --- | --- |
| `/` | 홈/랜딩 | 필요 없음 |
| `/resources` | 자료실 | 로그인 필요 |
| `/schedule` | 일정 관리 | 로그인 필요 |
| `/sessions` | 일정 관리 legacy alias | 로그인 필요 |
| `/questions` | 질문 게시판 | 로그인 필요 |
| `/members` | 멤버 목록/관리 | 로그인 필요, 수정은 admin만 |
| `/about` | 소개 | 로그인 후 접근 가능 화면 내부 공개 페이지 |

직접 경로로 접속하거나 새로고침해도 Vercel에서는 `index.html`로 rewrite된 뒤 해당 경로 화면이 렌더링됩니다. 정적 파일을 더블클릭해서 여는 방식에서는 경로 라우팅을 검증할 수 없으므로 로컬 서버를 사용하세요.

## Vercel 배포

1. GitHub 저장소를 Vercel에 Import합니다.
2. Framework Preset은 `Other` 또는 자동 감지 그대로 둡니다.
3. Build Command와 Output Directory는 비워 둡니다.
4. `scripts/firebase.js`에 Firebase 설정값을 넣거나 배포 파이프라인에서 안전하게 주입합니다.
5. Vercel 배포 후 `firebase deploy --only firestore:rules`로 Firestore Rules를 별도 배포합니다.
6. 배포된 사이트에서 로그인, 회원가입, 질문 등록, 자료 조회, CSP 오류 여부를 확인합니다.

## 테스트

자동화 테스트 러너는 포함되어 있지 않습니다. 배포 전 확인 항목은 `TEST_PLAN.md`에 정리했습니다.
