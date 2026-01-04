/* Kiosk UI logic */
const kioskId = q("kiosk","1");
const inputMode = q("input","touch");

const badgeKiosk = el("badgeKiosk");
const badgeInput = el("badgeInput");
const badgeMode = el("badgeMode");
const badgeDifficulty = el("badgeDifficulty");
const connBadge = el("connBadge");

badgeKiosk.textContent = `Kiosk #${kioskId}`;
badgeInput.textContent = (inputMode === "mouse") ? "Mouseモード" : "Touchモード";

const S = {
  ATTRACT: el("S_ATTRACT"),
  BRIEFING: el("S_BRIEFING"),
  PLANNING: el("S_PLANNING"),
  READY: el("S_READY"),
  RUNNING: el("S_RUNNING"),
  RESULT: el("S_RESULT"),
  CERT: el("S_CERT"),
};
function showState(name){
  for (const k of Object.keys(S)) S[k].classList.add("hidden");
  S[name].classList.remove("hidden");
}

const { ws, ready } = wsConnect({ role:"kiosk", kioskId });

let session = null;
let catalog = window.CATALOG;

function updateBadges(){
  if (!session) return;
  badgeMode.textContent = `Mode: ${session.mode}`;
  badgeDifficulty.textContent = `Difficulty: ${session.difficulty}`;
}

function fillSelectOptions(select, items){
  select.innerHTML = "";
  for (const it of items){
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.label;
    select.appendChild(opt);
  }
}

function renderBriefing(){
  if (!session?.card) return;
  el("briefTitle").textContent = `ミッション ${session.card.id}：${session.card.title}`;
  el("briefText").textContent = session.card.brief;
  el("briefObjective").textContent = session.card.objective;
  el("briefHint").textContent = session.card.hint || "—";

  const ul = el("briefConstraints");
  ul.innerHTML = "";
  const constraints = session.card.constraints || [];
  if (constraints.length === 0){
    const li = document.createElement("li");
    li.textContent = "なし";
    ul.appendChild(li);
  } else {
    for (const c of constraints){
      const li = document.createElement("li");
      li.textContent = c;
      ul.appendChild(li);
    }
  }
}

function renderPlanning(){
  // Fill selects
  const c1 = el("rule1Cond"), a1 = el("rule1Act");
  const c2 = el("rule2Cond"), a2 = el("rule2Act");

  fillSelectOptions(c1, catalog.conditions);
  fillSelectOptions(c2, catalog.conditions);
  fillSelectOptions(a1, catalog.actions);
  fillSelectOptions(a2, catalog.actions);

  // Apply existing rules
  const r1 = session.rules?.[0] || {condId:"always", actionId:"none"};
  const r2 = session.rules?.[1] || {condId:"always", actionId:"none"};
  c1.value = r1.condId; a1.value = r1.actionId;
  c2.value = r2.condId; a2.value = r2.actionId;

  // HARD card #30 rule limitation: only 1 rule
  const onlyOne = (session.card?.id === "30");
  el("rule2Note").textContent = onlyOne ? "このミッションは「作戦1個だけ」。作戦②は自動で無効になります。" : "";
  if (onlyOne){
    c2.disabled = true; a2.disabled = true;
    c2.value = "always"; a2.value = "none";
  } else {
    c2.disabled = false; a2.disabled = false;
  }

  setProgress("kiosk", session.scores || {rescue:50,crowd:50,delay:50});
}

function renderRunning(){
  setProgress("run", session.scores);
  el("runStep").textContent = String(session.step || 0);
  el("runTotal").textContent = String(session.totalSteps || 10);
}

