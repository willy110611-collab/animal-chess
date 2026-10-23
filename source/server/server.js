// ===== 動物戰棋 伺服器（Cloudflare Workers + Durable Objects）=====
// 整場遊戲在伺服器上跑（玩家只送操作），帳號、天梯分數也只存在伺服器：玩家改自己的瀏覽器改不了結果。
// 前面接上 data.js / engine.js / game.js（打包時串在一起）。
import { DurableObject } from 'cloudflare:workers';

const SV = {
  ORIGINS: ['https://willy110611-collab.github.io', 'http://localhost:8123', 'http://127.0.0.1:8123'],
  VERSION: '__VER__',    // 打包時自動填入（跟網站版本一致），一鍵更新用來確認伺服器已部署新版
  TICK_MS: 100,          // 伺服器遊戲迴圈
  SNAP_MS: 250,          // 多久檢查一次要不要送畫面
  SNAP_KEEPALIVE_MS: 2000, // 畫面沒變時，最久多久還是送一次（校正倒數計時）
  BTICK_MS: 200,         // 戰鬥中多久送一次 tick
  JOIN_WAIT_MS: 15000,   // 配對成功後最多等成員進房多久
  IDLE_CLOSE_MS: 120000, // 房間沒人多久關掉
  PBKDF2_ITER: 60000,    // 密碼雜湊強度
  SESSION_DAYS: 120,
  ACTIVE_MAX_MS: 4 * 3600e3, // 「回到對局」紀錄最多保留多久（一場不會打這麼久）
  REG_PER_IP_DAY: 5,     // 同一個 IP 一天最多註冊幾個帳號（擋大量分身）
  LOGIN_FAIL_HOUR: 10,   // 同一帳號一小時最多輸錯幾次
  MM_SAME_TZ: 2, MM_WIDEN_MS: 20000,
  META: { MIN_UNITS: 4, MAX: 300, SEND: 60, MIN_GAMES: 6, MIN_WR: 0.35, KEEP_DAYS: 30 }, // 電腦模仿陣容庫：最多幾套、每次給電腦幾套、用過幾場後勝率低於多少就刪、多久沒更新就刪
  LADDER: { WIN2: 24, LOSE2: -18, PLACE4: [0, 36, 16, -10, -24], ELO_SPAN: 250, SOLO_TOP: 36 }, // SOLO_TOP：單人混戰第 1 名基本分（最後一名 −36，中間平均分配）
};
const AI_NAMES_S = ['阿熊', '野狼幫甲', '野狼幫乙', '河馬團甲', '河馬團乙', '鴨鴨隊甲', '鴨鴨隊乙', '狸貓'];
const MM_ORDER_S = { 4: [0, 2, 1, 3], 8: [0, 2, 4, 6, 1, 3, 5, 7], solo: [0, 1, 2, 3, 4, 5, 6, 7], duel: [0, 1] };
const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
function roomCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(4)); return [...r].map(x => A[x % A.length]).join(''); }

