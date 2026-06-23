const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const PLACEHOLDER_VALUES = new Set(["", "YOUR_API_KEY", "YOUR_PROJECT_ID"]);

const isFirebaseConfigured = Object.entries(firebaseConfig).every(([key, value]) => {
  if (key === "storageBucket") {
    return true;
  }

  return typeof value === "string" && !PLACEHOLDER_VALUES.has(value.trim());
});

const AUTH_EMAIL_DOMAIN = "ctrl-ai.local";
const LOCAL_PREVIEW_USERS_KEY = "ctrlAiPreviewUsers";
const LOCAL_PREVIEW_SESSIONS_KEY = "ctrlAiPreviewSessions";
const LOCAL_PREVIEW_SESSION_KEY = "ctrlAiPreviewSession";
const LOCAL_ADMIN_PASSWORD = "123123";
const LOCAL_ADMIN = {
  uid: "local-admin",
  userUid: "local-admin",
  username: "admin",
  name: "관리자",
  team: "Ctrl + AI 운영",
  email: "",
  interest: "운영",
  message: "",
  status: "active",
  role: "admin"
};
const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const isLocalPreviewAuth = isLocalPreview && !isFirebaseConfigured;
const isAuthAvailable = isFirebaseConfigured || isLocalPreviewAuth;

let firebaseClientPromise;
let authStatePromise;

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function assertValidUsername(username) {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    const error = new Error("아이디는 영문, 숫자, 마침표, 밑줄, 하이픈으로 3~24자여야 합니다.");
    error.code = "auth/invalid-username";
    throw error;
  }
}

function usernameToAuthEmail(username) {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

function getLocalPreviewStorage() {
  return window.sessionStorage;
}

function readLocalPreviewUsers() {
  try {
    return JSON.parse(getLocalPreviewStorage().getItem(LOCAL_PREVIEW_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalPreviewUsers(users) {
  getLocalPreviewStorage().setItem(LOCAL_PREVIEW_USERS_KEY, JSON.stringify(users));
}

function readLocalPreviewSessions() {
  try {
    return JSON.parse(getLocalPreviewStorage().getItem(LOCAL_PREVIEW_SESSIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalPreviewSessions(sessions) {
  getLocalPreviewStorage().setItem(LOCAL_PREVIEW_SESSIONS_KEY, JSON.stringify(sessions));
}

function toPublicLocalUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

async function hashLocalPreviewPassword(username, password) {
  const input = new TextEncoder().encode(`${normalizeUsername(username)}:${password}:ctrl-ai-local-preview`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setLocalPreviewSession(username) {
  getLocalPreviewStorage().setItem(LOCAL_PREVIEW_SESSION_KEY, normalizeUsername(username));
}

function createLocalPreviewUid() {
  if (typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getLocalPreviewUser(username) {
  const normalized = normalizeUsername(username);

  if (normalized === LOCAL_ADMIN.username) {
    return LOCAL_ADMIN;
  }

  return readLocalPreviewUsers().find((user) => user.username === normalized) || null;
}

function upsertLocalPreviewUser(updatedUser) {
  const users = readLocalPreviewUsers();
  const nextUsers = users.map((user) => user.uid === updatedUser.uid ? { ...user, ...updatedUser } : user);
  writeLocalPreviewUsers(nextUsers);
}

async function getFirebaseClient() {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (!firebaseClientPromise) {
    firebaseClientPromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]).then(([appModule, authModule, firestoreModule]) => {
      const app = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const db = firestoreModule.getFirestore(app);

      return { app, auth, authModule, db, firestore: firestoreModule };
    });
  }

  return firebaseClientPromise;
}

function requireFirebaseConfigured() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase 설정이 필요합니다. scripts/firebase.js의 firebaseConfig를 채운 뒤 다시 시도하세요.");
  }
}

function getTimeValue(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return new Date(String(value).replace(" ", "T")).getTime() || 0;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const left = getTimeValue(a.date || a.createdAt || a.updatedAt);
    const right = getTimeValue(b.date || b.createdAt || b.updatedAt);
    return right - left;
  });
}

function sortMembers(items) {
  return [...items].sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username), "ko"));
}

function toAppUser(firebaseUser, fallback = {}) {
  if (!firebaseUser) {
    return null;
  }

  return {
    uid: firebaseUser.uid,
    username: fallback.username || firebaseUser.email?.split("@")[0] || "member",
    name: fallback.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Ctrl + AI 멤버",
    team: fallback.team || "Ctrl + AI 멤버",
    email: fallback.email || "",
    interest: fallback.interest || "",
    message: fallback.message || "",
    status: fallback.status || "active",
    role: fallback.role || "member"
  };
}

async function readMemberProfile(uid) {
  if (!uid) {
    return {};
  }

  const client = await getFirebaseClient();

  if (!client) {
    return {};
  }

  try {
    const { db, firestore } = client;
    const snapshot = await firestore.getDoc(firestore.doc(db, "members", uid));
    return snapshot.exists() ? snapshot.data() : {};
  } catch (error) {
    console.warn("Member profile could not be loaded.", error);
    return {};
  }
}

async function getCurrentUser() {
  if (isLocalPreviewAuth) {
    const username = getLocalPreviewStorage().getItem(LOCAL_PREVIEW_SESSION_KEY);
    return toPublicLocalUser(getLocalPreviewUser(username));
  }

  const client = await getFirebaseClient();

  if (!client) {
    return null;
  }

  if (!authStatePromise) {
    const { auth, authModule } = client;
    authStatePromise = new Promise((resolve) => {
      const unsubscribe = authModule.onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        const profile = user ? await readMemberProfile(user.uid) : {};
        resolve(toAppUser(user, profile));
      });
    });
  }

  return authStatePromise;
}

async function readCollection(name) {
  const client = await getFirebaseClient();

  if (!client || !client.auth.currentUser) {
    return [];
  }

  const { db, firestore } = client;
  const snapshot = await firestore.getDocs(firestore.collection(db, name));

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));
}

