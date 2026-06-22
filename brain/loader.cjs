// Carrega o robot.js real dentro de um sandbox com o shim de browser,
// e captura as funcoes do cerebro (calculo) pra usar no servidor.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { install } = require("./shim.cjs");

function loadBrain() {
  let src = fs.readFileSync(path.join(__dirname, "robot-original.js"), "utf8");

  // O robot.js e uma IIFE: (()=>{ ...tudo... })();
  // No fim ele chama ready(start) que dispara o desenho/timers. Sob o shim,
  // ready() provavelmente nao roda (sem DOM real), mas pra garantir que nada
  // de browser execute, neutralizamos a chamada de start e capturamos as funcoes.

  // Injeta, ANTES do fechamento da IIFE, um export das funcoes do cerebro
  // para um objeto global __BRAIN__.
  const exportHook = `
  ;try{
    globalThis.__BRAIN__ = {
      CONFIG, MARKETS, LIGA_LABELS,
      get RESULTS_CACHE(){return RESULTS_CACHE}, set RESULTS_CACHE(v){RESULTS_CACHE=v},
      get API_ROWS(){return API_ROWS}, set API_ROWS(v){API_ROWS=v},
      paysMarket, resultHistoryForMarket, calcResultWindows,
      teamPayPct, oddPayPct, marketCycleStats, cycleText,
      analysisForGame, comboScoreForGame,
      scoreModelForGame, scoreNextStats,
      anchorFutureGames, anchorStatsMap, anchorAttention,
      trendSeries, trendMoment, trendUpSignals,
      marketRankingBox,
      readGridGames: (typeof readGridGames!=='undefined'?readGridGames:null),
      oddFromObj: (typeof oddFromObj!=='undefined'?oddFromObj:null),
      txtFromApiRow: (typeof txtFromApiRow!=='undefined'?txtFromApiRow:null),
      weightedProb: (typeof weightedProb!=='undefined'?weightedProb:null),
      liveGraphCombo: (typeof liveGraphCombo!=='undefined'?liveGraphCombo:null),
      market, activeLiga: (typeof activeLiga!=='undefined'?activeLiga:null)
    };
    // tambem expoe helpers no escopo global do sandbox pra poder sobrescrever (DOM/tempo)
    globalThis.readGridGames = (typeof readGridGames!=='undefined'?readGridGames:null);
    globalThis.oddFromObj = (typeof oddFromObj!=='undefined'?oddFromObj:null);
    globalThis.isFuture = (typeof isFuture!=='undefined'?isFuture:null);
    globalThis.parseTime = (typeof parseTime!=='undefined'?parseTime:null);
    globalThis.activeLiga = (typeof activeLiga!=='undefined'?activeLiga:null);
    globalThis.activeMarkets = (typeof activeMarkets!=='undefined'?activeMarkets:null);
    globalThis.upcomingSetFromPage = (typeof upcomingSetFromPage!=='undefined'?upcomingSetFromPage:null);
  }catch(e){ globalThis.__BRAIN_ERR__ = String(e && e.stack || e); }
  `;

  // Substitui chamadas top-level que disparam DESENHO/timers (nao queremos no servidor).
  src = src.replace(/ready\(start\);/g, "/* start off */");
  src = src.replace(/^draw\(\);$/m, "/* draw off */");
  src = src.replace(/^\s*draw\(\);\s*$/m, "/* draw off */");

  // O cerebro (CONFIG, analysisForGame, comboScoreForGame...) esta na PRIMEIRA IIFE,
  // que fecha no primeiro "})();" do arquivo. Inserimos o hook ali.
  const firstClose = src.indexOf("})();");
  if (firstClose === -1) throw new Error("nao achei fechamento da 1a IIFE");
  src = src.slice(0, firstClose) + exportHook + "\n" + src.slice(firstClose);

  const sandbox = install({ globalThis: {}, Math, Date, JSON, RegExp, parseFloat, parseInt, isNaN, isFinite, Array, Object, String, Number, Boolean, Set, Map, Symbol, Promise, Error });
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "robot-original.js", timeout: 10000 });
  } catch (e) {
    return { error: "exec: " + (e && e.stack || e), brainErr: sandbox.__BRAIN_ERR__ };
  }
  if (sandbox.__BRAIN_ERR__) return { error: "hook: " + sandbox.__BRAIN_ERR__ };
  if (!sandbox.__BRAIN__) return { error: "brain nao exportado" };
  return { brain: sandbox.__BRAIN__, sandbox };
}

module.exports = { loadBrain };
