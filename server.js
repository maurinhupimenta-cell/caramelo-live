import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const LIGAS = ["euro", "copa", "super", "premier"];
const BASE = "https://www.caramelotips.com.br/final/";
const REFRESH_MS = 15000;

// cache em memoria: liga -> { games, computed, lastUpdated, fetchedAt }
const store = {};

function parseOdds(s) {
  const odds = {};
  s.replace(/([a-z0-9]+)@([\d.]+)/gi, (_, k, v) => { odds[k] = parseFloat(v); });
  return odds;
}

function parseGame(s) {
  if (typeof s !== "string") return null;
  // aceita placar normal (1-3) e notacao 5+ (ex: 5+-0, 1-5+)
  const m = s.match(/^(.+?)(\d+|\d*\+)-(\d+|\d*\+)/);
  if (!m) return null;
  const norm = x => x.includes("+") ? 5 : +x;
  const a = norm(m[2]), b = norm(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { nome: m[1].trim(), a, b, total: a + b, odds: parseOdds(s) };
}

function parseUpcoming(s) {
  if (typeof s !== "string") return null;
  if (/\d-\d|\d\+-|-\d\+/.test(s)) return null;  // tem placar (inc. 5+) = nao e futuro
  if (!/@[\d.]+/.test(s)) return null;
  const nome = s.split(/\s{2,}|\n/)[0].replace(/[a-z0-9]+@[\d.]+/gi, "").trim();
  return { nome, odds: parseOdds(s) };
}

function decodeRows(json) {
  const rows = (json && json.table && json.table.rows) || [];
  const games = [], upcoming = [];
  for (const row of rows) {
    for (const cell of (row.c || [])) {
      const v = cell && cell.v;
      const u = parseUpcoming(v);
      if (u && u.nome) { upcoming.push(u); continue; }
      const g = parseGame(v);
      if (g) games.push(g);
    }
  }
  return { games, upcoming: upcoming.slice(0, 6) };
}

function pays(g, mkt) {
  if (mkt === "o25") return g.total >= 3;
  if (mkt === "o35") return g.total >= 4;
  if (mkt === "ge5") return g.total >= 5;
  if (mkt === "ambas") return g.a > 0 && g.b > 0;
  return false;
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function windowPct(games, mkt, n) {
  const s = games.slice(-n);
  if (!s.length) return null;
  return pct(s.filter(g => pays(g, mkt)).length, s.length);
}

function chartSeries(games, mkt, qtdJogos = 20) {
  // EXATO como o caramelo: janela = Qtd. Jogos. valor = % do mercado nessa janela.
  const vals = [];
  for (let i = qtdJogos; i <= games.length; i++) {
    const block = games.slice(i - qtdJogos, i);
    vals.push(Math.round(block.filter(g => pays(g, mkt)).length / qtdJogos * 100));
  }
  return vals.slice(-40);
}

function ema(arr, period) {
  // media movel exponencial (como MM do caramelo)
  if (!arr.length) return [];
  const k = 2 / (period + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}

function slopeOf(series){
  const n=series.length;
  if(n<3)return 0;
  const xm=(n-1)/2, ym=series.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0;
  series.forEach((y,x)=>{num+=(x-xm)*(y-ym);den+=(x-xm)**2;});
  return den?num/den:0;
}

function macdData(series) {
  // MM1 curta (10), MM2 longa (20), igual ao caramelo. MACD = MM1 - MM2
  const mm1 = ema(series, 10), mm2 = ema(series, 20);
  const hist = series.map((_, i) => +(mm1[i] - mm2[i]).toFixed(2));
  return { mm1, mm2, hist };
}

function zoneSignal(series){
  if(!series.length)return{zona:"—",zonaPct:0,direcao:"—",pagamento:"—",sinal:"AGUARDAR",macd:0,mm1:0,mm2:0};
  const sorted=series.slice().sort((a,b)=>a-b);
  const p=(q)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*q)))];
  const min=p(0.05),max=p(0.95),cur=series[series.length-1];
  const range=Math.max(1,max-min);
  const zonaPct=Math.round((Math.max(min,Math.min(max,cur))-min)/range*100);

  // DIRECAO CORRETA (como o caramelo): MACD = MM1(10) - MM2(20)
  const { mm1, mm2, hist } = macdData(series);
  const macd = hist[hist.length - 1];
  const macdPrev = hist[hist.length - 4] ?? macd;
  // direcao = sinal do MACD + se ele esta crescendo (histograma abrindo pra cima)
  const macdSubindo = macd > 0 && macd >= macdPrev;
  const macdDescendo = macd < 0 || (macd < macdPrev);
  const subindo = macd > 0.2 && macd >= macdPrev;   // so "subindo" se MACD positivo E abrindo
  const descendo = macd < -0.2 || (macd < macdPrev - 0.2);

  const zona=zonaPct<=25?"Fundo":zonaPct<=45?"Baixa":zonaPct>=78?"Topo":zonaPct>=60?"Alta":"Meio";
  let sinal="AGUARDAR",pagamento="—";
  // REGRA CORRIGIDA: so COMPRA no fundo subindo com MACD positivo. NUNCA compra no topo.
  if(zonaPct>=78){sinal="TOPO - NAO ENTRAR (risco RED)";pagamento=descendo?"Saída/pagamento":"—";}
  else if(zonaPct>=60&&descendo){sinal="PROTEGER PARCIAL";pagamento="Parcial";}
  else if(zonaPct<=35&&subindo){sinal="COMPRA (fundo subindo)";pagamento="Alvo meio";}
  else if(zonaPct<=35&&!subindo){sinal="FUNDO - aguardar virada";}
  else if(subindo&&zonaPct<60){sinal="SUBINDO (a favor)";}
  else if(descendo){sinal="RECUO";}
  return{
    zona,zonaPct,
    direcao:subindo?"Subindo":descendo?"Descendo":"Lateral",
    pagamento,sinal,
    macd:+macd.toFixed(2),
    mm1:+mm1[mm1.length-1].toFixed(1),
    mm2:+mm2[mm2.length-1].toFixed(1)
  };
}

