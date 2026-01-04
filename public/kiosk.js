const kioskId = q("kiosk","1");
const inputMode = q("input","touch");
const kidMode = q("kid", (inputMode==="touch" ? "1":"0")) === "1";

const badgeKiosk = el("badgeKiosk");
const badgeInput = el("badgeInput");
const badgeMode = el("badgeMode");
const badgeDifficulty = el("badgeDifficulty");
const connBadge = el("connBadge");

badgeKiosk.textContent = `Kiosk #${kioskId}`;
badgeInput.textContent = (inputMode === "mouse") ? "Mouseモード" : "Touchモード";
el("kidModeLabel").textContent = kidMode ? "（キッズモード）" : "（通常モード）";

const S = {
  ATTRACT: el("S_ATTRACT"),
  BRIEFING: el("S_BRIEFING"),
  PLANNING_KID: el("S_PLANNING_KID"),
  READY: el("S_READY"),
  RUNNING: el("S_RUNNING"),
  RESULT: el("S_RESULT"),
  CERT: el("S_CERT"),
};
function showState(name){
  Object.values(S).forEach(x => x.classList.add("hidden"));
  S[name].classList.remove("hidden");
}

const { ws } = wsConnect({ role:"kiosk", kioskId });
let session = null;
const catalog = window.CATALOG;

function clamp01(n){ return Math.max(0, Math.min(100, n)); }
function faceFor(v){
  if (v >= 75) return "🙂";
  if (v >= 55) return "😮";
  return "😱";
}
function faceRowHTML(scores){
  const r = clamp01(scores.rescue), c = clamp01(scores.crowd), d = clamp01(scores.delay);
  return `
    <span class="faceBadge"><span class="faceEmoji">${faceFor(r)}</span>たすけ ${r}</span>
    <span class="faceBadge"><span class="faceEmoji">${faceFor(c)}</span>こんざつ ${c}</span>
    <span class="faceBadge"><span class="faceEmoji">${faceFor(d)}</span>おくれ ${d}</span>
  `;
}

function updateBadges(){
  if (!session) return;
  badgeMode.textContent = `Mode: ${session.mode}`;
  badgeDifficulty.textContent = `Difficulty: ${session.difficulty}`;
}

function renderBriefing(){
  if (!session?.card) return;
  el("briefTitle").textContent = `ミッション ${session.card.id}：${session.card.title}`;
  el("briefText").textContent = session.card.brief;
  el("briefObjective").textContent = session.card.objective;
  el("briefHint").textContent = session.card.hint || "—";

  el("briefFaces").innerHTML = faceRowHTML(session.scores || {rescue:50,crowd:50,delay:50});

  const ul = el("briefConstraints");
  ul.innerHTML = "";
  const constraints = session.card.constraints || [];
  if (!constraints.length){
    const li = document.createElement("li");
    li.textContent = "なし";
    ul.appendChild(li);
  } else {
    constraints.forEach(c => {
      const li = document.createElement("li");
      li.textContent = c;
      ul.appendChild(li);
    });
  }
}

