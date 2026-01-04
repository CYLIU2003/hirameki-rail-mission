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
  Object.values(S).forEach(x => x.classList.add("hidden"));
  S[name].classList.remove("hidden");
}

const { ws } = wsConnect({ role:"kiosk", kioskId });

let session = null;
const catalog = window.CATALOG;

function updateBadges(){
  if (!session) return;
  badgeMode.textContent = `Mode: ${session.mode}`;
  badgeDifficulty.textContent = `Difficulty: ${session.difficulty}`;
}

function fillSelectOptions(select, items, bannedSet){
  select.innerHTML = "";
  for (const it of items){
    const opt = document.createElement("option");
    opt.value = it.id;

    // banned actionの場合、表示はするが（分かるように）無効化
    if (bannedSet && bannedSet.has(it.id)){
      opt.textContent = `✖ ${it.label}（縛りで使用不可）`;
      opt.disabled = true;
    } else {
      opt.textContent = it.label;
    }
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

function renderPlanning(){
  const c1 = el("rule1Cond"), a1 = el("rule1Act");
  const c2 = el("rule2Cond"), a2 = el("rule2Act");

  const banned = new Set(session.card?.bannedActions || []);
  const onlyOne = !!session.card?.onlyOneRule;

  fillSelectOptions(c1, catalog.conditions);
  fillSelectOptions(c2, catalog.conditions);
  fillSelectOptions(a1, catalog.actions, banned);
  fillSelectOptions(a2, catalog.actions, banned);

  const r1 = session.rules?.[0] || {condId:"always", actionId:"none"};
  const r2 = session.rules?.[1] || {condId:"always", actionId:"none"};

  c1.value = r1.condId; a1.value = r1.actionId;
  c2.value = r2.condId; a2.value = r2.actionId;

  el("rule2Note").textContent = onlyOne ? "このミッションは「作戦1個だけ」。作戦②は無効です。" : "";

  c2.disabled = onlyOne;
  a2.disabled = onlyOne;
  if (onlyOne){
    c2.value = "always";
    a2.value = "none";
  }

  // descriptions
  el("rule1Desc").textContent = actionDesc(catalog.actions, a1.value) || "—";
  el("rule2Desc").textContent = actionDesc(catalog.actions, a2.value) || "—";

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
  el("certScores").textContent =
    `${session.scores.rescue} / ${session.scores.crowd} / ${session.scores.delay}（総合 ${r?.total ?? 0}）`;
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

// ---- UI Events ----
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
el("btnStartDeck").onclick = () => ws.send(JSON.stringify({ type:"kiosk_start" }));

el("btnBackToAttract").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));
el("btnToPlanning").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));

el("btnPlanningBack").onclick = () => ws.send(JSON.stringify({ type:"kiosk_force_reset" }));

function sendRulesAndGoReady(){
  const onlyOne = !!session?.card?.onlyOneRule;
  const rules = [
    { condId: el("rule1Cond").value, actionId: el("rule1Act").value },
    { condId: onlyOne ? "always" : el("rule2Cond").value, actionId: onlyOne ? "none" : el("rule2Act").value },
  ];
  ws.send(JSON.stringify({ type:"kiosk_set_rules", rules }));
  ws.send(JSON.stringify({ type:"kiosk_to_ready" }));
}
el("btnToReady").onclick = sendRulesAndGoReady;

el("btnReadyBack").onclick = () => ws.send(JSON.stringify({ type:"kiosk_to_planning" }));
el("btnDepart").onclick = () => ws.send(JSON.stringify({ type:"kiosk_depart" }));

el("btnRetry").onclick = () => ws.send(JSON.stringify({ type:"kiosk_retry" }));
el("btnShowCert").onclick = () => ws.send(JSON.stringify({ type:"kiosk_show_cert" }));
el("btnNext").onclick = () => ws.send(JSON.stringify({ type:"kiosk_next" }));

// 作戦説明のライブ更新（選択変えたら説明が変わる）
document.addEventListener("change", (e) => {
  if (!session) return;
  if (session.state !== "PLANNING") return;

  if (e.target?.id === "rule1Act"){
    el("rule1Desc").textContent = actionDesc(catalog.actions, el("rule1Act").value) || "—";
  }
  if (e.target?.id === "rule2Act"){
    el("rule2Desc").textContent = actionDesc(catalog.actions, el("rule2Act").value) || "—";
  }
});

// Mouse shortcuts
document.addEventListener("keydown", (e) => {
  if (inputMode !== "mouse") return;

  if (e.key === "r" || e.key === "R") ws.send(JSON.stringify({ type:"kiosk_force_reset" }));
  if (e.key === "Enter"){
    if (session?.state === "READY") ws.send(JSON.stringify({ type:"kiosk_depart" }));
  }
  if (e.key === " " || e.code === "Space"){
    if (session?.state === "BRIEFING") ws.send(JSON.stringify({ type:"kiosk_to_planning" }));
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
    el("selDifficulty").value = session.difficulty;
    el("selMode").value = session.mode;
    render();
  }
});