function evalUpcoming(upcoming, games, mkt) {
  const byOdd = {};
  for (const g of games) {
    const o = g.odds[mkt]; if (!o) continue;
    const k = o.toFixed(2);
    (byOdd[k] = byOdd[k] || { tot: 0, hit: 0 });
    byOdd[k].tot++; if (pays(g, mkt)) byOdd[k].hit++;
  }
  const baseGeral = pct(games.filter(g => pays(g, mkt)).length, games.length);
  return upcoming.map(u => {
    const odd = u.odds[mkt];
    let p = baseGeral, amostra = "geral";
    if (odd) {
      const k = odd.toFixed(2);
      if (byOdd[k] && byOdd[k].tot >= 5) { p = pct(byOdd[k].hit, byOdd[k].tot); amostra = byOdd[k].hit + "/" + byOdd[k].tot; }
    }
    const justa = p > 0 ? +(100 / p).toFixed(2) : null;
    const ev = odd ? Math.round((p / 100 * odd - 1) * 1000) / 10 : null;
    return { nome: u.nome, odd: odd || null, base: p, amostra, justa, ev, vale: ev != null && ev > 0 };

  });
}

function confluencia(games, mkt) {
  // janelas crescentes (proxy de 3h/6h/12h por quantidade de jogos recentes)
  // jogos rolam ~a cada 3min, entao 3h~60 jogos, 6h~120, 12h~240
  const janelas = [{ nome: "3h", n: 60 }, { nome: "6h", n: 120 }, { nome: "12h", n: 240 }];
  const win = 20;
  const out = janelas.map(j => {
    const sub = games.slice(-j.n);
    if (sub.length < win + 3) return { nome: j.nome, dir: "—", slope: 0, pct: null };
    const serie = [];
    for (let i = win; i <= sub.length; i++) serie.push(pct(sub.slice(i - win, i).filter(g => pays(g, mkt)).length, win));
    const s = slopeOf(serie.slice(-Math.min(10, serie.length)));
    return { nome: j.nome, dir: s > 0.3 ? "Subindo" : s < -0.3 ? "Descendo" : "Lateral", slope: +s.toFixed(2), pct: serie[serie.length - 1] };
  });
  // confluencia: todas as janelas com dados apontam pro mesmo lado?
  const dirs = out.filter(o => o.dir !== "—").map(o => o.dir);
  const todasSubindo = dirs.length && dirs.every(d => d === "Subindo");
  const todasDescendo = dirs.length && dirs.every(d => d === "Descendo");
  const forte = todasSubindo ? "Subindo (confluência forte)" : todasDescendo ? "Descendo (confluência forte)" : "Misto";
  return { janelas: out, confluencia: forte };
}

