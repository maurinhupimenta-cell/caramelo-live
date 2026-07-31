// ============================================================================
// AMD — MOTOR (radar · backtest · gráfico janela móvel · gráfico acumulado 00h)
// Versão NAVEGADOR + Node. Site estático: <script src="motor.js"></script> e use window.AMD_MOTOR
//
// Só o motor: nenhuma dependência do servidor original (store, LIGAS, express...).
// Cole num projeto novo e chame radar() / backtest(). O desenho fica por sua conta.
//
// FORMATO DE CADA JOGO (o array `games`, em ordem cronológica CRESCENTE):
//   {
//     horario: "14:27",              // relógio DO JOGO (usado para cortar o dia)
//     nome:    "Brasil x Argentina", // "casa x fora" — usado por time/backtest
//     a: 2, b: 1,                    // gols casa / fora (placar final)
//     total: 3,                      // OBRIGATÓRIO: a + b. pays() lê ESTE campo,
//                                    // não soma a+b sozinho. Sem `total`, todo
//                                    // mercado de gols dá 0% e o radar fica mudo.
//     odds: { o25: 2.10, o35: 3.80, ge5: 9.5, ambs: 1.90, u25: 1.72, ... }
//   }
//
// MERCADOS: "o25" | "o35" | "ge5" | "ambas" | "u05" | "u15" | "u25" | "totft"
// (a chave da odd de "ambas" é `ambs` — ver oddKey)
// ============================================================================