function cors(req) {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': SV.ORIGINS.includes(o) ? o : SV.ORIGINS[0], 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
}
const json = (req, obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(req)) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const acc = env.ACC.get(env.ACC.idFromName('main'));
    const ip = req.headers.get('CF-Connecting-IP') || '0';
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    try {
      if (p === '/api/register' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.register(String(b.user || ''), String(b.pass || ''), String(b.name || ''), ip)); }
      if (p === '/api/login' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.login(String(b.user || ''), String(b.pass || ''))); }
      if (p === '/api/me') return json(req, await acc.me(tok));
      if (p === '/api/rename' && req.method === 'POST') { const b = await req.json(); return json(req, await acc.rename(tok, String(b.name || ''))); }
      if (p === '/api/logout' && req.method === 'POST') return json(req, await acc.logout(tok));
      if (p === '/api/ladder') return json(req, await acc.ladder(tok, url.searchParams.get('mode') || 'duo'));
      if (p === '/api/meta') return json(req, { ok: true, list: await acc.getMeta() });
      if (p === '/api/active') { // 重開 App：有沒有還沒打完、自己也還沒被淘汰的對局
        const a = await acc.getActive(tok); if (!a) return json(req, { ok: true, code: '' });
        const st = await env.ROOM.get(env.ROOM.idFromName(a.code)).status(a.uid).catch(() => null);
        if (!st || !st.alive) { await acc.clearActive([a.uid], a.code); return json(req, { ok: true, code: '' }); }
        return json(req, { ok: true, code: a.code });
      }
      if (p === '/api/ping') return json(req, { ok: true, t: Date.now(), v: SV.VERSION, colo: (req.cf && req.cf.colo) || '' });
      if (req.headers.get('Upgrade') === 'websocket') {
        let m;
        if (p === '/ws/new') { const code = roomCode(), solo = url.searchParams.get('solo') === '1', md = solo ? Math.max(2, Math.min(8, +url.searchParams.get('mode') || 8)) : (url.searchParams.get('mode') === '8' ? 8 : 4); return env.ROOM.get(env.ROOM.idFromName(code)).fetch(new Request(url.origin + '/ws?code=' + code + '&mode=' + md + (solo ? '&solo=1' : ''), req)); }
        if ((m = p.match(/^\/ws\/room\/([A-Z0-9]{4})$/))) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(new Request(url.origin + '/ws?code=' + m[1], req));
        if (p === '/ws/mm') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
      }
      return json(req, { err: 'not found' }, 404);
    } catch (e) { return json(req, { err: '伺服器錯誤' }, 500); }
  },
};

