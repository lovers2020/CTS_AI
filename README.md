# Ctrl + AI

AI 활용법과 업무 적용 사례를 공유하는 사내 동호회 웹사이트입니다. React와 Vite로 구성되며 Firebase Auth와 Firestore를 사용합니다.

## 주요 기능

- 아이디 기반 로그인 및 회원가입
- 자료, 일정, 질문, 멤버, 동호회 소개 페이지
- 캘린더 날짜 선택 및 일정 등록
- 관리자 멤버 정보 수정
- Firebase 미설정 로컬 환경에서 미리보기 데이터 지원

## 로컬 실행

```bash
npm install
npm run dev
```

`http://127.0.0.1:4173`에서 확인할 수 있습니다. 로컬 미리보기 관리자 계정은 `admin / 123123`입니다. 이 계정은 배포 환경의 Firebase 계정을 대신하지 않습니다.

## Firebase 환경 변수

`.env.local` 파일에 다음 값을 설정합니다.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Firebase Auth의 실제 이메일은 입력한 아이디를 `{username}@ctrl-ai.local` 형식으로 변환해 사용합니다. 배포 환경의 관리자는 Firebase Console에서 해당 `members/{uid}` 문서에 `role: "admin"`, `status: "active"`를 설정합니다.

## 검증 및 배포

```bash
npm run test:static
npm run build
firebase deploy --only firestore:rules
```

Vercel은 `npm run build` 결과인 `dist`를 배포하며, `vercel.json`에서 SPA 경로를 처리합니다.
