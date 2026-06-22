// Adaptador: pega os jogos do JSON do caramelo e alimenta o CEREBRO REAL do robot.js.
// Constroi RESULTS_CACHE (historico) e API_ROWS (futuros) no formato que o robo espera,
// neutraliza as funcoes que dependem de DOM/tempo, e roda analysisForGame de verdade.
const { loadBrain } = require("./loader.cjs");

// nome da liga -> numero (LIGA_LABELS do robo: 1 Copa, 2 Euro, 3 Super, 4 Premier)
const LIGA_NUM = { copa: 1, euro: 2, super: 3, premier: 4 };

let BRAIN = null;
function getBrain() {
  if (BRAIN) return BRAIN;
  const r = loadBrain();
  if (r.error) throw new Error("brain load: " + r.error);
  BRAIN = r;
  return BRAIN;
}

// monta o txt no formato que o robo faz regex (igual a celula do caramelo)
// calcula o sinal de grafico (zona/forca/slope/histograma) que o cerebro le.
// usa a MESMA logica de janela 20 + MACD (MM1 10 / MM2 20) que validamos vivo.
function buildGraphCombo(games, marketKey, brain) {
  const m = brain.MARKETS.find(x => x.key === marketKey);
  const pays = (g) => brain.paysMarket({ a: g.a, b: g.b, t: g.total }, m);
  const win = 20;
  const serie = [];
  for (let i = win; i <= games.length; i++) {
    const block = games.slice(i - win, i);
    serie.push(Math.round(block.filter(pays).length / win * 100));
  }
  const tail = serie.slice(-40);
  if (!tail.length) return { zonePct: 50, force: 50, slope: 0, histRead: false };
  // zona pelo 5/95 percentil
  const sorted = tail.slice().sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
  const min = q(0.05), max = q(0.95), cur = tail[tail.length - 1];
  const range = Math.max(1, max - min);
  const zonePct = Math.round((Math.max(min, Math.min(max, cur)) - min) / range * 100);
  // MACD: MM1(10) - MM2(20)
  const ema = (arr, p) => { const k = 2 / (p + 1); const o = [arr[0]]; for (let i = 1; i < arr.length; i++)o.push(arr[i] * k + o[i - 1] * (1 - k)); return o; };
  const mm1 = ema(tail, 10), mm2 = ema(tail, 20);
  const macd = mm1[mm1.length - 1] - mm2[mm2.length - 1];
  const macdPrev = (mm1[mm1.length - 4] || mm1[0]) - (mm2[mm2.length - 4] || mm2[0]);
  const slope = +(macd).toFixed(3);
  const histPositive = macd > 0;
  const histWeakening = macd < macdPrev;
  return {
    zonePct, force: zonePct, slope,
    histRead: true, histPositive, histWeakening,
    serie: tail, macd: +macd.toFixed(2)
  };
}

function buildTxt(g) {
  const odds = Object.entries(g.odds || {}).map(([k, v]) => `${k}@${v}`).join(" ");
  const score = g.score ? `${g.score.a}-${g.score.b}` : "";
  return `${g.name} ${score} ${odds}`.trim();
}

// converte os jogos decodificados do caramelo (do server.js) para linhas API_ROWS
function toApiRows(games, upcoming, liga) {
  const ligaNum = LIGA_NUM[liga] || null;
  const rows = [];
  // historico (com score)
  games.forEach((g, i) => {
    rows.push({
      key: `hist|${liga}|${i}|${g.nome}`,
      liga: ligaNum, time: "", name: g.nome,
      score: { a: g.a, b: g.b, t: g.total },
      odds: g.odds, future: false, platform: "CARAMELO", hours: "Horas3",
      api: `caramelo/${liga}`, idx: i,
      txt: `${g.nome} ${g.a}-${g.b} ${Object.entries(g.odds).map(([k, v]) => `${k}@${v}`).join(" ")}`
    });
  });
  // futuros (sem score) - 6 proximos
  upcoming.forEach((u, i) => {
    rows.push({
      key: `fut|${liga}|${i}|${u.nome}`,
      liga: ligaNum, time: `99.${String(i).padStart(2, "0")}`, name: u.nome,
      score: null, odds: u.odds, future: true, platform: "CARAMELO", hours: "Horas3",
      api: `caramelo/${liga}?futuro=true`, idx: 1000 + i,
      txt: `${u.nome} ${Object.entries(u.odds).map(([k, v]) => `${k}@${v}`).join(" ")}`
    });
  });
  return rows;
}

