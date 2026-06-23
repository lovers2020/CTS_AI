import { webcrypto } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const storage = new Map();
const sessionStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const context = vm.createContext({
  console,
  crypto: webcrypto,
  TextEncoder,
  window: {
    location: { hostname: "127.0.0.1" },
    sessionStorage
  },
  sessionStorage
});

vm.runInContext(fs.readFileSync("scripts/firebase.js", "utf8"), context);

const admin = await vm.runInContext('signInMember("admin", "123123")', context);

if (admin.username !== "admin" || admin.role !== "admin") {
  throw new Error("Local admin login did not return the expected account.");
}

await vm.runInContext("signOutMember()", context);

const signupResult = await vm.runInContext(`signUpMember({
  username: "qa.user",
  name: "QA 사용자",
  team: "품질팀",
  email: "qa.user@example.com",
  interest: "업무 자동화",
  message: "로컬 미리보기 테스트",
  password: "123123"
})`, context);

if (signupResult.user.username !== "qa.user" || signupResult.user.name !== "QA 사용자") {
  throw new Error("Local signup did not return the expected account.");
}

const restored = await vm.runInContext("getCurrentUser()", context);

if (restored?.username !== "qa.user") {
  throw new Error("Local preview session was not restored.");
}

await vm.runInContext("signOutMember()", context);

const signedIn = await vm.runInContext('signInMember("qa.user", "123123")', context);

if (signedIn.username !== "qa.user") {
  throw new Error("Local preview login did not return the expected account.");
}

let invalidPasswordRejected = false;

try {
  await vm.runInContext('signInMember("qa.user", "wrong-password")', context);
} catch (error) {
  invalidPasswordRejected = error?.code === "auth/invalid-credential";
}

if (!invalidPasswordRejected) {
  throw new Error("An invalid local preview password was not rejected.");
}

await vm.runInContext("signOutMember()", context);
await vm.runInContext('signInMember("admin", "123123")', context);

const memberList = await vm.runInContext("fetchClubData()", context);

if (memberList.members.length !== 1) {
  throw new Error("Local preview member list did not include all signed-up users.");
}

const qaMember = memberList.members.find((member) => member.username === "qa.user");
await vm.runInContext(`updateMemberProfile("${qaMember.uid}", {
  name: "QA 수정",
  team: "품질보증팀",
  email: "qa.edit@example.com",
  interest: "데이터 분석",
  message: "관리자 수정 테스트",
  status: "active",
  role: "member"
})`, context);

const updatedList = await vm.runInContext("fetchClubData()", context);
const updatedQaMember = updatedList.members.find((member) => member.username === "qa.user");

if (updatedQaMember.name !== "QA 수정" || updatedQaMember.team !== "품질보증팀") {
  throw new Error("Admin member update was not reflected in local preview data.");
}


const createdSession = await vm.runInContext(`createSession({
  date: "2026-06-23",
  startTime: "10:00",
  endTime: "11:00",
  title: "AI 회의록 자동화 실습",
  summary: "회의록 요약 프롬프트를 실습합니다.",
  tag: "실습",
  location: "3층 회의실",
  owner: "관리자"
})`, context);

if (createdSession.title !== "AI 회의록 자동화 실습" || createdSession.startTime !== "10:00") {
  throw new Error("Local preview session creation did not return the expected schedule.");
}

const dataWithSession = await vm.runInContext("fetchClubData()", context);

if (!dataWithSession.sessions.some((session) => session.title === "AI 회의록 자동화 실습")) {
  throw new Error("Created local preview session was not included in club data.");
}

console.log("LOCAL_AUTH_SMOKE_OK");
