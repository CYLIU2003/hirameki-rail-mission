/**
 * Hirameki Rail Mission - Local server
 * - roles: kiosk / display / admin
 * - multi-kiosk sessions
 * - 100% local/offline friendly
 *
 * Requirements: Node.js >= 18
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

const express = require("express");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const HOST = process.env.HOST || "0.0.0.0";

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

/** ===== Catalog (cards / rules) ===== */
const catalog = require("./public/catalog.js");

// Session states (server authoritative)
const STATE = {
  ATTRACT: "ATTRACT",
  BRIEFING: "BRIEFING",
  PLANNING: "PLANNING",
  READY: "READY",
  RUNNING: "RUNNING",
  RESULT: "RESULT",
  CERT: "CERT",
};

const DEFAULTS = {
  difficulty: "NORMAL", // EASY | NORMAL | HARD
  mode: "NORMAL",       // NORMAL(10 steps) | QUICK(5 steps)
};

// Admin global settings (can be modified via WS)
let adminSettings = {
  displayFollow: "AUTO", // AUTO or kioskId
  soundEnabled: true,
  defaults: { ...DEFAULTS },
};

// Per kiosk sessions
/** @type {Map<string, any>} */
const sessions = new Map();

// Connected clients
/** @type {Set<any>} */
const clients = new Set();

// Track "most recently active kiosk" for AUTO display follow
let lastActiveKioskId = "1";

/** ===== Helpers ===== */
function nowMs() { return Date.now(); }
function uid() { return crypto.randomUUID(); }
function clamp(n, a=0, b=100) { return Math.max(a, Math.min(b, n)); }

