// ===== CARAMELO LIVE - CAPTURADOR DE CURVA =====
// Cole este codigo no Console (F12) da aba do caramelo (front.html),
// OU instale como Tampermonkey. Ele le a curva REAL do grafico e manda
// pro nosso site. Deixe a aba do caramelo aberta (pode minimizar).
//
// Troque a URL abaixo pela URL do SEU site no Render:
const SITE = "https://mr-betlive.onrender.com";

(function () {
  if (window.__CARAMELO_CAPTURA_ON) { console.log("captura ja rodando"); return; }
  window.__CARAMELO_CAPTURA_ON = true;

  // liga atual -> nome que o site usa
  function ligaAtual() {
    // tenta achar o botao de liga ativo (Copa/Euro/Super/Premier)
    const ativos = [...document.querySelectorAll("button,div")].filter(b => {
      const t = (b.innerText || "").trim().toLowerCase();
      return ["copa", "euro", "super", "premier"].includes(t) &&
        (b.className || "").match(/ativ|active|selected|on\b/i);
    });
    if (ativos.length) return ativos[0].innerText.trim().toLowerCase();
    // fallback: procura no titulo/estado
    const txt = (document.body.innerText || "").toLowerCase();
    for (const l of ["euro", "copa", "super", "premier"]) if (txt.includes(l)) return l;
    return "euro";
  }

  // _tipo do dataset -> mercado do site
  const TIPO_MKT = { over35: "o35", over25: "o25", over5: "ge5", ge5: "ge5", ambas_sim: "ambas", ambs: "ambas" };

  async function enviarCurva() {
    const cfg = window.__gpLastCfg;
    if (!cfg || !cfg.datasets || !cfg.datasets[0] || !Array.isArray(cfg.datasets[0].data)) return;
    const ds = cfg.datasets[0];
    const tipo = ds._tipo || "over35";
    const mkt = TIPO_MKT[tipo] || "o35";
    const liga = ligaAtual();
    const payload = {
      liga, mkt,
      curva: ds.data,
      mm1: cfg.mediaMovel1 || null,
      mm2: cfg.mediaMovel2 || null,
      topo: cfg.maxValor, fundo: cfg.minValor,
      labels: cfg.labelsSeq || null,
      markerColors: ds.markerColors || null
    };
    try {
      const r = await fetch(SITE + "/api/curve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      console.log(`[captura] ${liga}/${mkt}: ${j.pontos} pontos enviados`);
    } catch (e) {
      console.log("[captura] erro ao enviar:", e.message);
    }
  }

  // envia a cada 5s
  enviarCurva();
  window.__CARAMELO_CAPTURA_TIMER = setInterval(enviarCurva, 5000);
  console.log("=== CAPTURA CARAMELO LIGADA === enviando curva a cada 5s para " + SITE);
})();
