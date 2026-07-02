import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let brainAdapter = null;
try {
  brainAdapter = require("./brain/adapter.cjs");
  console.log("Cerebro da extensao carregado (robot.js real)");
} catch (e) {
  console.error("Falha ao carregar cerebro:", e.message);
}
const BRAIN_MKT = { o35: "over35", o25: "over25", ge5: "over5", ambas: "ambas_sim" };

function brainEval(games, upcoming, liga, mkt) {
  if (!brainAdapter) return null;
  const bk = BRAIN_MKT[mkt];
  if (!bk) return null;
  try {
    const res = brainAdapter.analyzeWithBrain(games, upcoming, liga, bk);
    return res.map(r => {
      if (r.error || !r.analysis) return { nome: r.game?.name || "?", erro: r.error || "sem analise" };
      const a = r.analysis;
      // acha o jogo original pra pegar horario/casa/fora
      const orig = upcoming.find(u => u.nome === r.game.name) || {};
      return {
        nome: r.game.name,
        horario: orig.horario || "",
        casa: orig.casa || "",
        fora: orig.fora || "",
        odd: r.game.odd || null,
        score: a.score ?? null,
        status: a.status || "—",
        motivo: a.motivo || "—",
        prob: Number.isFinite(a.prob) ? +a.prob.toFixed(1) : null,
        justa: Number.isFinite(a.fairOdd) ? +a.fairOdd.toFixed(2) : null,
        ev: Number.isFinite(a.ev) ? +a.ev.toFixed(1) : null,
        edge: Number.isFinite(a.probEdge) ? +a.probEdge.toFixed(1) : null,
        evGale: Number.isFinite(a.evGale) ? +a.evGale.toFixed(1) : null,
        teamBase: a.team && Number.isFinite(a.team.p) ? `${a.team.g}/${a.team.j} ${a.team.p.toFixed(0)}%` : "sem base",
        oddBase: a.odd && Number.isFinite(a.odd.p) ? `${a.odd.g}/${a.odd.j} ${a.odd.p.toFixed(0)}%` : "sem base",
        ciclo: a.cycle ? `${a.cycle.streak} ${a.cycle.cur} | ${a.cycle.fase} | pressão ${Math.round(a.cycle.pressao || 0)}` : "—",
        coldOdd: !!a.coldOdd,
        ready: !!(a.combo && a.combo.ready),
        pontos: a.combo ? a.combo.points : null,
        // detalhes completos (igual extensao)
        oddFixa: r.detalhes?.oddFixa || null,
        horarioStat: r.detalhes?.horario || null,
        ligaStat: r.detalhes?.liga || null,
        teamDetail: r.detalhes?.teamDetail || null,
        placarCorreto: r.detalhes?.placar || null,
        oneXTwo: r.detalhes?.oneXTwo || null,
        cicloTxt: r.detalhes?.cicloTxt || null,
        teamGeral: r.detalhes?.teamGeral || null
      };
    });
  } catch (e) {
    return [{ erro: "brain: " + e.message }];
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
// libera CORS pra extensao no caramelo conseguir mandar a curva
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "25mb" }));

const LIGAS = ["euro", "copa", "super", "premier"];
const BASE = "https://www.caramelotips.com.br/final/";
const REFRESH_MS = 15000;

// cache em memoria: liga -> { games, computed, lastUpdated, fetchedAt }
const store = {};
const liveCurves = {}; // curva REAL capturada da extensao: liga|mkt -> {curva,mm1,mm2,topo,fundo,ts}

