const AUTH_DISABLED_MESSAGE = "Firebase 설정이 필요합니다. 로컬에서는 127.0.0.1 또는 localhost로 접속해 주세요.";

const emptyClubData = {
  stats: {
    members: 0
  },
  resources: [],
  sessions: [],
  questions: [],
  members: []
};

const state = {
  activeView: "resources",
  query: "",
  data: structuredClone(emptyClubData),
  currentUser: null,
  pendingPath: null,
  calendarDate: new Date()
};

const viewLabels = {
  resources: "자료",
  sessions: "일정",
  questions: "질문",
  members: "멤버"
};

const pageRoutes = {
  "/": { page: "home", title: "Ctrl + AI | 사내 AI 활용 동호회" },
  "/resources": { page: "data", view: "resources", title: "자료실 | Ctrl + AI" },
  "/schedule": { page: "data", view: "sessions", title: "일정 관리 | Ctrl + AI" },
  "/questions": { page: "data", view: "questions", title: "질문 | Ctrl + AI" },
  "/members": { page: "data", view: "members", title: "멤버 | Ctrl + AI" },
  "/about": { page: "about", title: "소개 | Ctrl + AI" }
};

const routeAliases = {
  "/sessions": "/schedule"
};

const routeByView = {
  resources: "/resources",
  sessions: "/schedule",
  questions: "/questions",
  members: "/members"
};

const protectedPaths = new Set([...Object.values(routeByView), "/sessions"]);

const scheduleTypes = [
  { key: "meeting", label: "회의", aliases: ["회의", "미팅", "스터디", "공유회", "실습", "워크숍"] },
  { key: "offsite", label: "외근/출장", aliases: ["외근/출장", "외근", "출장"] },
  { key: "vacation", label: "휴가", aliases: ["휴가", "연차", "반차"] },
  { key: "remote", label: "재택 근무", aliases: ["재택 근무", "재택", "원격"] },
  { key: "personal", label: "개인 일정", aliases: ["개인 일정", "개인"] }
];

const listElement = document.querySelector("[data-list]");
const spotlightElement = document.querySelector("[data-spotlight-list]");
const searchInput = document.querySelector("[data-search]");
const tabs = document.querySelectorAll("[data-view]");
const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const dialog = document.querySelector("[data-question-dialog]");
const questionForm = document.querySelector("[data-question-form]");
const openQuestionButton = document.querySelector("[data-open-question]");
const closeQuestionButtons = document.querySelectorAll("[data-close-question]");
const signupForm = document.querySelector("[data-signup-form]");
const signupStatus = document.querySelector("[data-signup-status]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const authScreen = document.querySelector("[data-auth-screen]");
const appShell = document.querySelector("[data-app-shell]");
const openLoginButton = document.querySelector("[data-open-login]");
const logoutButton = document.querySelector("[data-logout]");
const authUser = document.querySelector("[data-auth-user]");
const authInitial = document.querySelector("[data-auth-initial]");
const authName = document.querySelector("[data-auth-name]");
const authTeam = document.querySelector("[data-auth-team]");
const loginJoinButton = document.querySelector("[data-login-join]");
const loginBackButton = document.querySelector("[data-login-back]");
const loginHelper = document.querySelector("[data-login-helper]");
const signupHelper = document.querySelector("[data-signup-helper]");
const memberDialog = document.querySelector("[data-member-dialog]");
const memberForm = document.querySelector("[data-member-form]");
const memberDialogTitle = document.querySelector("[data-member-dialog-title]");
const memberStatus = document.querySelector("[data-member-status]");
const closeMemberButtons = document.querySelectorAll("[data-close-member]");
const sessionDialog = document.querySelector("[data-session-dialog]");
const sessionForm = document.querySelector("[data-session-form]");
const sessionStatus = document.querySelector("[data-session-status]");
const openSessionButton = document.querySelector("[data-open-session]");
const closeSessionButtons = document.querySelectorAll("[data-close-session]");
const pageSections = document.querySelectorAll("[data-page-section]");
const routeLinks = document.querySelectorAll("[data-route]");

function formatDate(value) {
  if (!value) {
    return "일정 조율 중";
  }

  if (typeof value.toDate === "function") {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(value.toDate());
  }

  const stringValue = String(value);
  const normalized = stringValue.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return stringValue;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: stringValue.includes(":") ? "2-digit" : undefined,
    minute: stringValue.includes(":") ? "2-digit" : undefined
  }).format(date);
}