async function readStats() {
  const client = await getFirebaseClient();

  if (!client || !client.auth.currentUser) {
    return {};
  }

  const { db, firestore } = client;
  const snapshot = await firestore.getDoc(firestore.doc(db, "site", "stats"));

  return snapshot.exists() ? snapshot.data() : {};
}

async function fetchClubData() {
  if (isLocalPreviewAuth) {
    const members = readLocalPreviewUsers().map(toPublicLocalUser);
    return {
      resources: [],
      sessions: sortByDateDesc(readLocalPreviewSessions()),
      questions: [],
      members: sortMembers(members.map((member) => ({ ...member, id: member.uid }))),
      stats: { members: members.length }
    };
  }

  if (!isFirebaseConfigured) {
    return null;
  }

  const [resources, sessions, questions, members, stats] = await Promise.all([
    readCollection("resources"),
    readCollection("sessions"),
    readCollection("questions"),
    readCollection("members"),
    readStats()
  ]);

  return {
    resources: sortByDateDesc(resources),
    sessions: sortByDateDesc(sessions),
    questions: sortByDateDesc(questions),
    members: sortMembers(members),
    stats
  };
}

async function signUpMember({ username, name, team, email, interest, message, password }) {
  const normalizedUsername = normalizeUsername(username);
  assertValidUsername(normalizedUsername);

  if (isLocalPreviewAuth) {
    if (getLocalPreviewUser(normalizedUsername)) {
      const error = new Error("이미 사용 중인 아이디입니다.");
      error.code = "auth/username-already-in-use";
      throw error;
    }

    const localUser = {
      uid: createLocalPreviewUid(),
      userUid: "",
      username: normalizedUsername,
      name,
      team,
      email,
      interest,
      message: message || "",
      status: "active",
      role: normalizedUsername === "admin" ? "admin" : "member",
      createdAt: new Date().toISOString(),
      passwordHash: await hashLocalPreviewPassword(normalizedUsername, password)
    };
    localUser.userUid = localUser.uid;
    writeLocalPreviewUsers([...readLocalPreviewUsers(), localUser]);
    setLocalPreviewSession(normalizedUsername);

    return {
      user: toPublicLocalUser(localUser),
      registration: { id: localUser.uid, userUid: localUser.uid, username: normalizedUsername, status: "active", role: localUser.role }
    };
  }

  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const { auth, authModule } = client;
  let credential;

  try {
    credential = await authModule.createUserWithEmailAndPassword(
      auth,
      usernameToAuthEmail(normalizedUsername),
      password
    );
    await authModule.updateProfile(credential.user, { displayName: name });

    const registration = await createMemberRegistration({
      username: normalizedUsername,
      name,
      team,
      email,
      interest,
      message
    });

    const appUser = toAppUser(credential.user, { username: normalizedUsername, name, team, email, interest, message, status: "active", role: "member" });
    authStatePromise = Promise.resolve(appUser);

    return {
      user: appUser,
      registration
    };
  } catch (error) {
    if (credential?.user) {
      await authModule.deleteUser(credential.user).catch(() => authModule.signOut(auth));
    }
    throw error;
  }
}