// roda o cerebro real pra uma liga + mercado, devolvendo a analise dos proximos jogos
function analyzeWithBrain(games, upcoming, liga, marketKey) {
  const { brain, sandbox } = getBrain();
  const ligaNum = LIGA_NUM[liga] || null;

  // 1) configura o mercado e a liga ativa
  brain.CONFIG.market = marketKey;
  brain.CONFIG.ligaAuto = false;
  // neutraliza funcoes dependentes de DOM/tempo dentro do sandbox
  sandbox.activeLiga = () => ligaNum;
  sandbox.isFuture = () => true;          // todos os 6 futuros contam como futuros
  sandbox.parseTime = (t) => { const m = String(t).match(/(\d+)\.(\d+)/); return m ? +m[1] * 60 + +m[2] : 9999; };
  sandbox.upcomingSetFromPage = () => new Set();
  sandbox.scheduleDraw = () => {};
  sandbox.beep = () => {};

  // 3b) ALIMENTA O GRAFICO que o cerebro le (window.__BBTIPS_GRAPH_COMBO).
  //     Calculamos a serie do mercado (janela 20, igual caramelo) e a direcao por MACD.
  const graphCombo = buildGraphCombo(games, marketKey, brain);
  graphCombo.marketKey = marketKey;
  graphCombo.ts = Date.now();
  graphCombo.source = "caramelo-data";   // marca como confiavel pro cerebro
  sandbox.__BBTIPS_GRAPH_COMBO = graphCombo;

  // 2) alimenta API_ROWS (historico + futuros)
  const apiRows = toApiRows(games, upcoming, liga);
  brain.API_ROWS = apiRows;

  // 3) alimenta RESULTS_CACHE (historico, mais novo primeiro como o robo espera)
  //    resultHistoryForMarket mapeia score->green; precisa de {name, score, txt}
  const resultsCache = games.slice().reverse().map((g, i) => ({
    name: g.nome,
    time: "",
    score: { a: g.a, b: g.b, t: g.total },
    odds: g.odds,
    txt: `${g.nome} ${g.a}-${g.b}`,
    liga: ligaNum
  }));
  brain.RESULTS_CACHE = resultsCache;

  // 4) roda o cerebro: pega os jogos futuros e analisa cada um
  let readGridGames = sandbox.readGridGames;
  let games2;
  try {
    games2 = readGridGames ? readGridGames() : [];
  } catch (e) {
    games2 = [];
  }
  // fallback: monta os jogos futuros na mao se readGridGames nao achou
  if (!games2 || !games2.length) {
    const m = brain.MARKETS.find(x => x.key === marketKey);
    const oddFromObj = sandbox.oddFromObj;
    // chave direta no objeto de odds do caramelo pra cada mercado do robo
    const DIRECT = { over35: "o35", over25: "o25", over5: "ge5", ambas_sim: "ambs" };
    const dk = DIRECT[marketKey];
    games2 = upcoming.map((u, i) => {
      let odd = oddFromObj ? oddFromObj(u.odds, m) : null;
      if (!odd && dk && u.odds[dk]) odd = parseFloat(u.odds[dk]);   // fallback direto pela chave
      return { time: `99.${i}`, name: u.nome, market: m, odd, text: buildTxt({ name: u.nome, odds: u.odds }), api: true };
    }).filter(g => g.odd);
  }

  // 5) analysisForGame em cada jogo
  const out = [];
  for (const g of games2) {
    try {
      const a = brain.analysisForGame(g, []);
      out.push({ game: g, analysis: a });
    } catch (e) {
      out.push({ game: g, error: String(e && e.message || e) });
    }
  }
  return out;
}

module.exports = { getBrain, analyzeWithBrain, toApiRows, LIGA_NUM };
