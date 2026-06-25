// ==UserScript==
// @name         Caramelo Live - Sonda v5 (WebSocket)
// @namespace    caramelo-live
// @version      5.0
// @match        https://www.caramelotips.com.br/*
// @grant        none
// ==/UserScript==
//
// O caramelo migrou pra WebSocket e o feed EXIGE LOGIN (fecha 4001 sem sessao).
// Esta sonda roda na SUA aba logada, le o snapshot limpo do WebSocket (placares +
// futuros + odds) e manda pro site. Leve (nao raspa a tela, nao trava).
//
// USO: esteja LOGADO no caramelo. Cole no Console (F12) OU instale no Tampermonkey.
// Deixe a aba aberta (pode minimizar).

const SITE = "https://mr-betlive.onrender.com";
const LIGAS = ["copa", "euro", "super", "premier"];

(function () {
  if (window.__SONDA5) { console.log("sonda v5 ja ativa"); return; }
  window.__SONDA5 = true;

  function getWS() { return window.wsDados && window.wsDados.readyState === 1 ? window.wsDados : null; }

  async function enviarSnapshot(liga, data) {
    try {
      const c = window.__gpLastCfg;
      const TIPO = { over35: "o35", over25: "o25", over5: "ge5", ge5: "ge5", ambas_sim: "ambas", "ambas sim": "ambas" };
      const mkt = TIPO[c && c.datasets && c.datasets[0] && c.datasets[0]._tipo] || "o35";
      const body = {
        liga, data, mkt,
        curva: c && c.datasets && c.datasets[0] ? c.datasets[0].data : null,
        mm1: c ? c.mediaMovel1 : null, mm2: c ? c.mediaMovel2 : null,
        topo: c ? c.maxValor : null, fundo: c ? c.minValor : null
      };
      const r = await fetch(SITE + "/api/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      window.__sondaLast = `${liga}: ${j.placares || 0}pl ${j.futuros || 0}fut ${j.ok ? "ok" : ("ERRO:" + j.erro)} @${new Date().toLocaleTimeString()}`;
    } catch (e) { window.__sondaLast = "erro envio: " + e.message; }
  }

  // escuta os snapshots que o WS ja entrega (a propria pagina pede ao trocar de liga)
  function hookWS() {
    const ws = getWS();
    if (!ws || ws.__sondaHooked) return false;
    ws.addEventListener("message", ev => {
      if (typeof ev.data !== "string" || ev.data.length < 5000) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot" && msg.liga && msg.data) enviarSnapshot(msg.liga, msg.data);
      } catch (e) { }
    });
    ws.__sondaHooked = true;
    return true;
  }

  // pede ativamente o snapshot de cada liga (usa a sessao logada da pagina)
  function pedeTodas() {
    const ws = getWS();
    if (!ws) return;
    LIGAS.forEach((l, i) => setTimeout(() => { try { ws.send(JSON.stringify({ type: "liga:get", liga: l })); } catch (e) { } }, i * 600));
  }

  // watchdog: garante hook + pede ligas a cada 15s
  let ultimo = 0;
  setInterval(() => {
    hookWS();
    const n = Date.now();
    if (n - ultimo >= 15000) { ultimo = n; pedeTodas(); }
  }, 2000);
  hookWS(); pedeTodas();
  console.log("=== SONDA v5 (WebSocket) LIGADA === " + SITE + " — esteja logado no caramelo");
})();