// ===================== 帳號與天梯 =====================
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, user TEXT UNIQUE, salt TEXT, hash TEXT, name TEXT, lp INTEGER DEFAULT 0, games INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, created INTEGER, ip TEXT);
      CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, uid TEXT, exp INTEGER);
      CREATE TABLE IF NOT EXISTS fails (user TEXT, t INTEGER);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, t INTEGER, data TEXT);
      CREATE INDEX IF NOT EXISTS users_lp ON users(lp DESC);`);
    // v0.12：單人天梯分開計分（舊資料表補欄位）
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, data TEXT, n INTEGER, games INTEGER DEFAULT 1, wins INTEGER DEFAULT 1, t INTEGER)');
    for (const c of ['lp1', 'games1', 'wins1']) { try { this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} INTEGER DEFAULT 0`); } catch (e) {} }
    // v0.12.5：每個帳號正在打的對局（重開 App 自動回到同一場）
    this.sql.exec('CREATE TABLE IF NOT EXISTS active (uid TEXT PRIMARY KEY, code TEXT, t INTEGER)');
  }
  async hashPw(pass, salt) {
    const k = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: SV.PBKDF2_ITER }, k, 256));
  }
  row(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  pub(u) { return u ? { uid: u.uid, user: u.user, name: u.name, lp: u.lp, games: u.games, wins: u.wins, lp1: u.lp1 || 0, games1: u.games1 || 0, wins1: u.wins1 || 0 } : null; }
  newSession(uid) { const tok = rand(24); this.sql.exec('INSERT INTO sessions VALUES (?,?,?)', tok, uid, Date.now() + SV.SESSION_DAYS * 864e5); return tok; }
  async register(user, pass, name, ip) {
    user = user.trim().toLowerCase(); name = name.trim().slice(0, 8);
    if (!/^[a-z0-9_]{3,16}$/.test(user)) return { err: '帳號要 3～16 個英文小寫、數字或底線' };
    if (pass.length < 6 || pass.length > 64) return { err: '密碼要 6～64 個字' };
    if (!name) return { err: '請填暱稱' };
    if (this.row('SELECT uid FROM users WHERE user=?', user)) return { err: '這個帳號已經有人用了' };
    const n = this.row('SELECT COUNT(*) AS n FROM users WHERE ip=? AND created>?', ip, Date.now() - 864e5).n;
    if (n >= SV.REG_PER_IP_DAY && !['127.0.0.1', '::1', '0'].includes(ip)) return { err: '這個網路今天註冊太多帳號了，明天再試' };
    const uid = 'u' + rand(6), salt = rand(12);
    this.sql.exec('INSERT INTO users (uid,user,salt,hash,name,created,ip) VALUES (?,?,?,?,?,?,?)', uid, user, salt, await this.hashPw(pass, salt), name, Date.now(), ip);
    return { ok: true, token: this.newSession(uid), me: this.pub(this.row('SELECT * FROM users WHERE uid=?', uid)) };
  }
  async login(user, pass) {
    user = user.trim().toLowerCase();
    const fails = this.row('SELECT COUNT(*) AS n FROM fails WHERE user=? AND t>?', user, Date.now() - 36e5).n;
    if (fails >= SV.LOGIN_FAIL_HOUR) return { err: '輸錯太多次，請一小時後再試' };
    const u = this.row('SELECT * FROM users WHERE user=?', user);
    if (!u || (await this.hashPw(pass, u.salt)) !== u.hash) { this.sql.exec('INSERT INTO fails VALUES (?,?)', user, Date.now()); return { err: '帳號或密碼不對' }; }
    this.sql.exec('DELETE FROM sessions WHERE exp<?', Date.now());
    return { ok: true, token: this.newSession(u.uid), me: this.pub(u) };
  }
  verify(tok) {
    if (!tok) return null;
    const s = this.row('SELECT uid, exp FROM sessions WHERE tok=?', String(tok));
    if (!s || s.exp < Date.now()) return null;
    return this.pub(this.row('SELECT * FROM users WHERE uid=?', s.uid));
  }
  async me(tok) { const u = this.verify(tok); return u ? { ok: true, me: u } : { err: '請重新登入' }; }
  async logout(tok) { this.sql.exec('DELETE FROM sessions WHERE tok=?', String(tok)); return { ok: true }; }
  async rename(tok, name) { const u = this.verify(tok); name = name.trim().slice(0, 8); if (!u) return { err: '請重新登入' }; if (!name) return { err: '請填暱稱' }; this.sql.exec('UPDATE users SET name=? WHERE uid=?', name, u.uid); return { ok: true, me: this.verify(tok) }; }
  async ladder(tok, mode) {
    const [L, Gm, W] = mode === 'solo' ? ['lp1', 'games1', 'wins1'] : ['lp', 'games', 'wins'];
    const top = this.sql.exec(`SELECT uid, name, ${L} AS lp, ${Gm} AS games, ${W} AS wins FROM users WHERE ${Gm}>0 ORDER BY ${L} DESC, ${Gm} DESC LIMIT 100`).toArray();
    const total = this.row(`SELECT COUNT(*) AS n FROM users WHERE ${Gm}>0`).n;
    const u = this.verify(tok); let rank = 0;
    const ul = u ? (mode === 'solo' ? u.lp1 : u.lp) : 0, ug = u ? (mode === 'solo' ? u.games1 : u.games) : 0;
    if (u && ug) rank = this.row(`SELECT COUNT(*) AS n FROM users WHERE ${Gm}>0 AND (${L}>? OR (${L}=? AND ${Gm}>?))`, ul, ul, ug).n + 1;
    return { ok: true, top, total, me: u, rank, mode: mode === 'solo' ? 'solo' : 'duo' };
  }
  // ---- 進行中的對局 ----
  async setActive(uids, code) { for (const u of uids) this.sql.exec('INSERT OR REPLACE INTO active VALUES (?,?,?)', String(u), String(code), Date.now()); return { ok: true }; }
  async clearActive(uids, code) { for (const u of uids) this.sql.exec('DELETE FROM active WHERE uid=? AND code=?', String(u), String(code)); return { ok: true }; }
  async getActive(tok) {
    const u = this.verify(tok); if (!u) return null;
    const r = this.row('SELECT code, t FROM active WHERE uid=?', u.uid);
    if (!r) return null;
    if (Date.now() - r.t > SV.ACTIVE_MAX_MS) { this.sql.exec('DELETE FROM active WHERE uid=?', u.uid); return null; }
    return { uid: u.uid, code: r.code };
  }
  // ---- 電腦模仿玩家：高勝率陣容庫 ----
  // 收進「打出好名次的真人陣容」；電腦用過後回報名次。勝率 =（好名次+1）/（場數+2）；勝率太低或太舊的慢慢淘汰
  async metaAdd(comps, results) {
    const now = Date.now();
    for (const c of comps || []) {
      if (!Array.isArray(c.units) || c.units.length < SV.META.MIN_UNITS || c.units.length > 12) continue;
      const units = c.units.filter(u => Array.isArray(u) && typeof u[0] === 'string' && u[0].length < 20).map(u => [u[0], +u[1] || 1, +u[2] || 0, +u[3] || 0]);
      const id = units.map(u => u[0]).sort().join(',');
      if (this.row('SELECT id FROM meta WHERE id=?', id)) this.sql.exec('UPDATE meta SET data=?, games=games+1, wins=wins+1, t=? WHERE id=?', JSON.stringify(units), now, id);
      else this.sql.exec('INSERT INTO meta (id,data,n,games,wins,t) VALUES (?,?,?,1,1,?)', id, JSON.stringify(units), +c.n || 2, now);
    }
    for (const r of results || []) if (r && r.id) this.sql.exec('UPDATE meta SET games=games+1, wins=wins+? WHERE id=?', r.good ? 1 : 0, String(r.id));
    const M = SV.META;
    this.sql.exec('DELETE FROM meta WHERE games>=? AND (wins*1.0/games)<?', M.MIN_GAMES, M.MIN_WR);
    this.sql.exec('DELETE FROM meta WHERE t<?', now - M.KEEP_DAYS * 864e5);
    this.sql.exec('DELETE FROM meta WHERE id NOT IN (SELECT id FROM meta ORDER BY (wins+1.0)/(games+2) DESC, t DESC LIMIT ?)', M.MAX);
    return { ok: true };
  }
  async getMeta() {
    return this.sql.exec('SELECT id, data, games, wins FROM meta ORDER BY (wins+1.0)/(games+2) DESC LIMIT ?', SV.META.SEND).toArray().map(r => ({ id: r.id, units: JSON.parse(r.data), wr: Math.round((r.wins + 1) / (r.games + 2) * 100) / 100, games: r.games }));
  }
  // 一場（或一隊被淘汰時）結算：plist = [{uid, team, place}]，teamsLp 由這裡查
  async settle(matchId, n, plist, teamOfAll, solo) {
    const res = {}, LC = solo ? 'lp1' : 'lp', GC = solo ? 'games1' : 'games', WC = solo ? 'wins1' : 'wins';
    const lpOf = uid => { const u = this.row(`SELECT ${LC} AS v FROM users WHERE uid=?`, uid); return u ? (u.v || 0) : 0; };
    const humans = teamOfAll.map(x => ({ uid: x.uid, team: x.team, lp: lpOf(x.uid) }));
    const avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const allAvg = avg(humans.map(h => h.lp));
    const teamLp = t => { const v = humans.filter(h => h.team === t).map(h => h.lp); return v.length ? avg(v) : allAvg; };
    for (const p of plist) {
      const key = matchId + ':' + p.uid;
      if (this.row('SELECT id FROM matches WHERE id=?', key)) continue; // 同一場只算一次
      const L = SV.LADDER, base = n === 2 ? (p.place === 1 ? L.WIN2 : L.LOSE2) : solo ? Math.round(L.SOLO_TOP - (p.place - 1) * 2 * L.SOLO_TOP / (n - 1)) : L.PLACE4[Math.min(4, p.place)];
      const opp = avg(Array.from({ length: n }, (_, t) => t).filter(t => t !== p.team).map(teamLp));
      const diff = Math.max(-500, Math.min(500, opp - teamLp(p.team))) / L.ELO_SPAN;
      let d = base > 0 ? base * (1 + 0.5 * diff) : base * (1 - 0.5 * diff);
      d = Math.round(Math.max(base > 0 ? 3 : -60, Math.min(base > 0 ? 60 : -3, d)));
      const before = lpOf(p.uid), after = Math.max(0, before + d);
      this.sql.exec(`UPDATE users SET ${LC}=?, ${GC}=${GC}+1, ${WC}=${WC}+? WHERE uid=?`, after, p.place === 1 ? 1 : 0, p.uid);
      this.sql.exec('INSERT INTO matches VALUES (?,?,?)', key, Date.now(), JSON.stringify({ n, solo: !!solo, place: p.place, d: after - before }));
      res[p.uid] = { before, after, d: after - before, place: p.place, solo: !!solo };
    }
    return res;
  }
}

