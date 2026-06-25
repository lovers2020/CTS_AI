import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes
} from "firebase/storage";

const AUTH_EMAIL_DOMAIN = "ctrl-ai.local";
const PLACEHOLDER_VALUES = new Set(["", "YOUR_API_KEY", "YOUR_PROJECT_ID"]);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const isFirebaseConfigured = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId
].every((value) => typeof value === "string" && !PLACEHOLDER_VALUES.has(value.trim()));

const LOCAL_USERS_KEY = "ctrlAiReactPreviewUsers";
const LOCAL_RESOURCES_KEY = "ctrlAiReactPreviewResources";
const LOCAL_SESSIONS_KEY = "ctrlAiReactPreviewSessions";
const LOCAL_QUESTIONS_KEY = "ctrlAiReactPreviewQuestions";
const LOCAL_SESSION_KEY = "ctrlAiReactPreviewSession";
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
export const isLocalPreviewAuth = isLocalPreview && !isFirebaseConfigured;
export const isAuthAvailable = isFirebaseConfigured || isLocalPreviewAuth;

let app = null;
let auth = null;
let db = null;
let storage = null;

function getClient() {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  }

  return { app, auth, db, storage };
}

function requireClient() {
  const client = getClient();
  if (!client) {
    throw new Error("Firebase 환경변수를 설정한 뒤 사용할 수 있습니다.");
  }
  return client;
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function assertValidUsername(username) {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw new Error("아이디는 영문, 숫자, 마침표, 밑줄, 하이픈으로 3~24자여야 합니다.");
  }
}