function teamNames(nome) {
  if (!nome) return [];
  return nome.toLowerCase().split(/\s+x\s+/).map(s => s.trim()).filter(Boolean);
}

function teamPayPct(games, nome, mkt) {
  const names = teamNames(nome);
  if (!names.length) return { g: 0, j: 0, p: null };
  const rows = games.filter(g => {
    const t = (g.nome || "").toLowerCase();
    return names.some(n => n && t.includes(n));
  });
  const g = rows.filter(x => pays(x, mkt)).length;
  return { g, j: rows.length, p: rows.length ? Math.round(g / rows.length * 1000) / 10 : null };
}

function oddPayPct(games, odd, mkt) {
  if (!odd) return { g: 0, j: 0, p: null };
  const k = oddKey(mkt);
  const rows = games.filter(g => {
    const o = g.odds[k];
    return o && Math.abs(o - odd) <= 0.05;
  });
  const g = rows.filter(x => pays(x, mkt)).length;
  return { g, j: rows.length, p: rows.length ? Math.round(g / rows.length * 1000) / 10 : null };
}

function statForRows(games, mkt, n) {
  const sub = games.slice(-n);
  const g = sub.filter(x => pays(x, mkt)).length;
  return { g, j: sub.length, p: sub.length ? Math.round(g / sub.length * 1000) / 10 : null };
}

function radarDecision(s15, s30, s120) {
  if (!s30.j || s30.j < 12) return { label: "JUNTANDO BASE", cls: "warn" };
  const p15 = Number.isFinite(s15.p) ? s15.p : s30.p;
  const p30 = s30.p, p120 = Number.isFinite(s120.p) ? s120.p : p30;
  const delta = p15 - p30;
  if (p15 >= 58 && p30 >= 52 && delta >= -6) return { label: "LIGA QUENTE", cls: "ok" };
  if (p15 >= 50 && delta >= 8 && p15 >= p120) return { label: "VIRANDO P/ ALTA", cls: "ok" };
  if (p15 <= 35 && p30 <= 42) return { label: "LIGA FRIA", cls: "bad" };
  if (delta <= -10) return { label: "CAINDO", cls: "bad" };
  if (p30 <= 42 && p15 >= p30 + 6) return { label: "FUNDO REAGINDO", cls: "warn" };
  return { label: "NEUTRA", cls: "warn" };
}

