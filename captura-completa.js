// ===== CARAMELO LIVE - SONDA COMPLETA (placares + curva + jogos) =====
// O caramelo trocou pra WebSocket ao vivo e os arquivos JSON morreram.
// Esta sonda LE da tela ao vivo (fonte que o caramelo realmente usa agora)
// e manda pro nosso servidor. Deixe a aba do caramelo aberta (pode minimizar).
//
// Troque pela URL do SEU site no Render se mudar:
const SITE = "https://mr-betlive.onrender.com";

(function () {
  if (window.__SONDA_ON) { console.log("sonda ja rodando"); return; }
  window.__SONDA_ON = true;

  // ---- liga ativa: botao com fundo verde (rgb(31,204,89)) ----
  function ligaAtiva() {
    const spans = [...document.querySelectorAll("span")].filter(e =>
      ["copa", "euro", "super", "premier"].includes((e.textContent || "").trim().toLowerCase()));
    let best = { liga: "euro", verde: -1 };
    for (const s of spans) {
      const btn = s.closest("button") || s.parentElement;
      const m = getComputedStyle(btn).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      let verde = 0;
      if (m) { const [, r, g, b] = m.map(Number); verde = (g > r + 15 && g > b + 15) ? g - Math.max(r, b) : 0; }
      if (verde > best.verde) best = { liga: s.textContent.trim().toLowerCase(), verde };
    }
    return best.liga;
  }

  // ---- mercado do grafico: _tipo do dataset ----
  const TIPO_MKT = { over35: "o35", over25: "o25", over5: "ge5", ge5: "ge5", ambas_sim: "ambas", "ambas sim": "ambas" };
  function mercadoGrafico() {
    const t = window.__gpLastCfg?.datasets?.[0]?._tipo || "over35";
    return TIPO_MKT[t] || "o35";
  }

  // ---- placares da grade, na ORDEM CRONOLOGICA CORRETA ----
  // (validado: linhas de baixo pra cima, cada linha esq->dir, bate 41/41 com a curva real)
  function lerPlacares() {
    const cells = [...document.querySelectorAll("div")].filter(el =>
      /^\d{1,2}-\d{1,2}$/.test((el.textContent || "").trim()) && el.children.length === 0);
    if (!cells.length) return [];
    const pts = cells.map(c => { const r = c.getBoundingClientRect(); return { s: c.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y) }; });
    const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(pts.map(p => p.y))].sort((a, b) => a - b);
    const mat = ys.map(y => xs.map(x => { const c = pts.find(p => p.x === x && p.y === y); return c ? c.s : null; }));
    // baixo->cima, esq->dir. Os 2 ultimos placares ainda nao entram na curva
    // do caramelo (validado ao vivo: descartar 2 faz a curva bater 41/41).
    const ordenados = [...mat].reverse().flat().filter(Boolean).slice(0, -2);
    return ordenados.map(s => { const m = s.match(/(\d+)-(\d+)/); return { a: +m[1], b: +m[2], total: +m[1] + +m[2] }; });
  }

  // ---- curva pronta do grafico (a real do caramelo) ----
  function lerCurva() {
    const c = window.__gpLastCfg;
    if (!c || !c.datasets || !c.datasets[0]) return null;
    const d = c.datasets[0];
    return { curva: d.data, mm1: c.mediaMovel1, mm2: c.mediaMovel2, topo: c.maxValor, fundo: c.minValor, tipo: d._tipo };
  }

  async function enviar() {
    try {
      const liga = ligaAtiva();
      const mkt = mercadoGrafico();
      const placares = lerPlacares();
      const g = lerCurva();
      if (!placares.length && !g) return;
      const payload = {
        liga, mkt,
        placares,                                  // historico cronologico (recalcula tudo)
        curva: g ? g.curva : null,                 // curva real pronta
        mm1: g ? g.mm1 : null, mm2: g ? g.mm2 : null,
        topo: g ? g.topo : null, fundo: g ? g.fundo : null,
        ts: Date.now()
      };
      const r = await fetch(SITE + "/api/dados", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const j = await r.json();
      window.__sondaLast = `${liga}/${mkt}: ${placares.length} placares, curva ${g ? g.curva.length : 0}pts @${new Date().toLocaleTimeString()}`;
    } catch (e) { window.__sondaLast = "erro: " + e.message; }
  }

  enviar();
  window.__sondaTimer = setInterval(enviar, 5000);
  console.log("=== SONDA CARAMELO LIGADA === enviando placares+curva a cada 5s para " + SITE);
})();
