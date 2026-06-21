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

function parseGame(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(.+?)(\d+)-(\d+)/);
  if (!m) return null;
  const a = +m[2], b = +m[3];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const odds = {};
  s.replace(/([a-z0-9]+)@([\d.]+)/gi, (_, k, v) => { odds[k] = parseFloat(v); });
  return { nome: m[1].trim(), a, b, total: a + b, odds };
}

function decodeRows(json) {
  const rows = (json && json.table && json.table.rows) || [];
  const games = [];
  for (const row of rows) {
    for (const cell of (row.c || [])) {
      const g = parseGame(cell && cell.v);
      if (g) games.push(g);
    }
  }
  return games;
}

function pays(g, mkt) {
  if (mkt === "o25") return g.total >= 3;
  if (mkt === "o35") return g.total >= 4;
  if (mkt === "ge5") return g.total >= 5;
  return false;
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function windowPct(games, mkt, n) {
  const s = games.slice(-n);
  if (!s.length) return null;
  return pct(s.filter(g => pays(g, mkt)).length, s.length);
}

function computeMarket(games, mkt) {
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
    const o = g.odds[mkt];
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

  // assinaturas: padrao dos ultimos 5 -> paga no proximo
  const sigMap = {};
  for (let i = 5; i < games.length; i++) {
    const sig = games.slice(i - 5, i).map(g => (pays(g, mkt) ? "1" : "0")).join("");
    (sigMap[sig] = sigMap[sig] || { n: 0, paid: 0 });
    sigMap[sig].n++;
    if (pays(games[i], mkt)) sigMap[sig].paid++;
  }
  // assinatura ATUAL (ultimos 5 jogos) e o que costuma vir depois
  const atualSig = games.slice(-5).map(g => (pays(g, mkt) ? "1" : "0")).join("");
  const atualStat = sigMap[atualSig] || { n: 0, paid: 0 };

  const signatures = Object.entries(sigMap)
    .filter(([_, d]) => d.n >= 8)
    .map(([sig, d]) => ({ sig, n: d.n, paid: d.paid, p: pct(d.paid, d.n) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 10);

  return {
    total, base, justa,
    termometro: wins,
    aquecendo,
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
    const games = decodeRows(j);
    if (!games.length) throw new Error("zero jogos");
    store[liga] = {
      games,
      lastUpdated: j.lastUpdated || (j.table && j.table.lastUpdated) || null,
      fetchedAt: new Date().toISOString(),
      computed: {
        o35: computeMarket(games, "o35"),
        ge5: computeMarket(games, "ge5"),
        o25: computeMarket(games, "o25")
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
  res.json({
    liga,
    mercado: mkt,
    lastUpdated: d.lastUpdated,
    fetchedAt: d.fetchedAt,
    analise: d.computed[mkt] || d.computed.o35,
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
