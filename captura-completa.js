// ==UserScript==
// @name         Caramelo Live - Sonda v6 (event-driven, background-proof)
// @namespace    caramelo-live
// @version      6.0
// @match        https://www.caramelotips.com.br/*
// @grant        none
// ==/UserScript==
//
// Le o snapshot do WebSocket do caramelo (placares + futuros + odds) e manda
// pro site. Funciona com a aba EM SEGUNDO PLANO: reage aos avisos do WebSocket
// (que chegam mesmo escondido) em vez de depender de timer (que o navegador
// estrangula). Nao depende do grafico da tela; o servidor calcula a curva.
//
// USO: estar LOGADO no caramelo (marque "Manter conectado"). Instalado no
// Tampermonkey, roda sozinho ao abrir o caramelo. Deixe 1 aba do caramelo aberta.

const SITE = "https://mr-betlive.onrender.com";
const LIGAS = ["copa", "euro", "super", "premier"];

(function () {
  if (window.__SONDA6) { console.log("sonda v6 ja ativa"); return; }
  window.__SONDA6 = true;

  function getWS() { return window.wsDados && window.wsDados.readyState === 1 ? window.wsDados : null; }

  async function enviarSnapshot(liga, data) {
    try {
      const r = await fetch(SITE + "/api/snapshot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liga, data })   // so os dados; servidor calcula a curva
      });
      const j = await r.json();
      window.__sondaLast = `${liga}: ${j.placares || 0}pl ${j.futuros || 0}fut ${j.ok ? "ok" : ("ERRO:" + j.erro)} @${new Date().toLocaleTimeString()}`;
    } catch (e) { window.__sondaLast = "erro envio: " + e.message; }
  }

  function pedeLiga(l) { const ws = getWS(); if (ws) try { ws.send(JSON.stringify({ type: "liga:get", liga: l })); } catch (e) { } }
  function pedeTodas() { LIGAS.forEach((l, i) => setTimeout(() => pedeLiga(l), i * 400)); }

  // EVENT-DRIVEN: reage as mensagens do WS (funciona com a aba em segundo plano)
  function hookWS() {
    const ws = getWS();
    if (!ws || ws.__sondaHooked) return false;
    ws.addEventListener("message", ev => {
      if (typeof ev.data !== "string") return;
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "snapshot" && msg.liga && msg.data) {
        enviarSnapshot(msg.liga, msg.data);            // chegou snapshot -> manda
      } else if (msg.type === "liga:refresh" && msg.liga) {
        pedeLiga(msg.liga);                            // mudou -> pede o snapshot novo
      }
    });
    ws.__sondaHooked = true;
    pedeTodas();                                       // pede as 4 ao conectar
    return true;
  }

  // backup leve: re-hooka se o WS reconectar e pede tudo de tempos em tempos
  // (em segundo plano o navegador estrangula isto, mas o event-driven acima cobre)
  setInterval(() => { if (!hookWS()) pedeTodas(); }, 20000);
  hookWS();
  console.log("=== SONDA v6 (event-driven) LIGADA === " + SITE);
})();
