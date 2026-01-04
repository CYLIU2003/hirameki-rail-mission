function q(name, fallback=null){
  const u = new URL(location.href);
  return u.searchParams.get(name) ?? fallback;
}
function el(id){ return document.getElementById(id); }
function clamp(n,a=0,b=100){ return Math.max(a, Math.min(b, n)); }

function wsConnect({role, kioskId}){
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/`);
  const ready = new Promise((resolve) => {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type:"hello", role, kioskId }));
      resolve();
    });
  });
  return { ws, ready };
}

function fmtTime(ms){
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  const ss = String(d.getSeconds()).padStart(2,"0");
  return `${hh}:${mm}:${ss}`;
}

function setProgress(prefix, scores){
  const map = [["rescue","救援"],["crowd","混雑"],["delay","遅延"]];
  for (const [k] of map){
    const v = clamp(scores[k] ?? 0);
    const fill = el(`${prefix}_${k}_fill`);
    const val  = el(`${prefix}_${k}_val`);
    if (fill) fill.style.width = `${v}%`;
    if (val)  val.textContent = `${v}`;
  }
}

// 選択したactionの説明テキスト取得
function actionDesc(actions, id){
  const a = actions.find(x => x.id === id);
  return a ? a.description : "";
}