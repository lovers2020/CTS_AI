import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createQuestion,
  createResource,
  createResourceComment,
  deleteQuestion,
  deleteQuestionComment,
  updateResource,
  createSession,
  fetchClubData,
  isAuthAvailable,
  isLocalPreviewAuth,
  signInMember,
  signOutMember,
  signUpMember,
  subscribeAuthState,
  updateMemberProfile,
  createQuestionComment,
  updateQuestion,
  updateQuestionComment,
} from "./lib/firebase.js";
import "./styles.css";

const emptyData = {
  resources: [],
  sessions: [],
  questions: [],
  members: [],
  stats: {}
};

const routes = {
  "/": "home",
  "/resources": "resources",
  "/schedule": "schedule",
  "/sessions": "schedule",
  "/questions": "questions",
  "/members": "members",
  "/about": "about"
};


const navItems = [
  { label: "자료", href: "/resources", view: "resources" },
  { label: "일정", href: "/schedule", view: "schedule" },
  { label: "질문", href: "/questions", view: "questions" },
  { label: "멤버", href: "/members", view: "members" },
  { label: "소개", href: "/about", view: "about" }
];

const scheduleCategories = ["회의", "외근/출장", "휴가", "재택 근무", "개인 일정", "기타"];
const interests = ["프롬프트", "업무 자동화", "문서/보고서", "이미지/콘텐츠", "데이터 분석"];