function fullEvalUpcoming(upcoming, games, mkt) {
  const baseGeral = pct(games.filter(g => pays(g, mkt)).length, games.length);
  const cycle = cycleStats(games, mkt);
  return upcoming.map(u => {
    const odd = u.odds[oddKey(mkt)];
    const oddBase = oddPayPct(games, odd, mkt);
    const teamBase = teamPayPct(games, u.nome, mkt);
    const dist = odd ? scoreDistribution(games, odd, mkt) : null;
    let prob = baseGeral;
    if (oddBase.j >= 5) prob = (oddBase.p * 2 + baseGeral) / 3;
    prob = Math.round(prob * 10) / 10;
    const justa = prob > 0 ? +(100 / prob).toFixed(2) : null;
    const ev = odd ? Math.round((prob / 100 * odd - 1) * 1000) / 10 : null;
    const edge = odd && justa ? Math.round((odd - justa) / odd * 1000) / 10 : null;
    let status = "NEUTRO";
    if (ev != null) {
      if (ev > 8) status = "ENTRADA BOA";
      else if (ev > 0) status = "LEVE VANTAGEM";
      else if (ev > -10) status = "MARGINAL";
      else status = "EVITAR (caro)";
    }
    return {
      nome: u.nome, odd: odd || null,
      prob, justa, ev, edge, status,
      oddBase: oddBase.j ? `${oddBase.g}/${oddBase.j} ${oddBase.p}%` : "sem base",
      teamBase: teamBase.j ? `${teamBase.g}/${teamBase.j} ${teamBase.p}%` : "sem base",
      placarCorreto: dist ? dist.top.join(" | ") : "—",
      mercadoBase: dist ? `${dist.marketP}% (${dist.j} jogos)` : "—",
      ciclo: cycle ? `${cycle.streak} ${cycle.cur} | fase ${cycle.fase} | pressão ${cycle.pressao}` : "—",
      vale: ev != null && ev > 0
    };
  });
}

function oddKey(mkt) { return mkt === "ambas" ? "ambs" : mkt; }

function cycleStats(games, mkt) {
  // ultimos 80 resultados como GREEN(paga)/RED(nao paga), do mais novo
  const hist = games.slice(-80).reverse().map(g => pays(g, mkt));
  if (!hist.length) return null;
  const cur = hist[0] ? "GREEN" : "RED";
  let streak = 0;
  for (const h of hist) { if ((h ? "GREEN" : "RED") === cur) streak++; else break; }
  let lastGreen = null;
  for (let i = 0; i < hist.length; i++) { if (hist[i]) { lastGreen = i; break; } }
  const blocks = { GREEN: [], RED: [] };
  let last = hist[0] ? "GREEN" : "RED", n = 0;
  hist.forEach(x => { const s = x ? "GREEN" : "RED"; if (s === last) n++; else { blocks[last].push(n); last = s; n = 1; } });
  blocks[last].push(n);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const avgRed = avg(blocks.RED), avgGreen = avg(blocks.GREEN);
  const fase = cur === "RED" && avgRed && streak >= avgRed ? "ponto de virada" : cur === "RED" ? "inicio/meio" : "bloco green";
  const pressao = cur === "RED" && avgRed ? Math.min(100, streak / avgRed * 50) : 0;
  return { cur, streak, lastGreen, avgRed: avgRed ? +avgRed.toFixed(1) : null, avgGreen: avgGreen ? +avgGreen.toFixed(1) : null, fase, pressao: Math.round(pressao) };
}