function formatSessionDateTime(item) {
  const date = String(item.date || "").trim();
  const startTime = String(item.startTime || "").trim();
  const endTime = String(item.endTime || "").trim();

  if (!date) {
    return formatDate(item.createdAt);
  }

  const dateLabel = formatDate(startTime ? `${date}T${startTime}` : date);
  const timeLabel = startTime && endTime ? `${startTime}~${endTime}` : startTime || "시간 미정";
  return `${dateLabel} · ${timeLabel}`;
}

function getSessionDateKey(item) {
  const raw = String(item.date || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const value = item.date || item.createdAt;

  if (value?.toDate) {
    return value.toDate().toISOString().slice(0, 10);
  }

  const parsed = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(element, message, type = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-success", type === "success");
  element.classList.toggle("is-error", type === "error");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeAccountId(username) {
  return String(username || "").trim().toLowerCase();
}

function getSafeAnchorHref(value) {
  const href = String(value || "#join").trim();
  return /^#[A-Za-z][A-Za-z0-9_-]*$/.test(href) ? href : "#join";
}

function sanitizeAccentHex(value) {
  const color = String(value || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#2563eb";
}

function getAuthErrorMessage(error) {
  const code = error?.code || "";

  if (!isAuthAvailable) {
    return AUTH_DISABLED_MESSAGE;
  }

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }

  if (code.includes("email-already-in-use") || code.includes("username-already-in-use")) {
    return "이미 사용 중인 아이디입니다. 로그인해 주세요.";
  }

  if (code.includes("weak-password")) {
    return "비밀번호는 6자 이상이어야 합니다.";
  }

  if (code.includes("permission-denied")) {
    return "권한이 없습니다. 로그인 상태와 Firestore 보안 규칙 배포 여부를 확인해 주세요.";
  }

  if (code.includes("network-request-failed")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  return error?.message || "요청 처리 중 문제가 발생했습니다.";
}

function setCurrentUser(user) {
  state.currentUser = user
    ? {
        name: user.name,
        team: user.team,
        uid: user.uid || "",
        username: normalizeAccountId(user.username),
        email: normalizeEmail(user.email),
        interest: user.interest,
        message: user.message || "",
        status: user.status || "active",
        role: user.role || "member"
      }
    : null;

  renderAuthState();
}

function renderAuthState() {
  const isAuthenticated = Boolean(state.currentUser);
  document.body.dataset.auth = isAuthenticated ? "signed-in" : "signed-out";
  document.body.classList.toggle("is-authenticated", isAuthenticated);
  document.body.classList.toggle("auth-screen-active", !isAuthenticated);
  authScreen.hidden = isAuthenticated;
  appShell.hidden = !isAuthenticated;
  authUser.hidden = !isAuthenticated;
  openLoginButton.hidden = isAuthenticated;
  logoutButton.hidden = !isAuthenticated;
  searchInput.disabled = !isAuthenticated;
  searchInput.placeholder = isAuthenticated ? "프롬프트, 자동화, 문서 요약" : "로그인 후 검색 가능";

  if (isAuthenticated) {
    authInitial.textContent = state.currentUser.name.slice(0, 1).toUpperCase();
    authName.textContent = state.currentUser.name;
    authTeam.textContent = `${state.currentUser.team || state.currentUser.email}${state.currentUser.role === "admin" ? " · admin" : ""}`;
  }

  if (isAuthenticated) {
    applyRoute({ scroll: false });
  }

  renderSpotlight();
  renderList();
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  loginForm.hidden = isSignup;
  signupForm.hidden = !isSignup;
  loginHelper.hidden = isSignup;
  loginJoinButton.hidden = isSignup;
  signupHelper.hidden = !isSignup;
  loginBackButton.hidden = !isSignup;
  setStatus(loginStatus, "");
  setStatus(signupStatus, "");
}

function openLoginDialog(message = "로그인 후 이용할 수 있습니다.") {
  setAuthMode("login");
  setStatus(loginStatus, message);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeLoginDialog() {
  loginForm.reset();
}

function normalizePath(pathname = location.pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const canonicalPath = routeAliases[path] || path;
  return pageRoutes[canonicalPath] ? canonicalPath : "/";
}

function getCurrentRoute() {
  return pageRoutes[normalizePath()];
}

function isProtectedPath(pathname = location.pathname) {
  return protectedPaths.has(normalizePath(pathname));
}

function updatePageSections(page) {
  pageSections.forEach((section) => {
    const pages = String(section.dataset.pageSection || "").split(/\s+/);
    section.hidden = !pages.includes(page);
  });
}

function updateRouteLinks(path) {
  routeLinks.forEach((link) => {
    const linkPath = normalizePath(new URL(link.getAttribute("href"), location.origin).pathname);
    const isActive = linkPath === path;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function updatePageHeading(view) {
  const title = document.querySelector("#knowledge-title");
  const eyebrow = document.querySelector(".knowledge-main .eyebrow");

  if (!title || !eyebrow) {
    return;
  }

  const headings = {
    resources: ["Knowledge Desk", "AI 활용 자료실"],
    sessions: ["Calendar", "일정 관리"],
    questions: ["Question Board", "질문 게시판"],
    members: ["Member Directory", "멤버 목록"]
  };
  const [eyebrowText, titleText] = headings[view] || headings.resources;
  eyebrow.textContent = eyebrowText;
  title.textContent = titleText;
}

function applyRoute({ scroll = false } = {}) {
  const path = normalizePath();
  const route = pageRoutes[path];

  if (protectedPaths.has(path) && !requireAuth("로그인 후 이용할 수 있는 메뉴입니다.")) {
    return;
  }

  document.title = route.title;
  updatePageSections(route.page);
  updateRouteLinks(path);

  if (route.view) {
    setView(route.view, { updateUrl: false });
  } else {
    document.body.dataset.view = route.page;
  }

  if (scroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.querySelector("#top")?.focus({ preventScroll: true }));
  }
}

function navigateToRoute(path, { replace = false, scroll = true } = {}) {
  const normalizedPath = normalizePath(path);

  if (protectedPaths.has(normalizedPath) && !requireAuth("로그인 후 이용할 수 있는 메뉴입니다.")) {
    state.pendingPath = normalizedPath;
    return false;
  }

  if (location.pathname !== normalizedPath) {
    const method = replace ? "replaceState" : "pushState";
    history[method](null, "", normalizedPath);
  } else if (replace) {
    history.replaceState(null, "", normalizedPath);
  }

  applyRoute({ scroll });
  return true;
}

function moveToMainHome() {
  const targetPath = state.pendingPath || (isProtectedPath() ? normalizePath() : "/resources");
  state.pendingPath = null;
  navigateToRoute(targetPath, { replace: true, scroll: true });
}

function requireAuth(message) {
  if (state.currentUser) {
    return true;
  }

  openLoginDialog(message);
  return false;
}

function createLockedState(message = "로그인 후 자료를 볼 수 있습니다.") {
  const locked = document.createElement("div");
  locked.className = "locked-state";
  locked.innerHTML = `
    <div class="locked-icon" aria-hidden="true">↳</div>
    <h3>로그인이 필요합니다</h3>
    <p>${escapeHtml(message)}</p>
    <button class="button button-primary" type="button" data-inline-login>로그인</button>
  `;

  locked.querySelector("[data-inline-login]").addEventListener("click", () => openLoginDialog(message));
  return locked;
}

function matchesQuery(item) {
  const query = state.query.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [item.title, item.summary, item.tag, item.owner, item.name, item.team, item.email, item.interest, item.username, item.location, item.startTime, item.endTime]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function createCard(item, view) {
  const article = document.createElement("article");
  article.className = "item-card";

  const date = view === "sessions" ? formatSessionDateTime(item) : formatDate(item.date || item.createdAt);
  const statusLabel = item.status === "open" ? "답변 대기" : item.status || viewLabels[view];
  const safeHref = getSafeAnchorHref(item.href);

  article.innerHTML = `
    <div class="card-meta">
      <span class="tag">${escapeHtml(item.tag || viewLabels[view])}</span>
      <span>${escapeHtml(date)}</span>
    </div>
    <div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
    </div>
    <footer>
      <span>${escapeHtml(view === "sessions" ? item.location || item.owner || "Ctrl + AI" : item.owner || "Ctrl + AI")}</span>
      ${
        view === "questions"
          ? `<span class="tag">${escapeHtml(statusLabel)}</span>`
          : `<a class="item-link" href="${safeHref}">열기 <span aria-hidden="true">→</span></a>`
      }
    </footer>
  `;

  return article;
}

function isAdminUser() {
  return state.currentUser?.role === "admin";
}

function getStatusLabel(status) {
  const labels = {
    active: "활동 중",
    pending: "승인 대기",
    paused: "일시 중지"
  };

  return labels[status] || status || "활동 중";
}

function getRoleLabel(role) {
  return role === "admin" ? "admin" : "member";
}

function createMemberCard(member) {
  const article = document.createElement("article");
  article.className = "item-card member-card";

  article.innerHTML = `
    <div class="member-card-head">
      <span class="member-avatar" aria-hidden="true">${escapeHtml((member.name || member.username || "C").slice(0, 1).toUpperCase())}</span>
      <div>
        <h3>${escapeHtml(member.name || "이름 없음")}</h3>
        <p>${escapeHtml(member.team || "소속 미입력")}</p>
      </div>
    </div>
    <dl class="member-meta">
      <div><dt>아이디</dt><dd>${escapeHtml(member.username || "-")}</dd></div>
      <div><dt>메일</dt><dd>${escapeHtml(member.email || "-")}</dd></div>
      <div><dt>관심</dt><dd>${escapeHtml(member.interest || "-")}</dd></div>
      <div><dt>상태</dt><dd>${escapeHtml(getStatusLabel(member.status))}</dd></div>
      <div><dt>권한</dt><dd>${escapeHtml(getRoleLabel(member.role))}</dd></div>
    </dl>
    ${member.message ? `<p class="member-message">${escapeHtml(member.message)}</p>` : ""}
    ${isAdminUser() ? `<button class="button button-secondary member-edit-button" type="button" data-edit-member="${escapeHtml(member.id || member.userUid || member.uid)}">정보 수정</button>` : ""}
  `;

  const editButton = article.querySelector("[data-edit-member]");

  if (editButton) {
    editButton.addEventListener("click", () => openMemberDialog(member));
  }

  return article;
}

function sortSessionsAsc(items) {
  return [...items].sort((a, b) => {
    const left = `${getSessionDateKey(a)}T${a.startTime || "00:00"}`;
    const right = `${getSessionDateKey(b)}T${b.startTime || "00:00"}`;
    return left.localeCompare(right);
  });
}

function getSessionTypeKey(tag) {
  const normalized = String(tag || "회의").trim();
  const match = scheduleTypes.find((type) => type.aliases.includes(normalized));
  return match?.key || "meeting";
}

function getSessionTypeLabel(tag) {
  const normalized = String(tag || "회의").trim();
  const match = scheduleTypes.find((type) => type.aliases.includes(normalized));
  return match?.label || normalized || "회의";
}

function createScheduleLegend() {
  return scheduleTypes.map((type) => `
    <span class="schedule-legend-item type-${type.key}"><i aria-hidden="true"></i>${escapeHtml(type.label)}</span>
  `).join("");
}

function createSessionAgendaCard(item) {
  const article = document.createElement("article");
  const typeKey = getSessionTypeKey(item.tag);
  article.className = `calendar-agenda-card type-${typeKey}`;
  article.innerHTML = `
    <div class="calendar-agenda-time">${escapeHtml(item.startTime || "--:--")}</div>
    <div>
      <div class="calendar-agenda-title-row">
        <h3>${escapeHtml(item.title || "제목 없음")}</h3>
        <span class="schedule-chip type-${typeKey}">${escapeHtml(getSessionTypeLabel(item.tag))}</span>
      </div>
      ${item.purpose ? `<p class="calendar-purpose">${escapeHtml(item.purpose)}</p>` : ""}
      <p>${escapeHtml(item.summary || "내용 없음")}</p>
      <div class="calendar-agenda-meta">
        <span>${escapeHtml(item.endTime ? `${item.startTime || ""}~${item.endTime}` : item.startTime || "시간 미정")}</span>
        <span>${escapeHtml(item.location || "장소 미정")}</span>
        <span>${escapeHtml(item.owner || "Ctrl + AI")}</span>
      </div>
    </div>
  `;
  return article;
}

function renderSessionCalendar(items) {
  const wrapper = document.createElement("div");
  wrapper.className = "calendar-view";

  const monthDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), 1);
  const todayKey = getDateKey(new Date());
  const monthLabel = `${monthDate.getFullYear()}년 ${monthDate.getMonth() + 1}월`;
  const monthKey = getMonthKey(monthDate);
  const sessionsByDate = new Map();

  sortSessionsAsc(items).forEach((item) => {
    const key = getSessionDateKey(item);
    if (!key) return;
    if (!sessionsByDate.has(key)) sessionsByDate.set(key, []);
    sessionsByDate.get(key).push(item);
  });

  const firstDay = monthDate.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const totalCells = Math.max(35, Math.ceil((firstDay + daysInMonth) / 7) * 7);
  const cells = [];

  for (let blank = 0; blank < firstDay; blank += 1) {
    cells.push(`<div class="calendar-cell is-empty" aria-hidden="true"></div>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const key = getDateKey(date);
    const daySessions = sessionsByDate.get(key) || [];
    const weekday = date.getDay();
    const labels = daySessions.slice(0, 3).map((session) => {
      const typeKey = getSessionTypeKey(session.tag);
      return `
        <li class="schedule-event type-${typeKey}" title="${escapeHtml(session.title || "제목 없음")}">
          <strong>${escapeHtml(session.title || "제목 없음")}</strong>
          <span>${escapeHtml(session.purpose || session.location || session.owner || "")}</span>
        </li>
      `;
    }).join("");
    const more = daySessions.length > 3 ? `<p class="calendar-more">+${daySessions.length - 3}개 더</p>` : "";
    const count = daySessions.length ? `<span class="calendar-day-count">${daySessions.length}건</span>` : "";
    cells.push(`
      <div class="calendar-cell${key === todayKey ? " is-today" : ""}${weekday === 0 ? " is-sunday" : ""}${weekday === 6 ? " is-saturday" : ""}" data-date="${key}" role="gridcell">
        <div class="calendar-day-head">
          <span class="calendar-day-number">${day}</span>
          ${count}
        </div>
        <ul class="calendar-events">${labels}</ul>
        ${more}
      </div>
    `);
  }

  while (cells.length < totalCells) {
    cells.push(`<div class="calendar-cell is-empty" aria-hidden="true"></div>`);
  }

  const visibleItems = sortSessionsAsc(items).filter((item) => getSessionDateKey(item).startsWith(monthKey));

  wrapper.innerHTML = `
    <div class="calendar-header">
      <div class="calendar-title-controls">
        <h3>${escapeHtml(monthLabel)}</h3>
        <div class="calendar-controls" aria-label="달력 월 이동">
          <button class="icon-button" type="button" data-calendar-prev aria-label="이전 달">‹</button>
          <button class="button button-secondary" type="button" data-calendar-today>오늘</button>
          <button class="icon-button" type="button" data-calendar-next aria-label="다음 달">›</button>
        </div>
      </div>
      <div class="schedule-legend" aria-label="일정 분류">${createScheduleLegend()}</div>
    </div>
    <div class="calendar-board">
      <div class="calendar-weekdays" aria-hidden="true">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div class="calendar-grid" role="grid" aria-label="${escapeHtml(monthLabel)} 일정 달력">
        ${cells.join("")}
      </div>
    </div>
    <div class="calendar-agenda">
      <div class="calendar-agenda-head">
        <h3>이번 달 일정</h3>
        <span>${visibleItems.length}개</span>
      </div>
      <div data-calendar-agenda></div>
    </div>
  `;

  wrapper.querySelector("[data-calendar-prev]").addEventListener("click", () => {
    state.calendarDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
    renderList();
  });

  wrapper.querySelector("[data-calendar-next]").addEventListener("click", () => {
    state.calendarDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    renderList();
  });

  wrapper.querySelector("[data-calendar-today]").addEventListener("click", () => {
    state.calendarDate = new Date();
    renderList();
  });

  const agenda = wrapper.querySelector("[data-calendar-agenda]");
  if (visibleItems.length) {
    agenda.append(...visibleItems.map(createSessionAgendaCard));
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "이번 달 등록된 일정이 없습니다.";
    agenda.append(empty);
  }

  return wrapper;
}

function renderList() {
  if (openSessionButton) {
    openSessionButton.hidden = state.activeView !== "sessions" || !state.currentUser;
  }

  listElement.classList.toggle("is-calendar", state.activeView === "sessions");

  if (!state.currentUser) {
    listElement.replaceChildren(createLockedState("자료실, 일정, 질문, 멤버 목록은 로그인 후 이용할 수 있습니다."));
    return;
  }

  const items = (state.data[state.activeView] || []).filter(matchesQuery);
  listElement.replaceChildren();

  if (state.activeView === "sessions") {
    listElement.append(renderSessionCalendar(items));
    return;
  }

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.activeView === "members" ? "표시할 멤버가 없습니다." : "검색 결과가 없습니다.";
    listElement.append(empty);
    return;
  }

  listElement.append(...items.map((item) => state.activeView === "members" ? createMemberCard(item) : createCard(item, state.activeView)));
}

function renderSpotlight() {
  if (!state.currentUser) {
    spotlightElement.replaceChildren(
      createLockedState("이번 주 공유 주제는 로그인 후 확인할 수 있습니다.")
    );
    return;
  }

  const spotlightItems = state.data.resources.slice(0, 3);
  spotlightElement.replaceChildren();

  spotlightItems.forEach((item) => {
    const article = document.createElement("article");
    article.className = "topic-card";
    article.style.setProperty("--accent", sanitizeAccentHex(item.accent));
    article.innerHTML = `
      <div class="card-meta">
        <span class="tag">${escapeHtml(item.tag)}</span>
        <span>${escapeHtml(formatDate(item.date))}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
    `;
    spotlightElement.append(article);
  });
}

function renderStats() {
  const stats = {
    resources: state.data.resources.length,
    sessions: state.data.sessions.length,
    questions: state.data.questions.filter((question) => question.status !== "closed").length,
    members: state.data.members.length || state.data.stats?.members || 0
  };

  Object.entries(stats).forEach(([key, value]) => {
    const element = document.querySelector(`[data-stat="${key}"]`);

    if (element) {
      element.textContent = value;
    }
  });
}

function setView(view, { updateUrl = true } = {}) {
  if (!requireAuth("자료, 일정, 질문, 멤버 목록은 로그인 후 이용할 수 있습니다.")) {
    return false;
  }

  if (!viewLabels[view]) {
    return false;
  }

  if (updateUrl) {
    navigateToRoute(routeByView[view], { scroll: true });
    return true;
  }

  state.activeView = view;
  document.body.dataset.view = view;
  state.query = searchInput.value;
  searchInput.placeholder = view === "sessions" ? "일정명, 목적, 장소 검색" : "프롬프트, 자동화, 문서 요약";
  updatePageHeading(view);

  tabs.forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle("is-active", isActive);
    if (isActive) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  });

  renderList();
  return true;
}

function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  header.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
  menuToggle.setAttribute("aria-expanded", String(open));
}

function updateHeaderState() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function openSessionDialog() {
  if (!requireAuth("일정 등록은 로그인 후 이용할 수 있습니다.")) {
    return;
  }

  sessionForm.reset();
  setStatus(sessionStatus, "");
  const now = new Date();
  const today = getDateKey(now);
  const nextHour = String(Math.min(now.getHours() + 1, 23)).padStart(2, "0");
  sessionForm.elements.date.value = today;
  sessionForm.elements.startTime.value = `${nextHour}:00`;
  sessionForm.elements.endTime.value = `${String(Math.min(Number(nextHour) + 1, 23)).padStart(2, "0")}:00`;

  if (typeof sessionDialog.showModal === "function") {
    sessionDialog.showModal();
    return;
  }

  sessionDialog.setAttribute("open", "");
}

function closeSessionDialog() {
  if (sessionDialog.open && typeof sessionDialog.close === "function") {
    sessionDialog.close();
    return;
  }

  sessionDialog.removeAttribute("open");
}

function openQuestionDialog() {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
}

function closeQuestionDialog() {
  if (dialog.open && typeof dialog.close === "function") {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function openMemberDialog(member) {
  if (!isAdminUser()) {
    return;
  }

  memberForm.reset();
  setStatus(memberStatus, "");
  memberForm.elements.memberId.value = member.id || member.userUid || member.uid || "";
  memberForm.elements.name.value = member.name || "";
  memberForm.elements.team.value = member.team || "";
  memberForm.elements.email.value = member.email || "";
  memberForm.elements.interest.value = member.interest || "";
  memberForm.elements.status.value = member.status || "active";
  memberForm.elements.role.value = member.role || "member";
  memberForm.elements.message.value = member.message || "";

  if (memberDialogTitle) {
    memberDialogTitle.textContent = `${member.name || member.username || "멤버"} 정보 수정`;
  }

  if (typeof memberDialog.showModal === "function") {
    memberDialog.showModal();
    return;
  }

  memberDialog.setAttribute("open", "");
}

function closeMemberDialog() {
  if (memberDialog.open && typeof memberDialog.close === "function") {
    memberDialog.close();
    return;
  }

  memberDialog.removeAttribute("open");
}

async function handleMemberSubmit(event) {
  event.preventDefault();

  if (!isAdminUser()) {
    setStatus(memberStatus, "admin 권한이 필요합니다.", "error");
    return;
  }

  const formData = new FormData(memberForm);
  const memberId = String(formData.get("memberId") || "").trim();

  if (!memberId) {
    setStatus(memberStatus, "수정할 멤버를 찾을 수 없습니다.", "error");
    return;
  }

  try {
    setStatus(memberStatus, "멤버 정보를 저장하는 중입니다.");
    const updatedMember = await updateMemberProfile(memberId, {
      name: formData.get("name"),
      team: formData.get("team"),
      email: formData.get("email"),
      interest: formData.get("interest"),
      status: formData.get("status"),
      role: formData.get("role"),
      message: formData.get("message")
    });

    state.data.members = state.data.members.map((member) => {
      const id = member.id || member.userUid || member.uid;
      return id === memberId ? { ...member, ...updatedMember, id: memberId } : member;
    });

    if (state.currentUser?.uid === memberId) {
      setCurrentUser({ ...state.currentUser, ...updatedMember, uid: memberId });
    } else {
      renderList();
    }

    setStatus(memberStatus, "멤버 정보가 수정되었습니다.", "success");
    window.setTimeout(closeMemberDialog, 350);
  } catch (error) {
    console.warn("Member update failed.", error);
    setStatus(memberStatus, getAuthErrorMessage(error), "error");
  }
}

async function handleSessionSubmit(event) {
  event.preventDefault();

  try {
    const formData = new FormData(sessionForm);
    const date = String(formData.get("date") || "").trim();
    const startTime = String(formData.get("startTime") || "").trim();
    const endTime = String(formData.get("endTime") || "").trim();

    if (endTime && startTime && endTime <= startTime) {
      setStatus(sessionStatus, "종료 시간은 시작 시간보다 늦어야 합니다.", "error");
      return;
    }

    setStatus(sessionStatus, "일정을 저장하는 중입니다.");
    const session = await createSession({
      date,
      startTime,
      endTime,
      location: String(formData.get("location") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      purpose: String(formData.get("purpose") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      tag: String(formData.get("tag") || "").trim(),
      owner: state.currentUser?.name || "Ctrl + AI 멤버"
    });

    state.data.sessions = sortSessionsAsc([session, ...state.data.sessions]);
    state.calendarDate = parseDateKey(session.date);
    sessionForm.reset();
    closeSessionDialog();
    searchInput.value = "";
    state.query = "";
    navigateToRoute("/schedule", { scroll: true });
    renderStats();
  } catch (error) {
    console.warn("Session could not be saved.", error);
    setStatus(sessionStatus, getAuthErrorMessage(error), "error");
  }
}

async function handleQuestionSubmit(event) {
  event.preventDefault();

  try {
    const formData = new FormData(questionForm);
    const question = await createQuestion({
      title: String(formData.get("title")).trim(),
      summary: String(formData.get("summary")).trim(),
      tag: String(formData.get("tag")).trim(),
      owner: state.currentUser?.name || "Ctrl + AI 멤버"
    });

    state.data.questions = [question, ...state.data.questions];
    questionForm.reset();
    closeQuestionDialog();
    searchInput.value = "";
    state.query = "";
    navigateToRoute("/questions", { scroll: true });
    renderStats();
  } catch (error) {
    console.warn("Question could not be saved.", error);
    window.alert(getAuthErrorMessage(error));
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  setStatus(signupStatus, "가입 신청을 접수하는 중입니다.");

  const formData = new FormData(signupForm);
  const username = normalizeAccountId(formData.get("username"));
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password"));
  const confirmPassword = String(formData.get("confirmPassword"));
  const member = {
    username,
    name: String(formData.get("name")).trim(),
    team: String(formData.get("team")).trim(),
    email,
    interest: String(formData.get("interest")).trim(),
    message: String(formData.get("message")).trim()
  };

  if (password.length < 6) {
    setStatus(signupStatus, "비밀번호는 6자 이상이어야 합니다.", "error");
    return;
  }

  if (password !== confirmPassword) {
    setStatus(signupStatus, "비밀번호가 일치하지 않습니다.", "error");
    return;
  }

  try {
    const { user: authUserRecord } = await signUpMember({
      ...member,
      password
    });
    signupForm.reset();
    setCurrentUser(authUserRecord);
    await initData();
    moveToMainHome();
    setStatus(signupStatus, "회원가입이 완료되었습니다. 로그인 상태로 전환되었습니다.", "success");
  } catch (error) {
    console.warn("Member registration could not be saved.", error);
    setStatus(signupStatus, getAuthErrorMessage(error), "error");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = normalizeAccountId(formData.get("username"));
  const password = String(formData.get("password"));
  try {
    const user = await signInMember(username, password);
    setCurrentUser(user);
    closeLoginDialog();
    moveToMainHome();
    await initData();
  } catch (error) {
    console.warn("Login failed.", error);
    setStatus(loginStatus, getAuthErrorMessage(error), "error");
  }
}

async function initAuth() {
  try {
    const sessionUser = await getCurrentUser();

    if (sessionUser) {
      state.currentUser = {
        uid: sessionUser.uid || "",
        username: normalizeAccountId(sessionUser.username),
        name: sessionUser.name,
        team: sessionUser.team,
        email: normalizeEmail(sessionUser.email),
        interest: sessionUser.interest,
        message: sessionUser.message || "",
        status: sessionUser.status || "active",
        role: sessionUser.role || "member"
      };
    }
  } catch (error) {
    console.warn("Authentication state could not be loaded.", error);
  }

  renderAuthState();
}


function initInteractions() {
  routeLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const url = new URL(link.getAttribute("href"), location.origin);

      if (url.origin !== location.origin) {
        return;
      }

      event.preventDefault();
      navigateToRoute(url.pathname, { scroll: true });
      setMenu(false);
    });
  });


  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderList();
  });

  menuToggle.addEventListener("click", () => {
    setMenu(!document.body.classList.contains("menu-open"));
  });

  window.addEventListener("popstate", () => applyRoute({ scroll: false }));

  openQuestionButton.addEventListener("click", () => {
    if (!requireAuth("질문 등록은 로그인 후 이용할 수 있습니다.")) {
      return;
    }

    openQuestionDialog();
  });
  closeQuestionButtons.forEach((button) => button.addEventListener("click", closeQuestionDialog));
  questionForm.addEventListener("submit", handleQuestionSubmit);
  closeMemberButtons.forEach((button) => button.addEventListener("click", closeMemberDialog));
  memberForm.addEventListener("submit", handleMemberSubmit);
  openSessionButton?.addEventListener("click", openSessionDialog);
  closeSessionButtons.forEach((button) => button.addEventListener("click", closeSessionDialog));
  sessionForm?.addEventListener("submit", handleSessionSubmit);
  signupForm.addEventListener("submit", handleSignupSubmit);
  loginForm.addEventListener("submit", handleLoginSubmit);
  openLoginButton.addEventListener("click", () => openLoginDialog("로그인 후 기능을 이용할 수 있습니다."));
  logoutButton.addEventListener("click", async () => {
    await signOutMember();
    setCurrentUser(null);
    setAuthMode("login");
    window.scrollTo(0, 0);
  });
  loginJoinButton.addEventListener("click", () => {
    setAuthMode("signup");
    signupForm.reset();
  });
  loginBackButton.addEventListener("click", () => {
    setAuthMode("login");
    loginForm.reset();
  });
  window.addEventListener("scroll", updateHeaderState, { passive: true });
  updateHeaderState();
}

function initHeroCanvas() {
  const canvas = document.querySelector("[data-hero-canvas]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const context = canvas.getContext("2d");

  if (reduceMotion) {
    requestAnimationFrame(() => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#11131a";
      context.fillRect(0, 0, width, height);
    });
    return;
  }
  const pointer = { x: 0, y: 0, active: false };
  let width = 0;
  let height = 0;
  let particles = [];

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    const targetCount = width < 720 ? 42 : 72;
    particles = Array.from({ length: targetCount }, (_, index) => ({
      x: (index * 97) % Math.max(width, 1),
      y: (index * 53) % Math.max(height, 1),
      vx: (Math.sin(index) + 0.4) * 0.28,
      vy: (Math.cos(index * 1.3) - 0.2) * 0.28,
      size: index % 7 === 0 ? 3.6 : 2.2,
      hue: index % 3
    }));
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#11131a";
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;

      if (pointer.active) {
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 150 && distance > 0) {
          particle.x += (dx / distance) * 0.42;
          particle.y += (dy / distance) * 0.42;
        }
      }
    }

    particles.forEach((particle, index) => {
      for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex += 1) {
        const next = particles[nextIndex];
        const distance = Math.hypot(particle.x - next.x, particle.y - next.y);

        if (distance < 138) {
          context.strokeStyle = `rgba(109, 93, 252, ${0.22 - distance / 740})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(next.x, next.y);
          context.stroke();
        }
      }
    });

    particles.forEach((particle) => {
      const colors = ["#6d5dfc", "#d8ff62", "#858892"];
      context.fillStyle = colors[particle.hue];
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(draw);
  }

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  window.addEventListener("resize", resize);
  resize();
  draw();
}

async function initData() {
  try {
    const remoteData = await fetchClubData();

    if (remoteData) {
      state.data = {
        stats: { ...emptyClubData.stats, ...remoteData.stats },
        resources: remoteData.resources,
        sessions: remoteData.sessions,
        questions: remoteData.questions,
        members: remoteData.members
      };
    } else {
      const localUser = await getCurrentUser();
      const localMembers = localUser ? [localUser] : [];
      state.data = {
        ...structuredClone(emptyClubData),
        stats: { members: localMembers.length },
        members: localMembers
      };
    }
  } catch (error) {
    console.warn("Firebase data could not be loaded.", error);
    state.data = structuredClone(emptyClubData);
  }

  renderSpotlight();
  renderStats();
  renderList();
}

async function bootstrap() {
  await initAuth();
  initInteractions();
  initHeroCanvas();
  await initData();
  applyRoute({ scroll: false });

  if (!isAuthAvailable) {
    setStatus(loginStatus, AUTH_DISABLED_MESSAGE, "error");
  }
}

bootstrap();
