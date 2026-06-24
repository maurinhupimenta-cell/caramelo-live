// ==UserScript==
// @name         Caramelo Live - Sonda v4
// @namespace    caramelo-live
// @version      4.0
// @match        https://www.caramelotips.com.br/*
// @grant        none
// ==/UserScript==
// Cole no Console (F12) da aba do caramelo, ou instale no Tampermonkey.
// Deixe a aba aberta. Le placares + jogos futuros + curva e manda pro site.

const SITE = "https://mr-betlive.onrender.com";

(function () {
  if (window.__SONDA4) { console.log("sonda v4 ja ativa"); return; }
  window.__SONDA4 = true;
  const TIPO = { over35: "o35", over25: "o25", over5: "ge5", ge5: "ge5", ambas_sim: "ambas", "ambas sim": "ambas" };

  function ligaAtiva() {
    const spans = [...document.querySelectorAll("span")].filter(e =>
      ["copa", "euro", "super", "premier"].includes((e.textContent || "").trim().toLowerCase()));
    let best = { liga: "euro", verde: -1 };
    for (const s of spans) {
      const btn = s.closest("button") || s.parentElement;
      const m = getComputedStyle(btn).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      let v = 0; if (m) { const [, r, g, b] = m.map(Number); v = (g > r + 15 && g > b + 15) ? g - Math.max(r, b) : 0; }
      if (v > best.verde) best = { liga: s.textContent.trim().toLowerCase(), verde: v };
    }
    return best.liga;
  }

  // placares pela ordem do DOM (leve). baixo->cima, esq->dir, descarta 2 ultimos.
  function lerPlacares() {
    const cells = [...document.querySelectorAll("div")].filter(el =>
      el.children.length === 0 && /^\d{1,2}-\d{1,2}$/.test((el.textContent || "").trim()));
    if (!cells.length) return [];
    const tabela = cells[0].closest("table"); if (!tabela) return [];
    const linhas = [...tabela.querySelectorAll("tr")]
      .map(tr => [...tr.querySelectorAll("div")]
        .filter(d => d.children.length === 0 && /^\d{1,2}-\d{1,2}$/.test((d.textContent || "").trim()))
        .map(d => d.textContent.trim())).filter(a => a.length);
    const ord = [...linhas].reverse().flat().slice(0, -2);
    return ord.map(s => { const m = s.match(/(\d+)-(\d+)/); return { a: +m[1], b: +m[2], total: +m[1] + +m[2] }; });
  }

  // jogos FUTUROS: celulas da grade com "Time x Time" + odds (AMBS / O2.5 / O3.5).
  // retorna {upcoming, debugCells} - debug pra eu ver a estrutura real.
  function lerFuturos() {
    const cand = [...document.querySelectorAll("td,div")].filter(el => {
      const t = (el.innerText || "").trim();
      return el.children.length <= 6 && /\sx\s/i.test(t) && /\d\.\d{2}/.test(t) && t.length < 90;
    });
    const debugCells = cand.slice(0, 6).map(el => (el.innerText || "").replace(/\n+/g, " | ").trim().slice(0, 90));
    const upcoming = [];
    const vistos = new Set();
    for (const el of cand) {
      const raw = (el.innerText || "").replace(/\n+/g, " ").trim();
      const nm = raw.match(/([A-Za-zÀ-ú.\s]+?\sx\s[A-Za-zÀ-ú.\s]+?)(?=\s*(AMBS|AMBN|O2|O3|U2|U3|\d\.\d{2}|$))/i);
      if (!nm) continue;
      const nome = nm[1].replace(/\s+/g, " ").trim();
      if (!nome || vistos.has(nome)) continue;
      vistos.add(nome);
      const odds = {};
      const amb = raw.match(/AMBS[^\d]*(\d\.\d{2})/i); if (amb) odds.ambs = +amb[1];
      const o25 = raw.match(/O2\.?5[^\d]*(\d\.\d{2})/i); if (o25) odds.o25 = +o25[1];
      const o35 = raw.match(/O3\.?5[^\d]*(\d\.\d{2})/i); if (o35) odds.o35 = +o35[1];
      upcoming.push({ nome, horario: "", casa: "", fora: "", odds });
    }
    return { upcoming, debugCells };
  }

  async function enviar() {
    try {
      const c = window.__gpLastCfg;
      const liga = ligaAtiva();
      const mkt = TIPO[c && c.datasets && c.datasets[0] && c.datasets[0]._tipo] || "o35";
      const placares = lerPlacares();
      if (!placares.length) return;
      const fut = lerFuturos();
      const body = {
        liga, mkt, placares, upcoming: fut.upcoming,
        curva: c && c.datasets && c.datasets[0] ? c.datasets[0].data : null,
        mm1: c ? c.mediaMovel1 : null, mm2: c ? c.mediaMovel2 : null,
        topo: c ? c.maxValor : null, fundo: c ? c.minValor : null,
        debug: { futuros: fut.upcoming.length, cells: fut.debugCells }, ts: Date.now()
      };
      const r = await fetch(SITE + "/api/dados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      window.__sondaLast = `${liga}/${mkt}: ${placares.length}pl ${fut.upcoming.length}fut ${j.ok ? "ok" : "?"} @${new Date().toLocaleTimeString()}`;
    } catch (e) { window.__sondaLast = "erro: " + e.message; }
  }

  let ultimo = 0;
  setInterval(() => { const n = Date.now(); if (n - ultimo >= 8000) { ultimo = n; enviar(); } }, 2000);
  enviar();
  console.log("=== SONDA v4 LIGADA === " + SITE);
})();