function usernameToAuthEmail(username) {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

function getLocalStorage() {
  return window.sessionStorage;
}

function readLocalList(key) {
  try {
    return JSON.parse(getLocalStorage().getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeLocalList(key, value) {
  getLocalStorage().setItem(key, JSON.stringify(value));
}

function getLocalUser(username) {
  const normalized = normalizeUsername(username);
  if (normalized === LOCAL_ADMIN.username) return LOCAL_ADMIN;
  return readLocalList(LOCAL_USERS_KEY).find((user) => user.username === normalized) || null;
}

function toPublicLocalUser(user) {
  if (!user) return null;
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

function createLocalId(prefix) {
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

async function hashLocalPassword(username, password) {
  const input = new TextEncoder().encode(`${normalizeUsername(username)}:${password}:ctrl-ai-react-preview`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setLocalSession(username) {
  getLocalStorage().setItem(LOCAL_SESSION_KEY, normalizeUsername(username));
}

function upsertLocalUser(updatedUser) {
  const users = readLocalList(LOCAL_USERS_KEY);
  writeLocalList(LOCAL_USERS_KEY, users.map((user) => user.uid === updatedUser.uid ? { ...user, ...updatedUser } : user));
}

function getTime(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(String(value).replace(" ", "T")).getTime() || 0;
}

function sortByRecent(items) {
  return [...items].sort((a, b) => getTime(b.date || b.createdAt || b.updatedAt) - getTime(a.date || a.createdAt || a.updatedAt));
}

function sortMembers(items) {
  return [...items].sort((a, b) => String(a.name || a.username || "").localeCompare(String(b.name || b.username || ""), "ko"));
}

export function toAppUser(firebaseUser, profile = {}) {
  if (!firebaseUser) return null;

  return {
    uid: firebaseUser.uid,
    username: profile.username || firebaseUser.email?.split("@")[0] || "member",
    name: profile.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Ctrl + AI 멤버",
    team: profile.team || "Ctrl + AI 멤버",
    email: profile.email || "",
    interest: profile.interest || "",
    message: profile.message || "",
    status: profile.status || "active",
    role: profile.role || "member"
  };
}

export async function readMemberProfile(uid) {
  const client = getClient();
  if (!client || !uid) return {};

  const snapshot = await getDoc(doc(client.db, "members", uid));
  return snapshot.exists() ? snapshot.data() : {};
}

export function subscribeAuthState(callback) {
  if (isLocalPreviewAuth) {
    const username = getLocalStorage().getItem(LOCAL_SESSION_KEY);
    callback(toPublicLocalUser(getLocalUser(username)));
    return () => {};
  }

  const client = getClient();
  if (!client) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(client.auth, async (user) => {
    const profile = user ? await readMemberProfile(user.uid).catch(() => ({})) : {};
    callback(toAppUser(user, profile));
  });
}

async function readCollection(name) {
  const client = getClient();
  if (!client || !client.auth.currentUser) return [];

  const snapshot = await getDocs(collection(client.db, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function readResourceComments(resourceId) {
  const client = getClient();
  if (!client || !client.auth.currentUser || !resourceId) return [];

  const snapshot = await getDocs(collection(client.db, "resources", resourceId, "comments"));
  return sortByRecent(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))).reverse();
}

async function attachResourceComments(resources) {
  return Promise.all(resources.map(async (resource) => ({
    ...resource,
    comments: await readResourceComments(resource.id).catch(() => [])
  })));
}

function normalizeResourceScope(value) {
  return value === "shared" ? "shared" : "personal";
}

async function readVisibleResources(userId) {
  const client = getClient();
  if (!client || !client.auth.currentUser || !userId) return [];

  const resourcesRef = collection(client.db, "resources");
  const [personalSnapshot, sharedSnapshot] = await Promise.all([
    getDocs(query(resourcesRef, where("ownerUid", "==", userId), where("scope", "==", "personal"))),
    getDocs(query(resourcesRef, where("scope", "==", "shared")))
  ]);
  const byId = new Map();
  for (const document of [...personalSnapshot.docs, ...sharedSnapshot.docs]) {
    byId.set(document.id, { id: document.id, ...document.data() });
  }
  return [...byId.values()];
}

async function readQuestionComments(questionId) {
  const client = getClient();
  if (!client || !client.auth.currentUser || !questionId) return [];

  const snapshot = await getDocs(collection(client.db, "questions", questionId, "comments"));
  return sortByRecent(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))).reverse();
}

async function attachQuestionComments(questions) {
  return Promise.all(questions.map(async (question) => ({
    ...question,
    comments: await readQuestionComments(question.id).catch(() => [])
  })));
}

async function readStats() {
  const client = getClient();
  if (!client || !client.auth.currentUser) return {};

  const snapshot = await getDoc(doc(client.db, "site", "stats"));
  return snapshot.exists() ? snapshot.data() : {};
}

export async function fetchClubData() {
  if (isLocalPreviewAuth) {
    const members = readLocalList(LOCAL_USERS_KEY).map(toPublicLocalUser);
    return {
      resources: sortByRecent(readLocalList(LOCAL_RESOURCES_KEY)),
      sessions: sortByRecent(readLocalList(LOCAL_SESSIONS_KEY)),
      questions: sortByRecent(readLocalList(LOCAL_QUESTIONS_KEY)),
      members: sortMembers(members.map((member) => ({ ...member, id: member.uid }))),
      stats: { members: members.length }
    };
  }

  if (!isFirebaseConfigured) return null;

  const currentUser = getClient()?.auth.currentUser;
  const [resources, sessions, rawQuestions, members, stats] = await Promise.all([
    readVisibleResources(currentUser?.uid),
    readCollection("sessions"),
    readCollection("questions"),
    readCollection("members"),
    readStats()
  ]);
  const [resourcesWithComments, questions] = await Promise.all([
    attachResourceComments(resources),
    attachQuestionComments(rawQuestions)
  ]);

  return {
    resources: sortByRecent(resourcesWithComments),
    sessions: sortByRecent(sessions),
    questions: sortByRecent(questions),
    members: sortMembers(members),
    stats
  };
}

async function createMemberRegistration(member, firebaseUser) {
  const client = requireClient();
  const now = new Date().toISOString();
  const payload = {
    userUid: firebaseUser.uid,
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

  await setDoc(doc(client.db, "members", firebaseUser.uid), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return { id: firebaseUser.uid, ...payload };
}

export async function signUpMember({ username, name, team, email, interest, message, password }) {
  const normalizedUsername = normalizeUsername(username);
  assertValidUsername(normalizedUsername);

  if (isLocalPreviewAuth) {
    if (getLocalUser(normalizedUsername)) {
      throw new Error("이미 사용 중인 아이디입니다.");
    }

    const localUser = {
      uid: createLocalId("local-user"),
      username: normalizedUsername,
      name,
      team,
      email,
      interest,
      message: message || "",
      status: "active",
      role: "member",
      createdAt: new Date().toISOString(),
      passwordHash: await hashLocalPassword(normalizedUsername, password)
    };
    localUser.userUid = localUser.uid;
    writeLocalList(LOCAL_USERS_KEY, [...readLocalList(LOCAL_USERS_KEY), localUser]);
    setLocalSession(normalizedUsername);
    return { user: toPublicLocalUser(localUser), registration: toPublicLocalUser(localUser) };
  }

  const client = requireClient();
  let credential;

  try {
    credential = await createUserWithEmailAndPassword(client.auth, usernameToAuthEmail(normalizedUsername), password);
    await updateProfile(credential.user, { displayName: name });
    const registration = await createMemberRegistration({ username: normalizedUsername, name, team, email, interest, message }, credential.user);
    return { user: toAppUser(credential.user, registration), registration };
  } catch (error) {
    if (credential?.user) {
      await deleteUser(credential.user).catch(() => signOut(client.auth));
    }
    throw error;
  }
}

export async function signInMember(username, password) {
  const normalizedUsername = normalizeUsername(username);
  assertValidUsername(normalizedUsername);

  if (isLocalPreviewAuth) {
    const localUser = getLocalUser(normalizedUsername);
    const validAdmin = normalizedUsername === LOCAL_ADMIN.username && password === LOCAL_ADMIN_PASSWORD;
    const validMember = localUser?.passwordHash
      && localUser.passwordHash === await hashLocalPassword(normalizedUsername, password);

    if (!localUser || (!validAdmin && !validMember)) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    setLocalSession(normalizedUsername);
    return toPublicLocalUser(localUser);
  }

  const client = requireClient();
  const credential = await signInWithEmailAndPassword(client.auth, usernameToAuthEmail(normalizedUsername), password);
  const profile = await readMemberProfile(credential.user.uid);
  return toAppUser(credential.user, { username: normalizedUsername, ...profile });
}

export async function signOutMember() {
  if (isLocalPreviewAuth) {
    getLocalStorage().removeItem(LOCAL_SESSION_KEY);
    return;
  }

  const client = getClient();
  if (!client) return;
  await signOut(client.auth);
}

function normalizeSessionPayload(session, user) {
  const payload = {
    date: String(session.date || "").trim(),
    startTime: String(session.startTime || "").trim(),
    endTime: String(session.endTime || "").trim(),
    title: String(session.title || "").trim(),
    purpose: String(session.purpose || "").trim(),
    summary: String(session.summary || "").trim(),
    tag: String(session.tag || "일정").trim() || "일정",
    location: String(session.location || "").trim(),
    owner: String(user?.name || "Ctrl + AI 멤버").trim(),
    ownerUid: user?.uid || "",
    status: "scheduled"
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) throw new Error("날짜를 올바르게 입력해 주세요.");
  if (!/^\d{2}:\d{2}$/.test(payload.startTime) || !/^\d{2}:\d{2}$/.test(payload.endTime)) throw new Error("시작 시간과 종료 시간을 입력해 주세요.");
  if (payload.endTime <= payload.startTime) throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
  if (!payload.title) throw new Error("일정명을 입력해 주세요.");

  return payload;
}

export async function createSession(session, appUser) {
  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 일정을 추가할 수 있습니다.");

    const payload = normalizeSessionPayload(session, currentUser);
    const created = { id: createLocalId("local-session"), ...payload, createdAt: new Date().toISOString() };
    writeLocalList(LOCAL_SESSIONS_KEY, [created, ...readLocalList(LOCAL_SESSIONS_KEY)]);
    return created;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 일정을 추가할 수 있습니다.");

  const profile = await readMemberProfile(user.uid);
  const payload = normalizeSessionPayload(session, appUser || toAppUser(user, profile));
  const now = new Date().toISOString();

  const created = await addDoc(collection(client.db, "sessions"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return { id: created.id, ...payload, createdAt: now };
}

const RESOURCE_FILE_LIMIT = 20 * 1024 * 1024;

function sanitizeFileName(name) {
  const safeName = String(name || "resource-file")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^~\[\]`]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return safeName || "resource-file";
}

function normalizeResourcePayload(resource, user, fileMeta = {}) {
  const payload = {
    title: String(resource.title || "").trim(),
    body: String(resource.body || resource.summary || "").trim(),
    summary: String(resource.summary || resource.body || "").trim().slice(0, 260),
    tag: String(resource.tag || "자료").trim() || "자료",
    scope: normalizeResourceScope(resource.scope),
    owner: String(user?.name || "Ctrl + AI 멤버").trim(),
    ownerUid: user?.uid || "",
    status: "published",
    href: String(fileMeta.fileUrl || "").trim(),
    fileUrl: String(fileMeta.fileUrl || "").trim(),
    filePath: String(fileMeta.filePath || "").trim(),
    fileName: String(fileMeta.fileName || "").trim(),
    fileType: String(fileMeta.fileType || "").trim(),
    fileSize: Number(fileMeta.fileSize || 0)
  };

  if (!payload.title) throw new Error("자료 제목을 입력해 주세요.");
  if (payload.title.length > 80) throw new Error("자료 제목은 80자 이내로 입력해 주세요.");
  if (payload.body.length > 10000) throw new Error("자료 본문은 10,000자 이내로 입력해 주세요.");
  if (payload.summary.length > 260) throw new Error("자료 설명은 260자 이내로 입력해 주세요.");
  if (!payload.tag) throw new Error("자료 분류를 입력해 주세요.");
  if (payload.tag.length > 24) throw new Error("자료 분류는 24자 이내로 입력해 주세요.");

  return payload;
}

async function uploadResourceFile(client, user, file, scope = "personal") {
  if (!file) return {};
  if (file.size > RESOURCE_FILE_LIMIT) {
    throw new Error("첨부 파일은 20MB 이하만 업로드할 수 있습니다.");
  }

  const safeName = sanitizeFileName(file.name);
  const safeScope = normalizeResourceScope(scope);
  const path = `resource-files/${safeScope}/${user.uid}/${Date.now()}-${safeName}`;
  const ref = storageRef(client.storage, path);
  await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
  const fileUrl = await getDownloadURL(ref);

  return {
    fileUrl,
    filePath: path,
    fileName: file.name || safeName,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size || 0
  };
}

export async function createResource(resource, file, appUser) {
  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 자료를 등록할 수 있습니다.");

    const fileMeta = file ? {
      fileUrl: URL.createObjectURL(file),
      filePath: `local/${normalizeResourceScope(resource.scope)}/${Date.now()}-${sanitizeFileName(file.name)}`,
      fileName: file.name || "local-file",
      fileType: file.type || "application/octet-stream",
      fileSize: file.size || 0
    } : {};
    const body = String(resource.body || resource.summary || "").trim();
    if (body.length > 10000) throw new Error("자료 본문은 10,000자 이내로 입력해 주세요.");
    const payload = {
      ...normalizeResourcePayload({ ...resource, scope: normalizeResourceScope(resource.scope) }, currentUser, fileMeta),
      body,
      summary: String(resource.summary || body).trim().slice(0, 260)
    };
    const created = { id: createLocalId("local-resource"), ...payload, createdAt: new Date().toISOString() };
    writeLocalList(LOCAL_RESOURCES_KEY, [created, ...readLocalList(LOCAL_RESOURCES_KEY)]);
    return created;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 자료를 등록할 수 있습니다.");

  const profile = await readMemberProfile(user.uid);
  const currentUser = appUser || toAppUser(user, profile);
  const fileMeta = await uploadResourceFile(client, user, file, normalizeResourceScope(resource.scope));
  const body = String(resource.body || resource.summary || "").trim();
  if (body.length > 10000) throw new Error("자료 본문은 10,000자 이내로 입력해 주세요.");
  const payload = {
    ...normalizeResourcePayload({ ...resource, scope: normalizeResourceScope(resource.scope) }, currentUser, fileMeta),
    body,
    summary: String(resource.summary || body).trim().slice(0, 260)
  };
  const now = new Date().toISOString();

  const created = await addDoc(collection(client.db, "resources"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return { id: created.id, ...payload, createdAt: now };
}

function normalizeResourceEditable(resource) {
  const body = String(resource.body || resource.summary || "").trim();
  const payload = {
    title: String(resource.title || "").trim(),
    tag: String(resource.tag || "자료").trim() || "자료",
    body,
    summary: String(resource.summary || body).trim().slice(0, 260)
  };

  if (!payload.title) throw new Error("자료 제목을 입력해 주세요.");
  if (payload.title.length > 80) throw new Error("자료 제목은 80자 이내로 입력해 주세요.");
  if (payload.tag.length > 24) throw new Error("자료 분류는 24자 이내로 입력해 주세요.");
  if (payload.body.length > 10000) throw new Error("자료 본문은 10,000자 이내로 입력해 주세요.");
  return payload;
}

export async function updateResource(resourceId, updates, file, appUser) {
  if (!resourceId) throw new Error("수정할 자료를 찾을 수 없습니다.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 자료를 수정할 수 있습니다.");
    const resources = readLocalList(LOCAL_RESOURCES_KEY);
    const target = resources.find((item) => item.id === resourceId);
    if (!target) throw new Error("수정할 자료를 찾을 수 없습니다.");
    if (!canManageOwnedContent(target, currentUser)) {
      throw new Error("작성자 또는 admin만 자료를 수정할 수 있습니다.");
    }
    const payload = normalizeResourceEditable(updates);
    const filePatch = file ? {
      href: URL.createObjectURL(file),
      fileUrl: URL.createObjectURL(file),
      filePath: `local/${normalizeResourceScope(target.scope)}/${Date.now()}-${sanitizeFileName(file.name)}`,
      fileName: file.name || "local-file",
      fileType: file.type || "application/octet-stream",
      fileSize: file.size || 0
    } : {};
    const updated = { ...target, ...payload, ...filePatch, updatedAt: new Date().toISOString() };
    writeLocalList(LOCAL_RESOURCES_KEY, resources.map((item) => item.id === resourceId ? updated : item));
    return updated;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 자료를 수정할 수 있습니다.");

  const documentRef = doc(client.db, "resources", resourceId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) throw new Error("수정할 자료를 찾을 수 없습니다.");
  const current = snapshot.data();
  if (!canManageOwnedContent(current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 자료를 수정할 수 있습니다.");
  }

  const payload = normalizeResourceEditable(updates);
  const fileMeta = await uploadResourceFile(client, user, file, normalizeResourceScope(current.scope));
  const filePatch = file ? {
    href: String(fileMeta.fileUrl || "").trim(),
    fileUrl: String(fileMeta.fileUrl || "").trim(),
    filePath: String(fileMeta.filePath || "").trim(),
    fileName: String(fileMeta.fileName || "").trim(),
    fileType: String(fileMeta.fileType || "").trim(),
    fileSize: Number(fileMeta.fileSize || 0)
  } : {};

  await updateDoc(documentRef, {
    ...payload,
    ...filePatch,
    updatedAt: serverTimestamp()
  });

  return { id: resourceId, ...current, ...payload, ...filePatch, updatedAt: new Date().toISOString() };
}

export async function deleteResource(resourceId, resource, appUser) {
  if (!resourceId) throw new Error("삭제할 자료를 찾을 수 없습니다.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 자료를 삭제할 수 있습니다.");
    const resources = readLocalList(LOCAL_RESOURCES_KEY);
    const target = resources.find((item) => item.id === resourceId);
    if (!target) return resourceId;
    if (!canManageOwnedContent(target, currentUser)) {
      throw new Error("작성자 또는 admin만 자료를 삭제할 수 있습니다.");
    }
    writeLocalList(LOCAL_RESOURCES_KEY, resources.filter((item) => item.id !== resourceId));
    return resourceId;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 자료를 삭제할 수 있습니다.");

  const documentRef = doc(client.db, "resources", resourceId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) return resourceId;
  const current = snapshot.data();
  if (!canManageOwnedContent(current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 자료를 삭제할 수 있습니다.");
  }

  const comments = Array.isArray(resource?.comments) ? resource.comments : await readResourceComments(resourceId).catch(() => []);
  await Promise.all(comments.map((comment) => deleteDoc(doc(client.db, "resources", resourceId, "comments", comment.id))));
  await deleteDoc(documentRef);
  if (current.filePath) {
    await deleteObject(storageRef(client.storage, current.filePath)).catch(() => {});
  }
  return resourceId;
}

export async function createResourceComment(resourceId, comment, appUser) {
  const body = String(comment.body || "").trim();
  if (!resourceId) throw new Error("댓글을 등록할 자료를 찾을 수 없습니다.");
  if (!body) throw new Error("댓글 내용을 입력해 주세요.");
  if (body.length > 400) throw new Error("댓글은 400자 이내로 입력해 주세요.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 댓글을 등록할 수 있습니다.");

    const created = {
      id: createLocalId("local-resource-comment"),
      body,
      owner: currentUser.name,
      ownerUid: currentUser.uid,
      createdAt: new Date().toISOString()
    };
    const resources = readLocalList(LOCAL_RESOURCES_KEY);
    const target = resources.find((resource) => resource.id === resourceId);
    if (!target) throw new Error("댓글을 등록할 자료를 찾을 수 없습니다.");
    writeLocalList(LOCAL_RESOURCES_KEY, resources.map((resource) => resource.id === resourceId
      ? { ...resource, comments: [...(resource.comments || []), created] }
      : resource));
    return created;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 댓글을 등록할 수 있습니다.");

  const now = new Date().toISOString();
  const payload = {
    body,
    owner: appUser?.name || user.displayName || "Ctrl + AI 멤버",
    ownerUid: user.uid
  };

  const created = await addDoc(collection(client.db, "resources", resourceId, "comments"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return { id: created.id, ...payload, createdAt: now };
}

export async function createQuestionComment(questionId, comment, appUser) {
  const body = String(comment.body || "").trim();
  if (!questionId) throw new Error("댓글을 등록할 질문을 찾을 수 없습니다.");
  if (!body) throw new Error("댓글 내용을 입력해 주세요.");
  if (body.length > 400) throw new Error("댓글은 400자 이내로 입력해 주세요.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 댓글을 등록할 수 있습니다.");

    const created = {
      id: createLocalId("local-comment"),
      body,
      owner: currentUser.name,
      ownerUid: currentUser.uid,
      createdAt: new Date().toISOString()
    };
    const questions = readLocalList(LOCAL_QUESTIONS_KEY);
    const target = questions.find((question) => question.id === questionId);
    if (!target) throw new Error("댓글을 등록할 질문을 찾을 수 없습니다.");
    writeLocalList(LOCAL_QUESTIONS_KEY, questions.map((question) => question.id === questionId
      ? { ...question, comments: [...(question.comments || []), created] }
      : question));
    return created;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 댓글을 등록할 수 있습니다.");

  const payload = {
    body,
    owner: appUser?.name || user.displayName || "Ctrl + AI 멤버",
    ownerUid: user.uid
  };
  const created = await addDoc(collection(client.db, "questions", questionId, "comments"), {
    ...payload,
    createdAt: serverTimestamp()
  });
  return { id: created.id, ...payload, createdAt: new Date().toISOString() };
}

export async function createQuestion(question, appUser) {
  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 질문을 등록할 수 있습니다.");

    const created = {
      id: createLocalId("local-question"),
      title: String(question.title || "").trim(),
      summary: String(question.summary || "").trim(),
      tag: String(question.tag || "질문").trim() || "질문",
      owner: currentUser.name,
      ownerUid: currentUser.uid,
      status: "open",
      createdAt: new Date().toISOString(),
      comments: []
    };
    writeLocalList(LOCAL_QUESTIONS_KEY, [created, ...readLocalList(LOCAL_QUESTIONS_KEY)]);
    return created;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 질문을 등록할 수 있습니다.");

  const now = new Date().toISOString();
  const payload = {
    title: String(question.title || "").trim(),
    summary: String(question.summary || "").trim(),
    tag: String(question.tag || "질문").trim() || "질문",
    owner: appUser?.name || user.displayName || "Ctrl + AI 멤버",
    ownerUid: user.uid,
    status: "open"
  };

  const created = await addDoc(collection(client.db, "questions"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  return { id: created.id, ...payload, createdAt: now, comments: [] };
}

function canManageOwnedContent(item, appUser) {
  return Boolean(appUser?.role === "admin" || (item?.ownerUid && item.ownerUid === appUser?.uid));
}

function normalizeQuestionPayload(question) {
  const payload = {
    title: String(question.title || "").trim(),
    summary: String(question.summary || "").trim(),
    tag: String(question.tag || "질문").trim() || "질문"
  };

  if (!payload.title) throw new Error("질문 제목을 입력해 주세요.");
  if (payload.title.length > 70) throw new Error("질문 제목은 70자 이내로 입력해 주세요.");
  if (!payload.summary) throw new Error("질문 내용을 입력해 주세요.");
  if (payload.summary.length > 180) throw new Error("질문 내용은 180자 이내로 입력해 주세요.");
  if (!payload.tag) throw new Error("태그를 입력해 주세요.");
  if (payload.tag.length > 20) throw new Error("태그는 20자 이내로 입력해 주세요.");

  return payload;
}

export async function updateQuestion(questionId, updates, appUser) {
  if (!questionId) throw new Error("수정할 게시글을 찾을 수 없습니다.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 게시글을 수정할 수 있습니다.");
    const questions = readLocalList(LOCAL_QUESTIONS_KEY);
    const target = questions.find((question) => question.id === questionId);
    if (!target) throw new Error("수정할 게시글을 찾을 수 없습니다.");
    if (!canManageOwnedContent(target, currentUser)) {
      throw new Error("작성자 또는 admin만 게시글을 수정할 수 있습니다.");
    }
    const payload = normalizeQuestionPayload(updates);
    const updated = { ...target, ...payload, updatedAt: new Date().toISOString() };
    writeLocalList(LOCAL_QUESTIONS_KEY, questions.map((question) => question.id === questionId ? updated : question));
    return updated;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 게시글을 수정할 수 있습니다.");

  const documentRef = doc(client.db, "questions", questionId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) throw new Error("수정할 게시글을 찾을 수 없습니다.");
  const current = snapshot.data();
  if (!canManageOwnedContent(current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 게시글을 수정할 수 있습니다.");
  }

  const payload = normalizeQuestionPayload(updates);
  await updateDoc(documentRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });

  return { id: questionId, ...current, ...payload, updatedAt: new Date().toISOString() };
}

export async function deleteQuestion(questionId, question, appUser) {
  if (!questionId) throw new Error("삭제할 게시글을 찾을 수 없습니다.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 게시글을 삭제할 수 있습니다.");
    const questions = readLocalList(LOCAL_QUESTIONS_KEY);
    const target = questions.find((item) => item.id === questionId);
    if (!target) return questionId;
    if (!canManageOwnedContent(target, currentUser)) {
      throw new Error("작성자 또는 admin만 게시글을 삭제할 수 있습니다.");
    }
    writeLocalList(LOCAL_QUESTIONS_KEY, questions.filter((item) => item.id !== questionId));
    return questionId;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 게시글을 삭제할 수 있습니다.");

  const documentRef = doc(client.db, "questions", questionId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) return questionId;
  const current = snapshot.data();
  if (!canManageOwnedContent(current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 게시글을 삭제할 수 있습니다.");
  }

  const comments = Array.isArray(question?.comments) ? question.comments : await readQuestionComments(questionId).catch(() => []);
  await Promise.all(comments.map((comment) => deleteDoc(doc(client.db, "questions", questionId, "comments", comment.id))));
  await deleteDoc(documentRef);
  return questionId;
}

export async function updateQuestionComment(questionId, commentId, updates, appUser) {
  const body = String(updates.body || "").trim();
  if (!questionId || !commentId) throw new Error("수정할 댓글을 찾을 수 없습니다.");
  if (!body) throw new Error("댓글 내용을 입력해 주세요.");
  if (body.length > 400) throw new Error("댓글은 400자 이내로 입력해 주세요.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 댓글을 수정할 수 있습니다.");
    const questions = readLocalList(LOCAL_QUESTIONS_KEY);
    const target = questions.find((item) => item.id === questionId);
    const current = target?.comments?.find((item) => item.id === commentId);
    if (!target || !current) throw new Error("수정할 댓글을 찾을 수 없습니다.");
    if (!canManageOwnedContent(current, currentUser)) {
      throw new Error("작성자 또는 admin만 댓글을 수정할 수 있습니다.");
    }
    const updated = { ...current, body, updatedAt: new Date().toISOString() };
    writeLocalList(LOCAL_QUESTIONS_KEY, questions.map((item) => item.id === questionId
      ? { ...item, comments: (item.comments || []).map((comment) => comment.id === commentId ? updated : comment) }
      : item));
    return updated;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 댓글을 수정할 수 있습니다.");

  const documentRef = doc(client.db, "questions", questionId, "comments", commentId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) throw new Error("수정할 댓글을 찾을 수 없습니다.");
  const current = snapshot.data();
  if (!canManageOwnedContent(current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 댓글을 수정할 수 있습니다.");
  }

  await updateDoc(documentRef, {
    body,
    updatedAt: serverTimestamp()
  });

  return { id: commentId, ...current, body, updatedAt: new Date().toISOString() };
}

export async function deleteQuestionComment(questionId, commentId, comment, appUser) {
  if (!questionId || !commentId) throw new Error("삭제할 댓글을 찾을 수 없습니다.");

  if (isLocalPreviewAuth) {
    const currentUser = appUser || toPublicLocalUser(getLocalUser(getLocalStorage().getItem(LOCAL_SESSION_KEY)));
    if (!currentUser) throw new Error("로그인 후 댓글을 삭제할 수 있습니다.");
    const questions = readLocalList(LOCAL_QUESTIONS_KEY);
    const target = questions.find((item) => item.id === questionId);
    const current = target?.comments?.find((item) => item.id === commentId);
    if (!target || !current) return commentId;
    if (!canManageOwnedContent(comment || current, currentUser)) {
      throw new Error("작성자 또는 admin만 댓글을 삭제할 수 있습니다.");
    }
    writeLocalList(LOCAL_QUESTIONS_KEY, questions.map((item) => item.id === questionId
      ? { ...item, comments: (item.comments || []).filter((entry) => entry.id !== commentId) }
      : item));
    return commentId;
  }

  const client = requireClient();
  const user = client.auth.currentUser;
  if (!user) throw new Error("로그인 후 댓글을 삭제할 수 있습니다.");

  const documentRef = doc(client.db, "questions", questionId, "comments", commentId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) return commentId;
  const current = snapshot.data();
  if (!canManageOwnedContent(comment || current, appUser || { uid: user.uid })) {
    throw new Error("작성자 또는 admin만 댓글을 삭제할 수 있습니다.");
  }

  await deleteDoc(documentRef);
  return commentId;
}

export async function updateMemberProfile(memberId, updates, appUser) {
  if (appUser?.role !== "admin") {
    throw new Error("admin 권한이 필요합니다.");
  }

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
    const target = readLocalList(LOCAL_USERS_KEY).find((user) => user.uid === memberId);
    if (!target) throw new Error("수정할 멤버를 찾을 수 없습니다.");
    const updated = { ...target, ...allowedUpdates, updatedAt: new Date().toISOString() };
    upsertLocalUser(updated);
    return { id: memberId, ...toPublicLocalUser(updated) };
  }

  const client = requireClient();
  const documentRef = doc(client.db, "members", memberId);
  const snapshot = await getDoc(documentRef);
  if (!snapshot.exists()) throw new Error("수정할 멤버를 찾을 수 없습니다.");

  await updateDoc(documentRef, {
    ...allowedUpdates,
    updatedAt: serverTimestamp()
  });

  return { id: memberId, ...snapshot.data(), ...allowedUpdates, updatedAt: new Date().toISOString() };
}