function makeCode4() {
  // 4-digit code for certificate / ranking
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getOrCreateSession(kioskId) {
  if (!sessions.has(kioskId)) {
    sessions.set(kioskId, {
      kioskId,
      sessionId: uid(),
      state: STATE.ATTRACT,
      difficulty: adminSettings.defaults.difficulty,
      mode: adminSettings.defaults.mode,
      cardId: null,
      card: null,
      rules: [{ condId: "always", actionId: "none" }, { condId: "always", actionId: "none" }],
      step: 0,
      totalSteps: 10,
      scores: { rescue: 50, crowd: 50, delay: 50 },
      result: null,
      createdAt: nowMs(),
      lastActiveAt: nowMs(),
      lastEventAt: nowMs(),
      lock: false, // prevent double-run
    });
  }
  return sessions.get(kioskId);
}

function sanitizeSessionForClient(s) {
  return {
    kioskId: s.kioskId,
    sessionId: s.sessionId,
    state: s.state,
    difficulty: s.difficulty,
    mode: s.mode,
    cardId: s.cardId,
    card: s.card ? {
      id: s.card.id,
      title: s.card.title,
      brief: s.card.brief,
      objective: s.card.objective,
      constraints: s.card.constraints || [],
      hint: s.card.hint,
      difficulty: s.card.difficulty,
      pass: s.card.pass,
      weights: s.card.weights,
      tags: s.card.tags,
      recommended: s.card.recommended,
    } : null,
    rules: s.rules,
    step: s.step,
    totalSteps: s.totalSteps,
    scores: s.scores,
    result: s.result,
    lastActiveAt: s.lastActiveAt,
  };
}

function broadcastToKiosk(kioskId, msgObj) {
  const msg = JSON.stringify(msgObj);
  for (const c of clients) {
    if (c.readyState !== 1) continue;
    if (c.role === "kiosk" && c.kioskId === kioskId) c.ws.send(msg);
    if (c.role === "admin") c.ws.send(msg);
    if (c.role === "display") {
      // AUTO follow: show last active kiosk or explicit follow
      const follow = adminSettings.displayFollow;
      const target = (follow === "AUTO") ? lastActiveKioskId : follow;
      if (target === kioskId) c.ws.send(msg);
    }
  }
}

function pushSession(kioskId) {
  const s = getOrCreateSession(kioskId);
  broadcastToKiosk(kioskId, { type: "session", session: sanitizeSessionForClient(s), adminSettings });
}

function pushAllSessionsToAdmin() {
  const list = Array.from(sessions.values()).map(sanitizeSessionForClient);
  const msg = JSON.stringify({ type: "sessions", sessions: list, adminSettings });
  for (const c of clients) {
    if (c.readyState !== 1) continue;
    if (c.role === "admin") c.ws.send(msg);
  }
}

function resetSession(kioskId) {
  const s = getOrCreateSession(kioskId);
  s.sessionId = uid();
  s.state = STATE.ATTRACT;
  s.cardId = null;
  s.card = null;
  s.rules = [{ condId: "always", actionId: "none" }, { condId: "always", actionId: "none" }];
  s.step = 0;
  s.totalSteps = (s.mode === "QUICK") ? 5 : 10;
  s.scores = { rescue: 50, crowd: 50, delay: 50 };
  s.result = null;
  s.lock = false;
  s.lastActiveAt = nowMs();
  s.lastEventAt = nowMs();
  pushSession(kioskId);
  pushAllSessionsToAdmin();
}

function pickRandomCard(difficulty) {
  const pool = catalog.cards.filter(c => {
    if (difficulty === "EASY") return c.difficulty === "EASY";
    if (difficulty === "HARD") return c.difficulty === "HARD";
    return true; // NORMAL includes all
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

function applyActionEffect(actionId, s) {
  const action = catalog.actions.find(a => a.id === actionId);
  if (!action) return;

  const eff = action.effect;
  // Apply deterministic effect
  s.scores.rescue = clamp(s.scores.rescue + (eff.rescue || 0));
  s.scores.crowd  = clamp(s.scores.crowd  + (eff.crowd  || 0));
  s.scores.delay  = clamp(s.scores.delay  + (eff.delay  || 0));

  // Optional: small tradeoff jitter per step (deterministic by step)
  // Keep it minimal so it doesn't feel random/unfair.
}

function condHolds(condId, s) {
  const card = s.card;
  const tags = card?.tags || [];

  switch (condId) {
    case "always": return true;
    case "has_rescue": return tags.includes("rescue");
    case "blackout": return tags.includes("blackout");
    case "event": return tags.includes("event");
    case "fault": return tags.includes("fault");
    case "peak": return tags.includes("peak");
    case "crowd_bad": return s.scores.crowd < 60;
    case "delay_bad": return s.scores.delay < 60;
    case "rescue_bad": return s.scores.rescue < 60;
    case "multi_trouble": return tags.length >= 2;
    default: return false;
  }
}

function enforceConstraints(card, rules) {
  // For HARD: block some actions
  const banned = new Set(card?.bannedActions || []);
  return rules.map(r => (banned.has(r.actionId) ? { ...r, actionId: "none" } : r));
}

function computeTotalScore(s) {
  const w = s.card?.weights || { rescue: 0.45, crowd: 0.35, delay: 0.20 };
  return Math.round(
    w.rescue * s.scores.rescue +
    w.crowd  * s.scores.crowd +
    w.delay  * s.scores.delay
  );
}

function judge(s) {
  const pass = s.card?.pass || {};
  const total = computeTotalScore(s);
  const rescueOk = (pass.rescueMin == null) ? true : (s.scores.rescue >= pass.rescueMin);
  const crowdOk  = (pass.crowdMin  == null) ? true : (s.scores.crowd  >= pass.crowdMin);
  const delayOk  = (pass.delayMin  == null) ? true : (s.scores.delay  >= pass.delayMin);
  const totalOk  = (pass.totalMin  == null) ? true : (total >= pass.totalMin);

  const ok = rescueOk && crowdOk && delayOk && totalOk;

  let reason = "";
  if (!rescueOk) reason = "救援が間に合っていない（救援を優先してみよう）";
  else if (!crowdOk) reason = "ホームが混雑したまま（増発・案内を試そう）";
  else if (!delayOk) reason = "遅延が収まっていない（折返し短縮・迂回を試そう）";
  else if (!totalOk) reason = "全体のバランスがあと少し（別の組み合わせを試そう）";

  // Title by total score
  let title = "見習い駅員";
  if (ok && total >= 90) title = "伝説の指令長";
  else if (ok && total >= 80) title = "臨時駅長";
  else if (ok && total >= 70) title = "敏腕指令員";
  else if (ok) title = "復旧隊員";

  return { ok, total, reason, title };
}

async function runSimulation(kioskId) {
  const s = getOrCreateSession(kioskId);
  if (!s.card) return;
  if (s.lock) return;
  s.lock = true;

  s.state = STATE.RUNNING;
  s.step = 0;
  s.totalSteps = (s.mode === "QUICK") ? 5 : 10;

  // Initialize scores by card preset
  s.scores = { ...s.card.initScores };

  pushSession(kioskId);

  const intervalMs = 650; // "feels responsive" on display; not too fast
  const maxSteps = s.totalSteps;

  // Pre-enforce card constraints
  s.rules = enforceConstraints(s.card, s.rules);

  const tick = () => {
    if (!sessions.has(kioskId)) return;
    const ss = sessions.get(kioskId);
    if (ss.state !== STATE.RUNNING) return;

    ss.step += 1;

    // Baseline dynamics (card-defined)
    const base = ss.card.baseStep || { rescue: 0, crowd: 0, delay: 0 };
    ss.scores.rescue = clamp(ss.scores.rescue + base.rescue);
    ss.scores.crowd  = clamp(ss.scores.crowd  + base.crowd);
    ss.scores.delay  = clamp(ss.scores.delay  + base.delay);

    // Apply rules (up to 2)
    for (const r of ss.rules) {
      if (!r) continue;
      if (r.actionId === "none") continue;
      if (condHolds(r.condId, ss)) {
        applyActionEffect(r.actionId, ss);
      }
    }

    // Small "reality friction" for harder cards (deterministic)
    if (ss.card.friction) {
      ss.scores.rescue = clamp(ss.scores.rescue - ss.card.friction.rescue);
      ss.scores.crowd  = clamp(ss.scores.crowd  - ss.card.friction.crowd);
      ss.scores.delay  = clamp(ss.scores.delay  - ss.card.friction.delay);
    }

    ss.lastActiveAt = nowMs();
    ss.lastEventAt = nowMs();
    lastActiveKioskId = kioskId;

    if (ss.step >= maxSteps) {
      const j = judge(ss);
      ss.result = {
        pass: j.ok,
        total: j.total,
        reason: j.reason,
        title: j.title,
        code: makeCode4(),
        timestamp: nowMs(),
      };
      ss.state = STATE.RESULT;
      ss.lock = false;
      pushSession(kioskId);
      pushAllSessionsToAdmin();
      return;
    }

    pushSession(kioskId);
  };

  const timer = setInterval(() => {
    const ss = sessions.get(kioskId);
    if (!ss || ss.state !== STATE.RUNNING) {
      clearInterval(timer);
      return;
    }
    tick();
  }, intervalMs);
}

/** ===== Express routes ===== */
app.get("/", (req, res) => res.redirect("/kiosk.html"));
app.get("/api/catalog", (req, res) => {
  res.json({
    cards: catalog.cards,
    conditions: catalog.conditions,
    actions: catalog.actions,
    meta: catalog.meta,
  });
});
app.get("/api/health", (req, res) => res.json({ ok: true, time: nowMs() }));

app.use(express.static(PUBLIC_DIR));

/** ===== WebSocket ===== */
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const client = { ws, role: "unknown", kioskId: null, readyState: 1 };
  clients.add(client);

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString("utf-8")); }
    catch { return; }

    const type = msg.type;

    if (type === "hello") {
      client.role = msg.role;
      client.kioskId = msg.kioskId || null;

      if (client.role === "kiosk") {
        const s = getOrCreateSession(client.kioskId || "1");
        lastActiveKioskId = s.kioskId;
        pushSession(s.kioskId);
        pushAllSessionsToAdmin();
      } else if (client.role === "display") {
        // Follow either specified kiosk or AUTO
        if (msg.kioskId) adminSettings.displayFollow = msg.kioskId;
        // Push current followed session
        const target = (adminSettings.displayFollow === "AUTO") ? lastActiveKioskId : adminSettings.displayFollow;
        pushSession(target);
        pushAllSessionsToAdmin();
      } else if (client.role === "admin") {
        pushAllSessionsToAdmin();
      }

      ws.send(JSON.stringify({ type: "hello_ack", adminSettings }));
      return;
    }

    // Admin controls
    if (client.role === "admin") {
      if (type === "admin_set_display_follow") {
        adminSettings.displayFollow = msg.follow || "AUTO";
        // push to all display clients by pushing target session
        const target = (adminSettings.displayFollow === "AUTO") ? lastActiveKioskId : adminSettings.displayFollow;
        pushSession(target);
        pushAllSessionsToAdmin();
      }
      if (type === "admin_set_defaults") {
        const d = msg.defaults || {};
        if (["EASY","NORMAL","HARD"].includes(d.difficulty)) adminSettings.defaults.difficulty = d.difficulty;
        if (["NORMAL","QUICK"].includes(d.mode)) adminSettings.defaults.mode = d.mode;
        pushAllSessionsToAdmin();
      }
      if (type === "admin_reset_kiosk") {
        if (msg.kioskId) resetSession(msg.kioskId);
      }
      return;
    }

    // Kiosk actions
    if (client.role === "kiosk") {
      const kioskId = client.kioskId || "1";
      const s = getOrCreateSession(kioskId);
      s.lastActiveAt = nowMs();
      s.lastEventAt = nowMs();
      lastActiveKioskId = kioskId;

      if (type === "kiosk_set_mode") {
        if (["NORMAL","QUICK"].includes(msg.mode)) s.mode = msg.mode;
        if (["EASY","NORMAL","HARD"].includes(msg.difficulty)) s.difficulty = msg.difficulty;
        s.totalSteps = (s.mode === "QUICK") ? 5 : 10;
        pushSession(kioskId);
        pushAllSessionsToAdmin();
        return;
      }

      if (type === "kiosk_start") {
        // Select card by id or random
        let card = null;
        if (msg.cardId) {
          card = catalog.cards.find(c => c.id === msg.cardId);
        } else {
          card = pickRandomCard(s.difficulty);
        }
        if (!card) return;

        s.cardId = card.id;
        s.card = card;
        s.state = STATE.BRIEFING;
        s.rules = [{ condId: "always", actionId: "none" }, { condId: "always", actionId: "none" }];
        s.step = 0;
        s.result = null;
        s.lock = false;

        // Initialize scores
        s.scores = { ...card.initScores };
        pushSession(kioskId);
        pushAllSessionsToAdmin();
        return;
      }

      if (type === "kiosk_to_planning") {
        if (s.state === STATE.BRIEFING) {
          s.state = STATE.PLANNING;
          pushSession(kioskId);
        }
        return;
      }

      if (type === "kiosk_set_rules") {
        if (s.state !== STATE.PLANNING) return;
        const rules = msg.rules || [];
        // sanitize
        const clean = [];
        for (let i=0; i<2; i++) {
          const r = rules[i] || {};
          const condOk = catalog.conditions.some(c => c.id === r.condId);
          const actOk  = catalog.actions.some(a => a.id === r.actionId);
          clean.push({
            condId: condOk ? r.condId : "always",
            actionId: actOk ? r.actionId : "none",
          });
        }
        s.rules = enforceConstraints(s.card, clean);
        pushSession(kioskId);
        return;
      }

      if (type === "kiosk_to_ready") {
        if (s.state === STATE.PLANNING) {
          s.state = STATE.READY;
          pushSession(kioskId);
        }
        return;
      }

      if (type === "kiosk_depart") {
        if (s.state === STATE.READY) {
          runSimulation(kioskId);
        }
        return;
      }

      if (type === "kiosk_show_cert") {
        if (s.state === STATE.RESULT) {
          s.state = STATE.CERT;
          pushSession(kioskId);
        }
        return;
      }

      if (type === "kiosk_retry") {
        // retry same card: go back to planning
        if (s.state === STATE.RESULT || s.state === STATE.CERT) {
          s.state = STATE.PLANNING;
          s.step = 0;
          s.result = null;
          // reset initial scores
          s.scores = { ...s.card.initScores };
          pushSession(kioskId);
        }
        return;
      }

      if (type === "kiosk_next") {
        // reset to attract for next player
        resetSession(kioskId);
        return;
      }

      if (type === "kiosk_force_reset") {
        resetSession(kioskId);
        return;
      }
    }
  });

  ws.on("close", () => {
    client.readyState = 3;
    clients.delete(client);
    pushAllSessionsToAdmin();
  });

  ws.on("error", () => {
    client.readyState = 3;
    clients.delete(client);
  });
});

/** ===== Watchdog: auto reset stale sessions ===== */
setInterval(() => {
  const t = nowMs();
  for (const [kioskId, s] of sessions.entries()) {
    const idle = t - (s.lastEventAt || s.lastActiveAt || t);
    // If mid-flow and idle too long, reset
    const mid = [STATE.BRIEFING, STATE.PLANNING, STATE.READY, STATE.RUNNING, STATE.RESULT, STATE.CERT].includes(s.state);
    if (mid && idle > 120000) { // 2 min
      resetSession(kioskId);
    }
  }
}, 15000);

server.listen(PORT, HOST, () => {
  console.log(`Hirameki Rail Mission server running: http://${HOST}:${PORT}`);
  console.log(`Kiosk:   http://localhost:${PORT}/kiosk.html?kiosk=1&input=touch`);
  console.log(`Display: http://localhost:${PORT}/display.html`);
  console.log(`Admin:   http://localhost:${PORT}/admin.html`);
});