// ===================== 房間（整場遊戲在這裡跑）=====================
export class Room extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.code = ''; this.conns = new Set(); this.seats = null; this.owner = null; this.G = null; this.timer = 0; this.mm = null; this.last = Date.now(); this.settled = {}; }
  acc() { return this.env.ACC.get(this.env.ACC.idFromName('main')); }
  async fetch(req) {
    const url = new URL(req.url);
    if (!this.code) this.code = url.searchParams.get('code') || '';
    if (!this.seats) { const n = +url.searchParams.get('mode') || 0; if (n) this.seats = Array(n).fill(null); this.solo = url.searchParams.get('solo') === '1'; }
    if (!this.metaReq) { this.metaReq = true; this.acc().getMeta().then(m => { this.meta = m; }).catch(() => {}); }
    const pair = new WebSocketPair(); const ws = pair[1]; ws.accept();
    const c = { ws, uid: null, seat: -1, last: Date.now() };
    this.conns.add(c);
    ws.addEventListener('message', e => { c.last = Date.now(); let m; try { m = JSON.parse(e.data); } catch (x) { return; } this.onMsg(c, m).catch(() => {}); });
    const gone = () => { try { ws.close(); } catch (e) {} if (this.conns.delete(c)) this.drop(c); };
    ws.addEventListener('close', gone); ws.addEventListener('error', gone);
    this.ensureTimer();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  // 配對大廳先呼叫：設定人數與座位表，人到齊自動開打
  async setup(mode, seatOf, solo) { this.solo = !!solo; this.seats = Array(mode).fill(null); this.mm = { seatOf, t0: Date.now() }; this.ensureTimer(); return { ok: true }; }
  send(c, m) { try { c.ws.send(JSON.stringify(m)); } catch (e) {} }
  bcast(m) { const s = JSON.stringify(m); for (const c of this.conns) if (c.uid) try { c.ws.send(s); } catch (e) {} }
  roomMsg() { return { k: 'room', code: this.code, seats: this.seats, owner: this.seats ? this.seats.findIndex(s => s && s.uid === this.owner) : -1, ranked: !!this.mm, solo: !!this.solo }; }
  async onMsg(c, m) {
    if (m.k === 'ping') { this.send(c, { k: 'pong', t: m.t }); return; }
    if (m.k === 'hello') {
      const u = await this.acc().verify(String(m.token || ''));
      if (!u) { this.send(c, { k: 'full', why: '請先登入帳號' }); return; }
      if (!this.seats) { this.send(c, { k: 'full', why: '找不到這個房號' }); return; }
      for (const o of this.conns) if (o !== c && o.uid === u.uid) { this.send(o, { k: 'full', why: '你在別的地方登入了這個房間' }); this.conns.delete(o); try { o.ws.close(); } catch (e) {} }
      c.uid = u.uid;
      let seat = this.seats.findIndex(s => s && s.uid === u.uid);
      if (seat < 0) {
        if (this.G && this.mm && this.mm.seatOf[u.uid] !== undefined && !this.seats[this.mm.seatOf[u.uid]]) { // 配對成員晚到：接回原本保留的位置（原本由電腦代打）
          seat = this.mm.seatOf[u.uid]; this.seats[seat] = { uid: u.uid, name: u.name, lp: u.lp };
          this.acc().setActive([u.uid], this.code).catch(() => {});
          const P = this.G.players[seat]; if (P && !P.out) { P.ai = false; P.name = u.name; this.G.humanAt[seat] = true; this.G.ladder[seat] = { lp: u.lp, pid: u.uid, name: u.name }; this.G.ranked = this.isRanked(); }
        } else if (this.G) { this.send(c, { k: 'full', why: '遊戲已經開始了' }); c.uid = null; return; }
        else {
          if (this.mm) { seat = this.mm.seatOf[u.uid]; if (seat === undefined) { this.send(c, { k: 'full', why: '這是配對房，你不在名單上' }); c.uid = null; return; } }
          else seat = this.seats.findIndex(s => !s);
          if (seat < 0 || this.seats[seat]) { this.send(c, { k: 'full', why: '房間滿了' }); c.uid = null; return; }
          this.seats[seat] = { uid: u.uid, name: u.name, lp: u.lp };
          if (!this.owner) this.owner = u.uid;
        }
      }
      c.seat = seat;
      this.send(c, { k: 'seat', seat });
      if (this.G) { const P = this.G.players[seat]; if (P && !P.out) P.ai = false; this.send(c, { k: 'start', seat }); this.resync(); }
      else this.bcast(this.roomMsg());
      return;
    }
    if (!c.uid) return;
    if (m.k === 'bye') { this.conns.delete(c); this.drop(c); try { c.ws.close(); } catch (e) {} return; }
    if (!this.G) {
      if (m.k === 'seat' && !this.mm) { const to = +m.seat; if (to >= 0 && to < this.seats.length && !this.seats[to]) { this.seats[to] = this.seats[c.seat]; this.seats[c.seat] = null; c.seat = to; this.send(c, { k: 'seat', seat: to }); this.bcast(this.roomMsg()); } }
      else if (m.k === 'mode' && c.uid === this.owner && !this.mm) { const solo = !!m.solo; const n = solo ? Math.max(2, Math.min(8, +m.n || 8)) : (+m.n === 8 ? 8 : 4); this.solo = solo; this.setMode(n, true); }
      else if (m.k === 'start' && c.uid === this.owner) this.start();
      return;
    }
    if (m.k === 'act' && c.seat >= 0) {
      const a = m.a && typeof m.a === 'object' ? m.a : {};
      const r = act(this.G, c.seat, a);
      this.send(c, { k: 'res', id: m.id, r }); this.snapAcc = 1e9;
    }
  }
  setMode(n, force) {
    if (n === this.seats.length) { if (force) this.bcast(this.roomMsg()); return; }
    if (n < this.seats.length) {
      for (let i = n; i < this.seats.length; i++) if (this.seats[i]) { const f = this.seats.slice(0, n).findIndex(x => !x); if (f < 0) return; this.seats[f] = this.seats[i]; this.seats[i] = null; for (const c of this.conns) if (c.seat === i) { c.seat = f; this.send(c, { k: 'seat', seat: f }); } }
      this.seats = this.seats.slice(0, n);
    } else while (this.seats.length < n) this.seats.push(null);
    this.bcast(this.roomMsg());
  }
  drop(c) {
    if (!c.uid) return;
    if (this.G) { const P = this.G.players[c.seat]; if (P && ![...this.conns].some(o => o.uid === c.uid)) { P.ai = true; P.ready = true; } }
    else if (!this.mm && c.seat >= 0 && this.seats[c.seat] && this.seats[c.seat].uid === c.uid) { this.seats[c.seat] = null; if (this.owner === c.uid) { const s = this.seats.find(Boolean); this.owner = s ? s.uid : null; } this.bcast(this.roomMsg()); }
  }
  start() {
    if (this.G) return;
    const players = this.seats.map((s, i) => s ? { name: s.name, ai: false } : { name: AI_NAMES_S[i] || 'AI', ai: true });
    this.G = createGame({ seed: (Date.now() & 0x7fffffff), rules: Object.assign({}, DEFAULT_RULES, { teams: this.solo ? this.seats.length : this.seats.length >> 1, solo: !!this.solo }), players, solo: !!this.solo, meta: this.meta || [] });
    const G = this.G; G.online = true; G.server = true; G.humanAt = players.map(p => !p.ai);
    G.ladder = this.seats.map(s => s ? { lp: s.lp || 0, pid: s.uid, name: s.name } : null);
    G.ranked = this.isRanked();
    startGame(G);
    this.acc().setActive(this.seats.filter(Boolean).map(s => s.uid), this.code).catch(() => {});
    for (const c of this.conns) if (c.uid) this.send(c, { k: 'start', seat: c.seat });
    this.resync();
  }
  async status(uid) { const G = this.G; if (!G || G.phase === 'over' || !this.seats) return { alive: false }; const i = this.seats.findIndex(s => s && s.uid === uid); return { alive: i >= 0 && !!G.players[i] && !G.players[i].out }; }
  // 進行中對局紀錄：開打時記下所有真人；被淘汰或整場結束就清掉
  trackActive() {
    const G = this.G; if (!G || !this.seats) return;
    this.activeCleared = this.activeCleared || {};
    const gone = this.seats.map((s, i) => s && !this.activeCleared[s.uid] && (G.phase === 'over' || (G.players[i] && G.players[i].out)) ? s.uid : null).filter(Boolean);
    if (gone.length) { for (const u of gone) this.activeCleared[u] = true; this.acc().clearActive(gone, this.code).catch(() => {}); }
  }
  isRanked() { const G = this.G; return G.teams.filter((T, t) => G.players.some((p, i) => p.team === t && G.humanAt[i])).length >= 2; }
  resync() { this.lastSnap = ''; this.logSent = 0; this.snapAcc = 1e9; if (this.G && this.G.phase === 'combat') this.sendBattles(); }
  sendBattles() {
    const G = this.G; if (!G.battles.length || !G.battles[0].input) return;
    this.battleKey = G.round + G.phase + G.battles.length;
    this.bcast({ k: 'battles', round: G.round, list: G.battles.map(b => ({ teams: b.teams, ghost: !!b.ghost, input: b.input })), t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []) });
  }
  ensureTimer() { if (!this.timer) { this.lastT = Date.now(); this.timer = setInterval(() => { try { this.tick(); } catch (e) {} }, SV.TICK_MS); } }
  tick() {
    const now = Date.now(), dt = Math.min(1000, now - this.lastT); this.lastT = now;
    const live = [...this.conns].filter(c => c.uid);
    if (live.length) this.last = now;
    if (now - this.last > SV.IDLE_CLOSE_MS || (this.G && this.G.phase === 'over' && !live.length)) { clearInterval(this.timer); this.timer = 0; return; }
    if (!this.G) { if (this.mm && (this.seats.filter(Boolean).length >= Object.keys(this.mm.seatOf).length || now - this.mm.t0 > SV.JOIN_WAIT_MS) && this.seats.some(Boolean)) this.start(); return; }
    const G = this.G;
    if (G.phase !== 'over') update(G, dt);
    this.settleOuts(); this.trackActive();
    if (G.phase === 'over' && !this.metaDone) { this.metaDone = true; this.metaReport(); }
    const bk = G.round + G.phase + G.battles.length;
    if (G.phase === 'combat' && this.battleKey !== bk && G.battles.length && G.battles[0].input) this.sendBattles();
    this.snapAcc = (this.snapAcc || 0) + dt;
    if (this.snapAcc >= SV.SNAP_MS) {
      this.snapAcc = 0;
      const log = G.log.slice(this.logSent || 0);
      const s = JSON.stringify(G, (k, v) => (k === 'rng' || k === 'B' || k === 'log' || k === 'battles' || k === 'input') ? undefined : v);
      // 只有內容真的變了才送（倒數計時與戰鬥進度每格都在變，比對時不算；客人自己會倒數），另外每隔一段時間保底送一次校正
      const cmp = s.replace(/"(timer|acc)":-?[0-9.e+-]+/g, '');
      if (cmp !== this.lastSnap || log.length || now - (this.snapAt || 0) >= SV.SNAP_KEEPALIVE_MS) { this.lastSnap = cmp; this.snapAt = now; this.bcast({ k: 'snap', s, log, logFrom: this.logSent || 0 }); this.logSent = G.log.length; }
    }
    this.btAcc = (this.btAcc || 0) + dt;
    if (G.phase === 'combat' && this.btAcc >= SV.BTICK_MS) { this.btAcc = 0; this.bcast({ k: 'tick', round: G.round, t: G.battles.map(b => b.B.t), cmds: G.battles.map(b => b.B.cmdLog || []), speed: 1 }); }
  }
  metaReport() {
    const G = this.G, n = G.teams.length, top = n <= 3 ? 1 : 2, good = t => (G.teams[t].place || 99) <= top;
    const comps = G.players.filter((P, i) => G.humanAt[i] && good(P.team) && P.lastComp).map(P => ({ units: P.lastComp, n }));
    const results = G.players.filter(P => P.ai && P.target).map(P => ({ id: P.target.id, good: (G.teams[P.team].place || 99) <= Math.max(1, Math.floor(n / 2)) }));
    if (comps.length || results.length) this.acc().metaAdd(comps, results).catch(() => {});
  }
  // 天梯：某隊名次確定（被淘汰或比賽結束）就結算那一隊的真人
  settleOuts() {
    const G = this.G; if (!G.ranked) return;
    const ready = G.teams.map((T, t) => t).filter(t => !this.settled[t] && G.teams[t].place && ((G.teams[t].out && !(G.phase === 'combat' && G.teams[t].dieRound === G.round)) || G.phase === 'over')); // 同回合還有戰場在打時名次可能往前調：等這回合打完才算分
    if (!ready.length) return;
    for (const t of ready) this.settled[t] = true;
    const all = this.seats.map((s, i) => s ? { uid: s.uid, team: G.players[i].team } : null).filter(Boolean);
    const plist = all.filter(x => ready.includes(x.team)).map(x => ({ uid: x.uid, team: x.team, place: G.teams[x.team].place }));
    if (!plist.length) return;
    this.acc().settle(this.code + ':' + G.seed, G.teams.length, plist, all, !!G.solo).then(res => {
      for (const c of this.conns) if (c.uid && res[c.uid]) this.send(c, Object.assign({ k: 'lp', seed: G.seed }, res[c.uid]));
    }).catch(() => {});
  }
}

