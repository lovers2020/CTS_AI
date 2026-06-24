# Test Plan

## 자동 검증

- `npm run test:static`
- `npm run build`
- Firebase와 Vercel 설정 JSON 파싱

## 인증

- 로컬에서 `admin / 123123` 로그인 확인
- 신규 아이디 회원가입과 재로그인 확인
- 로그아웃 후 보호된 페이지가 인증 화면으로 돌아가는지 확인
- Firebase 설정 환경에서 Auth와 `members/{uid}` 문서 생성 확인

## 화면 및 기능

- `/resources`, `/schedule`, `/questions`, `/members`, `/about` 직접 접근 확인
- `/sessions`가 `/schedule` 화면으로 연결되는지 확인
- 캘린더 날짜 선택, 일정 등록, 질문 등록 확인
- 관리자 멤버 수정 권한 확인
- 360px, 768px, 1024px, 데스크톱 화면에서 겹침과 잘림 확인