function scoreDistribution(games, odd, mkt) {
  // jogos com odd parecida; top placares e % que o mercado pagou
  const band = games.filter(g => { const o = g.odds[oddKey(mkt)]; return o && Math.abs(o - odd) <= 0.4; });
  if (!band.length) return null;
  const counts = {};
  band.forEach(g => { const k = g.a + "-" + g.b; counts[k] = (counts[k] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k} ${Math.round(v / band.length * 100)}%`);
  const green = band.filter(g => pays(g, mkt)).length;
  return { j: band.length, top, marketP: Math.round(green / band.length * 1000) / 10 };
}

function buildAlerts(games, serie, sinal, mkt, base) {
  const alertas = [];
  if (!serie.length) return alertas;
  const cur = serie[serie.length - 1];
  const min = Math.min(...serie), max = Math.max(...serie);

  // 1) ALERTA DE MINIMA: mercado no fundo historico (oportunidade de formacao)
  if (cur <= min + 2 && sinal.zonaPct <= 20) {
    alertas.push({ tipo: "MINIMA", cls: "warn", txt: `Mercado na MÍNIMA (${cur}%) — fundo. Espere VIRAR pra cima antes de entrar.` });
  }

  // 2) ALERTA DE TENDENCIA (so quando SUBINDO de verdade: MACD positivo e abrindo, fora do topo)
  if (sinal.macd > 0.2 && sinal.direcao === "Subindo" && sinal.zonaPct < 70) {
    alertas.push({ tipo: "TENDENCIA ALTA", cls: "ok", txt: `${mktNome(mkt)} SUBINDO (MACD +${sinal.macd}, zona ${sinal.zonaPct}%) — tendência a favor.` });
  }
  // alerta de topo (protecao contra o RED)
  if (sinal.zonaPct >= 78) {
    alertas.push({ tipo: "TOPO", cls: "bad", txt: `${mktNome(mkt)} no TOPO (${sinal.zonaPct}%) — NÃO entrar, risco de RED. Mercado já pagou.` });
  }

  // 3) ALERTA DE ANCORA: nos ultimos ~6 jogos, algum padrao de odd/time que paga forte
  const recent = games.slice(-30);
  const byOdd = {};
  for (const g of recent) {
    const o = g.odds[oddKey(mkt)]; if (!o) continue;
    const k = o.toFixed(2);
    (byOdd[k] = byOdd[k] || { tot: 0, hit: 0, odd: o });
    byOdd[k].tot++; if (pays(g, mkt)) byOdd[k].hit++;
  }
  Object.values(byOdd).forEach(r => {
    if (r.tot >= 6 && r.hit / r.tot >= 0.6) {
      alertas.push({ tipo: "ÂNCORA ODD", cls: "ok", txt: `Odd @${r.odd.toFixed(2)} pagou ${r.hit}/${r.tot} (${Math.round(r.hit / r.tot * 100)}%) nos últimos jogos — âncora forte.` });
    }
  });

  return alertas;
}

function mktNome(m) { return { o35: "Over 3.5", ge5: "5+ gols", o25: "Over 2.5", ambas: "Ambas" }[m] || m; }

function computeMarket(games, mkt, qtdJogos = 20) {
  const total = games.length;
  const hit = games.filter(g => pays(g, mkt)).length;
  const base = pct(hit, total);
  const justa = base > 0 ? +(100 / base).toFixed(2) : null;

  const wins = [120, 240, 480, 960].map(n => ({ n, v: windowPct(games, mkt, n) }));
  const w120 = wins[0].v, w480 = wins[2].v;
  const aquecendo = w120 != null && w480 != null && w120 > w480;

  // ranking por odd
  const byOdd = {};
  for (const g of games) {
    const o = g.odds[oddKey(mkt)];
    if (!o) continue;
    const k = o.toFixed(2);
    (byOdd[k] = byOdd[k] || { odd: o, tot: 0, hit: 0 });
    byOdd[k].tot++;
    if (pays(g, mkt)) byOdd[k].hit++;
  }
  const ranking = Object.values(byOdd)
    .filter(r => r.tot >= 5)
    .map(r => {
      const p = pct(r.hit, r.tot);
      const ev = Math.round((p / 100 * r.odd - 1) * 1000) / 10;
      return { odd: r.odd, hit: r.hit, tot: r.tot, p, justa: p > 0 ? +(100 / p).toFixed(2) : null, ev };
    })
    .sort((a, b) => b.ev - a.ev);

  // assinaturas
  const sigMap = {};
  for (let i = 5; i < games.length; i++) {
    const sig = games.slice(i - 5, i).map(g => (pays(g, mkt) ? "1" : "0")).join("");
    (sigMap[sig] = sigMap[sig] || { n: 0, paid: 0 });
    sigMap[sig].n++;
    if (pays(games[i], mkt)) sigMap[sig].paid++;
  }
  const atualSig = games.slice(-5).map(g => (pays(g, mkt) ? "1" : "0")).join("");
  const atualStat = sigMap[atualSig] || { n: 0, paid: 0 };
  const signatures = Object.entries(sigMap)
    .filter(([_, d]) => d.n >= 8)
    .map(([sig, d]) => ({ sig, n: d.n, paid: d.paid, p: pct(d.paid, d.n) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 10);

  const serie = chartSeries(games, mkt, qtdJogos);
  const sinal = zoneSignal(serie);
  const { hist: macdHist } = macdData(serie);
  const conf = confluencia(games, mkt);
  const s15 = statForRows(games, mkt, 15), s30 = statForRows(games, mkt, 30), s120 = statForRows(games, mkt, 120);
  const ligaStatus = radarDecision(s15, s30, s120);
  const alertas = buildAlerts(games, serie, sinal, mkt, base);

  return {
    total, base, justa,
    termometro: wins,
    aquecendo,
    qtdJogos,
    serie,
    macdHist: macdHist.slice(-40),
    sinal,
    alertas,
    confluencia: conf,
    ligaStatus,
    stats: { s15: s15.p, s30: s30.p, s120: s120.p },
    ranking: ranking.slice(0, 14),
    signatures,
    atual: { sig: atualSig, n: atualStat.n, paid: atualStat.paid, p: pct(atualStat.paid, atualStat.n) }
  };
}

async function refreshLiga(liga) {
  try {
    const r = await fetch(BASE + liga + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const { games, upcoming } = decodeRows(j);
    if (!games.length) throw new Error("zero jogos");
    store[liga] = {
      games,
      upcomingRaw: upcoming,
      lastUpdated: j.lastUpdated || (j.table && j.table.lastUpdated) || null,
      fetchedAt: new Date().toISOString(),
      computed: {
        o35: computeMarket(games, "o35"),
        ge5: computeMarket(games, "ge5"),
        o25: computeMarket(games, "o25"),
        ambas: computeMarket(games, "ambas")
      },
      upcoming: {
        o35: fullEvalUpcoming(upcoming, games, "o35"),
        ge5: fullEvalUpcoming(upcoming, games, "ge5"),
        o25: fullEvalUpcoming(upcoming, games, "o25"),
        ambas: fullEvalUpcoming(upcoming, games, "ambas")
      },
      ultimos: games.slice(-10).map(g => ({ nome: g.nome, placar: g.a + "-" + g.b, total: g.total }))
    };
  } catch (e) {
    if (!store[liga]) store[liga] = {};
    store[liga].erro = e.message;
    store[liga].fetchedAt = new Date().toISOString();
  }
}

async function refreshAll() {
  await Promise.all(LIGAS.map(refreshLiga));
}

// loop de atualizacao
refreshAll();
setInterval(refreshAll, REFRESH_MS);

// API
app.get("/api/liga/:liga", (req, res) => {
  const liga = req.params.liga;
  if (!LIGAS.includes(liga)) return res.status(404).json({ erro: "liga invalida" });
  const d = store[liga];
  if (!d || d.erro) return res.json({ erro: (d && d.erro) || "carregando...", liga });
  const mkt = req.query.mkt || "o35";
  const qtd = Math.min(240, Math.max(20, parseInt(req.query.qtd) || 20));

  // analise base (pre-calculada com qtd=20)
  let analise = d.computed[mkt] || d.computed.o35;
  // se o usuario pediu outra Qtd. Jogos, recalcula a serie/sinal/macd/alertas pra essa janela
  if (qtd !== 20 && d.games) {
    const serie = chartSeries(d.games, mkt, qtd);
    const sinal = zoneSignal(serie);
    const { hist } = macdData(serie);
    const alertas = buildAlerts(d.games, serie, sinal, mkt, analise.base);
    analise = { ...analise, serie, macdHist: hist.slice(-40), sinal, alertas, qtdJogos: qtd };
  }

  res.json({
    liga,
    mercado: mkt,
    qtd,
    lastUpdated: d.lastUpdated,
    fetchedAt: d.fetchedAt,
    analise,
    proximos: (d.upcoming && d.upcoming[mkt]) || [],
    ultimos: d.ultimos
  });
});

app.get("/api/status", (req, res) => {
  res.json(LIGAS.map(l => ({
    liga: l,
    jogos: store[l]?.games?.length || 0,
    lastUpdated: store[l]?.lastUpdated || null,
    fetchedAt: store[l]?.fetchedAt || null,
    erro: store[l]?.erro || null
  })));
});

app.use(express.static(join(__dirname, "public")));

app.listen(PORT, () => console.log("Caramelo Live rodando na porta " + PORT));