function parseOdds(s) {
  const odds = {};
  s.replace(/([a-z0-9]+)@([\d.]+)/gi, (_, k, v) => { odds[k] = parseFloat(v); });
  // os jogos FUTUROS do caramelo as vezes so trazem as odds de UNDER (u15/u25/u35)
  // e ambn. Como over e under sao mercados complementares (ou da um, ou da outro),
  // derivamos a odd de OVER a partir da de UNDER quando a de over nao veio.
  // prob_under = 1/odd_under (sem margem); prob_over = 1 - prob_under; odd_over = 1/prob_over.
  const deriveOver = (uKey, oKey) => {
    if (odds[oKey] == null && odds[uKey] != null && odds[uKey] > 1) {
      const pUnder = 1 / odds[uKey];
      const pOver = 1 - pUnder;
      if (pOver > 0.01) odds[oKey] = +(1 / pOver).toFixed(2);
    }
  };
  deriveOver("u15", "o15");
  deriveOver("u25", "o25");
  deriveOver("u35", "o35");
  // ambas sim a partir de ambas nao
  if (odds.ambs == null && odds.ambn != null && odds.ambn > 1) {
    const pNao = 1 / odds.ambn, pSim = 1 - pNao;
    if (pSim > 0.01) odds.ambs = +(1 / pSim).toFixed(2);
  }
  // 5+ (ge5): se nao veio, deriva de o35 (aproximacao: 5+ e mais raro que 3.5+)
  // melhor deixar sem do que inventar; ge5 fica ausente se nao houver base
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
  // horario: procura H.MM ou H:MM nas linhas (igual timeFromGameText do robo)
  let horario = "";
  for (const line of s.split(/\n/).map(x => x.trim()).slice(0, 5)) {
    const m = line.match(/^(?:hor[aá]rio|hora)?\s*[:\-]?\s*(\d{1,2})[.:](\d{2})$/i);
    if (m) { horario = `${m[1]}:${m[2]}`; break; }
  }
  // times separados (casa x fora)
  const partes = nome.split(/\s+x\s+/i);
  const casa = partes[0] ? partes[0].trim() : "";
  const fora = partes[1] ? partes[1].trim() : "";
  return { nome, horario, casa, fora, odds: parseOdds(s) };
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

// ===== LINHAS DE TENDENCIA (LTA / LTB) + GATILHO DE ROMPIMENTO =====
// Metodo do usuario (price action no virtual): LTA liga 2 fundos ascendentes
// (suporte, fica ABAIXO da curva); LTB liga 2 topos descendentes (resistencia,
// fica ACIMA). O sinal de ouro e o ROMPIMENTO (reversao/fim de ciclo).
function pivots(serie) {
  // acha topos e fundos locais (um ponto maior/menor que os vizinhos)
  const topos = [], fundos = [];
  for (let i = 1; i < serie.length - 1; i++) {
    if (serie[i] >= serie[i - 1] && serie[i] > serie[i + 1]) topos.push({ i, v: serie[i] });
    if (serie[i] <= serie[i - 1] && serie[i] < serie[i + 1]) fundos.push({ i, v: serie[i] });
  }
  return { topos, fundos };
}

function trendLines(serie) {
  if (!serie || serie.length < 6) return null;
  const n = serie.length;
  // foca na tendencia RECENTE (ultimos ~20 pontos = micro/macro do virtual)
  const jan = Math.min(20, n);
  const ini = n - jan;
  const sub = serie.slice(ini);
  const { topos, fundos } = pivots(sub);
  // reindexa pivots pro indice global da serie
  topos.forEach(p => p.i += ini);
  fundos.forEach(p => p.i += ini);
  const lineFrom = (p1, p2) => {
    if (!p1 || !p2 || p2.i === p1.i) return null;
    const m = (p2.v - p1.v) / (p2.i - p1.i);
    const projeta = x => p1.v + m * (x - p1.i);
    return { m, p1, p2, valorEm: projeta, atual: projeta(n - 1) };
  };

  // LTA: 2 fundos ASCENDENTES mais recentes
  let lta = null;
  for (let j = fundos.length - 1; j >= 1; j--) {
    const f2 = fundos[j], f1 = fundos[j - 1];
    if (f2.v > f1.v) { lta = lineFrom(f1, f2); break; }
  }
  // LTB: 2 topos DESCENDENTES mais recentes
  let ltb = null;
  for (let j = topos.length - 1; j >= 1; j--) {
    const t2 = topos[j], t1 = topos[j - 1];
    if (t2.v < t1.v) { ltb = lineFrom(t1, t2); break; }
  }

  // GATILHO: a curva rompeu alguma linha no ultimo ponto?
  const atual = serie[n - 1], ant = serie[n - 2];
  let rompimento = null;
  if (ltb) {
    const linhaAtual = ltb.atual, linhaAnt = ltb.valorEm(n - 2);
    // rompeu pra CIMA: antes estava abaixo da LTB, agora fechou acima
    if (ant <= linhaAnt && atual > linhaAtual) {
      rompimento = { tipo: "ROMPEU_LTB_CIMA", cor: "verde",
        msg: "ROMPEU LTB pra cima — ciclo virou, mercado vai pagar Over. Sinal de ENTRADA." };
    }
  }
  if (lta && !rompimento) {
    const linhaAtual = lta.atual, linhaAnt = lta.valorEm(n - 2);
    // rompeu pra BAIXO: antes acima da LTA, agora fechou abaixo
    if (ant >= linhaAnt && atual < linhaAtual) {
      rompimento = { tipo: "ROMPEU_LTA_BAIXO", cor: "vermelho",
        msg: "ROMPEU LTA pra baixo — mercado saturou, vai pro Under. SEGURA A MÃO / proteja." };
    }
  }

  // status da tendencia vigente (sem rompimento)
  let tendencia = "lateral";
  if (lta && atual >= lta.atual && (!ltb || atual < ltb.atual)) tendencia = "alta (sobre a LTA)";
  else if (ltb && atual <= ltb.atual) tendencia = "baixa (sob a LTB)";

  // serie projetada das linhas (pra desenhar) - so a partir do 1o pivo, clampada
  // na faixa da propria curva (nao deixa a reta disparar longe da curva)
  const sMin = Math.min(...serie), sMax = Math.max(...serie);
  const margem = Math.max(5, (sMax - sMin) * 0.3);
  const clamp = v => Math.max(sMin - margem, Math.min(sMax + margem, Math.round(v * 10) / 10));
  const ltaSerie = lta ? serie.map((_, x) => x >= lta.p1.i ? clamp(lta.valorEm(x)) : null) : null;
  const ltbSerie = ltb ? serie.map((_, x) => x >= ltb.p1.i ? clamp(ltb.valorEm(x)) : null) : null;

  return {
    lta: lta ? { inclinacao: +lta.m.toFixed(2), atual: Math.round(lta.atual), serie: ltaSerie } : null,
    ltb: ltb ? { inclinacao: +ltb.m.toFixed(2), atual: Math.round(ltb.atual), serie: ltbSerie } : null,
    rompimento, tendencia
  };
}

function chartSeries(games, mkt, qtdJogos = 20) {
  // EXATO como o caramelo: janela rolante de qtdJogos. Cada ponto = % do mercado nos
  // ultimos qtdJogos jogos. Gera todos os pontos possiveis (nao corta no final —
  // o frontend ja recebe a serie inteira e renderiza).
  const vals = [];
  for (let i = qtdJogos; i <= games.length; i++) {
    const block = games.slice(i - qtdJogos, i);
    if (mkt === "totft") {
      // Total Gols (FT): media de gols por jogo na janela, x10 (ex: 2.8 gols -> 28)
      const avg = block.reduce((s, g) => s + (g.total || 0), 0) / qtdJogos;
      vals.push(Math.round(avg * 10));
    } else {
      vals.push(Math.round(block.filter(g => pays(g, mkt)).length / qtdJogos * 100));
    }
  }
  return vals;
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

function comboScore({ graphSubindo, graphTopo, temMinima, minimaLonga, cycleStrong, cycleBuilding, probStrong, evStrong, baseForte, coldOdd }) {
  // FORMULA FIEL DA EXTENSAO (comboScoreForGame)
  const points = {
    hist: graphSubindo ? 15 : graphTopo ? -15 : 0,       // histograma/direcao
    trend: graphSubindo ? 10 : graphTopo ? -10 : 0,       // tendencia
    minimum: temMinima ? 25 : 0,                           // mínima = maior peso
    cycle: cycleStrong ? 15 : cycleBuilding ? 8 : 0,
    prob: probStrong ? 15 : 0,
    ev: evStrong ? 10 : 0,
    base: baseForte ? 10 : 0,
    longMinimum: minimaLonga ? 5 : 0
  };
  let score = Object.values(points).reduce((a, b) => a + b, 0);
  score = Math.max(0, Math.min(100, score));
  // tetos de seguranca (igual extensao)
  if (!temMinima || !graphSubindo) score = Math.min(score, 64);
  if (coldOdd || !probStrong || !evStrong) score = Math.min(score, 54);
  const ready = score >= 70 && temMinima && graphSubindo && probStrong && evStrong && baseForte && !coldOdd;
  return { score: Math.round(score), ready, points };
}

function fullEvalUpcoming(upcoming, games, mkt) {
  const baseGeral = pct(games.filter(g => pays(g, mkt)).length, games.length);
  const cycle = cycleStats(games, mkt);
  // sinal do grafico da liga (direcao/zona) - vale pra todos os jogos da liga
  const serie = chartSeries(games, mkt, 20);
  const sinal = zoneSignal(serie);
  const cur = serie.length ? serie[serie.length - 1] : 0;
  const minSerie = serie.length ? Math.min(...serie) : 0;
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

    // ingredientes do combo (os 3 pilares: grafico + base + ev/prob)
    const graphSubindo = sinal.direcao === "Subindo" && sinal.zonaPct < 70;
    const graphTopo = sinal.zonaPct >= 78;
    const temMinima = cur <= minSerie + 5 && sinal.zonaPct <= 40; // perto do fundo
    const cycleStrong = cycle && cycle.cur === "RED" && cycle.avgRed && cycle.streak >= cycle.avgRed;
    const cycleBuilding = cycle && cycle.cur === "RED" && cycle.pressao >= 35;
    const probStrong = prob >= (mkt === "ge5" ? 12 : mkt === "o35" ? 28 : 45);
    const evStrong = ev != null && ev >= 0;
    const baseForte = (teamBase.j >= 6 && teamBase.p >= 52) || (oddBase.j >= 8 && oddBase.p >= 52);
    const coldOdd = oddBase.j >= 8 && oddBase.p < 30;
    const combo = comboScore({ graphSubindo, graphTopo, temMinima, minimaLonga: false, cycleStrong, cycleBuilding, probStrong, evStrong, baseForte, coldOdd });

    // status agora reflete o COMBO (nao so EV) - protege contra RED
    let status = "PASSAR";
    if (combo.ready) status = "ENTRADA FORTE";
    else if (combo.score >= 58) status = "OBSERVAR";
    else if (graphTopo) status = "TOPO - EVITAR";
    else if (ev != null && ev > 0) status = "LEVE VANTAGEM";
    else status = "PASSAR";

    return {
      nome: u.nome, odd: odd || null,
      score: combo.score, ready: combo.ready,
      prob, justa, ev, edge, status,
      oddBase: oddBase.j ? `${oddBase.g}/${oddBase.j} ${oddBase.p}%` : "sem base",
      teamBase: teamBase.j ? `${teamBase.g}/${teamBase.j} ${teamBase.p}%` : "sem base",
      placarCorreto: dist ? dist.top.join(" | ") : "—",
      mercadoBase: dist ? `${dist.marketP}% (${dist.j} jogos)` : "—",
      ciclo: cycle ? `${cycle.streak} ${cycle.cur} | fase ${cycle.fase} | pressão ${cycle.pressao}` : "—",
      pilares: { grafico: graphSubindo ? "+" : graphTopo ? "-" : "0", base: baseForte ? "+" : "0", ev: evStrong ? "+" : "0" },
      vale: combo.ready
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
  if (mkt === "totft") return []; // Total Gols nao tem alerta de over/under
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
  // Total Gols (FT): mercado de MEDIA de gols (nao e taxa de acerto). O grafico mostra
  // a media de gols por jogo na janela; nao tem EV/odd justa (nao e aposta sim/nao).
  if (mkt === "totft") {
    const JANELA = Math.max(2, Math.min(20, games.length));
    const serie = chartSeries(games, "totft", JANELA).slice(-qtdJogos);
    const sinal = zoneSignal(serie);
    const { hist: macdHist } = macdData(serie);
    const mediaGols = games.length ? +(games.reduce((s, g) => s + (g.total || 0), 0) / games.length).toFixed(2) : 0;
    return {
      total: games.length, base: mediaGols, justa: null, mediaGols, ehTotalGols: true,
      termometro: [], aquecendo: false, qtdJogos, serie,
      macdHist: macdHist.slice(-qtdJogos), sinal, alertas: [],
      confluencia: null, ligaStatus: {}, stats: {}, ranking: [], signatures: [], atual: null
    };
  }
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

  // JANELA FIXA (forma da curva, igual caramelo); qtd so define quantos pontos exibir.
  // Antes usava qtdJogos como janela -> com poucos jogos ou qtd alto, curva quebrava.
  const JANELA = Math.max(2, Math.min(20, games.length));
  const serieFull = chartSeries(games, mkt, JANELA);
  const serie = serieFull.slice(-qtdJogos);
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
    macdHist: macdHist.slice(-qtdJogos),
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

// monta o store de uma liga a partir dos jogos (funciona com qualquer fonte:
// JSON antigo OU placares vindos da sonda ao vivo)
// ===== ANCORAS: times que pagam placares-gatilho (2-1, 3-0, 2-0 HT) =====
// Calcula, por time, a taxa historica de placares-ancora jogando em CASA e FORA.
// Esses placares costumam anteceder/acompanhar big placares (Over 3.5 / 5+).
// Tudo SEPARADO e ADITIVO — nao altera score/EV/grafico existentes.
function ehPlacarAncora(g) {
  const a = g.a, b = g.b;
  // FT 2-1 / 1-2 / 3-0 / 0-3
  if ((a === 2 && b === 1) || (a === 1 && b === 2)) return true;
  if ((a === 3 && b === 0) || (a === 0 && b === 3)) return true;
  // HT 2-0 / 0-2
  const ht = (g.ht || "").replace(/\s/g, "");
  if (ht === "2-0" || ht === "0-2") return true;
  return false;
}
function anchorStats(games) {
  const t = {};
  const get = n => (t[n] || (t[n] = { casaJogos: 0, casaAnc: 0, foraJogos: 0, foraAnc: 0 }));
  for (const g of games) {
    if (!g.casa || !g.fora) continue;
    const anc = ehPlacarAncora(g);
    const c = get(g.casa); c.casaJogos++; if (anc) c.casaAnc++;
    const f = get(g.fora); f.foraJogos++; if (anc) f.foraAnc++;
  }
  return t;
}
// BIG PLACAR: pra cada jogo do time (casa/fora), olha a janela de 3 jogos na ordem
// da liga — o ANTERIOR, o DELE e o SEGUINTE. Se em qualquer um saiu Over 3.5 (>=4)
// ou 5+ (>=5), conta. Mede "esse time costuma aparecer perto de big placar".
function bigPlacarStats(games) {
  const t = {};
  const get = n => (t[n] || (t[n] = { casaJogos: 0, casaO35: 0, casa5: 0, foraJogos: 0, foraO35: 0, fora5: 0 }));
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!g.casa || !g.fora) continue;
    const win = [games[i - 1], g, games[i + 1]];
    const o35 = win.some(x => x && x.total >= 4);
    const p5 = win.some(x => x && x.total >= 5);
    const c = get(g.casa); c.casaJogos++; if (o35) c.casaO35++; if (p5) c.casa5++;
    const f = get(g.fora); f.foraJogos++; if (o35) f.foraO35++; if (p5) f.fora5++;
  }
  return t;
}
// RANK DE TIMES: ranqueia os times que mais "pagam" um mercado dentro de uma janela
// de tempo (em numero de jogos recentes). Soma aparicoes em casa+fora.
function teamRanking(games, mkt, nGames, minJogos = 3, topN = 5) {
  const recent = games.slice(-nGames);
  const t = {};
  for (const g of recent) {
    if (!g.casa || !g.fora) continue;
    const paid = pays(g, mkt);
    for (const time of [g.casa, g.fora]) {
      (t[time] = t[time] || { jogos: 0, hit: 0 });
      t[time].jogos++;
      if (paid) t[time].hit++;
    }
  }
  return Object.entries(t)
    .filter(([_, d]) => d.jogos >= minJogos)
    .map(([time, d]) => ({ time, jogos: d.jogos, hit: d.hit, pct: Math.round(d.hit / d.jogos * 100) }))
    .sort((a, b) => b.pct - a.pct || b.jogos - a.jogos)
    .slice(0, topN);
}
// janelas de tempo (virtual ~20 jogos/hora): 3h/6h/12h/24h
const JANELAS_HORA = { h3: 60, h6: 120, h12: 240, h24: 480 };
function rankTimesPorJanela(games, mkt) {
  const out = {};
  for (const [k, n] of Object.entries(JANELAS_HORA)) out[k] = teamRanking(games, mkt, n);
  return out;
}

const ANCORA_CORTE = 0.30;   // >=30% = alta taxa de placar-gatilho (2-1/3-0/2-0HT)
const ANCORA_MIN_JOGOS = 8;  // amostra minima pra a taxa valer
const BIG_CORTE = 0.65;      // >=65% de Over 3.5 na janela de 3 = "paga big placar" (seletivo)
function avaliaAncora(u, stats, big) {
  const cs = stats[u.casa], fs = stats[u.fora];
  const cb = big[u.casa], fb = big[u.fora];
  const casaRate = cs && cs.casaJogos >= ANCORA_MIN_JOGOS ? cs.casaAnc / cs.casaJogos : null;
  const foraRate = fs && fs.foraJogos >= ANCORA_MIN_JOGOS ? fs.foraAnc / fs.foraJogos : null;
  // taxas de big placar (janela de 3) por lado
  const casaO35 = cb && cb.casaJogos >= ANCORA_MIN_JOGOS ? cb.casaO35 / cb.casaJogos : null;
  const casa5 = cb && cb.casaJogos >= ANCORA_MIN_JOGOS ? cb.casa5 / cb.casaJogos : null;
  const foraO35 = fb && fb.foraJogos >= ANCORA_MIN_JOGOS ? fb.foraO35 / fb.foraJogos : null;
  const fora5 = fb && fb.fora5 >= 0 && fb.foraJogos >= ANCORA_MIN_JOGOS ? fb.fora5 / fb.foraJogos : null;
  // dispara se: alta taxa de placar-gatilho OU alta taxa de big placar (Over 3.5 janela)
  const casaHit = (casaRate != null && casaRate >= ANCORA_CORTE) || (casaO35 != null && casaO35 >= BIG_CORTE);
  const foraHit = (foraRate != null && foraRate >= ANCORA_CORTE) || (foraO35 != null && foraO35 >= BIG_CORTE);
  const nivel = (casaHit && foraHit) ? "forte" : (casaHit || foraHit) ? "normal" : null;
  if (!nivel) return null;
  const pc = x => x != null ? Math.round(x * 100) : null;
  return {
    nivel,
    casa: { time: u.casa, taxa: pc(casaRate), jogos: cs ? cs.casaJogos : 0, hit: casaHit, o35: pc(casaO35), p5: pc(casa5) },
    fora: { time: u.fora, taxa: pc(foraRate), jogos: fs ? fs.foraJogos : 0, hit: foraHit, o35: pc(foraO35), p5: pc(fora5) }
  };
}

function buildStore(liga, games, upcoming, lastUpdated) {
  const stats = anchorStats(games);
  const big = bigPlacarStats(games);
  // mapa de ancora por nome de jogo futuro (so os que disparam)
  const ancoras = {};
  for (const u of upcoming) { const a = avaliaAncora(u, stats, big); if (a) ancoras[u.nome] = a; }
  return {
    games,
    upcomingRaw: upcoming,
    lastUpdated: lastUpdated || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    computed: {
      o35: computeMarket(games, "o35"),
      ge5: computeMarket(games, "ge5"),
      o25: computeMarket(games, "o25"),
      ambas: computeMarket(games, "ambas"),
      totft: computeMarket(games, "totft")
    },
    upcoming: {
      o35: brainEval(games, upcoming, liga, "o35") || fullEvalUpcoming(upcoming, games, "o35"),
      ge5: brainEval(games, upcoming, liga, "ge5") || fullEvalUpcoming(upcoming, games, "ge5"),
      o25: brainEval(games, upcoming, liga, "o25") || fullEvalUpcoming(upcoming, games, "o25"),
      ambas: brainEval(games, upcoming, liga, "ambas") || fullEvalUpcoming(upcoming, games, "ambas"),
      // Total Gols (FT): nao e aposta sim/nao, entao mostra so o jogo (sem EV/score)
      totft: upcoming.map(u => ({ nome: u.nome, horario: u.horario, casa: u.casa, fora: u.fora, semEV: true }))
    },
    ultimos: games.slice(-10).map(g => ({ nome: g.nome, placar: g.a + "-" + g.b, total: g.total })),
    ancoras
  };
}

async function refreshLiga(liga) {
  // O JSON estatico do caramelo foi APAGADO (404). A fonte agora e o WebSocket
  // (ver wsConnect). Esta funcao so age como ultimo recurso: se NAO ha dados da
  // WS nem da sonda, tenta o JSON (provavelmente 404, mas nao custa).
  const atual = store[liga];
  if (atual && (atual.fonte === "ws" || atual.fonte === "sonda")) {
    const ts = atual.wsTs || atual.sondaTs || 0;
    if (Date.now() - ts < 180000) return; // dados vivos recentes: nao mexe
  }
  try {
    const r = await fetch(BASE + liga + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const { games, upcoming } = decodeRows(j);
    if (!games.length) throw new Error("zero jogos");
    const lu = j.lastUpdated || (j.table && j.table.lastUpdated) || null;
    if (atual && (atual.fonte === "ws" || atual.fonte === "sonda")) return;
    const s = buildStore(liga, games, upcoming, lu);
    s.fonte = "json";
    store[liga] = s;
  } catch (e) {
    if (!store[liga]) store[liga] = { erro: e.message, fetchedAt: new Date().toISOString() };
  }
}

// ===== FONTE DIRETA: cliente WebSocket do caramelo =====
// O caramelo migrou pra WebSocket (wss://.../ws-dados). Apagou os JSON estaticos.
// A pagina pede dados com {"type":"liga:get","liga":X} e recebe um "snapshot"
// com data.cells[] (cada celula tem times, placar.ft, odds, linha_visual, coluna_visual,
// status). Aqui o SERVIDOR faz o mesmo: conecta, pede cada liga, recebe e processa.
// Robusto: nao depende de aba aberta nem da tela travando.
import { WebSocket as WSClient } from "ws";

const WS_URL = "wss://www.caramelotips.com.br/ws-dados";

// converte o snapshot do caramelo nos games/upcoming que o servidor ja usa
function decodeSnapshot(data) {
  const cells = (data && data.cells) || [];
  const passados = [], futuros = [];
  for (const c of cells) {
    // O snapshot do WS tem dois formatos possiveis:
    // Formato A (wrapper): { cell: { times, placar, odds, ... }, linha_visual, coluna_visual, status }
    // Formato B (direto):  { times, placar, odds, linha_visual, coluna_visual, status }
    // Suportamos os dois: preferimos .cell se existir, senao usa o proprio c.
    const cell = (c.cell && typeof c.cell === "object") ? c.cell : c;
    const ft = cell.placar && cell.placar.ft;
    const times = cell.times || {};
    const nome = (times.casa || "?") + " x " + (times.fora || "?");
    // ordem cronologica: linha_visual DESC (linha 1 = mais recente/topo), coluna ASC
    const lv = c.linha_visual ?? cell.linha_visual ?? 0;
    const cv = c.coluna_visual ?? cell.coluna_visual ?? 0;
    const ordem = (-lv) * 1000 + cv;
    const status = c.status ?? cell.status;
    if (status === "futuro" || cell.futuro === true) {
      const o = cell.odds || {};
      futuros.push({
        ordem,
        nome,
        horario: (c.hora_base || cell.hora_base || "") + ":" + (c.minuto || cell.minuto || ""),
        casa: times.casa || "", fora: times.fora || "",
        odds: { o25: o.o25, o35: o.o35, ge5: o.ge5, ambs: o.ambs }
      });
    } else if (ft && /^\d+-\d+$/.test(String(ft).trim())) {
      const m = String(ft).trim().match(/(\d+)-(\d+)/);
      const o = cell.odds || {};
      const ht = (cell.placar && cell.placar.ht) ? String(cell.placar.ht).trim() : "";
      passados.push({
        ordem, nome, a: +m[1], b: +m[2], total: +m[1] + +m[2],
        casa: times.casa || "", fora: times.fora || "", ht,
        odds: { o25: o.o25, o35: o.o35, ge5: o.ge5, ambs: o.ambs }
      });
    }
  }
  // ordena cronologicamente (mais antigo -> mais novo)
  passados.sort((x, y) => x.ordem - y.ordem);
  futuros.sort((x, y) => x.ordem - y.ordem);
  // os 2 jogos mais recentes ainda nao entram na curva do caramelo (validado: drop2)
  // e limita aos ~1200 jogos recentes: a curva (janela 20) e as stats usam os recentes,
  // e o historico cru pode passar de 4000 jogos (deixa o servidor lento sem necessidade).
  const games = passados.slice(0, -2).slice(-1200).map(g => ({
    nome: g.nome, a: g.a, b: g.b, total: g.total,
    casa: g.casa, fora: g.fora, ht: g.ht, odds: g.odds || {}
  }));
  const upcoming = futuros.slice(0, 6).map(u => ({
    nome: u.nome, horario: u.horario, casa: u.casa, fora: u.fora, odds: u.odds
  }));
  console.log(`decodeSnapshot: ${passados.length} passados → ${games.length} games, ${futuros.length} futuros → ${upcoming.length} upcoming`);
  return { games, upcoming };
}

function aplicaSnapshot(liga, data) {
  try {
    const { games, upcoming } = decodeSnapshot(data);
    if (!games.length) return;
    const s = buildStore(liga, games, upcoming, new Date(data.atualizadoEm || Date.now()).toISOString());
    s.fonte = "ws";
    s.wsTs = Date.now();
    store[liga] = s;
    avisaClientes(liga);
  } catch (e) {
    console.error("erro aplicaSnapshot " + liga + ":", e.message);
  }
}

// NOTA: o WS do caramelo exige LOGIN (fecha com code 4001 sem sessao). Por isso o
// servidor sozinho nao consegue conectar. A sonda (no navegador logado do usuario)
// captura o snapshot do WS e manda pra /api/snapshot. Mantemos decodeSnapshot e o
// cliente WS abaixo desligado (so liga se um dia houver auth no servidor).
const WS_SERVER_ENABLED = false;

let ws = null, wsReady = false, wsReconnectTimer = null;
function wsConnect() {
  if (!WS_SERVER_ENABLED) return;
  try {
    ws = new WSClient(WS_URL, { headers: { Origin: "https://www.caramelotips.com.br" } });
    ws.on("open", () => {
      wsReady = true;
      console.log("WS caramelo conectado");
      LIGAS.forEach(l => pedeLiga(l));
    });
    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.type === "snapshot" && msg.liga && msg.data) {
          aplicaSnapshot(msg.liga, msg.data);
        } else if (msg.type === "liga:refresh" && msg.liga) {
          pedeLiga(msg.liga); // dados mudaram -> pede snapshot novo
        }
      } catch (e) { /* ignora msgs nao-JSON */ }
    });
    ws.on("close", () => { wsReady = false; agendaReconexao(); });
    ws.on("error", (e) => { wsReady = false; console.error("WS erro:", e.message); });
  } catch (e) {
    console.error("WS connect falhou:", e.message);
    agendaReconexao();
  }
}
function pedeLiga(liga) {
  if (ws && wsReady) { try { ws.send(JSON.stringify({ type: "liga:get", liga })); } catch (e) { } }
}
function agendaReconexao() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => { wsReconnectTimer = null; wsConnect(); }, 4000);
}
wsConnect();
// re-pede todas as ligas periodicamente (garante frescor mesmo sem refresh ping)
setInterval(() => { if (WS_SERVER_ENABLED && wsReady) LIGAS.forEach(pedeLiga); }, 20000);