function oddKey(mkt) { return mkt === "ambas" ? "ambs" : (mkt === "ambasN" ? "ambn" : mkt); }
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
function teamNames(nome) {
  if (!nome) return [];
  return nome.toLowerCase().split(/\s+x\s+/).map(s => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// BLOCO 1 — BASE (o que "paga", a série da curva, médias, zona, tendência)
// ---------------------------------------------------------------------------

function pays(g, mkt) {
  if (mkt === "o25") return g.total >= 3;
  if (mkt === "o35") return g.total >= 4;
  if (mkt === "ge5") return g.total >= 5;
  if (mkt === "ambas") return g.a > 0 && g.b > 0;
  if (mkt === "ambasN") return !(g.a > 0 && g.b > 0);   // ambas NAO marcam
  if (mkt === "u05") return g.total <= 0;
  if (mkt === "u15") return g.total <= 1;
  if (mkt === "u25") return g.total <= 2;
  return false;
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

function serieDoDia(gAll, mkt, JAN) {
  let idx = 0;
  for (let i = 1; i < gAll.length; i++) {
    const h1 = parseInt((gAll[i].horario || "").split(":")[0]);
    const h0 = parseInt((gAll[i - 1].horario || "").split(":")[0]);
    if (!isNaN(h1) && !isNaN(h0) && h1 < h0 - 12) idx = i;
  }
  const dia = gAll.slice(idx);
  if (dia.length < 3) return null;
  const out = [];
  for (let k = 0; k < dia.length; k++) {
    const ini = Math.max(0, k - JAN + 1);
    const jan = dia.slice(ini, k + 1);
    out.push(Math.round(jan.filter(g => pays(g, mkt)).length / jan.length * 1000) / 10);
  }
  return out;
}

// ---------------------------------------------------------------------------
// BLOCO 2 — AVALIAÇÃO DE JOGO (score / EV) — usada pelo backtest
// ---------------------------------------------------------------------------

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

// (oddKey definido no topo)
// (pct definido no topo do módulo)

// ---------------------------------------------------------------------------
// BLOCO 3 — RADAR (os quatro sinais)
//
// PURO E COM ESTADO EXPLÍCITO: você passa o estado da leitura anterior e recebe
// o novo. Isso preserva a HISTERESE (o sinal não pisca) sem precisar de variável
// global. Guarde `estado` por liga|mercado do seu lado.
//
//   let est = {};
//   const r = radar(games, "o25", { estado: est.euro_o25 });
//   est.euro_o25 = r.estado;
//   r.sinais  // -> [{tipo:"minima", ...}, {tipo:"subida", ...}]
//
// REGRAS (idênticas às do sistema):
//   minima → base >= 15 e último jogo NÃO pagou e cur <= base*0.60
//            (histerese: continua enquanto cur < base*0.85)
//   subida → ganho >= 10 pontos em 5 jogos e cur <= base*1.20
//            (histerese: continua com ganho >= 3 e cur <= base*1.35)
//   ltb    → trendLines(serie).rompimento.tipo === "ROMPEU_LTB_CIMA"
//   pull   → cur >= base, recuo de 8 a 25 pontos do topo dos últimos 10,
//            e o último ponto voltou a subir
//
// OBS: a série é a do DIA (serieDoDia). Se preferir a janela que atravessa dias,
//      passe { usarDia: false } nas opções.
// ---------------------------------------------------------------------------
function radar(games, mkt, opts = {}) {
  const estadoAnterior = opts.estado || {};
  const primeira = !opts.estado;                 // 1a leitura: registra sem "avisar"
  const usarDia = opts.usarDia !== false;
  const sinais = [];
  const g = (games || []).filter(Boolean);
  if (g.length < 3) return { sinais, estado: estadoAnterior, primeira };

  const JAN = Math.max(2, Math.min(20, g.length));
  const serieDia = usarDia ? serieDoDia(g, mkt, JAN) : null;
  const serie = (serieDia && serieDia.length >= 3) ? serieDia : chartSeries(g, mkt, JAN).slice(-20);
  if (!serie.length) return { sinais, estado: estadoAnterior, primeira };

  const cur = serie[serie.length - 1];
  // base = taxa histórica do mercado (o "normal"). Pode vir pronta em opts.base.
  const base = opts.base != null ? opts.base
    : Math.round(g.filter(x => pays(x, mkt)).length / g.length * 1000) / 10;
  const fita = g.slice(-6).map(x => ({ p: pays(x, mkt) ? 1 : 0, m: (x.horario || "").split(":")[1] || "" }));
  const ultimoPagou = pays(g[g.length - 1], mkt);

  // 📉 MÍNIMA
  const fundo = cur != null && base != null && base >= 15 && !ultimoPagou &&
    (estadoAnterior.fundo ? cur < base * 0.85 : cur <= base * 0.6);

  // 📈 SUBIDA
  const antes = serie.length >= 6 ? serie[serie.length - 6] : null;
  const ganho = (cur != null && antes != null) ? cur - antes : null;
  const sobe = ganho != null && base != null &&
    (estadoAnterior.sobe ? (ganho >= 3 && cur <= base * 1.35) : (ganho >= 10 && cur <= base * 1.2));

  // 💥 QUEBRA DE LTB
  let quebrouLTB = false;
  try { const t = trendLines(serie); quebrouLTB = !!(t && t.rompimento && t.rompimento.tipo === "ROMPEU_LTB_CIMA"); } catch (e) {}

  // ↩️ PULLBACK
  let pull = false, topoRec = null;
  try {
    if (cur != null && base != null && serie.length >= 6) {
      topoRec = Math.max(...serie.slice(-10));
      const recuo = topoRec - cur;
      const retomou = serie[serie.length - 1] > serie[serie.length - 2];
      pull = cur >= base && recuo >= 8 && recuo <= 25 && retomou;
    }
  } catch (e) {}

  const rel = base ? Math.round(cur / base * 100) : null;
  // só dispara na BORDA (quando nasce), como no sistema original
  if (fundo && !estadoAnterior.fundo) sinais.push({ tipo: "minima", mkt, pagando: cur, base, rel, fita, novo: !primeira });
  if (sobe && !estadoAnterior.sobe)   sinais.push({ tipo: "subida", mkt, pagando: cur, deOnde: antes, base, fita, novo: !primeira });
  if (quebrouLTB && !estadoAnterior.ltb) sinais.push({ tipo: "ltb", mkt, pagando: cur, base, fita, novo: !primeira });
  if (pull && !estadoAnterior.pull)   sinais.push({ tipo: "pull", mkt, pagando: cur, topo: topoRec, base, fita, novo: !primeira });

  return {
    sinais,
    ativos: { minima: fundo, subida: sobe, ltb: quebrouLTB, pull },   // o que está ACESO agora
    estado: { fundo, sobe, ltb: quebrouLTB, pull },                   // guarde e devolva na próxima leitura
    serie, cur, base, primeira
  };
}


// ---------------------------------------------------------------------------
// (motor interno do backtest — original, adaptado para receber `store`)
// ---------------------------------------------------------------------------
function _calculaBacktest(liga, mkt, n, store) {
    const key = liga + "|" + mkt + "|" + n;
    const d = store[liga];
    if (!d || !d.games || d.games.length < 150) return { erro: "historico insuficiente" };
    if (false && btCache[key] && Date.now() - btCache[key].ts < 60000 && btCache[key].lu === d.lastUpdated) {
      return btCache[key].out;
    }
    const games = d.games;
    const ini = Math.max(120, games.length - n); // exige 120 jogos de historico minimo
    const resultados = [];
    for (let i = ini; i < games.length; i++) {
      const g = games[i];
      if (!g.odds || !g.odds[oddKey(mkt)]) continue;
      const hist = games.slice(0, i).slice(-400); // 400 anteriores: mesmas stats, 3x mais leve
      const ev = fullEvalUpcoming([{ nome: g.nome, horario: "", casa: g.casa, fora: g.fora, odds: g.odds }], hist, mkt)[0] || {};
      resultados.push({
        nome: g.nome, horario: g.horario || "", odd: g.odds[oddKey(mkt)],
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
      _seqIndicados: indicados.map(r => !!r.green),
      faixas: { forte_60mais: faixa(60, 999), media_30a59: faixa(30, 60), fraca_0a29: faixa(0, 30), negativa: faixa(-999, 0) },
      evPositivo: { n: evPos.length, green: evPos.filter(r => r.green).length, pct: evPos.length ? Math.round(evPos.filter(r => r.green).length / evPos.length * 100) : null },
      indicados: { n: indicados.length, green: indicados.filter(r => r.green).length, pct: indicados.length ? Math.round(indicados.filter(r => r.green).length / indicados.length * 100) : null },
      ultimos10indicados: (() => {
        // JANELA DE 6 HORAS do relogio do jogo (pedido do usuario: os indicados sumiam com o corte de 10)
        const hm = h => { const m = /^(\d{1,2}):(\d{1,2})/.exec(h || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
        const agoraJogo = (() => { for (let k = resultados.length - 1; k >= 0; k--) { const v = hm(resultados[k].horario); if (v != null) return v; } return null; })();
        const dentro6h = r => { const v = hm(r.horario); if (v == null || agoraJogo == null) return true; const diff = (agoraJogo - v + 1440) % 1440; return diff <= 360; };
        const janela = indicados.filter(dentro6h);
        // ⚠️ TRIANGULO: o MAIOR EV+ que deu RED na janela (aviso: EV alto nao e garantia)
        let idxAlerta = -1, maiorEv = -1;
        janela.forEach((r, ix) => { if (!r.green && r.ev != null && r.ev > 0 && r.ev > maiorEv) { maiorEv = r.ev; idxAlerta = ix; } });
        return janela.map((r, ix) => ({ nome: r.nome, horario: r.horario, odd: r.odd, score: r.score, ev: r.ev, placar: r.placar, resultado: r.green ? "GREEN" : "RED", alerta: ix === idxAlerta }));
      })()
    };
    // cache desativado no modulo portatil
    return out;
}

const btCache = {};

// ---------------------------------------------------------------------------
// BLOCO 4 — BACKTEST
//
// Para cada jogo, REFAZ a avaliação usando só os jogos ANTERIORES (janela de 400).
// Indicação = score >= 30 E ev > 0. Devolve as taxas e a lista das últimas 6h,
// marcando com `alerta: true` a maior EV+ que terminou em RED.
//
//   const bt = backtest(games, "o25", 150);
//   bt.taxaIndicados / bt.baseGeral / bt.ultimos10indicados
//
// LIMITE HONESTO: o filtro (score/EV) foi calibrado olhando estes mesmos dados,
// então o backtest é DESCRITIVO, não preditivo.
// ---------------------------------------------------------------------------
function backtest(games, mkt, n = 100) {
  const store = { _: { games: games || [] } };   // adaptador: a função original lê de store[liga]
  return _calculaBacktest("_", mkt, n, store);
}



// ---------------------------------------------------------------------------
// BLOCO 5 — MOTOR DO GRÁFICO JANELA MÓVEL
// Devolve tudo que o desenho precisa. O "Qtd. Jogos" é o PERÍODO REAL da média.
//   const g = chartJanela(games, "o25", 20);
//   g.serie / g.horas / g.macdHist / g.sinal / g.trend
// ---------------------------------------------------------------------------
function chartJanela(games, mkt, qtd = 20) {
  games = (games || []).filter(Boolean);
  if (games.length < 3) return null;
  const JAN = Math.max(2, Math.min(qtd, Math.max(2, Math.floor(games.length / 2))));
  const serieFull = chartSeries(games, mkt, JAN);
  const serie = serieFull.slice(-Math.min(120, serieFull.length));
  const { hist } = macdData(serie);
  const horas = games.slice(-serie.length).map(g => g.horario || "");
  let trend = null; try { trend = trendLines(serie); } catch (e) {}
  return { serie, horas, macdHist: hist.slice(-serie.length), sinal: zoneSignal(serie), trend, janelaMM: JAN,
    base: Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10 };
}

// ---------------------------------------------------------------------------
// BLOCO 6 — MOTOR DO GRÁFICO ACUMULADO 00h
// Corta na virada do relógio DO JOGO e monta as faixas 3h/6h/12h/18h/24h + dia.
// Média móvel com aquecimento: já existe ponto no 1º jogo do dia.
//   const a = acumulado(games, "o25", 20);
//   a.faixas.dia.serie / .horas / .macd   |  a.faixas.h3, h6, h12, h18, h24
//   a.jogos / a.desde / a.base
// ---------------------------------------------------------------------------
function acumulado(games, mkt, qtd) {
  games = (games || []).filter(Boolean);
  if (games.length < 2) return null;
  // corte na virada do dia pelo RELOGIO DO JOGO (queda de hora), nao pelo nosso horario
  let idxDia = 0;
  for (let i = 1; i < games.length; i++) {
    const h1 = parseInt((games[i].horario || "").split(":")[0]);
    const h0 = parseInt((games[i - 1].horario || "").split(":")[0]);
    if (!isNaN(h1) && !isNaN(h0) && h1 < h0 - 12) idxDia = i;
  }
  const dia = games.slice(idxDia);
  const JAN = Math.max(2, parseInt(qtd) || 20);
  // media movel NORMAL com aquecimento: no 1o jogo ja existe ponto (janela = o que houver),
  // e a janela cresce ate JAN. Assim o grafico nasce cedo e ja aponta a direcao dos resultados.
  const monta = arr => {
    if (!arr || arr.length < 2) return null;
    const serie = [], hrs = [];
    for (let k = 0; k < arr.length; k++) {
      const ini2 = Math.max(0, k - JAN + 1);
      const jan = arr.slice(ini2, k + 1);
      const pg = jan.filter(g => pays(g, mkt)).length;
      serie.push(Math.round(pg / jan.length * 1000) / 10);
      hrs.push(arr[k].horario || "");
    }
    return { serie, horas: hrs, macd: serie.length > 3 ? (macdData(serie).hist || []) : [] };
  };
  const JOGOS_HORA = 20; // 1 jogo a cada 3 min
  const faixasAcum = {};
  for (const h of [3, 6, 12, 18, 24]) {
    const n = h * JOGOS_HORA;
    const fatia = dia.length > n ? dia.slice(-n) : dia;   // dentro do dia, ultimas h horas
    const f = monta(fatia);
    if (f) faixasAcum["h" + h] = f;
  }
  const fDia = monta(dia);
  if (fDia) faixasAcum.dia = fDia;
  if (!Object.keys(faixasAcum).length) return null;
  const base = Math.round(dia.filter(g => pays(g, mkt)).length / dia.length * 1000) / 10;
  return { faixas: faixasAcum, janela: JAN, jogos: dia.length, desde: (dia[0] || {}).horario || "", base };
}

// ---------------------------------------------------------------------------
// EXPORTS — funciona no NAVEGADOR (site estático) e no Node
// ---------------------------------------------------------------------------
var AMD_MOTOR = {
  radar: radar,
  backtest: backtest,
  chartJanela: chartJanela,
  acumulado: acumulado,
  // peças soltas, se você quiser montar outra coisa
  pays: pays, oddKey: oddKey, chartSeries: chartSeries, serieDoDia: serieDoDia,
  ema: ema, macdData: macdData, zoneSignal: zoneSignal, trendLines: trendLines,
  teamPayPct: teamPayPct, oddPayPct: oddPayPct, scoreDistribution: scoreDistribution,
  cycleStats: cycleStats, comboScore: comboScore, fullEvalUpcoming: fullEvalUpcoming
};
if (typeof window !== "undefined") window.AMD_MOTOR = AMD_MOTOR;
if (typeof module !== "undefined" && module.exports) module.exports = AMD_MOTOR;
