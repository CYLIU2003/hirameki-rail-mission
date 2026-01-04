const { ws } = wsConnect({ role:"admin", kioskId:null });
const conn = el("conn");

let sessions = [];

function render(){
  const list = el("list");
  list.innerHTML = "";

  for (const s of sessions){
    const div = document.createElement("div");
    div.className = "card";

    const title = document.createElement("div");
    title.className = "h2";
    title.textContent = `Kiosk #${s.kioskId} / ${s.state}`;

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `card=${s.cardId||"-"} mode=${s.mode} diff=${s.difficulty} last=${fmtTime(s.lastActiveAt||Date.now())}`;

    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "10px";

    const btnReset = document.createElement("button");
    btnReset.className = "btn danger";
    btnReset.textContent = "リセット";
    btnReset.onclick = () => ws.send(JSON.stringify({ type:"admin_reset_kiosk", kioskId:s.kioskId }));

    const btnFollow = document.createElement("button");
    btnFollow.className = "btn";
    btnFollow.textContent = "このKioskを表示";
    btnFollow.onclick = () => ws.send(JSON.stringify({ type:"admin_set_display_follow", follow:String(s.kioskId) }));

    row.appendChild(btnReset);
    row.appendChild(btnFollow);

    div.appendChild(title);
    div.appendChild(meta);
    div.appendChild(row);

    // last results
    const resWrap = document.createElement("div");
    resWrap.style.marginTop = "12px";
    resWrap.className = "noteBox";

    const last = s.lastResults || [];
    if (!last.length){
      resWrap.textContent = "直近結果：なし";
    } else {
      const lines = last.slice(0, 6).map(r => {
        const icon = r.pass ? "✅" : "❌";
        return `${icon} ${new Date(r.time).toLocaleTimeString()}  #${r.cardId} ${r.total}pt  code:${r.code}`;
      });
      resWrap.textContent = "直近結果：\n" + lines.join("\n");
      resWrap.style.whiteSpace = "pre-wrap";
    }
    div.appendChild(resWrap);

    list.appendChild(div);
  }
}

el("btnFollowAuto").onclick = () => ws.send(JSON.stringify({ type:"admin_set_display_follow", follow:"AUTO" }));
el("btnFollowSet").onclick = () => {
  const id = (el("followId").value || "").trim();
  if (!id) return;
  ws.send(JSON.stringify({ type:"admin_set_display_follow", follow:id }));
};

el("btnSetDefaults").onclick = () => {
  ws.send(JSON.stringify({
    type:"admin_set_defaults",
    defaults: {
      difficulty: el("defDifficulty").value,
      mode: el("defMode").value,
    }
  }));
};

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "hello_ack"){
    conn.textContent = "接続OK";
    conn.classList.add("good");
    if (msg.adminSettings?.defaults){
      el("defDifficulty").value = msg.adminSettings.defaults.difficulty;
      el("defMode").value = msg.adminSettings.defaults.mode;
    }
  }

  if (msg.type === "sessions"){
    sessions = msg.sessions || [];
    if (msg.adminSettings?.defaults){
      el("defDifficulty").value = msg.adminSettings.defaults.difficulty;
      el("defMode").value = msg.adminSettings.defaults.mode;
    }
    render();
  }
});