function renderResult(){
  const r = session.result;
  setProgress("res", session.scores);
  el("resultBadgeTotal").textContent = `総合 ${r?.total ?? 0}`;
  el("resultBadgeName").textContent = `称号：${r?.title ?? "—"}`;
  el("resultBadgeCode").textContent = `コード：${r?.code ?? "----"}`;

  if (r?.pass){
    el("resultTitle").textContent = "成功！復旧完了！";
    el("resultReason").textContent = "警報解除！発車標が定刻表示に戻りました。";
  } else {
    el("resultTitle").textContent = "惜しい！";
    el("resultReason").textContent = r?.reason || "もう一回作戦を変えてみよう。";
  }
}

function renderCert(){
  const r = session.result;
  el("certWhen").textContent = `時刻：${fmtTime(Date.now())} / Kiosk #${kioskId}`;
  el("certMission").textContent = `${session.card?.id}：${session.card?.title ?? ""}`;
  el("certTitle").textContent = r?.title ?? "—";
  el("certCode").textContent = r?.code ?? "----";
  el("certScores").textContent = `${session.scores.rescue} / ${session.scores.crowd} / ${session.scores.delay}（総合 ${r?.total ?? 0}）`;
}

function render(){
  updateBadges();
  if (!session) return;
  switch(session.state){
    case "ATTRACT": showState("ATTRACT"); break;
    case "BRIEFING": showState("BRIEFING"); renderBriefing(); break;
    case "PLANNING": showState("PLANNING"); renderPlanning(); break;
    case "READY": showState("READY"); break;
    case "RUNNING": showState("RUNNING"); renderRunning(); break;
    case "RESULT": showState("RESULT"); renderResult(); break;
    case "CERT": showState("CERT"); renderCert(); break;
    default: showState("ATTRACT"); break;
  }
}

/** ===== Event bindings ===== */
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
  ws.send(JSON.stringify({ type:"kiosk_start", cardId: id }));
};
el("btnStartRandom").onclick = () => ws.send(JSON.stringify({ type:"kiosk_start" }));

el("btnBackToAttract").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));
el("btnToPlanning").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));

el("btnPlanningBack").onclick = () => ws.send(JSON.stringify({ type:"kiosk_force_reset" })); // keep simple
el("btnToReady").onclick = () => {
  // send rules first
  const onlyOne = (session?.card?.id === "30");
  const rules = [
    { condId: el("rule1Cond").value, actionId: el("rule1Act").value },
    { condId: onlyOne ? "always" : el("rule2Cond").value, actionId: onlyOne ? "none" : el("rule2Act").value },
  ];
  ws.send(JSON.stringify({ type:"kiosk_set_rules", rules }));
  ws.send(JSON.stringify({ type:"kiosk_to_ready" }));
};

el("btnReadyBack").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));
el("btnDepart").onclick = () => ws.send(JSON.stringify({ type:"kiosk_depart" }));

el("btnRetry").onclick = () => ws.send(JSON.stringify({ type:"kiosk_retry" }));
el("btnShowCert").onclick = () => ws.send(JSON.stringify({ type:"kiosk_show_cert" }));
el("btnNext").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));

// Mouse shortcuts
document.addEventListener("keydown", (e) => {
  if (inputMode !== "mouse") return;
  if (e.key === "r" || e.key === "R") ws.send(JSON.stringify({ type:"kiosk_force_reset" }));
  if (e.key === "Enter") {
    if (session?.state === "READY") ws.send(JSON.stringify({ type:"kiosk_depart" }));
  }
  if (e.key === " " || e.code === "Space") {
    if (session?.state === "BRIEFING") ws.send(JSON.stringify({ type:"kiosk_to_planning" }));
  }
});

/** ===== WS handling ===== */
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === "hello_ack") {
    connBadge.textContent = "接続OK";
    connBadge.classList.add("good");
  }
  if (msg.type === "session") {
    session = msg.session;
    // sync difficulty/mode selects with session
    el("selDifficulty").value = session.difficulty;
    el("selMode").value = session.mode;
    render();
  }
  if (msg.type === "sessions") {
    // ignore on kiosk
  }
});

ready.then(() => {
  // request catalog info if needed; we already loaded in page
});