async function signInMember(username, password) {
  const normalizedUsername = normalizeUsername(username);
  assertValidUsername(normalizedUsername);

  if (isLocalPreviewAuth) {
    const localUser = getLocalPreviewUser(normalizedUsername);
    const isAdminLogin = normalizedUsername === LOCAL_ADMIN.username && password === LOCAL_ADMIN_PASSWORD;
    const isMemberLogin = localUser?.passwordHash
      && localUser.passwordHash === await hashLocalPreviewPassword(normalizedUsername, password);

    if (!localUser || (!isAdminLogin && !isMemberLogin)) {
      const error = new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
      error.code = "auth/invalid-credential";
      throw error;
    }

    setLocalPreviewSession(normalizedUsername);
    return toPublicLocalUser(localUser);
  }

  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const { auth, authModule } = client;
  const credential = await authModule.signInWithEmailAndPassword(
    auth,
    usernameToAuthEmail(normalizedUsername),
    password
  );
  const profile = await readMemberProfile(credential.user.uid);
  const appUser = toAppUser(credential.user, { username: normalizedUsername, ...profile });
  authStatePromise = Promise.resolve(appUser);
  return appUser;
}

async function signOutMember() {
  if (isLocalPreviewAuth) {
    getLocalPreviewStorage().removeItem(LOCAL_PREVIEW_SESSION_KEY);
    return;
  }

  const client = await getFirebaseClient();

  if (!client) {
    return;
  }

  await client.authModule.signOut(client.auth);
  authStatePromise = Promise.resolve(null);
}

function normalizeSessionPayload(session, user) {
  const payload = {
    date: String(session.date || "").trim(),
    startTime: String(session.startTime || "").trim(),
    endTime: String(session.endTime || "").trim(),
    title: String(session.title || "").trim(),
    summary: String(session.summary || "").trim(),
    tag: String(session.tag || "모임").trim() || "모임",
    location: String(session.location || "").trim(),
    owner: String(session.owner || user?.name || "Ctrl + AI 멤버").trim(),
    ownerUid: user?.uid || "",
    status: "scheduled"
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    throw new Error("날짜를 올바르게 입력해 주세요.");
  }

  if (!/^\d{2}:\d{2}$/.test(payload.startTime) || !/^\d{2}:\d{2}$/.test(payload.endTime)) {
    throw new Error("시작 시간과 종료 시간을 입력해 주세요.");
  }

  if (payload.endTime <= payload.startTime) {
    throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
  }

  if (!payload.title || !payload.summary) {
    throw new Error("목적/제목과 내용을 입력해 주세요.");
  }

  return payload;
}