// ===================== 排位配對 =====================
export class Lobby extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.q = { 4: new Map(), 8: new Map(), solo: new Map(), duel: new Map() }; this.timer = 0; }
  async fetch(req) {
    const pair = new WebSocketPair(); const ws = pair[1]; ws.accept();
    const c = { ws, uid: null };
    ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } this.onMsg(c, m).catch(() => {}); });
    const gone = () => { try { ws.close(); } catch (e) {} for (const q of Object.values(this.q)) if (c.uid && q.get(c.uid) && q.get(c.uid).c === c) q.delete(c.uid); };
    ws.addEventListener('close', gone); ws.addEventListener('error', gone);
    if (!this.timer) this.timer = setInterval(() => { try { this.match(); } catch (e) {} }, 1000);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async onMsg(c, m) {
    if (m.k === 'q') {
      const u = await this.env.ACC.get(this.env.ACC.idFromName('main')).verify(String(m.token || ''));
      if (!u) { try { c.ws.send(JSON.stringify({ k: 'err', why: '請先登入帳號' })); } catch (e) {} return; }
      c.uid = u.uid; const mode = ['solo', 'duel'].includes(m.mode) ? m.mode : m.mode === 8 ? 8 : 4;
      for (const q of Object.values(this.q)) q.delete(u.uid);
      this.q[mode].set(u.uid, { c, uid: u.uid, tz: Math.max(-12, Math.min(14, +m.tz || 0)), t: Date.now(), name: u.name });
    } else if (m.k === 'cancel') { for (const q of Object.values(this.q)) q.delete(c.uid); }
  }
  match() {
    const now = Date.now();
    for (const mode of [4, 8, 'solo', 'duel']) {
      const need = mode === 'solo' ? 8 : mode === 'duel' ? 2 : mode;
      const q = this.q[mode];
      for (const [uid, x] of q) if (x.c.ws.readyState !== 1) q.delete(uid);
      const n = q.size;
      for (const x of q.values()) try { x.c.ws.send(JSON.stringify({ k: 'stat', n, near: [...q.values()].filter(y => Math.abs(y.tz - x.tz) <= SV.MM_SAME_TZ).length, wait: now - x.t })); } catch (e) {}
      while (q.size >= 2) {
        const all = [...q.values()].sort((a, b) => a.t - b.t), lead = all[0];
        const others = all.slice(1).map(x => ({ x, near: Math.abs(x.tz - lead.tz) <= SV.MM_SAME_TZ })).sort((a, b) => (b.near - a.near) || (a.x.t - b.x.t));
        const nearN = others.filter(o => o.near).length, wide = now - lead.t >= SV.MM_WIDEN_MS;
        let pick = null;
        if (nearN >= need - 1) pick = others.filter(o => o.near).slice(0, need - 1);
        else if (wide) pick = others.slice(0, need - 1);
        if (!pick) break;
        const members = [lead].concat(pick.map(o => o.x)), seatOf = {};
        members.forEach((x, i) => { seatOf[x.uid] = MM_ORDER_S[mode][i]; q.delete(x.uid); });
        const code = roomCode();
        this.env.ROOM.get(this.env.ROOM.idFromName(code)).setup(need, seatOf, mode === 'solo' || mode === 'duel').then(() => {
          for (const x of members) try { x.c.ws.send(JSON.stringify({ k: 'match', room: code, n: members.length })); } catch (e) {}
        }).catch(() => {});
      }
    }
  }
}