function renderPlanningKid(){
  // Kid mode: choose 2 action cards (no IF)
  const grid = el("kidActionGrid");
  grid.innerHTML = "";

  // kid-friendly action set (4～6個くらいがちょうど良い)
  const KID_ACTIONS = [
    { id:"prioritize_rescue", emoji:"🚑", title:"たすける！", desc:"救援をいそぐ（少しおくれるかも）" },
    { id:"add_local", emoji:"➕", title:"ふやす！", desc:"電車をふやして混雑をへらす" },
    { id:"platform_change", emoji:"🔀", title:"のりばをかえる！", desc:"行く道をわかりやすくする" },
    { id:"info_guide", emoji:"📢", title:"おしらせ強化！", desc:"案内をはっきりして安全に" },
    { id:"shorten_turnback", emoji:"⏱️", title:"はやくおりかえす！", desc:"おくれをへらす（少し混むかも）" },
    { id:"detour", emoji:"🧭", title:"べつのみち！", desc:"遠回りでつまるのを回避" },
  ];

  const banned = new Set(session.card?.bannedActions || []);
  const onlyOne = !!session.card?.onlyOneRule;

  // current selection from session.rules (always condition)
  let selected = [];
  if (session.rules?.[0]?.actionId && session.rules[0].actionId !== "none") selected.push(session.rules[0].actionId);
  if (session.rules?.[1]?.actionId && session.rules[1].actionId !== "none") selected.push(session.rules[1].actionId);

  const maxPick = onlyOne ? 1 : 2;

  for (const a of KID_ACTIONS){
    const tile = document.createElement("div");
    tile.className = "actionTile";
    const isBanned = banned.has(a.id);
    const isSel = selected.includes(a.id);

    if (isSel) tile.classList.add("selected");
    if (isBanned){
      tile.style.opacity = "0.35";
      tile.style.cursor = "not-allowed";
    }

    tile.innerHTML = `
      <div>
        <div class="emoji">${a.emoji}</div>
        <div class="title">${a.title}</div>
        <div class="desc">${a.desc}${isBanned ? "<br/>（しばりで使えない）" : ""}</div>
      </div>
      <div class="muted">タップで選択</div>
    `;

    tile.onclick = () => {
      if (isBanned) return;

      // toggle select
      if (selected.includes(a.id)){
        selected = selected.filter(x => x !== a.id);
      } else {
        if (selected.length >= maxPick) selected.shift(); // 先に選んだ方を外す（低学年向けに簡単）
        selected.push(a.id);
      }

      // send to server as 2 rules (always)
      const rules = [
        { condId:"always", actionId: selected[0] || "none" },
        { condId:"always", actionId: selected[1] || "none" },
      ];
      ws.send(JSON.stringify({ type:"kiosk_set_rules", rules }));
    };

    grid.appendChild(tile);
  }

  // score UI
  setProgress("kiosk", session.scores || {rescue:50,crowd:50,delay:50});
  el("planFaces").innerHTML = faceRowHTML(session.scores || {rescue:50,crowd:50,delay:50});
}

function renderRunning(){
  setProgress("run", session.scores);
  el("runStep").textContent = String(session.step || 0);
  el("runTotal").textContent = String(session.totalSteps || 10);

  // cute running emoji
  const step = session.step || 0;
  el("runCount").textContent = ["🚆","🚆💨","🚆💨💨","🚆💨💨💨"][step % 4];
}

function renderResult(){
  const r = session.result;
  el("resultBadgeTotal").textContent = `総合 ${r?.total ?? 0}`;
  el("resultBadgeName").textContent = `称号：${r?.title ?? "—"}`;
  el("resultBadgeCode").textContent = `コード：${r?.code ?? "----"}`;

  el("resultFaces").innerHTML = faceRowHTML(session.scores || {rescue:50,crowd:50,delay:50});

  if (r?.pass){
    el("resultTitle").textContent = "やったー！復旧完了！";
    el("resultReason").textContent = "警報解除！みんなが安心して乗れるようになった！";
    popConfetti();
  } else {
    el("resultTitle").textContent = "おしい！";
    el("resultReason").textContent = r?.reason || "作戦をかえてもう一回！";
  }
}

function renderCert(){
  const r = session.result;
  el("certWhen").textContent = `時刻：${fmtTime(Date.now())} / Kiosk #${kioskId}`;
  el("certMission").textContent = `${session.card?.id}：${session.card?.title ?? ""}`;
  el("certTitle").textContent = r?.title ?? "—";
  el("certCode").textContent = r?.code ?? "----";
  el("certScores").textContent =
    `${session.scores.rescue} / ${session.scores.crowd} / ${session.scores.delay}（総合 ${r?.total ?? 0}）`;
}

function render(){
  updateBadges();
  if (!session) return;

  switch(session.state){
    case "ATTRACT": showState("ATTRACT"); break;
    case "BRIEFING": showState("BRIEFING"); renderBriefing(); break;
    case "PLANNING":
      // キッズモードはKid画面へ
      showState("PLANNING_KID");
      renderPlanningKid();
      break;
    case "READY": showState("READY"); break;
    case "RUNNING": showState("RUNNING"); renderRunning(); break;
    case "RESULT": showState("RESULT"); renderResult(); break;
    case "CERT": showState("CERT"); renderCert(); break;
    default: showState("ATTRACT"); break;
  }
}

// ---- confetti (CSS only) ----
function popConfetti(){
  const wrap = el("confetti");
  wrap.innerHTML = "";
  const n = 36;
  for (let i=0; i<n; i++){
    const p = document.createElement("div");
    p.className = "confettiPiece";
    p.style.left = `${Math.random()*100}%`;
    p.style.top = `${-20 - Math.random()*80}px`;
    p.style.transform = `rotate(${Math.random()*180}deg)`;
    p.style.background = `rgba(255,255,255,${0.25 + Math.random()*0.55})`;
    p.style.animationDuration = `${900 + Math.random()*700}ms`;
    wrap.appendChild(p);
  }
  wrap.classList.add("show");
  setTimeout(()=> wrap.classList.remove("show"), 1400);
}

