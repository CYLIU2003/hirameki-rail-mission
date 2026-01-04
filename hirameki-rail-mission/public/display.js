const { ws, ready } = wsConnect({ role:"display", kioskId: null });
const follow = el("dispFollow");

let session = null;

function scaleStage(){
  // Fit 1920x1080 stage into any display (14" 1080p -> 1.0, but safe)
  const stage = el("stage");
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener("resize", scaleStage);
scaleStage();

function setBoard(session){
  const card = session?.card;
  if (!card){
    el("boardLine").textContent = "ひらめき線";
    el("boardDest").textContent = "待機中";
    el("boardTime").textContent = "--:--";
    el("boardPlat").textContent = "1番線";
    return;
  }
  el("boardLine").textContent = "ひらめき線";
  el("boardDest").textContent = card.tags?.includes("rescue") ? "救援特別" : "臨時列車";
  // Fake time display based on step
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  el("boardTime").textContent = `${hh}:${mm}`;
  el("boardPlat").textContent = card.tags?.includes("blackout") ? "2番線" : "1番線";
}

function setAlarm(session){
  const st = session?.state;
  const card = session?.card;
  const alarm = el("alarm");
  alarm.classList.remove("success");
  alarm.classList.add("flash");

  if (!card){
    alarm.textContent = "警報：待機中";
    return;
  }
  if (st === "RUNNING"){
    alarm.textContent = `警報：${card.title}`;
  } else if (st === "RESULT"){
    if (session.result?.pass){
      alarm.textContent = "警報解除：定刻に復旧！";
      alarm.classList.add("success");
      alarm.classList.remove("flash");
    } else {
      alarm.textContent = `注意：${session.result?.reason ?? "再挑戦"}`;
    }
  } else if (st === "CERT"){
    alarm.textContent = "復旧証明書：撮影OK";
    alarm.classList.add("success");
    alarm.classList.remove("flash");
  } else {
    alarm.textContent = `警報：${card.title}`;
  }
}

let overlayTimer = null;
function showOverlay(r){
  const ov = el("ov");
  el("ovTitle").textContent = r?.pass ? "成功！復旧完了！" : "惜しい！";
  el("ovText").textContent = r?.pass ? "警報解除！発車標が定刻表示に戻りました。" : (r?.reason || "作戦を変えて再挑戦！");
  el("ovBadge1").textContent = `称号：${r?.title ?? "—"}`;
  el("ovBadge2").textContent = `総合：${r?.total ?? "—"}`;
  el("ovBadge3").textContent = `コード：${r?.code ?? "—"}`;
  ov.classList.add("show");
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(()=> ov.classList.remove("show"), 3500);
}

function render(){
  if (!session) return;
  follow.textContent = `FOLLOW: ${session.kioskId ?? "AUTO"}`;
  setBoard(session);
  setAlarm(session);
  setProgress("disp", session.scores || {rescue:50,crowd:50,delay:50});
  el("dispStep").textContent = String(session.step || 0);
  el("dispTotal").textContent = String(session.totalSteps || 10);
  el("dispMission").textContent = session.card ? `ミッション ${session.card.id}：${session.card.title}` : "（待機中）";

  // Train box subtle movement
  const box = el("trainBox");
  if (session.state === "RUNNING"){
    box.style.transform = `translateX(${(session.step||0)*12}px)`;
  } else {
    box.style.transform = "translateX(0px)";
  }

  // Overlay on result
  if (session.state === "RESULT" && session.result){
    showOverlay(session.result);
  }
}

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === "hello_ack") {
    // noop
  }
  if (msg.type === "session") {
    session = msg.session;
    render();
  }
});

ready.then(()=>{});
