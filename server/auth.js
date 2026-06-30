import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import initSqlJs from "sql.js";

const scrypt = promisify(scryptCallback);

const PHONE_RE = /^1[3-9]\d{9}$/;
const SESSION_DAYS = 14;
const WELCOME_CREDITS = 30;
const CODE_TTL_MINUTES = 10;
const PHONE_CODE_DAILY_LIMIT = 5;
const IP_CODE_DAILY_LIMIT = 20;
const IP_WELCOME_DAILY_LIMIT = 3;

let db;
let dbPath;
let saveTimer = null;

export async function initAuth({ dataDir }) {
  dbPath = path.join(dataDir, "app.sqlite");
  const SQL = await initSqlJs();
  if (existsSync(dbPath)) {
    db = new SQL.Database(await fs.readFile(dbPath));
  } else {
    db = new SQL.Database();
  }
  migrate();
  await saveDb();
}

export async function handleAuthRoute(req, res, url, { readJson, json, getClientIp }) {
  if (req.method === "POST" && url.pathname === "/api/auth/send-code") {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const ip = getClientIp(req);
    assertPhone(phone);
    assertRateLimit("sms_phone", phone, PHONE_CODE_DAILY_LIMIT, "这个手机号今天获取验证码太频繁了，请明天再试。");
    assertRateLimit("sms_ip", ip, IP_CODE_DAILY_LIMIT, "当前网络今天获取验证码太频繁了，请稍后再试。");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
    run(
      `insert into sms_codes (id, phone, code, purpose, expires_at, consumed_at, ip, created_at)
       values (?, ?, ?, 'login', ?, null, ?, ?)`,
      [randomUUID(), phone, code, expiresAt, ip, now.toISOString()]
    );
    recordIpEvent(ip, "sms_phone", phone);
    recordIpEvent(ip, "sms_ip", ip);
    scheduleSave();
    console.log(`[auth] dev sms code for ${phone}: ${code}`);
    return json(res, { ok: true, devCode: code, expiresIn: CODE_TTL_MINUTES * 60 });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const code = String(body.code || "").trim();
    const ip = getClientIp(req);
    assertPhone(phone);
    if (!/^\d{6}$/.test(code)) throw statusError("验证码格式不正确。", 400);

    const codeRow = get(
      `select * from sms_codes
       where phone = ? and code = ? and purpose = 'login' and consumed_at is null
       order by created_at desc limit 1`,
      [phone, code]
    );
    if (!codeRow || new Date(codeRow.expires_at).getTime() < Date.now()) {
      throw statusError("验证码错误或已过期。", 400);
    }

    run("update sms_codes set consumed_at = ? where id = ?", [new Date().toISOString(), codeRow.id]);
    const isNew = !get("select id from users where phone = ?", [phone]);
    const user = isNew ? createUser({ phone, ip }) : getUserByPhone(phone);
    const welcome = isNew ? grantWelcomeCredits(user, ip) : null;
    const session = createSession(user.id, ip, req.headers["user-agent"] || "");
    recordIpEvent(ip, isNew ? "register" : "login", phone);
    scheduleSave();

    setSessionCookie(res, session.token);
    return json(res, {
      ok: true,
      user: serializeUser(user),
      credits: getBalance(user.id),
      welcome
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const session = getSession(req);
    if (session) {
      run("delete from sessions where token = ?", [session.token]);
      scheduleSave();
    }
    clearSessionCookie(res);
    return json(res, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = getCurrentUser(req);
    if (!user) return json(res, { user: null, credits: 0 });
    return json(res, { user: serializeUser(user), credits: getBalance(user.id) });
  }

  if (req.method === "GET" && url.pathname === "/api/credits/ledger") {
    const user = requireUser(req);
    const rows = all(
      `select type, amount, balance_before, balance_after, description, created_at
       from credit_ledger where user_id = ? order by created_at desc limit 80`,
      [user.id]
    );
    return json(res, { credits: getBalance(user.id), ledger: rows });
  }

  return false;
}

export function getCurrentUser(req) {
  const session = getSession(req);
  if (!session) return null;
  const user = get("select * from users where id = ? and status = 'active'", [session.user_id]);
  return user || null;
}

export function requireUser(req) {
  const user = getCurrentUser(req);
  if (!user) throw statusError("请先登录后再使用。", 401);
  return user;
}

export function getBalance(userId) {
  const row = get("select balance from credit_accounts where user_id = ?", [userId]);
  return row ? Number(row.balance) : 0;
}

export function addCredits({ userId, amount, type, description, refId = "" }) {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Invalid credit amount.");
  const before = getBalance(userId);
  const after = before + amount;
  if (after < 0) throw statusError("积分余额不足。", 402);
  run(
    `insert into credit_ledger (id, user_id, type, amount, balance_before, balance_after, description, ref_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, type, amount, before, after, description || "", refId, new Date().toISOString()]
  );
  run(
    `insert into credit_accounts (user_id, balance, updated_at) values (?, ?, ?)
     on conflict(user_id) do update set balance = excluded.balance, updated_at = excluded.updated_at`,
    [userId, after, new Date().toISOString()]
  );
  scheduleSave();
  return { before, after };
}

export function statusError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function migrate() {
  db.run(`
    create table if not exists users (
      id text primary key,
      phone text not null unique,
      nickname text not null,
      role text not null default 'user',
      status text not null default 'active',
      created_ip text,
      created_at text not null,
      last_login_at text
    );
    create table if not exists sms_codes (
      id text primary key,
      phone text not null,
      code text not null,
      purpose text not null,
      expires_at text not null,
      consumed_at text,
      ip text,
      created_at text not null
    );
    create table if not exists sessions (
      token text primary key,
      user_id text not null,
      ip text,
      user_agent text,
      expires_at text not null,
      created_at text not null
    );
    create table if not exists ip_events (
      id text primary key,
      ip text not null,
      event_type text not null,
      subject text,
      created_at text not null
    );
    create table if not exists credit_accounts (
      user_id text primary key,
      balance integer not null default 0,
      updated_at text not null
    );
    create table if not exists credit_ledger (
      id text primary key,
      user_id text not null,
      type text not null,
      amount integer not null,
      balance_before integer not null,
      balance_after integer not null,
      description text,
      ref_id text,
      created_at text not null
    );
    create index if not exists idx_sms_phone_created on sms_codes(phone, created_at);
    create index if not exists idx_ip_events_type_ip_created on ip_events(event_type, ip, created_at);
    create index if not exists idx_credit_ledger_user_created on credit_ledger(user_id, created_at);
  `);
}

function createUser({ phone, ip }) {
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    phone,
    nickname: `用户${phone.slice(-4)}`,
    role: "user",
    status: "active",
    created_ip: ip,
    created_at: now,
    last_login_at: now
  };
  run(
    `insert into users (id, phone, nickname, role, status, created_ip, created_at, last_login_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.phone, user.nickname, user.role, user.status, user.created_ip, user.created_at, user.last_login_at]
  );
  run("insert into credit_accounts (user_id, balance, updated_at) values (?, 0, ?)", [user.id, now]);
  return user;
}

function grantWelcomeCredits(user, ip) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = get(
    `select count(*) as count from ip_events
     where event_type = 'welcome_grant' and ip = ? and created_at >= ?`,
    [ip, since]
  )?.count || 0;
  if (count >= IP_WELCOME_DAILY_LIMIT) {
    return { granted: false, amount: 0, reason: "当前网络今天领取新手积分的账号较多，本账号暂不发放赠送积分。" };
  }
  addCredits({
    userId: user.id,
    amount: WELCOME_CREDITS,
    type: "welcome",
    description: "注册送体验积分"
  });
  recordIpEvent(ip, "welcome_grant", user.phone);
  return { granted: true, amount: WELCOME_CREDITS };
}

function createSession(userId, ip, userAgent) {
  const now = new Date();
  const session = {
    token: randomBytes(32).toString("base64url"),
    user_id: userId,
    ip,
    user_agent: String(userAgent || "").slice(0, 240),
    expires_at: new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now.toISOString()
  };
  run(
    "insert into sessions (token, user_id, ip, user_agent, expires_at, created_at) values (?, ?, ?, ?, ?, ?)",
    [session.token, session.user_id, session.ip, session.user_agent, session.expires_at, session.created_at]
  );
  run("update users set last_login_at = ? where id = ?", [session.created_at, userId]);
  return session;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie || "").sid;
  if (!token) return null;
  const session = get("select * from sessions where token = ?", [token]);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    run("delete from sessions where token = ?", [token]);
    scheduleSave();
    return null;
  }
  return session;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function assertRateLimit(eventType, subject, limit, message) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = get(
    "select count(*) as count from ip_events where event_type = ? and subject = ? and created_at >= ?",
    [eventType, subject, since]
  )?.count || 0;
  if (count >= limit) throw statusError(message, 429);
}

function recordIpEvent(ip, eventType, subject = "") {
  run(
    "insert into ip_events (id, ip, event_type, subject, created_at) values (?, ?, ?, ?, ?)",
    [randomUUID(), ip, eventType, subject, new Date().toISOString()]
  );
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function assertPhone(phone) {
  if (!PHONE_RE.test(phone)) throw statusError("请输入有效的中国大陆手机号。", 400);
}

function getUserByPhone(phone) {
  return get("select * from users where phone = ?", [phone]);
}

function serializeUser(user) {
  return {
    id: user.id,
    phone: maskPhone(user.phone),
    nickname: user.nickname,
    role: user.role,
    createdAt: user.created_at
  };
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } finally {
    stmt.free();
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDb().catch((error) => console.error("Could not save auth database:", error));
  }, 150);
}

async function saveDb() {
  if (!db || !dbPath) return;
  await fs.writeFile(dbPath, Buffer.from(db.export()));
}