function pathnameToView() {
  return routes[window.location.pathname] || "home";
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "날짜 미정";
  if (typeof value.toDate === "function") return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(value.toDate());
  const valueString = String(value);
  const date = new Date(valueString.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return valueString;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

function formatSessionTime(item) {
  const date = item.date || "";
  const start = item.startTime || "";
  const end = item.endTime || "";
  if (date && start && end) return `${formatDate(date)} · ${start}–${end}`;
  return formatDate(date || item.createdAt);
}

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return new Date();
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatKoreanDate(value) {
  const date = parseDateKey(value);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

function parseTimeValue(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hour: 10, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatTimeValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatKoreanTime(value) {
  const { hour, minute } = parseTimeValue(value);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, "0")}`;
}

function useOutsideClose(ref, active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [active, onClose, ref]);
}

function getSessionDate(item) {
  const raw = item.date || item.createdAt;
  if (!raw) return null;
  if (typeof raw.toDate === "function") return raw.toDate();
  const date = new Date(String(raw).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInitial(user) {
  return String(user?.name || user?.username || "C").trim().slice(0, 1).toUpperCase();
}

function canManageItem(item, user) {
  return Boolean(user?.role === "admin" || (item?.ownerUid && item.ownerUid === user?.uid));
}

function Modal({ title, children, onClose, wide = false, className = "" }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cx("modal", wide && "modal-wide", className)} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <p className="section-kicker">Ctrl + AI</p>
          <h2 id="modal-title">{title}</h2>
          <button className="icon-pill" type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setStatus("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const user = await signInMember(form.get("username"), form.get("password"));
      onSignedIn(user);
    } catch (error) {
      setStatus(error.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setStatus("");
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) {
      setStatus("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      const result = await signUpMember(Object.fromEntries(form.entries()));
      onSignedIn(result.user);
    } catch (error) {
      setStatus(error.message || "가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Ctrl + AI 소개">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <p className="auth-badge">INTERNAL AI CLUB</p>
        <h1>AI를 도입하는 팀에서<br />AI로 일하는 팀으로.</h1>
        <p>자료, 일정, 질문, 멤버 운영까지 하나의 흐름으로 연결하는 사내 AI 실험실입니다.</p>
        <div className="auth-metrics">
          <span><b>Firebase</b> 단일 데이터</span>
          <span><b>React</b> 컴포넌트 UI</span>
          <span><b>Admin</b> 멤버 관리</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <p className="section-kicker">CTRL + AI</p>
        <h2 id="auth-title">{mode === "login" ? "계정 로그인" : "멤버 등록"}</h2>
        <p className="muted">아이디 기반으로 로그인하고 동호회 자료와 일정을 관리합니다.</p>
        {!isAuthAvailable && <div className="notice">Firebase 환경변수를 설정해야 로그인/회원가입이 동작합니다.</div>}
        {isLocalPreviewAuth && <div className="notice">로컬 관리자: admin / 123123</div>}

        {mode === "login" ? (
          <form className="stack-form" onSubmit={handleLogin}>
            <TextField name="username" label="아이디" placeholder="admin" pattern="[A-Za-z0-9._-]+" required />
            <TextField name="password" type="password" label="비밀번호" placeholder="6자 이상" required />
            <button className="primary-action" type="submit" disabled={loading || !isAuthAvailable}>로그인</button>
          </form>
        ) : (
          <form className="stack-form" onSubmit={handleSignup}>
            <div className="form-grid two">
              <TextField name="username" label="아이디" placeholder="영문/숫자" pattern="[A-Za-z0-9._-]+" minLength={3} maxLength={24} required />
              <TextField name="name" label="이름" placeholder="홍길동" required />
              <TextField name="team" label="부서/팀" placeholder="품질경영팀" required />
              <TextField name="email" type="email" label="회사 메일" placeholder="name@company.com" required />
              <SelectField name="interest" label="관심 분야" options={interests} required />
              <TextField name="password" type="password" label="비밀번호" placeholder="6자 이상" minLength={6} required />
              <TextField name="confirmPassword" type="password" label="비밀번호 확인" placeholder="다시 입력" minLength={6} required />
            </div>
            <TextArea name="message" label="함께 해보고 싶은 AI 활용" placeholder="예: 주간 보고서 초안 자동화" maxLength={160} />
            <button className="primary-action" type="submit" disabled={loading || !isAuthAvailable}>가입하기</button>
          </form>
        )}

        {status && <p className="form-status" role="status">{status}</p>}
        <button className="text-link" type="button" onClick={() => { setStatus(""); setMode(mode === "login" ? "signup" : "login"); }}>
          {mode === "login" ? "계정이 없으면 회원가입" : "이미 계정이 있으면 로그인"}
        </button>
      </section>
    </main>
  );
}

function TextField({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label className="field full">
      <span>{label}</span>
      <textarea {...props} />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>
        <option value="">선택</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Shell({ user, view, data, loading, error, onNavigate, onLogout, onRefresh, onCreateResource, onUpdateResource, onCreateResourceComment, onCreateSession, onCreateQuestion, onUpdateQuestion, onDeleteQuestion, onCreateComment, onUpdateComment, onDeleteComment, onUpdateMember }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [memberToEdit, setMemberToEdit] = useState(null);

  return (
    <div className="app-shell">
      <Header user={user} view={view} menuOpen={menuOpen} onMenu={() => setMenuOpen(!menuOpen)} onNavigate={(path) => { setMenuOpen(false); onNavigate(path); }} onLogout={onLogout} />
      <main className="page-frame">
        {error && <div className="notice error">{error}</div>}
        {view === "home" && <Home data={data} onNavigate={onNavigate} />}
        {view === "resources" && <ResourcesPage resources={data.resources} loading={loading} user={user} onRegister={() => setResourceOpen(true)} onUpdate={onUpdateResource} onComment={onCreateResourceComment} />}
        {view === "schedule" && <SchedulePage sessions={data.sessions} loading={loading} onDateClick={setSessionDate} onOpen={() => setSessionDate(dateKey(new Date()))} />}
        {view === "questions" && <QuestionsPage questions={data.questions} loading={loading} onAsk={() => setQuestionOpen(true)} onSelect={setSelectedQuestion} />}
        {view === "members" && <MembersPage members={data.members} loading={loading} user={user} onEdit={setMemberToEdit} />}
        {view === "about" && <AboutPage />}
      </main>
      <Footer />
      {resourceOpen && <ResourceModal onClose={() => setResourceOpen(false)} onSubmit={async (payload, file) => { await onCreateResource(payload, file); setResourceOpen(false); onRefresh(); }} />}
      {sessionDate && <SessionModal date={sessionDate} user={user} onClose={() => setSessionDate(null)} onSubmit={async (payload) => { await onCreateSession(payload); setSessionDate(null); onRefresh(); }} />}
      {questionOpen && <QuestionModal onClose={() => setQuestionOpen(false)} onSubmit={async (payload) => { await onCreateQuestion(payload); setQuestionOpen(false); onRefresh(); }} />}
      {selectedQuestion && <QuestionDetailModal
        question={selectedQuestion}
        user={user}
        onClose={() => setSelectedQuestion(null)}
        onSubmit={async (payload) => {
          const questionId = selectedQuestion.id;
          const created = await onCreateComment(questionId, payload);
          setSelectedQuestion((current) => current && current.id === questionId
            ? { ...current, comments: [...(current.comments || []), created] }
            : current);
        }}
        onUpdateQuestion={async (payload) => {
          const questionId = selectedQuestion.id;
          const updated = await onUpdateQuestion(questionId, payload);
          setSelectedQuestion((current) => current && current.id === questionId ? { ...current, ...updated } : current);
        }}
        onDeleteQuestion={async () => {
          const questionId = selectedQuestion.id;
          await onDeleteQuestion(questionId, selectedQuestion);
          setSelectedQuestion(null);
        }}
        onUpdateComment={async (commentId, payload) => {
          const questionId = selectedQuestion.id;
          const updated = await onUpdateComment(questionId, commentId, payload);
          setSelectedQuestion((current) => current && current.id === questionId
            ? { ...current, comments: (current.comments || []).map((comment) => comment.id === commentId ? updated : comment) }
            : current);
        }}
        onDeleteComment={async (commentId, comment) => {
          const questionId = selectedQuestion.id;
          await onDeleteComment(questionId, commentId, comment);
          setSelectedQuestion((current) => current && current.id === questionId
            ? { ...current, comments: (current.comments || []).filter((item) => item.id !== commentId) }
            : current);
        }}
      />}
      {memberToEdit && <MemberModal member={memberToEdit} onClose={() => setMemberToEdit(null)} onSubmit={async (payload) => { await onUpdateMember(memberToEdit.id, payload); setMemberToEdit(null); onRefresh(); }} />}
    </div>
  );
}

function Header({ user, view, menuOpen, onMenu, onNavigate, onLogout }) {
  return (
    <header className="site-header">
      <button className="brand" type="button" onClick={() => onNavigate("/")}>
        <span className="brand-mark">⌘</span>
        <span>Ctrl + AI</span>
      </button>
      <nav className={cx("site-nav", menuOpen && "open")} aria-label="주요 메뉴">
        {navItems.map((item) => (
          <button key={item.href} className={cx(view === item.view && "active")} type="button" onClick={() => onNavigate(item.href)}>{item.label}</button>
        ))}
      </nav>
      <div className="header-actions">
        <div className="user-chip">
          <span>{getInitial(user)}</span>
          <b>{user.name}</b>
        </div>
        <button className="ghost-action" type="button" onClick={onLogout}>로그아웃</button>
        <button className="menu-button" type="button" aria-expanded={menuOpen} aria-label="메뉴" onClick={onMenu}><i /><i /></button>
      </div>
    </header>
  );
}

function Home({ data, onNavigate }) {
  const nextSession = data.sessions[0];
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy-block">
          <p className="section-kicker">WORK SYSTEM FOR AI NATIVE TEAMS</p>
          <h1>Build practical AI habits inside your company.</h1>
          <p>Ctrl + AI는 사내에서 검증한 프롬프트, 일정, 질문, 멤버 운영을 하나의 아름다운 작업 흐름으로 연결합니다.</p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={() => onNavigate("/resources")}>자료 보기</button>
            <button className="soft-action schedule-cta" type="button" onClick={() => onNavigate("/schedule")}>일정 열기<span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div className="hero-stack" aria-label="서비스 요약">
          <button className="stack-card lime nav-card" type="button" onClick={() => onNavigate("/resources")} aria-label="자료 화면으로 이동">
            <span>01</span><b>Knowledge</b><p>업무에 검증된 AI 자료를 축적합니다.</p>
          </button>
          <button className="stack-card blue nav-card" type="button" onClick={() => onNavigate("/schedule")} aria-label="일정 화면으로 이동">
            <span>02</span><b>Schedule</b><p>{nextSession ? `${nextSession.title} · ${formatSessionTime(nextSession)}` : "Firebase 일정이 여기에 표시됩니다."}</p>
          </button>
          <button className="stack-card cream nav-card" type="button" onClick={() => onNavigate("/members")} aria-label="멤버 화면으로 이동">
            <span>03</span><b>Community</b><p>{data.members.length}명의 멤버가 함께 실험 중입니다.</p>
          </button>
        </div>
      </section>
      <section className="bento-grid">
        <FeatureCard kicker="Resources" title="자료를 구조화" copy="태그, 담당자, 날짜 기준으로 실무 자료를 빠르게 탐색합니다." onClick={() => onNavigate("/resources")} />
        <FeatureCard kicker="Calendar" title="일정을 클릭해서 등록" copy="월간 달력에서 날짜를 누르면 바로 일정 등록 모달이 열립니다." onClick={() => onNavigate("/schedule")} />
        <FeatureCard kicker="Questions" title="질문과 답변 흐름" copy="업무 적용 중 막힌 지점을 질문으로 남기고 함께 해결합니다." onClick={() => onNavigate("/questions")} />
      </section>
    </>
  );
}

function FeatureCard({ kicker, title, copy, onClick }) {
  return (
    <button className="feature-card nav-card" type="button" onClick={onClick}>
      <p>{kicker}</p>
      <h3>{title}</h3>
      <span>{copy}</span>
    </button>
  );
}

function PageHero({ kicker, title, copy, action }) {
  return (
    <section className="page-hero">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </section>
  );
}

function ResourcesPage({ resources, loading, user, onRegister, onUpdate, onComment }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return resources;
    return resources.filter((item) => [item.title, item.summary, item.body, item.tag, item.owner].join(" ").toLowerCase().includes(needle));
  }, [resources, query]);

  useEffect(() => {
    if (filtered.length === 0) { if (selectedId) setSelectedId(""); return; }
    if (!filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const myPages = filtered.filter((item) => item.ownerUid === user.uid);
  const sharedPages = filtered.filter((item) => item.ownerUid !== user.uid);

  return (
    <section className="notion-resource-page">
      <aside className="notion-sidebar">
        <div className="notion-sidebar-head"><b>개인 페이지</b><button className="mini-icon-action" type="button" onClick={onRegister}>＋</button></div>
        <label className="notion-search"><span className="sr-only">자료 검색</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="자료 검색" /></label>
        <div className="notion-page-list">
          {loading && <Skeleton count={3} />}
          {!loading && myPages.length === 0 && <p className="notion-empty-line">내가 작성한 자료가 없습니다.</p>}
          {!loading && myPages.map((item) => <button key={item.id} type="button" className={cx("notion-page-link", selected?.id === item.id && "active")} onClick={() => setSelectedId(item.id)}><span>▤</span><b>{item.title || "제목 없는 페이지"}</b></button>)}
        </div>
        <button className="notion-add-page" type="button" onClick={onRegister}>＋ 새 페이지 추가</button>
        <div className="notion-divider" />
        <div className="notion-sidebar-head"><b>팀 공유 문서</b><span>{sharedPages.length}</span></div>
        <div className="notion-folder">⌄ 2026</div>
        <div className="notion-page-list shared">
          {!loading && sharedPages.map((item) => <button key={item.id} type="button" className={cx("notion-page-link", selected?.id === item.id && "active")} onClick={() => setSelectedId(item.id)}><span>□</span><b>{item.title || "제목 없는 페이지"}</b></button>)}
        </div>
      </aside>
      <ResourceDocumentEditor resource={selected} loading={loading} user={user} onRegister={onRegister} onUpdate={onUpdate} onComment={onComment} />
    </section>
  );
}

function safeResourceUrl(item) {
  const fileUrl = String(item?.fileUrl || "").trim();
  if (/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(fileUrl)) return fileUrl;
  const href = String(item?.href || "").trim();
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return href;
  return "";
}

function ResourceDocumentEditor({ resource, loading, user, onRegister, onUpdate, onComment }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", tag: "자료", body: "" });
  const [file, setFile] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileUrl = safeResourceUrl(resource);
  const comments = Array.isArray(resource?.comments) ? resource.comments : [];
  const canEdit = canManageItem(resource, user);

  useEffect(() => {
    setEditing(false); setFile(null); setStatus(""); setCommentBody("");
    setDraft({ title: resource?.title || "", tag: resource?.tag || "자료", body: resource?.body || resource?.summary || "" });
  }, [resource?.id]);

  if (loading) return <main className="notion-document"><Skeleton count={4} /></main>;
  if (!resource) return <main className="notion-document empty-doc"><div className="doc-empty-state"><span>▤</span><h1>자료가 없습니다</h1><p>새 페이지를 만들고 파일을 첨부해 팀 자료를 축적하세요.</p><button className="primary-action" type="button" onClick={onRegister}>새 페이지 만들기</button></div></main>;

  async function saveEdit() {
    setStatus(""); setBusy(true);
    try { await onUpdate(resource.id, draft, file); setEditing(false); setFile(null); setStatus("자료가 수정되었습니다."); }
    catch (e) { setStatus(e.message || "자료 수정에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function submitComment() {
    const body = commentBody.trim();
    if (!body) { setStatus("댓글 내용을 입력해 주세요."); return; }
    setStatus(""); setBusy(true);
    try { await onComment(resource.id, { body }); setCommentBody(""); setStatus("댓글이 등록되었습니다."); }
    catch (e) { setStatus(e.message || "댓글 등록에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <main className="notion-document">
      <div className="notion-doc-toolbar"><div className="notion-breadcrumb"><span>□ Personal</span><i>›</i><b>{resource.title || "제목 없는 페이지"}</b></div><div className="notion-doc-actions">{fileUrl && <a className="mini-action" href={fileUrl} target="_blank" rel="noreferrer">첨부 열기</a>}{canEdit && !editing && <button className="mini-action" type="button" onClick={() => setEditing(true)}>수정</button>}</div></div>
      <article className="notion-doc-body">
        <div className="notion-doc-icon">▤</div>
        {!editing ? <>
          <h1>{resource.title || "제목 없는 페이지"}</h1>
          <div className="notion-meta"><span>♙ {resource.owner || "Ctrl + AI"}</span><span>최종 수정: {formatDate(resource.updatedAt || resource.createdAt)}</span><span>{resource.tag || "자료"}</span></div>
          <div className="notion-rule" />
          <div className="notion-content-text">{resource.body || resource.summary || "여기에 내용을 입력하세요..."}</div>
          {resource.fileName && <div className="notion-attachment"><span>📎</span><div><b>{resource.fileName}</b><small>{resource.fileType || "첨부 파일"}{resource.fileSize ? ` · ${Math.ceil(resource.fileSize / 1024)}KB` : ""}</small></div>{fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer">열기</a>}</div>}
        </> : <div className="notion-edit-panel">
          <div className="form-grid two compact"><TextField label="제목" value={draft.title} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} maxLength={80} required /><TextField label="분류" value={draft.tag} onChange={(e) => setDraft((c) => ({ ...c, tag: e.target.value }))} maxLength={24} required /></div>
          <TextArea label="본문" value={draft.body} onChange={(e) => setDraft((c) => ({ ...c, body: e.target.value }))} placeholder="여기에 내용을 입력하세요..." maxLength={10000} />
          <ResourceFileDrop file={file} setFile={setFile} existingFileName={resource.fileName} />
          <div className="edit-actions"><button className="soft-action" type="button" onClick={() => setEditing(false)}>취소</button><button className="primary-action" type="button" onClick={saveEdit} disabled={busy}>{busy ? "저장 중..." : "수정 저장"}</button></div>
        </div>}
      </article>
      <section className="resource-comments"><div className="comment-head"><h3>댓글 {comments.length}</h3><p>자료에 대한 의견과 참고 링크를 남겨주세요.</p></div><div className="resource-comment-list">{comments.length === 0 && <Empty message="아직 댓글이 없습니다." />}{comments.map((comment) => <article className="resource-comment" key={comment.id}><b>{comment.owner || "멤버"}</b><p>{comment.body}</p><time>{formatDate(comment.createdAt)}</time></article>)}</div><div className="resource-comment-form"><textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="댓글을 입력하세요." maxLength={400} /><button className="primary-action" type="button" onClick={submitComment} disabled={busy}>{busy ? "등록 중..." : "댓글 등록"}</button></div>{status && <p className="form-status" role="status">{status}</p>}</section>
    </main>
  );
}

function ResourceFileDrop({ file, setFile, existingFileName }) {
  const inputRef = useRef(null);
  return <div className="resource-file-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const next = e.dataTransfer.files?.[0]; if (next) setFile(next); }}><button type="button" onClick={() => inputRef.current?.click()}><span>＋</span><b>{file ? file.name : existingFileName ? `현재 첨부: ${existingFileName}` : "파일 첨부"}</b><small>클릭 또는 드래그 앤드롭</small></button><input ref={inputRef} type="file" className="hidden-file-input" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>;
}

function SchedulePage({ sessions, loading, onDateClick, onOpen }) {
  const [cursor, setCursor] = useState(() => new Date());
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(monthStart);
  const monthSessions = sessions.filter((item) => {
    const date = getSessionDate(item);
    return date && date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth();
  });

  return (
    <>
      <PageHero
        kicker="Calendar"
        title="일정"
        copy="날짜를 클릭해 일정 등록을 시작하고, 이번 달 일정을 카드로 확인합니다."
        action={<button className="primary-action" type="button" onClick={onOpen}>일정 등록</button>}
      />
      <section className="schedule-layout">
        <div className="calendar-panel">
          <div className="calendar-head">
            <h2>{monthLabel}</h2>
            <div className="calendar-nav">
              <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>이전</button>
              <button type="button" onClick={() => setCursor(new Date())}>오늘</button>
              <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>다음</button>
            </div>
          </div>
          <CalendarGrid cursor={cursor} sessions={sessions} onDateClick={onDateClick} />
        </div>
        <aside className="agenda-panel">
          <div className="agenda-summary">
            <span>{monthSessions.length}</span>
            <p>이번 달 등록 일정</p>
          </div>
          <div className="agenda-list">
            {loading && <Skeleton count={4} />}
            {!loading && monthSessions.length === 0 && <Empty message="이번 달 일정이 없습니다." />}
            {!loading && monthSessions.map((item) => <ScheduleItem key={item.id} item={item} />)}
          </div>
        </aside>
      </section>
    </>
  );
}

function CalendarGrid({ cursor, sessions, onDateClick }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 35 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const byDay = useMemo(() => {
    const map = new Map();
    sessions.forEach((item) => {
      if (!item.date) return;
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    });
    return map;
  }, [sessions]);

  return (
    <div className="calendar-grid">
      {["일", "월", "화", "수", "목", "금", "토"].map((day) => <strong key={day}>{day}</strong>)}
      {days.map((day) => {
        const key = dateKey(day);
        const isCurrentMonth = day.getMonth() === month;
        const events = byDay.get(key) || [];
        return (
          <button key={key} type="button" className={cx("date-cell", !isCurrentMonth && "muted-day", events.length && "has-event")} onClick={() => onDateClick(key)}>
            <span>{day.getDate()}</span>
            {events.slice(0, 2).map((item) => <i key={item.id}><b>{item.title}</b><small>{item.owner || "등록자 미상"}</small></i>)}
            {events.length > 2 && <em>+{events.length - 2}</em>}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleItem({ item }) {
  return (
    <article className="agenda-card">
      <span>{item.tag || "일정"}</span>
      <h3>{item.title}</h3>
      <p>{item.purpose || item.summary}</p>
      <small>{formatSessionTime(item)}{item.location ? ` · ${item.location}` : ""} · 등록: {item.owner || "등록자 미상"}</small>
    </article>
  );
}

function QuestionsPage({ questions, loading, onAsk, onSelect }) {
  return (
    <>
      <PageHero kicker="Questions" title="질문 보드" copy="질문을 클릭해 상세 내용을 확인하고 댓글로 답변을 남깁니다." action={<button className="primary-action" type="button" onClick={onAsk}>질문 등록</button>} />
      <CardGrid loading={loading} empty="등록된 질문이 없습니다.">
        {questions.map((item) => <QuestionCard key={item.id} item={item} onSelect={onSelect} />)}
      </CardGrid>
    </>
  );
}

function QuestionCard({ item, onSelect }) {
  const commentCount = Array.isArray(item.comments) ? item.comments.length : 0;
  return (
    <button className="question-card" type="button" onClick={() => onSelect(item)}>
      <div className="card-topline"><span>{item.tag || "질문"}</span><time>{formatDate(item.createdAt)}</time></div>
      <h3>{item.title || "제목 없음"}</h3>
      <p>{item.summary || "질문 내용이 없습니다."}</p>
      <div className="question-meta"><b>{item.owner || "Ctrl + AI 멤버"}</b><span>댓글 {commentCount}</span></div>
    </button>
  );
}

function MembersPage({ members, loading, user, onEdit }) {
  return (
    <>
      <PageHero kicker="Members" title="멤버" copy="Firebase members 컬렉션 기준으로 동호회 멤버를 표시합니다." />
      <div className="member-grid">
        {loading && <Skeleton count={6} />}
        {!loading && members.length === 0 && <Empty message="등록된 멤버가 없습니다." />}
        {!loading && members.map((member) => (
          <article className="member-card" key={member.id}>
            <div className="member-avatar">{String(member.name || member.username || "C").slice(0, 1)}</div>
            <div><h3>{member.name || member.username}</h3><p>{member.team || "팀 정보 없음"}</p></div>
            <span>{member.interest || "AI"}</span>
            {user.role === "admin" && <button className="soft-action" type="button" onClick={() => onEdit(member)}>수정</button>}
          </article>
        ))}
      </div>
    </>
  );
}

function AboutPage() {
  return (
    <section className="about-page">
      <p className="section-kicker">About</p>
      <h1>AI를 쓰는 방식을 팀의 자산으로 만듭니다.</h1>
      <div className="about-columns">
        <p>Ctrl + AI는 사내 구성원이 직접 검증한 프롬프트, 자동화 흐름, 실패 사례를 모아 실무 재사용성을 높이는 동호회입니다.</p>
        <p>새 버전은 React 컴포넌트 중심으로 구성되어 페이지, 달력, 멤버 관리, 질문 등록 흐름을 명확하게 분리했습니다.</p>
      </div>
    </section>
  );
}

function CardGrid({ children, loading, empty }) {
  const content = React.Children.toArray(children);
  if (loading) return <div className="card-grid"><Skeleton count={6} /></div>;
  if (content.length === 0) return <Empty message={empty} />;
  return <div className="card-grid">{content}</div>;
}

function Skeleton({ count = 3 }) {
  return Array.from({ length: count }, (_, index) => <div className="skeleton" key={index} />);
}

function Empty({ message }) {
  return <div className="empty-state"><span>∅</span><p>{message}</p></div>;
}

function SessionModal({ date, onClose, onSubmit }) {
  const [status, setStatus] = useState("");
  const [selectedDate, setSelectedDate] = useState(date || dateKey(new Date()));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");

  async function submit(event) {
    event.preventDefault();
    setStatus("");
    try {
      await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
    } catch (error) {
      setStatus(error.message || "일정 등록에 실패했습니다.");
    }
  }

  return (
    <Modal title="일정 등록" onClose={onClose} wide className="schedule-modal">
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid two">
          <DatePickerField name="date" label="날짜" value={selectedDate} onChange={setSelectedDate} required />
          <TextField name="location" label="장소" placeholder="회의실 A" maxLength={40} />
          <TimePickerField name="startTime" label="시작 시간" value={startTime} onChange={setStartTime} required />
          <TimePickerField name="endTime" label="종료 시간" value={endTime} onChange={setEndTime} required />
          <TextField name="title" label="일정명" placeholder="AI 실습 세션" maxLength={70} required />
          <SelectField name="tag" label="분류" options={scheduleCategories} required />
        </div>
        <TextField name="purpose" label="목적" placeholder="선택 입력" maxLength={100} />
        <TextArea name="summary" label="상세 내용" placeholder="준비물, 진행 방식, 공유할 내용을 입력하세요. 선택 입력입니다." maxLength={220} />
        <button className="primary-action" type="submit">저장</button>
        {status && <p className="form-status" role="status">{status}</p>}
      </form>
    </Modal>
  );
}

function DatePickerField({ name, label, value, onChange, required }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseDateKey(value));
  const ref = useRef(null);
  useOutsideClose(ref, open, () => setOpen(false));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const labelId = `${name}-label`;

  function selectDate(nextDate) {
    const nextValue = dateKey(nextDate);
    onChange(nextValue);
    setCursor(nextDate);
    setOpen(false);
  }

  return (
    <div className={cx("field picker-field", open && "picker-field-open")} ref={ref}>
      <span id={labelId}>{label}{required && <em aria-hidden="true"> *</em>}</span>
      <input type="hidden" name={name} value={value} readOnly />
      <div
        className={cx("picker-shell", open && "open")}
        onMouseDown={(event) => {
          if (event.target.closest(".picker-popover")) return;
          event.preventDefault();
          setOpen(true);
        }}
        onClick={(event) => {
          if (event.target.closest(".picker-popover")) return;
          setOpen(true);
        }}
      >
        <button
          className="picker-trigger"
          type="button"
          aria-labelledby={labelId}
          aria-expanded={open}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <b>{formatKoreanDate(value)}</b>
          <small>날짜 선택</small>
        </button>
        {open && (
          <div className="picker-popover date-popover" role="dialog" aria-label="날짜 선택" onClick={(event) => event.stopPropagation()}>
            <div className="picker-titlebar">
              <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="이전 달">‹</button>
              <strong>{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(cursor)}</strong>
              <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="다음 달">›</button>
            </div>
            <div className="mini-calendar">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}
              {days.map((day) => {
                const key = dateKey(day);
                return (
                  <button
                    key={key}
                    type="button"
                    className={cx(day.getMonth() !== month && "outside", key === value && "selected", key === dateKey(new Date()) && "today")}
                    onClick={() => selectDate(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="picker-actions">
              <button type="button" onClick={() => selectDate(new Date())}>오늘</button>
              <button type="button" onClick={() => setOpen(false)}>닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimePickerField({ name, label, value, onChange, required }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, open, () => setOpen(false));
  const parsed = parseTimeValue(value);
  const period = parsed.hour < 12 ? "AM" : "PM";
  const hour12 = parsed.hour % 12 || 12;
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  const labelId = `${name}-label`;

  function updateTime(nextPeriod = period, nextHour = hour12, nextMinute = parsed.minute) {
    const normalizedHour = Number(nextHour);
    let hour24 = nextPeriod === "AM" ? normalizedHour % 12 : normalizedHour % 12 + 12;
    if (nextPeriod === "AM" && normalizedHour === 12) hour24 = 0;
    if (nextPeriod === "PM" && normalizedHour === 12) hour24 = 12;
    onChange(formatTimeValue(hour24, Number(nextMinute)));
  }

  return (
    <div className={cx("field picker-field", open && "picker-field-open")} ref={ref}>
      <span id={labelId}>{label}{required && <em aria-hidden="true"> *</em>}</span>
      <input type="hidden" name={name} value={value} readOnly />
      <div
        className={cx("picker-shell", open && "open")}
        onMouseDown={(event) => {
          if (event.target.closest(".picker-popover")) return;
          event.preventDefault();
          setOpen(true);
        }}
        onClick={(event) => {
          if (event.target.closest(".picker-popover")) return;
          setOpen(true);
        }}
      >
        <button
          className="picker-trigger"
          type="button"
          aria-labelledby={labelId}
          aria-expanded={open}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <b>{formatKoreanTime(value)}</b>
          <small>시간 선택</small>
        </button>
        {open && (
          <div className="picker-popover time-popover" role="dialog" aria-label={`${label} 선택`} onClick={(event) => event.stopPropagation()}>
            <div className="time-preview">
              <span>{label}</span>
              <strong>{formatKoreanTime(value)}</strong>
            </div>
            <div className="period-toggle" role="group" aria-label="오전 오후">
              <button type="button" className={cx(period === "AM" && "selected")} onClick={() => updateTime("AM")}>오전</button>
              <button type="button" className={cx(period === "PM" && "selected")} onClick={() => updateTime("PM")}>오후</button>
            </div>
            <div className="time-picker-columns">
              <div>
                <span>시</span>
                <div className="time-chip-grid hours">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                    <button key={hour} type="button" className={cx(hour === hour12 && "selected")} onClick={() => updateTime(period, hour, parsed.minute)}>{hour}</button>
                  ))}
                </div>
              </div>
              <div>
                <span>분</span>
                <div className="time-chip-grid minutes">
                  {minutes.map((minute) => (
                    <button key={minute} type="button" className={cx(minute === parsed.minute && "selected")} onClick={() => updateTime(period, hour12, minute)}>{String(minute).padStart(2, "0")}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="picker-actions">
              <button type="button" onClick={() => onChange("09:00")}>09:00</button>
              <button type="button" onClick={() => onChange("13:00")}>13:00</button>
              <button type="button" onClick={() => setOpen(false)}>완료</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceModal({ onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setStatus("");
    setFile(nextFile);
  }

  function openFileDialog() {
    fileInputRef.current?.click();
  }

  function handleDrop(event) {
    event.preventDefault();
    const nextFile = event.dataTransfer.files?.[0] || null;
    if (nextFile) setFile(nextFile);
  }

  async function submit(event) {
    event.preventDefault();
    setStatus("");
    setUploading(true);
    try {
      const form = new FormData(event.currentTarget);
      await onSubmit(Object.fromEntries(form.entries()), file);
    } catch (error) {
      setStatus(error.message || "자료 등록에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="자료 등록" onClose={onClose} wide>
      <form className="stack-form resource-form" onSubmit={submit}>
        <button
          className="notion-upload"
          type="button"
          onClick={openFileDialog}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <span className="upload-icon">＋</span>
          <strong>{file ? file.name : "파일을 첨부하거나 클릭해서 업로드"}</strong>
          <small>{file ? `${Math.ceil(file.size / 1024)}KB · ${file.type || "파일"}` : "PDF, 이미지, 문서 등 20MB 이하 파일을 자료에 연결합니다."}</small>
        </button>
        <input ref={fileInputRef} className="hidden-file-input" type="file" onChange={handleFileChange} />
        <div className="form-grid two">
          <TextField name="title" label="자료명" placeholder="AI 보고서 프롬프트 모음" maxLength={80} required />
          <TextField name="tag" label="분류" placeholder="프롬프트" maxLength={24} required />
        </div>
        <TextArea name="body" label="본문" placeholder="여기에 내용을 입력하세요. 파일 첨부도 가능합니다." maxLength={10000} />
        <button className="primary-action" type="submit" disabled={uploading}>{uploading ? "등록 중..." : "자료 등록"}</button>
        {status && <p className="form-status" role="status">{status}</p>}
      </form>
    </Modal>
  );
}

function QuestionModal({ onClose, onSubmit }) {
  const [status, setStatus] = useState("");
  async function submit(event) {
    event.preventDefault();
    setStatus("");
    try {
      await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
    } catch (error) {
      setStatus(error.message || "질문 등록에 실패했습니다.");
    }
  }
  return (
    <Modal title="질문 등록" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <TextField name="title" label="질문 제목" maxLength={70} required />
        <TextField name="tag" label="태그" defaultValue="질문" maxLength={20} required />
        <TextArea name="summary" label="질문 내용" maxLength={180} required />
        <button className="primary-action" type="submit">등록</button>
        {status && <p className="form-status" role="status">{status}</p>}
      </form>
    </Modal>
  );
}

function QuestionDetailModal({ question, user, onClose, onSubmit, onUpdateQuestion, onDeleteQuestion, onUpdateComment, onDeleteComment }) {
  const [status, setStatus] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionDraft, setQuestionDraft] = useState(() => ({
    title: question.title || "",
    tag: question.tag || "질문",
    summary: question.summary || ""
  }));
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const comments = Array.isArray(question.comments) ? question.comments : [];
  const canManageQuestion = canManageItem(question, user);

  useEffect(() => {
    setQuestionDraft({
      title: question.title || "",
      tag: question.tag || "질문",
      summary: question.summary || ""
    });
  }, [question.id, question.title, question.tag, question.summary]);

  async function submitComment() {
    const body = commentBody.trim();
    if (!body) {
      setStatus("댓글 내용을 입력해 주세요.");
      return;
    }

    setStatus("");
    setSubmitting(true);
    try {
      await onSubmit({ body });
      setCommentBody("");
      setStatus("댓글이 등록되었습니다.");
    } catch (error) {
      const message = error?.message || "댓글 등록에 실패했습니다.";
      setStatus(message.includes("reset") ? "댓글 등록 중 입력창 초기화 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요." : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveQuestionEdit() {
    setStatus("");
    setActionBusy(true);
    try {
      await onUpdateQuestion(questionDraft);
      setEditingQuestion(false);
      setStatus("게시글이 수정되었습니다.");
    } catch (error) {
      setStatus(error.message || "게시글 수정에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  async function removeQuestion() {
    if (!window.confirm("게시글과 댓글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.")) return;
    setStatus("");
    setActionBusy(true);
    try {
      await onDeleteQuestion();
    } catch (error) {
      setStatus(error.message || "게시글 삭제에 실패했습니다.");
      setActionBusy(false);
    }
  }

  function beginCommentEdit(comment) {
    setStatus("");
    setEditingCommentId(comment.id);
    setCommentDraft(comment.body || "");
  }

  async function saveCommentEdit(commentId) {
    const body = commentDraft.trim();
    if (!body) {
      setStatus("댓글 내용을 입력해 주세요.");
      return;
    }
    setStatus("");
    setActionBusy(true);
    try {
      await onUpdateComment(commentId, { body });
      setEditingCommentId(null);
      setCommentDraft("");
      setStatus("댓글이 수정되었습니다.");
    } catch (error) {
      setStatus(error.message || "댓글 수정에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  async function removeComment(comment) {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    setStatus("");
    setActionBusy(true);
    try {
      await onDeleteComment(comment.id, comment);
      setStatus("댓글이 삭제되었습니다.");
    } catch (error) {
      setStatus(error.message || "댓글 삭제에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <Modal title="질문 상세" onClose={onClose} wide className="question-thread-modal">
      <div className="question-thread">
        <article className="question-detail">
          {!editingQuestion ? (
            <>
              <div className="card-topline"><span>{question.tag || "질문"}</span><time>{formatDate(question.createdAt)}</time></div>
              <h3>{question.title || "제목 없음"}</h3>
              <p>{question.summary || "질문 내용이 없습니다."}</p>
              <div className="content-meta-row">
                <small>작성자: {question.owner || "Ctrl + AI 멤버"}{question.updatedAt ? " · 수정됨" : ""}</small>
                {canManageQuestion && (
                  <div className="inline-actions" aria-label="게시글 관리">
                    <button className="mini-action" type="button" onClick={() => setEditingQuestion(true)} disabled={actionBusy}>수정</button>
                    <button className="mini-action danger" type="button" onClick={removeQuestion} disabled={actionBusy}>삭제</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="edit-panel">
              <div className="form-grid two compact">
                <TextField label="질문 제목" value={questionDraft.title} onChange={(event) => setQuestionDraft((current) => ({ ...current, title: event.target.value }))} maxLength={70} required />
                <TextField label="태그" value={questionDraft.tag} onChange={(event) => setQuestionDraft((current) => ({ ...current, tag: event.target.value }))} maxLength={20} required />
              </div>
              <TextArea label="질문 내용" value={questionDraft.summary} onChange={(event) => setQuestionDraft((current) => ({ ...current, summary: event.target.value }))} maxLength={180} required />
              <div className="edit-actions">
                <button className="soft-action" type="button" onClick={() => { setEditingQuestion(false); setQuestionDraft({ title: question.title || "", tag: question.tag || "질문", summary: question.summary || "" }); }} disabled={actionBusy}>취소</button>
                <button className="primary-action compact" type="button" onClick={saveQuestionEdit} disabled={actionBusy}>{actionBusy ? "저장 중..." : "게시글 저장"}</button>
              </div>
            </div>
          )}
        </article>
        <section className="comment-section" aria-label="댓글">
          <div className="comment-head">
            <div>
              <h3>댓글 {comments.length}</h3>
              <p>질문에 대한 답변이나 참고 링크를 남겨주세요.</p>
            </div>
          </div>
          <div className="comment-list">
            {comments.length === 0 && <Empty message="아직 댓글이 없습니다." />}
            {comments.map((comment) => {
              const canManageComment = canManageItem(comment, user);
              const isEditing = editingCommentId === comment.id;
              return (
                <article className="comment-card" key={comment.id}>
                  <div className="comment-avatar" aria-hidden="true">{String(comment.owner || "C").slice(0, 1)}</div>
                  <div>
                    <div className="comment-meta">
                      <b>{comment.owner || "Ctrl + AI 멤버"}</b>
                      <time>{formatDate(comment.createdAt)}{comment.updatedAt ? " · 수정됨" : ""}</time>
                    </div>
                    {!isEditing ? (
                      <>
                        <p>{comment.body}</p>
                        {canManageComment && (
                          <div className="inline-actions comment-actions" aria-label="댓글 관리">
                            <button className="mini-action" type="button" onClick={() => beginCommentEdit(comment)} disabled={actionBusy}>수정</button>
                            <button className="mini-action danger" type="button" onClick={() => removeComment(comment)} disabled={actionBusy}>삭제</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="comment-edit-panel">
                        <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={400} rows={3} />
                        <div className="edit-actions">
                          <small>{commentDraft.trim().length}/400</small>
                          <button className="soft-action" type="button" onClick={() => { setEditingCommentId(null); setCommentDraft(""); }} disabled={actionBusy}>취소</button>
                          <button className="primary-action compact" type="button" onClick={() => saveCommentEdit(comment.id)} disabled={actionBusy}>{actionBusy ? "저장 중..." : "저장"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="comment-form" role="form" aria-label="댓글 작성">
            <label className="comment-composer">
              <span>댓글 작성</span>
              <textarea
                name="body"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="답변이나 추가 의견을 입력하세요."
                maxLength={400}
                rows={4}
                required
              />
            </label>
            <div className="comment-form-actions">
              <small>{commentBody.trim().length}/400</small>
              <button className="primary-action" type="button" onClick={submitComment} disabled={submitting || actionBusy}>
                {submitting ? "등록 중..." : "댓글 등록"}
              </button>
            </div>
            {status && <p className={cx("form-status", (status.includes("되었습니다") || status.includes("삭제되었습니다")) && "success")} role="status">{status}</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function MemberModal({ member, onClose, onSubmit }) {
  const [status, setStatus] = useState("");
  async function submit(event) {
    event.preventDefault();
    setStatus("");
    try {
      await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()));
    } catch (error) {
      setStatus(error.message || "멤버 수정에 실패했습니다.");
    }
  }

  return (
    <Modal title="멤버 정보 수정" onClose={onClose} wide>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid two">
          <TextField name="name" label="이름" defaultValue={member.name || ""} maxLength={20} required />
          <TextField name="team" label="부서/팀" defaultValue={member.team || ""} maxLength={40} required />
          <TextField name="email" type="email" label="회사 메일" defaultValue={member.email || ""} maxLength={80} required />
          <SelectField name="interest" label="관심 분야" options={interests} defaultValue={member.interest || ""} required />
          <SelectField name="status" label="상태" options={["active", "pending", "paused"]} defaultValue={member.status || "active"} required />
          <SelectField name="role" label="권한" options={["member", "admin"]} defaultValue={member.role || "member"} required />
        </div>
        <TextArea name="message" label="메시지" defaultValue={member.message || ""} maxLength={160} />
        <button className="primary-action" type="submit">수정 저장</button>
        {status && <p className="form-status" role="status">{status}</p>}
      </form>
    </Modal>
  );
}

function Footer() {
  return <footer className="site-footer"><span>Ctrl + AI</span><p>React · Firebase · Vercel</p></footer>;
}

function App() {
  const [view, setView] = useState(pathnameToView);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingPath, setPendingPath] = useState(null);

  function go(path) {
    navigateTo(path);
  }

  async function loadData() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchClubData();
      setData(result || emptyData);
    } catch (loadError) {
      setError(loadError.message || "Firebase 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeAuthState((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onRoute = () => setView(pathnameToView());
    window.addEventListener("popstate", onRoute);
    return () => window.removeEventListener("popstate", onRoute);
  }, []);

  useEffect(() => {
    document.title = `Ctrl + AI${view === "home" ? " · 로그인" : ` · ${navItems.find((item) => item.view === view)?.label || ""}`}`;
    if (!authReady || user) return;

    const requestedPath = window.location.pathname;
    if (requestedPath !== "/" && routes[requestedPath]) {
      setPendingPath(requestedPath);
    }
  }, [view, user, authReady]);

  useEffect(() => {
    loadData();
  }, [user]);

  if (!authReady) return <div className="boot-screen">Ctrl + AI 로딩 중...</div>;

  if (!user) {
    const redirectPath = pendingPath || (window.location.pathname !== "/" && routes[window.location.pathname] ? window.location.pathname : "/resources");
    return <AuthScreen onSignedIn={(nextUser) => { setUser(nextUser); go(redirectPath); setPendingPath(null); }} />;
  }

  return (
    <Shell
      user={user}
      view={view}
      data={data}
      loading={loading}
      error={error}
      onNavigate={go}
      onLogout={async () => { await signOutMember(); setUser(null); setData(emptyData); go("/"); }}
      onRefresh={loadData}
      onCreateResource={(payload, file) => createResource(payload, file, user).then((created) => setData((current) => ({ ...current, resources: [created, ...current.resources] })))}
      onUpdateResource={(resourceId, payload, file) => updateResource(resourceId, payload, file, user).then((updated) => { setData((current) => ({ ...current, resources: current.resources.map((item) => item.id === resourceId ? { ...item, ...updated } : item) })); return updated; })}
      onCreateResourceComment={(resourceId, payload) => createResourceComment(resourceId, payload, user).then((created) => { setData((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === resourceId ? { ...resource, comments: [...(resource.comments || []), created] } : resource) })); return created; })}
      onCreateSession={(payload) => createSession(payload, user).then((created) => setData((current) => ({ ...current, sessions: [created, ...current.sessions] })))}
      onCreateQuestion={(payload) => createQuestion(payload, user).then((created) => setData((current) => ({ ...current, questions: [created, ...current.questions] })))}
      onUpdateQuestion={(questionId, payload) => updateQuestion(questionId, payload, user).then((updated) => { setData((current) => ({ ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, ...updated } : question) })); return updated; })}
      onDeleteQuestion={(questionId, question) => deleteQuestion(questionId, question, user).then(() => setData((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== questionId) })))}
      onCreateComment={(questionId, payload) => createQuestionComment(questionId, payload, user).then((created) => { setData((current) => ({ ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, comments: [...(question.comments || []), created] } : question) })); return created; })}
      onUpdateComment={(questionId, commentId, payload) => updateQuestionComment(questionId, commentId, payload, user).then((updated) => { setData((current) => ({ ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, comments: (question.comments || []).map((comment) => comment.id === commentId ? updated : comment) } : question) })); return updated; })}
      onDeleteComment={(questionId, commentId, comment) => deleteQuestionComment(questionId, commentId, comment, user).then(() => setData((current) => ({ ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, comments: (question.comments || []).filter((item) => item.id !== commentId) } : question) })))}
      onUpdateMember={(id, payload) => updateMemberProfile(id, payload, user).then((updated) => setData((current) => ({ ...current, members: current.members.map((member) => member.id === id ? updated : member) })))}
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
