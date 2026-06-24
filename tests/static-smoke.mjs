import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "index.html",
  "package.json",
  "vite.config.js",
  "src/main.jsx",
  "src/lib/firebase.js",
  "src/styles.css",
  "firestore.rules",
  "storage.rules",
  "firebase.json",
  "vercel.json"
];

for (const file of required) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing file: ${file}`);
  }
}

const html = readFileSync(join(root, "index.html"), "utf8");
if (!html.includes('id="root"')) throw new Error("React root is missing");
if (!html.includes('/src/main.jsx')) throw new Error("React entry script is missing");

const app = readFileSync(join(root, "src/main.jsx"), "utf8");
for (const token of [
  "function App",
  "AuthScreen",
  "ResourcesPage",
  "ResourceModal",
  "ResourceFileDrop",
  "SchedulePage",
  "CalendarGrid",
  "DatePickerField",
  "TimePickerField",
  "QuestionsPage",
  "QuestionDetailModal",
  "createRoot"
]) {
  if (!app.includes(token)) throw new Error(`Expected React token missing: ${token}`);
}
if (!app.includes('if (!user) {')) {
  throw new Error("Unauthenticated users should land on the auth screen first");
}
if (app.includes("LandingPublic")) {
  throw new Error("Public landing should not render before login");
}
if (app.includes("data-page-section") || app.includes("innerHTML")) {
  throw new Error("Legacy DOM rendering markers should not remain");
}
for (const token of [
  "createResource",
  "updateResource",
  "createResourceComment",
  "notion-resource-page",
  "ResourceFileDrop",
  "updateQuestion",
  "deleteQuestion",
  "updateQuestionComment",
  "deleteQuestionComment",
  "comment-edit-panel",
  "mini-action"
]) {
  if (!app.includes(token)) throw new Error(`Expected feature token missing: ${token}`);
}
if (app.includes('type="date"') || app.includes('type="time"')) {
  throw new Error("Native date/time inputs should not be used for the schedule modal");
}
if (!app.includes("picker-popover") || !app.includes("mini-calendar") || !app.includes("time-chip-grid")) {
  throw new Error("Custom date/time picker UI should be present");
}
if (app.includes(".reset(") || app.includes("currentTarget.reset") || app.includes("target.reset")) {
  throw new Error("Comment/question submit handlers should not call form reset");
}
if (!app.includes("isLocalPreviewAuth") || !app.includes("admin / 123123")) {
  throw new Error("Local admin preview notice should remain in the UI");
}

const firebaseModule = readFileSync(join(root, "src/lib/firebase.js"), "utf8");
for (const token of [
  "LOCAL_ADMIN_PASSWORD",
  "LOCAL_RESOURCES_KEY",
  "isLocalPreviewAuth",
  "sessionStorage",
  "createResource",
  "updateResource",
  "createResourceComment",
  "createQuestionComment",
  "updateQuestionComment",
  "deleteQuestionComment",
  "readResourceComments"
]) {
  if (!firebaseModule.includes(token)) throw new Error(`Local preview feature missing: ${token}`);
}
if (firebaseModule.includes("localStorage")) {
  throw new Error("Local preview credentials must not persist in localStorage");
}

const css = readFileSync(join(root, "src/styles.css"), "utf8");
for (const token of [
  "Pretendard",
  ".picker-popover",
  ".time-chip-grid",
  ".mini-action",
  ".comment-edit-panel",
  ".notion-resource-page",
  ".notion-sidebar",
  ".notion-document",
  ".resource-file-drop",
  ".schedule-cta",
  ".stack-card:hover",
  "cursor: default",
  ".nav-card",
  "repeat(5, 92px)"
]) {
  if (!css.includes(token)) throw new Error(`Expected CSS token missing: ${token}`);
}

const rules = readFileSync(join(root, "firestore.rules"), "utf8");
for (const token of [
  "isValidResource",
  "isValidResourceUpdate",
  "isValidQuestionUpdate",
  "isValidCommentUpdate",
  "match /comments/{commentId}",
  "isQuestionOwner",
  "\"body\""
]) {
  if (!rules.includes(token)) throw new Error(`Expected rules token missing: ${token}`);
}

const storageRules = readFileSync(join(root, "storage.rules"), "utf8");
if (!storageRules.includes("resource-files") || !storageRules.includes("20 * 1024 * 1024")) {
  throw new Error("Storage rules should protect resource file uploads");
}

JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const firebaseConfig = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
if (!firebaseConfig.storage?.rules) throw new Error("firebase.json should include storage rules");
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const csp = vercel.headers?.[0]?.headers?.find((item) => item.key === "Content-Security-Policy")?.value || "";
if (!csp.includes("cdn.jsdelivr.net")) throw new Error("Pretendard CDN should be allowed by CSP");
if (!csp.includes("firebasestorage.googleapis.com")) throw new Error("Firebase Storage should be allowed by CSP");

console.log("static smoke passed");