// ---- beep (WebAudio) ----
function beep(freq=880, ms=120){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.06;
    o.start();
    setTimeout(()=> { o.stop(); ctx.close(); }, ms);
  }catch{}
}

// ---- UI events ----
el("btnCardClear").onclick = () => el("cardInput").value = "";
el("btnForceReset").onclick = () => ws.send(JSON.stringify({ type:"kiosk_force_reset" }));

el("selDifficulty").onchange = () => ws.send(JSON.stringify({
  type:"kiosk_set_mode",
  difficulty: el("selDifficulty").value,
  mode: el("selMode").value,
}));
el("selMode").onchange = () => ws.send(JSON.stringify({
  type:"kiosk_set_mode",
  difficulty: el("selDifficulty").value,
  mode: el("selMode").value,
}));

el("btnStartWithId").onclick = () => {
  const id = (el("cardInput").value || "").trim().padStart(2,"0");
  ws.send(JSON.stringify({ type:"kiosk_start", cardId:id }));
};

// “ルーレット感”を出す：押したら一瞬ワクワク表示→開始
el("btnStartDeck").onclick = () => {
  el("btnStartDeck").textContent = "ルーレット中…🎲";
  el("btnStartDeck").disabled = true;
  beep(660,120);
  setTimeout(()=> {
    ws.send(JSON.stringify({ type:"kiosk_start" }));
    el("btnStartDeck").textContent = "ルーレット開始（被りにくい）";
    el("btnStartDeck").disabled = false;
  }, 650);
};

el("btnBackToAttract").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));
el("btnToPlanning").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));

el("btnPlanningBackKid").onclick = () => ws.send(JSON.stringify({ type:"kiosk_force_reset" }));
el("btnToReadyKid").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_ready" }));

el("btnReadyBack").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));

let departLock = false;
async function departCountdown(){
  if (departLock) return;
  departLock = true;

  // 3-2-1
  const hint = el("countHint");
  hint.classList.remove("small");
  hint.textContent = "3";
  beep(660,110);
  await new Promise(r=>setTimeout(r,420));

  hint.textContent = "2";
  beep(740,110);
  await new Promise(r=>setTimeout(r,420));

  hint.textContent = "1";
  beep(880,110);
  await new Promise(r=>setTimeout(r,420));

  hint.textContent = "しゅっぱつ！";
  beep(1040,140);
  ws.send(JSON.stringify({ type:"kiosk_depart" }));

  setTimeout(()=> {
    hint.classList.add("small");
    hint.textContent = "（ボタンをおしてね）";
    departLock = false;
  }, 800);
}

el("btnDepart").onclick = departCountdown;

el("btnRetry").onclick = () => ws.send(JSON.stringify({ type:"kiosk_retry" }));
el("btnShowCert").onclick = () => ws.send(JSON.stringify({ type:"kiosk_show_cert" }));
el("btnNext").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));

// Mouse shortcuts
document.addEventListener("keydown", (e) => {
  if (inputMode !== "mouse") return;
  if (e.key === "r" || e.key === "R") ws.send(JSON.stringify({ type:"kiosk_force_reset" }));
  if (e.key === "Enter"){
    if (session?.state === "READY") departCountdown();
  }
});

// WS
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "hello_ack"){
    connBadge.textContent = "接続OK";
    connBadge.classList.add("good");
  }

  if (msg.type === "session"){
    session = msg.session;

    // kidModeのとき：常にPLANNINGはKid画面へ誘導するため
    // サーバ側stateはPLANNINGのままでOK

    // UI select reflect
    el("selDifficulty").value = session.difficulty;
    el("selMode").value = session.mode;

    render();
  }
});

/*
これで「低学年向けに面白そう」になる理由（運用コツもセット）
低学年は「選択肢が多い」だけで離脱します

なので IF/THENを見せず、
“作戦カードを最大2枚タップ” にしています。

ゲームっぽさは「演出」で決まる

3・2・1発車（音付き）

成功で紙吹雪

顔メーターで理解できる（数字より強い）
*/