async function refreshAll() {
  await Promise.all(LIGAS.map(refreshLiga));
}

// loop de atualizacao
refreshAll();
setInterval(refreshAll, REFRESH_MS);

// API
// recebe o SNAPSHOT CRU do WebSocket do caramelo, capturado pela sonda no
// navegador logado do usuario (o WS exige login, code 4001 sem sessao).
// dados limpos: placares + futuros + odds completas.
app.post("/api/snapshot", (req, res) => {
  try {
    const { liga, data, mkt, curva, mm1, mm2, topo, fundo } = req.body || {};
    if (!liga || !data || !Array.isArray(data.cells)) {
      return res.status(400).json({ ok: false, erro: "snapshot invalido" });
    }
    const { games, upcoming } = decodeSnapshot(data);
    if (!games.length) return res.status(400).json({ ok: false, erro: "zero jogos no snapshot" });
    const s = buildStore(liga, games, upcoming, new Date(data.atualizadoEm || Date.now()).toISOString());
    s.fonte = "ws";
    s.wsTs = Date.now();
    if (Array.isArray(curva)) liveCurves[liga + "|" + (mkt || "o35")] = { curva, mm1, mm2, topo, fundo, ts: Date.now() };
    store[liga] = s;
    avisaClientes(liga); // SSE: avisa as telas abertas que essa liga atualizou (nao altera analises)
    res.json({ ok: true, liga, placares: games.length, futuros: upcoming.length, mercados: Object.keys(s.computed) });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// recebe os DADOS AO VIVO da sonda (placares da grade) - fonte nova, JSON morreu
let lastDebug = {};
app.post("/api/dados", (req, res) => {
  try {
    const { liga, mkt, placares, upcoming, curva, mm1, mm2, topo, fundo, debug } = req.body || {};
    if (debug) lastDebug[liga || "?"] = { debug, ts: Date.now() };
    if (!liga || !Array.isArray(placares) || !placares.length) {
      return res.status(400).json({ ok: false, erro: "sem placares" });
    }
    const games = placares.map((p, i) => ({
      nome: "Jogo " + (i + 1), a: p.a, b: p.b, total: p.total, odds: {}
    }));
    // jogos futuros vindos da sonda (teams + odds lidos da grade)
    const upc = Array.isArray(upcoming) ? upcoming.filter(u => u && u.nome) : [];
    const s = buildStore(liga, games, upc, new Date().toISOString());
    s.fonte = "sonda";
    s.sondaTs = Date.now();
    if (Array.isArray(curva)) {
      liveCurves[liga + "|" + (mkt || "o35")] = { curva, mm1, mm2, topo, fundo, ts: Date.now() };
    }
    store[liga] = s;
    avisaClientes(liga);
    res.json({ ok: true, placares: placares.length, upcoming: upc.length, mercados: Object.keys(s.computed) });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// le o que a sonda achou na tela (pra debug remoto, ja que a aba trava pra automacao)
app.get("/api/debug/:liga", (req, res) => {
  res.json(lastDebug[req.params.liga] || { vazio: true });
});

app.post("/api/curve", (req, res) => {
  try {
    const { liga, mkt, curva, mm1, mm2, topo, fundo, labels, markerColors } = req.body || {};
    if (!liga || !mkt || !Array.isArray(curva)) return res.status(400).json({ ok: false, erro: "dados invalidos" });
    liveCurves[liga + "|" + mkt] = { curva, mm1, mm2, topo, fundo, labels, markerColors, ts: Date.now() };
    res.json({ ok: true, pontos: curva.length });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

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
    const JANELA = Math.max(2, Math.min(20, d.games.length)); // janela fixa = forma da curva
    const serieFull = chartSeries(d.games, mkt, JANELA);
    const serie = serieFull.slice(-qtd); // exibe os ultimos qtd pontos (zoom), sem quebrar
    const sinal = zoneSignal(serie);
    const { hist } = macdData(serie);
    const alertas = buildAlerts(d.games, serie, sinal, mkt, analise.base);
    analise = { ...analise, serie, macdHist: hist.slice(-qtd), sinal, alertas, qtdJogos: qtd };
  }

  // se a extensao mandou a curva REAL do caramelo, usa ela (identica)
  const curveKey = liga + "|" + mkt;
  const live = liveCurves[curveKey];
  const curvaReal = live && (Date.now() - live.ts < 120000) ? live : null;
  if (curvaReal) {
    const serie = curvaReal.curva.slice(-qtd);
    const sinal = zoneSignal(serie);
    // histograma vem do MM1-MM2 real do caramelo, se veio
    let macdHist = [];
    if (Array.isArray(curvaReal.mm1) && Array.isArray(curvaReal.mm2)) {
      macdHist = curvaReal.mm1.map((v, i) => +((v - (curvaReal.mm2[i] ?? v))).toFixed(2));
    } else {
      macdHist = macdData(serie).hist;
    }
    const alertas = buildAlerts(d.games || [], serie, sinal, mkt, analise.base);
    analise = { ...analise, serie, macdHist: macdHist.slice(-qtd), sinal, alertas, qtdJogos: qtd, curvaReal: true, topo: curvaReal.topo, fundo: curvaReal.fundo };
  }

  // LINHAS DE TENDENCIA (LTA/LTB) + gatilho de rompimento, sobre a serie atual
  const tend = trendLines(analise.serie || []);
  analise = { ...analise, trend: tend };

  // se os dados vieram da SONDA (placares reais ao vivo), a curva calculada e EXATA
  // pra qualquer mercado — marca como real mesmo sem curva capturada desse mercado
  const fonteSonda = d.fonte === "sonda" || d.fonte === "ws";
  const ehReal = !!curvaReal || fonteSonda;

  // anexa a ancora (placares-gatilho) a cada proximo jogo, pelo nome. ADITIVO.
  const ancoras = d.ancoras || {};
  // === RANK ===
  // combo = score + EV (criterio escolhido). Indexa cada mercado por nome de jogo.
  const MKTS_RANK = ["o25", "o35", "ge5", "ambas"];
  const comboDe = e => e && e.score != null ? Math.round((e.score || 0) + (e.ev || 0)) : null;
  const upByMkt = {};
  for (const m of MKTS_RANK) {
    upByMkt[m] = {};
    for (const e of (d.upcoming && d.upcoming[m]) || []) upByMkt[m][e.nome] = e;
  }
  const proximos = ((d.upcoming && d.upcoming[mkt]) || []).map(p => {
    const anc = ancoras[p.nome];
    const base = anc ? { ...p, ancora: anc } : { ...p };
    if (mkt !== "totft") {
      base.combo = comboDe(p);
      // rank dos MERCADOS pra ESSE jogo (qual mercado paga melhor nele)
      base.rankMercados = MKTS_RANK
        .map(m => { const e = upByMkt[m][p.nome]; return e ? { mkt: m, combo: comboDe(e), score: e.score, ev: e.ev } : null; })
        .filter(x => x && x.combo != null)
        .sort((a, b) => b.combo - a.combo);
    }
    return base;
  });
  // rank dos JOGOS no mercado aberto (melhor -> pior por combo)
  if (mkt !== "totft") {
    const ord = proximos.filter(p => p.combo != null).sort((a, b) => b.combo - a.combo);
    ord.forEach((p, i) => { p.rankJogo = i + 1; p.rankTotal = ord.length; });
  }

  // RANK DE TIMES por janela de tempo (3h/6h/12h/24h) p/ o mercado aberto + Over 2.5 + Ambas
  const mktsRankTimes = [...new Set([mkt === "totft" ? "o25" : mkt, "o25", "ambas"])];
  const rankTimes = {};
  for (const m of mktsRankTimes) rankTimes[m] = rankTimesPorJanela(d.games || [], m);

  res.json({
    liga,
    mercado: mkt,
    qtd,
    lastUpdated: d.lastUpdated,
    fetchedAt: d.fetchedAt,
    analise,
    proximos,
    rankTimes,
    ultimos: d.ultimos,
    curvaReal: ehReal,
    fonte: d.fonte || "json"
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

// ===== BACKTEST (somente leitura, nao altera nenhuma analise) =====
// Reconstroi, jogo a jogo, o que a avaliacao teria indicado usando SO os jogos
// anteriores (sem olhar o futuro), e confere GREEN/RED contra o placar real.
const btCache = {};
app.get("/api/backtest/:liga", (req, res) => {
  try {
    const liga = req.params.liga;
    const mkt = req.query.mkt || "o35";
    const n = Math.min(parseInt(req.query.n || "80", 10) || 80, 150);
    const key = liga + "|" + mkt + "|" + n;
    const d = store[liga];
    if (!d || !d.games || d.games.length < 150) return res.json({ erro: "historico insuficiente" });
    // cache 60s (backtest e pesado; evita recalcular a cada clique)
    if (btCache[key] && Date.now() - btCache[key].ts < 60000 && btCache[key].lu === d.lastUpdated) {
      return res.json(btCache[key].out);
    }
    const games = d.games;
    const ini = Math.max(120, games.length - n); // exige 120 jogos de historico minimo
    const resultados = [];
    for (let i = ini; i < games.length; i++) {
      const g = games[i];
      if (!g.odds || !g.odds[oddKey(mkt)]) continue;
      const hist = games.slice(0, i);
      const ev = fullEvalUpcoming([{ nome: g.nome, horario: "", casa: g.casa, fora: g.fora, odds: g.odds }], hist, mkt)[0] || {};
      resultados.push({
        nome: g.nome, odd: g.odds[oddKey(mkt)],
        score: ev.score ?? null, ev: ev.ev ?? null, motivo: ev.motivo || "",
        green: pays(g, mkt), placar: (g.a != null && g.b != null) ? g.a + "-" + g.b : null
      });
    }
    // agregados por faixa
    const faixa = (min, max) => {
      const f = resultados.filter(r => r.score != null && r.score >= min && r.score < max);
      return { n: f.length, green: f.filter(r => r.green).length, pct: f.length ? Math.round(f.filter(r => r.green).length / f.length * 100) : null };
    };
    const evPos = resultados.filter(r => r.ev != null && r.ev > 0);
    const baseGeral = Math.round(resultados.filter(r => r.green).length / (resultados.length || 1) * 100);
    const indicados = resultados.filter(r => r.score != null && r.score >= 30 && r.ev > 0);
    const out = {
      liga, mkt, jogosAvaliados: resultados.length, baseGeral,
      faixas: { forte_60mais: faixa(60, 999), media_30a59: faixa(30, 60), fraca_0a29: faixa(0, 30), negativa: faixa(-999, 0) },
      evPositivo: { n: evPos.length, green: evPos.filter(r => r.green).length, pct: evPos.length ? Math.round(evPos.filter(r => r.green).length / evPos.length * 100) : null },
      indicados: { n: indicados.length, green: indicados.filter(r => r.green).length, pct: indicados.length ? Math.round(indicados.filter(r => r.green).length / indicados.length * 100) : null },
      ultimos10indicados: indicados.slice(-10).map(r => ({ nome: r.nome, odd: r.odd, score: r.score, ev: r.ev, placar: r.placar, resultado: r.green ? "GREEN" : "RED" }))
    };
    btCache[key] = { ts: Date.now(), lu: d.lastUpdated, out };
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== SSE (Server-Sent Events): canal de aviso em tempo real p/ as telas =====
// NAO altera nenhuma analise/calculo. So avisa "liga X atualizou" pra tela buscar na hora
// em vez de esperar o ciclo de 10s. Fallback: o ciclo de 10s continua funcionando igual.
const sseClientes = new Set();
function avisaClientes(liga) {
  const msg = `data: ${JSON.stringify({ tipo: "liga", liga, ts: Date.now() })}\n\n`;
  for (const res of sseClientes) { try { res.write(msg); } catch (e) { sseClientes.delete(res); } }
}
app.get("/api/eventos", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(`data: ${JSON.stringify({ tipo: "oi", ts: Date.now() })}\n\n`);
  sseClientes.add(res);
  req.on("close", () => sseClientes.delete(res));
});
// batimento a cada 25s pra conexao nao ser derrubada por proxies/idle
setInterval(() => {
  for (const res of sseClientes) { try { res.write(": ping\n\n"); } catch (e) { sseClientes.delete(res); } }
}, 25000);

app.use(express.static(join(__dirname, "public")));

app.listen(PORT, () => console.log("Caramelo Live rodando na porta " + PORT));