async function createSession(session) {
  if (isLocalPreviewAuth) {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("로그인 후 일정을 추가할 수 있습니다.");
    }

    const payload = normalizeSessionPayload(session, user);
    const savedSession = {
      id: `local-session-${Date.now()}`,
      ...payload,
      createdAt: new Date().toISOString()
    };
    writeLocalPreviewSessions([savedSession, ...readLocalPreviewSessions()]);
    return savedSession;
  }

  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const user = client.auth.currentUser;

  if (!user) {
    throw new Error("로그인 후 일정을 추가할 수 있습니다.");
  }

  const profile = await readMemberProfile(user.uid);
  const appUser = toAppUser(user, profile);
  const payload = normalizeSessionPayload(session, appUser);
  const now = new Date().toISOString();

  const { db, firestore } = client;
  const document = await firestore.addDoc(firestore.collection(db, "sessions"), {
    ...payload,
    createdAt: firestore.serverTimestamp()
  });

  return {
    id: document.id,
    ...payload,
    createdAt: now
  };
}

async function createQuestion(question) {
  if (isLocalPreviewAuth) {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("로그인 후 질문을 등록할 수 있습니다.");
    }

    return {
      id: `local-question-${Date.now()}`,
      title: question.title,
      summary: question.summary,
      tag: question.tag || "질문",
      owner: question.owner || user.name,
      ownerUid: user.uid,
      status: "open",
      createdAt: new Date().toISOString()
    };
  }

  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const user = client.auth.currentUser;

  if (!user) {
    throw new Error("로그인 후 질문을 등록할 수 있습니다.");
  }

  const now = new Date().toISOString();
  const payload = {
    title: question.title,
    summary: question.summary,
    tag: question.tag || "질문",
    owner: question.owner || user.displayName || "Ctrl + AI 멤버",
    ownerUid: user.uid,
    status: "open",
    createdAt: now
  };

  const { db, firestore } = client;
  const document = await firestore.addDoc(firestore.collection(db, "questions"), {
    ...payload,
    createdAt: firestore.serverTimestamp()
  });

  return {
    id: document.id,
    ...payload
  };
}

async function createMemberRegistration(member) {
  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const user = client.auth.currentUser;

  if (!user) {
    throw new Error("인증된 사용자만 가입 신청 정보를 저장할 수 있습니다.");
  }

  const now = new Date().toISOString();
  const payload = {
    userUid: user.uid,
    username: member.username,
    name: member.name,
    team: member.team,
    email: member.email,
    interest: member.interest,
    message: member.message || "",
    status: "active",
    role: "member",
    createdAt: now
  };

  const { db, firestore } = client;
  const document = firestore.doc(db, "members", user.uid);
  await firestore.setDoc(document, {
    ...payload,
    createdAt: firestore.serverTimestamp()
  });

  return {
    id: document.id,
    ...payload
  };
}

async function updateMemberProfile(memberId, updates) {
  const allowedUpdates = {
    name: String(updates.name || "").trim(),
    team: String(updates.team || "").trim(),
    email: String(updates.email || "").trim().toLowerCase(),
    interest: String(updates.interest || "").trim(),
    message: String(updates.message || "").trim(),
    status: String(updates.status || "active").trim(),
    role: String(updates.role || "member").trim()
  };

  if (isLocalPreviewAuth) {
    const currentUser = await getCurrentUser();

    if (currentUser?.role !== "admin") {
      const error = new Error("admin 권한이 필요합니다.");
      error.code = "permission-denied";
      throw error;
    }

    const target = readLocalPreviewUsers().find((user) => user.uid === memberId);

    if (!target) {
      throw new Error("수정할 멤버를 찾을 수 없습니다.");
    }

    const updatedUser = {
      ...target,
      ...allowedUpdates,
      updatedAt: new Date().toISOString()
    };
    upsertLocalPreviewUser(updatedUser);
    return toPublicLocalUser(updatedUser);
  }

  requireFirebaseConfigured();

  const client = await getFirebaseClient();
  const { db, firestore } = client;
  const document = firestore.doc(db, "members", memberId);
  await firestore.updateDoc(document, {
    ...allowedUpdates,
    updatedAt: firestore.serverTimestamp()
  });

  return {
    id: memberId,
    ...allowedUpdates,
    updatedAt: new Date().toISOString()
  };
}
