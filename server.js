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

// ===== ACESSO POR CODIGO + ADMIN (controle de testes 1 dia e assinantes 30 dias) =====
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const GH_T = process.env.GH_TOKEN || "";
const GH_REPO = "maurinhupimenta-cell/caramelo-live";
const GH_BRANCH = "dados";
let webpush = null;
try { webpush = require("web-push"); } catch (e) { console.log("web-push indisponivel:", e.message); }

const GH_FILE = "codigos.json";
let codigos = {}; // codigo -> {nome, criado, expira, usos, ultimoUso}
let ghSha = null;
let ghErro = null; // ultimo erro de salvamento (visivel no /admin)
const ghHead = () => ({ "Authorization": "Bearer " + GH_T, "Accept": "application/vnd.github+json", "User-Agent": "caramelo-live" });
async function carregaCodigos() {
  if (!GH_T) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}`, { headers: ghHead() });
    if (r.ok) { const j = await r.json(); ghSha = j.sha; codigos = JSON.parse(Buffer.from(j.content, "base64").toString()); }
  } catch (e) {}
}
async function salvaCodigos() {
  if (!GH_T) return;
  try {
    const body = { message: "codigos", content: Buffer.from(JSON.stringify(codigos, null, 1)).toString("base64"), branch: GH_BRANCH };
    if (ghSha) body.sha = ghSha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, { method: "PUT", headers: { ...ghHead(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { const j = await r.json(); ghSha = j.content.sha; ghErro = null; }
    else { ghErro = "HTTP " + r.status + " — token sem permissão Contents:Read/Write nesse repo, ou token inválido"; }
  } catch (e) { ghErro = e.message; }
}
carregaCodigos();
function codigoValido(c) {
  const d = codigos[c]; if (!d) return false;
  if (Date.now() > d.expira) return false;
  d.usos = (d.usos || 0) + 1; d.ultimoUso = Date.now(); return true;
}
// PORTAO: protege os dados; deixa livre snapshot (sonda), eventos (SSE), acesso/admin e arquivos estaticos
app.use((req, res, next) => {
  const p = req.path;
  const livre = p === "/api/snapshot" || p === "/api/eventos" || p.startsWith("/api/acesso") || p.startsWith("/api/admin") || !p.startsWith("/api/");
  if (livre) return next();
  const c = String(req.headers["x-acesso"] || req.query.c || "").toUpperCase().trim();
  if (codigoValido(c)) return next();
  res.status(401).json({ erro: "acesso" });
});
app.post("/api/acesso/validar", (req, res) => {
  const c = String((req.body || {}).codigo || "").toUpperCase().trim();
  if (codigoValido(c)) { const d = codigos[c]; res.json({ ok: true, nome: d.nome, expira: d.expira }); }
  else res.status(401).json({ ok: false, erro: "código inválido ou expirado" });
});
const isAdmin = req => ADMIN_KEY && (req.headers["x-admin"] === ADMIN_KEY || req.query.k === ADMIN_KEY);
app.post("/api/admin/testar-alerta", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ erro: "admin" });
  avisaRadar({ liga: "copa", mkt: "o25", tipo: "subida", pagando: 35, deOnde: 25, base: 38, fita: [0,1,1,0,1,1], teste: true, ts: Date.now() });
  res.json({ ok: true, msg: "alerta de teste enviado a todas as telas abertas" });
});
app.get("/api/admin/codigos", (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ erro: "admin" });
  res.json({ codigos, persistencia: !!GH_T && !ghErro && !!ghSha, tokenPresente: !!GH_T, erroSave: ghErro, adminKeyDefinida: !!ADMIN_KEY });
});
app.post("/api/admin/criar", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ erro: "admin" });
  const { nome, dias } = req.body || {};
  const cod = "CL-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  codigos[cod] = { nome: String(nome || ""), criado: Date.now(), expira: Date.now() + (parseFloat(dias) || 1) * 86400000, usos: 0 };
  await salvaCodigos();
  res.json({ ok: true, codigo: cod, expira: codigos[cod].expira });
});
app.post("/api/admin/revogar", async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ erro: "admin" });
  delete codigos[String((req.body || {}).codigo || "").toUpperCase().trim()];
  await salvaCodigos();
  res.json({ ok: true });
});
// pagina /admin (painel do dono)
app.get("/admin", (req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — AMD Live</title>
<style>body{background:#0d1117;color:#e8edf4;font-family:system-ui;margin:0;padding:20px;max-width:760px;margin:auto}h2{color:#3fb950}input,select,button{padding:9px 12px;border-radius:8px;border:1px solid #2d3646;background:#1c2333;color:#e8edf4;font-size:14px}button{cursor:pointer}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}td,th{padding:8px;border-bottom:1px solid #2d3646;text-align:left}.ok{color:#3fb950}.exp{color:#f85149}.note{color:#8b98a8;font-size:12px}</style></head><body>
<h2>🔑 Admin — AMD Live</h2>
<div id="login"><p>Senha do admin: <input id="k" type="password"> <button onclick="entrar()">Entrar</button></p><p class="note" id="dica"></p></div>
<div id="painel" style="display:none">
  <p>Nome: <input id="nome" placeholder="ex: João teste"> Duração:
    <select id="dias"><option value="1">1 dia (teste)</option><option value="30">30 dias</option><option value="7">7 dias</option><option value="0.125">3 horas</option></select>
    <button onclick="criar()">➕ Criar código</button> <button onclick="teste()">🔔 Testar alerta</button></p>
  <p id="novo" style="font-weight:700;color:#3fb950"></p>
  <table><thead><tr><th>Código</th><th>Nome</th><th>Expira</th><th>Usos</th><th></th></tr></thead><tbody id="lista"></tbody></table>
  <p class="note" id="aviso"></p>
</div>
<script>
let K='';
async function api(p,m,b){const r=await fetch(p+(p.includes('?')?'&':'?')+'k='+encodeURIComponent(K),{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});if(r.status===401)throw new Error('senha errada');return r.json();}
async function entrar(){K=document.getElementById('k').value;try{await lista();document.getElementById('login').style.display='none';document.getElementById('painel').style.display='block';}catch(e){document.getElementById('dica').textContent='Senha incorreta (ou ADMIN_KEY não definida no Render).';}}
async function lista(){const j=await api('/api/admin/codigos');const tb=document.getElementById('lista');tb.innerHTML='';
 const agora=Date.now();
 Object.entries(j.codigos).sort((a,b)=>b[1].criado-a[1].criado).forEach(([c,d])=>{
  const exp=new Date(d.expira);const ativo=agora<d.expira;
  tb.innerHTML+=\`<tr><td><b>\${c}</b></td><td>\${d.nome||'—'}</td><td class="\${ativo?'ok':'exp'}">\${exp.toLocaleString('pt-BR')} \${ativo?'✅':'⛔ expirado'}</td><td>\${d.usos||0}\${d.ultimoUso?' <span class=note>('+new Date(d.ultimoUso).toLocaleTimeString('pt-BR')+')</span>':''}</td><td><button onclick="revogar('\${c}')">🗑️</button></td></tr>\`;});
 document.getElementById('aviso').textContent=j.persistencia?'✔ códigos salvos com persistência (sobrevivem a reinício)':(j.tokenPresente?('⚠️ GH_TOKEN presente mas o salvamento FALHOU: '+(j.erroSave||'crie um código para testar')):'⚠️ SEM persistência — falta GH_TOKEN no Render; códigos somem a cada reinício');}
async function criar(){const j=await api('/api/admin/criar','POST',{nome:document.getElementById('nome').value,dias:document.getElementById('dias').value});
 document.getElementById('novo').textContent='Código criado: '+j.codigo+' — envie ao usuário';await lista();}
async function teste(){await api('/api/admin/testar-alerta','POST',{});alert('Alerta de teste enviado! Olhe a notificação no canto (com o site aberto em outra aba).');}
async function revogar(c){if(!confirm('Revogar '+c+'?'))return;await api('/api/admin/revogar','POST',{codigo:c});await lista();}
</script></body></html>`);
});

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
  // e o caminho inverso: deriva UNDER quando so veio o OVER (mercados complementares)
  const deriveUnder = (oKey, uKey) => {
    if (odds[uKey] == null && odds[oKey] != null && odds[oKey] > 1) {
      const pOver = 1 / odds[oKey];
      const pUnder = 1 - pOver;
      if (pUnder > 0.01) odds[uKey] = +(1 / pUnder).toFixed(2);
    }
  };
  deriveUnder("o15", "u15");
  deriveUnder("o25", "u25");
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
  if (mkt === "u05") return g.total <= 0;
  if (mkt === "u15") return g.total <= 1;
  if (mkt === "u25") return g.total <= 2;
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

// PLACAR PROVAVEL: distribuicao de placares dos jogos recentes da liga (peso 1) +
// historico do mandante em casa e do visitante fora (peso 3). Top 2 com %.
function placarProvavel(games, casa, fora, nome) {
  if ((!casa || !fora) && nome && nome.includes(" x ")) {
    const pp = nome.split(" x "); casa = casa || pp[0].trim(); fora = fora || (pp[1] || "").trim();
  }
  // duas distribuicoes: liga (referencia) e confronto (mandante em casa + visitante fora, peso 3 + liga peso 1)
  const liga = {}, conf = {}; let totL = 0, totC = 0;
  const add = (m, g, w) => { if (g.a == null || g.b == null) return 0; const k = g.a + "-" + g.b; m[k] = (m[k] || 0) + w; return w; };
  for (const g of games.slice(-300)) totL += add(liga, g, 1);
  for (const g of games.slice(-150)) totC += add(conf, g, 1);
  if (casa || fora) for (const g of games) {
    if (casa && g.casa === casa) totC += add(conf, g, 3);
    if (fora && g.fora === fora) totC += add(conf, g, 3);
  }
  if (!totC || !totL) return null;
  const soma = k => k.split("-").reduce((a, b) => +a + +b, 0);
  const top = filtro => {
    const e = Object.entries(conf).filter(([k]) => filtro(soma(k))).sort((a, b) => b[1] - a[1])[0];
    return e ? { placar: e[0], pct: Math.round(e[1] / totC * 100) } : null;
  };
  // placar que ESSE confronto puxa acima do normal da liga (lift >= 1.5x, minimo de ocorrencias)
  let puxa = null;
  for (const [k, w] of Object.entries(conf)) {
    if (w < 6) continue;
    const pC = w / totC, pL = (liga[k] || 0.5) / totL;
    const x = pC / pL;
    if (x >= 1.5 && (!puxa || x > puxa.x)) puxa = { placar: k, x: Math.round(x * 10) / 10 };
  }
  return { under: top(t => t <= 2), over: top(t => t >= 3), puxa };
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
      u25: computeMarket(games, "u25"),
      u15: computeMarket(games, "u15"),
      u05: computeMarket(games, "u05"),
      totft: computeMarket(games, "totft")
    },
    upcoming: {
      o35: brainEval(games, upcoming, liga, "o35") || fullEvalUpcoming(upcoming, games, "o35"),
      ge5: brainEval(games, upcoming, liga, "ge5") || fullEvalUpcoming(upcoming, games, "ge5"),
      o25: brainEval(games, upcoming, liga, "o25") || fullEvalUpcoming(upcoming, games, "o25"),
      ambas: brainEval(games, upcoming, liga, "ambas") || fullEvalUpcoming(upcoming, games, "ambas"),
      u25: fullEvalUpcoming(upcoming, games, "u25"),
      u15: fullEvalUpcoming(upcoming, games, "u15"),
      u05: fullEvalUpcoming(upcoming, games, "u05"),
      // Total Gols (FT): nao e aposta sim/nao, entao mostra so o jogo (sem EV/score)
      totft: upcoming.map(u => ({ nome: u.nome, horario: u.horario, casa: u.casa, fora: u.fora, semEV: true }))
    },
    ultimos: games.slice(-20).map(g => ({ nome: g.nome, placar: g.a + "-" + g.b, total: g.total })),
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
// completa odds complementares (over<->under, sem margem) no objeto que a sonda entrega pronto
function completaOdds(o) {
  const odds = { ...(o || {}) };
  const deriva = (deKey, paraKey) => {
    if (odds[paraKey] == null && odds[deKey] != null && odds[deKey] > 1) {
      const p = 1 - 1 / odds[deKey];
      if (p > 0.01) odds[paraKey] = +(1 / p).toFixed(2);
    }
  };
  deriva("u15", "o15"); deriva("u25", "o25"); deriva("u35", "o35");
  deriva("o15", "u15"); deriva("o25", "u25"); deriva("o35", "u35");
  return odds;
}

// MAXIMAS DE REDS: maior corda de nao-pagamento por janela de tempo (~3min/jogo) + seca atual
function colunaPct(gamesArr, horario, mkt) {
  if (!horario || !horario.includes(":")) return null;
  const min = horario.split(":")[1];
  const hist = [];
  for (let i = gamesArr.length - 1; i >= 0 && hist.length < 24; i--) {
    const h = gamesArr[i].horario || "";
    if (h.endsWith(":" + min)) hist.push(pays(gamesArr[i], mkt) ? 1 : 0);
  }
  if (!hist.length) return null;
  const pc = n => { const s = hist.slice(0, n); return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length * 100) : null; };
  return { min, h3: pc(3), h6: pc(6), h12: pc(12), h24: pc(24) };
}
function taxaJanelas(gamesArr, mkt) {
  const out = {};
  for (const [k, n] of Object.entries({ h3: 60, h6: 120, h12: 240, h24: 480 })) {
    const g = gamesArr.slice(-n);
    out[k] = g.length ? Math.round(g.filter(x => pays(x, mkt)).length / g.length * 100) : null;
  }
  return out;
}
function maximasReds(gamesArr, mkt) {
  const janelas = { h3: 60, h6: 120, h12: 240, h24: 480 };
  const out = {};
  for (const [k, n] of Object.entries(janelas)) {
    const g = gamesArr.slice(-n);
    let mx = 0, run = 0;
    for (const x of g) { if (!pays(x, mkt)) { run++; if (run > mx) mx = run; } else run = 0; }
    out[k] = mx;
  }
  let agora = 0;
  for (let i = gamesArr.length - 1; i >= 0; i--) { if (!pays(gamesArr[i], mkt)) agora++; else break; }
  out.agora = agora;
  return out;
}

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
    const horaJogo = (c.hora_base || cell.hora_base || "") + ":" + String(c.minuto || cell.minuto || "").padStart(2, "0");
    if (status === "futuro" || cell.futuro === true) {
      const o = cell.odds || {};
      futuros.push({
        ordem,
        nome,
        horario: horaJogo,
        casa: times.casa || "", fora: times.fora || "",
        odds: { o25: o.o25, o35: o.o35, ge5: o.ge5, ambs: o.ambs, u05: o.u05, u15: o.u15, u25: o.u25, o15: o.o15 }
      });
    } else if (ft && /^\d+-\d+$/.test(String(ft).trim())) {
      const m = String(ft).trim().match(/(\d+)-(\d+)/);
      const o = cell.odds || {};
      const ht = (cell.placar && cell.placar.ht) ? String(cell.placar.ht).trim() : "";
      passados.push({
        ordem, nome, a: +m[1], b: +m[2], total: +m[1] + +m[2],
        casa: times.casa || "", fora: times.fora || "", ht, horario: horaJogo,
        odds: { o25: o.o25, o35: o.o35, ge5: o.ge5, ambs: o.ambs, u05: o.u05, u15: o.u15, u25: o.u25, o15: o.o15 }
      });
    }
  }
  // ordena cronologicamente (mais antigo -> mais novo)
  passados.sort((x, y) => x.ordem - y.ordem);
  futuros.sort((x, y) => x.ordem - y.ordem);
  // os 2 jogos mais recentes ainda nao entram na curva do caramelo (validado: drop2)
  // e limita aos ~1200 jogos recentes: a curva (janela 20) e as stats usam os recentes,
  // e o historico cru pode passar de 4000 jogos (deixa o servidor lento sem necessidade).
  const mapa = g => ({
    nome: g.nome, a: g.a, b: g.b, total: g.total,
    casa: g.casa, fora: g.fora, ht: g.ht, horario: g.horario || "", odds: completaOdds(g.odds)
  });
  const games = passados.slice(0, -2).slice(-1200).map(mapa);
  // gamesAll: SEM o drop-2 (inclui os 2 jogos mais recentes) — usado SO pelo radar,
  // pra alertar no fechamento real (~6 min mais cedo). Grafico/analises seguem com drop-2.
  const gamesAll = passados.slice(-1200).map(mapa);
  const upcoming = futuros.slice(0, 6).map(u => ({
    nome: u.nome, horario: u.horario, casa: u.casa, fora: u.fora, odds: completaOdds(u.odds)
  }));
  console.log(`decodeSnapshot: ${passados.length} passados → ${games.length} games, ${futuros.length} futuros → ${upcoming.length} upcoming`);
  return { games, upcoming, gamesAll };
}

function aplicaSnapshot(liga, data) {
  try {
    const { games, upcoming, gamesAll } = decodeSnapshot(data);
    if (!games.length) return;
    const s = buildStore(liga, games, upcoming, new Date(data.atualizadoEm || Date.now()).toISOString());
    s.fonte = "ws";
    s.wsTs = Date.now();
    store[liga] = s;
    atualizaRadar(liga, s);
    atualizaRoboLedger();
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
    const { games, upcoming, gamesAll } = decodeSnapshot(data);
    if (!games.length) return res.status(400).json({ ok: false, erro: "zero jogos no snapshot" });
    const s = buildStore(liga, games, upcoming, new Date(data.atualizadoEm || Date.now()).toISOString());
    s.fonte = "ws";
    s.wsTs = Date.now();
    if (Array.isArray(curva)) liveCurves[liga + "|" + (mkt || "o35")] = { curva, mm1, mm2, topo, fundo, ts: Date.now() };
    store[liga] = s;
    atualizaRadar(liga, s);
    atualizaRoboLedger();
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
  // pagando em TEMPO REAL (sem o atraso de 2 jogos): o selo/zona operam com este;
  // o grafico continua com drop-2, fiel ao caramelo
  try {
    const gAllTR = d.gamesAll || d.games || [];
    if (gAllTR.length >= 2 && !analise.ehTotalGols) {
      const sfTR = chartSeries(gAllTR, mkt, Math.max(2, Math.min(20, gAllTR.length)));
      if (sfTR.length) analise.pagandoTempoReal = sfTR[sfTR.length - 1];
    }
  } catch (e) {}
  const tend = trendLines(analise.serie || []);
  analise = { ...analise, trend: tend };
  const _gM = d.gamesAll || d.games || [];
  const maximas = {};
  for (const _mm of ["o25", "o35", "ambas", "ge5"]) maximas[_mm] = maximasReds(_gM, _mm);

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
  // posicao REAL de cada time no rank do mercado escolhido (ULTIMAS 3 HORAS ~60 jogos,
  // ranking completo - retrato do agora, a pedido do usuario; minimo 2 jogos por time)
  let posTimes = null, posTotal = 0;
  if (mkt !== "totft") {
    try {
      const rkFull = teamRanking(d.games || [], mkt, 60, 2, 999);
      posTimes = {}; posTotal = rkFull.length;
      rkFull.forEach((t, i) => posTimes[t.time] = i + 1);
    } catch (e) {}
  }

  const proximos = ((d.upcoming && d.upcoming[mkt]) || []).map(p => {
    const anc = ancoras[p.nome];
    const base = anc ? { ...p, ancora: anc } : { ...p };
    base.placarProvavel = placarProvavel(d.games || [], p.casa, p.fora, p.nome);
    if (mkt !== "totft") base.coluna = colunaPct(d.gamesAll || d.games || [], p.horario, mkt);
    if (mkt !== "totft" && posTimes) { base.posCasa = posTimes[p.casa] || null; base.posFora = posTimes[p.fora] || null; base.posTotal = posTotal; }
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
    maximas,
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
      faixas: { forte_60mais: faixa(60, 999), media_30a59: faixa(30, 60), fraca_0a29: faixa(0, 30), negativa: faixa(-999, 0) },
      evPositivo: { n: evPos.length, green: evPos.filter(r => r.green).length, pct: evPos.length ? Math.round(evPos.filter(r => r.green).length / evPos.length * 100) : null },
      indicados: { n: indicados.length, green: indicados.filter(r => r.green).length, pct: indicados.length ? Math.round(indicados.filter(r => r.green).length / indicados.length * 100) : null },
      ultimos10indicados: indicados.slice(-10).map(r => ({ nome: r.nome, horario: r.horario, odd: r.odd, score: r.score, ev: r.ev, placar: r.placar, resultado: r.green ? "GREEN" : "RED" }))
    };
    btCache[key] = { ts: Date.now(), lu: d.lastUpdated, out };
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== RELATORIO POR DATA (diagnostico do regime diario; nao altera analises) =====
// Datas inferidas: os jogos vem em ordem cronologica so com hora; quando a hora "volta"
// (23:57 -> 00:01), e a virada do dia. Ancora: ultimo jogo = hoje (fuso de Sao Paulo).
// Acumula resumos por dia em memoria (zera em restart do Render).
const relAcum = {};
function horaMin(h) { const m = /^(\d{1,2}):(\d{1,2})/.exec(h || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function dataBR(diasAtras) { const d = new Date(Date.now() - diasAtras * 86400000); return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); }
app.get("/api/relatorio/:liga", (req, res) => {
  try {
    const liga = req.params.liga; const d = store[liga];
    if (!d || !d.games || !d.games.length) return res.json({ erro: "sem dados" });
    // separa os jogos em dias pela virada de horario (queda > 60min = novo dia)
    const dias = [[]];
    let prev = null;
    for (const g of d.games) {
      const t = horaMin(g.horario);
      if (prev != null && t != null && t < prev - 60 && dias[dias.length - 1].length) dias.push([]);
      if (t != null) prev = t;
      dias[dias.length - 1].push(g);
    }
    const resumo = (gs) => {
      const n = gs.length;
      const p = (mk) => Math.round(gs.filter(g => pays(g, mk)).length / n * 100);
      const per = (a, b) => {
        const s = gs.filter(g => { const t = horaMin(g.horario); return t != null && t >= a * 60 && t < b * 60; });
        return s.length ? { n: s.length, o35: Math.round(s.filter(g => pays(g, "o35")).length / s.length * 100) } : null;
      };
      return {
        jogos: n, o25: p("o25"), o35: p("o35"), ge5: p("ge5"), ambas: p("ambas"),
        mediaGols: +(gs.reduce((s, g) => s + (g.total || 0), 0) / n).toFixed(2),
        periodos: { madrugada: per(0, 6), manha: per(6, 12), tarde: per(12, 18), noite: per(18, 24) }
      };
    };
    relAcum[liga] = relAcum[liga] || {};
    const nDias = dias.length;
    dias.forEach((gs, i) => { if (gs.length) relAcum[liga][dataBR(nDias - 1 - i)] = resumo(gs); });
    // lista ordenada (mais recente primeiro) com delta vs dia anterior
    const ord = Object.keys(relAcum[liga]).sort((a, b) => {
      const pa = a.split("/").reverse().join(""), pb = b.split("/").reverse().join("");
      return pb.localeCompare(pa);
    });
    const lista = ord.map((data, i) => {
      const r = relAcum[liga][data]; const ant = relAcum[liga][ord[i + 1]];
      let delta = null;
      if (ant) { delta = {}; for (const k of ["o25", "o35", "ge5", "ambas"]) delta[k] = r[k] - ant[k]; }
      return { data, ...r, delta };
    });
    res.json({ liga, dias: lista, aviso: "datas inferidas pela virada de horário; acumulado zera quando o servidor reinicia" });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});


// ===== CADERNO DO ROBO: acompanha o resultado real de cada indicacao (saldo em unidades) =====
const ROBO_FILE = "robo.json";
let roboSha = null;
let roboLedger = { saldo: 0, ciclos: 0, greens: 0, redsCiclo: 0, aborts: 0, historico: [] };
let roboCiclo = null; // { liga, degrau, apostado, alvo:{h,jogo,odd,unidades}, iniciadoEm }
async function carregaRobo() {
  if (!GH_T) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ROBO_FILE}?ref=${GH_BRANCH}`, { headers: ghHead() });
    if (r.ok) { const j = await r.json(); roboSha = j.sha; const dados = JSON.parse(Buffer.from(j.content, "base64").toString()); if (dados && typeof dados.saldo === "number") { roboLedger = dados; roboCiclo = dados.cicloAberto || null; } }
  } catch (e) {}
  // ciclo antigo sem carimbo de hora (anterior ao anti-zumbi) = anulado ja no boot
  if (roboCiclo && roboCiclo.alvo && !roboCiclo.alvo.desde) {
    registraCiclo("DESCARTADO", 0, `${roboCiclo.liga} · ciclo antigo sem carimbo (pre-fix) anulado no boot`);
    roboCiclo = null;
  }
}
async function salvaRoboLedger() {
  if (!GH_T) return;
  try {
    const body = { message: "robo ledger", content: Buffer.from(JSON.stringify({ ...roboLedger, cicloAberto: roboCiclo }, null, 1)).toString("base64"), branch: GH_BRANCH };
    if (roboSha) body.sha = roboSha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ROBO_FILE}`, { method: "PUT", headers: { ...ghHead(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { const j = await r.json(); roboSha = j.content.sha; }
  } catch (e) {}
}
carregaRobo();
function registraCiclo(resultado, unidades, detalhe) {
  roboLedger.ciclos++;
  if (resultado === "GREEN") roboLedger.greens++; else if (resultado === "RED_CICLO") roboLedger.redsCiclo++; else if (resultado === "ABORT") roboLedger.aborts++; else roboLedger.descartes = (roboLedger.descartes || 0) + 1;
  roboLedger.saldo = Math.round((roboLedger.saldo + unidades) * 10) / 10;
  roboLedger.historico.unshift({ quando: new Date().toISOString(), resultado, unidades, detalhe });
  roboLedger.historico = roboLedger.historico.slice(0, 20);
  salvaRoboLedger();
}
// roda a cada snapshot: abre ciclo quando o robo montar entrada, resolve degraus quando jogos fecham
function atualizaRoboLedger() {
  try {
    const melhor = montaRobo();
    // sonda as vezes rotula snapshot com liga trocada: so aceita alvo cujo time da casa exista no historico da liga
    const pertenceALiga = (liga, jogo) => {
      const d2 = store[liga]; const g2 = (d2 && (d2.gamesAll || d2.games)) || [];
      const casa = (jogo || "").split(" x ")[0];
      return !!casa && g2.slice(-480).some(x => x.casa === casa);
    };
    if (!roboCiclo) {
      if (melhor && melhor.degraus && melhor.degraus[0] && pertenceALiga(melhor.liga, melhor.degraus[0].jogo)) {
        const d0 = melhor.degraus[0];
        roboCiclo = { liga: melhor.liga, degrau: 0, apostado: 0, alvo: { h: d0.h, jogo: d0.jogo, odd: d0.odd, unidades: 1, desde: Date.now() }, iniciadoEm: Date.now() };
        salvaRoboLedger();
      }
      return;
    }
    const d = store[roboCiclo.liga];
    if (!d) return;
    const gAll = d.gamesAll || d.games || [];
    // o alvo fechou? (procura nome+horario nos ~40 jogos mais recentes)
    if (roboCiclo.alvo) {
      // ANTI-ZUMBI: alvo sem resolucao ha 30+ min (reinicios, jogo sumiu da janela) = descarta o ciclo sem contabilizar
      if (!roboCiclo.alvo.desde || Date.now() - roboCiclo.alvo.desde > 15 * 60000) {
        registraCiclo("DESCARTADO", 0, `${roboCiclo.liga} · ${roboCiclo.alvo.jogo} — alvo sem fechamento em 15min (reinicio/liga trocada), anulado sem contar`);
        roboCiclo = null;
        return;
      }
      const cauda = gAll.slice(-60);
      let g = cauda.find(x => x.nome === roboCiclo.alvo.jogo && roboCiclo.alvo.h && x.horario === roboCiclo.alvo.h);
      if (!g) { const soNome = cauda.filter(x => x.nome === roboCiclo.alvo.jogo); if (soNome.length === 1) g = soNome[0]; }
      if (g) {
        if (pays(g, "o35")) {
          const lucro = Math.round((roboCiclo.alvo.unidades * roboCiclo.alvo.odd - (roboCiclo.apostado + roboCiclo.alvo.unidades)) * 10) / 10;
          roboLedger.consumidas = roboLedger.consumidas || {};
          roboLedger.consumidas[roboCiclo.liga] = true; // green consome a janela
          registraCiclo("GREEN", lucro, `${roboCiclo.liga} · ${roboCiclo.alvo.jogo} @${roboCiclo.alvo.odd} (degrau ${roboCiclo.degrau + 1})`);
          roboCiclo = null;
          return;
        }
        // RED no degrau
        roboCiclo.apostado += roboCiclo.alvo.unidades;
        roboCiclo.degrau++;
        roboCiclo.alvo = null;
        if (roboCiclo.degrau >= 3) {
          roboLedger.consumidas = roboLedger.consumidas || {};
          roboLedger.consumidas[roboCiclo.liga] = true; // ciclo perdido = sair da janela (nunca 4o tiro na mesma seca)
          registraCiclo("RED_CICLO", -roboCiclo.apostado, `${roboCiclo.liga} · ciclo perdido (3 tiros)`);
          roboCiclo = null;
          return;
        }
        salvaRoboLedger();
      }
    }
    // precisa de novo alvo (apos red): pega o proximo degrau EV+ do robo na MESMA liga
    if (!roboCiclo.alvo) {
      if (melhor && melhor.liga === roboCiclo.liga && melhor.degraus && melhor.degraus[0] && pertenceALiga(melhor.liga, melhor.degraus[0].jogo)) {
        const dn = melhor.degraus[0];
        roboCiclo.alvo = { h: dn.h, jogo: dn.jogo, odd: dn.odd, unidades: [1, 2, 4][roboCiclo.degrau], desde: Date.now() };
        salvaRoboLedger();
      } else if (!melhor || melhor.liga !== roboCiclo.liga) {
        // janela fechou sem alvo: aborta o ciclo (perde o que apostou)
        if (roboCiclo.apostado > 0) registraCiclo("ABORT", -roboCiclo.apostado, `${roboCiclo.liga} · janela fechou no meio do ciclo`);
        roboCiclo = null;
      }
    }
  } catch (e) {}
}

// ===== ROBO 2-GALE O3.5: quando ha zona azul no O3.5, monta a escada entrada->gale1->gale2 =====
function montaRobo() {
  const mkt = "o35";
  let melhor = null;
  for (const liga of Object.keys(store)) {
    const d = store[liga];
    if (!d || !d.games || d.games.length < 60) continue;
    const games = d.games;
    const base = games.filter(g => pays(g, mkt)).length / games.length * 100;
    if (!base) continue;
    const JR = Math.max(2, Math.min(20, games.length));
    const sf = chartSeries(games, mkt, JR);
    const cur = sf.length ? sf[sf.length - 1] : null;
    if (cur == null) continue;
    const rel = Math.round(cur / base * 100);
    // 1 CICLO POR JANELA: liga cujo mergulho ja foi operado (green ou ciclo perdido) fica
    // consumida ate re-armar (subir de 85% do normal) — igual ao chip do radar
    roboLedger.consumidas = roboLedger.consumidas || {};
    if (roboLedger.consumidas[liga]) {
      if (rel >= 85) { delete roboLedger.consumidas[liga]; salvaRoboLedger(); }
      else continue;
    }
    if (rel >= 60) continue; // robo so aparece com ZONA AZUL de verdade (<60% do normal)
    if (melhor && rel >= melhor.rel) continue;
    const evs = (d.upcoming && d.upcoming[mkt]) || [];
    const degraus = [], pulados = [];
    const papeis = ["ENTRADA", "GALE 1", "GALE 2"];
    // METODO v2.1: dentro da zona azul, piso de odd (>=3.60) E preferencia pelo MAIOR EV-
    // (celula medida: EV- durante a seca paga 29% vs base 21 no O3.5 — a casa certa + a mola)
    const cands = evs.map((p, i) => ({ ...p, _i: i })).filter(p => p.odd != null && p.ev != null);
    for (const p of cands) { if (p.odd < 3.6 && pulados.length < 4) pulados.push({ h: p.horario || "", jogo: p.nome, odd: p.odd, ev: p.ev }); }
    const validos = cands.filter(p => p.odd >= 3.6);
    let idxAnterior = -1;
    for (let dgi = 0; dgi < 3; dgi++) {
      const pool = validos.filter(p => p._i > idxAnterior);
      if (!pool.length) break;
      const p = pool.reduce((a, b) => (b.ev < a.ev ? b : a)); // maior EV- disponivel dali em diante
      idxAnterior = p._i;
      degraus.push({ papel: papeis[dgi], unidades: [1, 2, 4][dgi], h: p.horario || "", jogo: p.nome, odd: p.odd, justa: p.justa, ev: p.ev, evAlto: p.ev > 10, col: colunaPct(d.gamesAll || games, p.horario, mkt) });
    }
    melhor = { liga, rel, pagando: cur, base: Math.round(base * 10) / 10, degraus, pulados, teste: rel >= 60, taxas: taxaJanelas(d.gamesAll || games, mkt) };
  }
  return melhor;
}
app.get("/api/robo", (req, res) => {
  try {
    const melhor = montaRobo() || {};
    if (!melhor.liga && roboLedger.consumidas) {
      // alguma liga azul porem ja operada? comunica em vez de sumir
      for (const liga of Object.keys(roboLedger.consumidas)) {
        const d = store[liga]; if (!d || !d.games || d.games.length < 60) continue;
        const base = d.games.filter(g => pays(g, "o35")).length / d.games.length * 100; if (!base) continue;
        const sf = chartSeries(d.games, "o35", Math.max(2, Math.min(20, d.games.length)));
        const cur = sf.length ? sf[sf.length - 1] : null; if (cur == null) continue;
        const rel = Math.round(cur / base * 100);
        if (rel < 60) { melhor.consumida = { liga, rel }; break; }
      }
    }
    melhor.registro = { saldo: roboLedger.saldo, ciclos: roboLedger.ciclos, greens: roboLedger.greens, redsCiclo: roboLedger.redsCiclo, aborts: roboLedger.aborts, descartes: roboLedger.descartes || 0 };
    if (roboCiclo) melhor.cicloAndamento = { degrau: roboCiclo.degrau + 1, apostado: roboCiclo.apostado, esperando: roboCiclo.alvo ? `${roboCiclo.alvo.h || ""} ${roboCiclo.alvo.jogo}`.trim() : "proximo degrau com odd no piso" };
    if (req.query.debug) { melhor.dbgCiclo = roboCiclo; melhor.dbgHistorico = roboLedger.historico.slice(0, 6); }
    res.json(melhor);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== DICAS: 3 melhores do quadro (todas as ligas) para o mercado, com carimbo honesto =====
const dicasCache = {};
app.get("/api/dicas", (req, res) => {
  try {
    const mkt = req.query.mkt || "o35";
    if (mkt === "totft") return res.json([]);
    const now = Date.now();
    if (dicasCache[mkt] && now - dicasCache[mkt].ts < 15000) return res.json(dicasCache[mkt].out);
    const tudo = [];
    for (const liga of Object.keys(store)) {
      const d = store[liga];
      if (!d || !d.games || d.games.length < 60) continue;
      const games = d.games;
      const base = games.filter(g => pays(g, mkt)).length / games.length * 100;
      if (!base) continue;
      const JR = Math.max(2, Math.min(20, games.length));
      const sf = chartSeries(games, mkt, JR);
      const cur = sf.length ? sf[sf.length - 1] : null;
      if (cur == null) continue;
      const rel = Math.round(cur / base * 100);
      const evs = (d.upcoming && d.upcoming[mkt]) || []; // avaliacoes prontas no store (aninhadas em upcoming)
      if (!Array.isArray(evs) || !evs.length) continue;
      // rank da rodada dentro da liga (1o = maior score)
      const porScore = evs.filter(p => p.score != null).slice().sort((a, b) => b.score - a.score);
      const rankDe = {}; porScore.forEach((p, i) => rankDe[p.nome] = i + 1);
      for (const p of evs) {
        if (p.odd == null || p.ev == null) continue;
        const rank = rankDe[p.nome] || null;
        const anc = d.ancoras && d.ancoras[p.nome] ? (d.ancoras[p.nome].nivel || "SIM") : null;
        const veto = /CONTRA|TOPO/i.test(p.motivo || "");
        // METODO v2: preco = PISO DE ODD da zona (chances reais medidas: O3.5 31% -> odd>=3.60; O2.5 54% -> odd>=2.00)
        const piso = ({ o35: 3.6, o25: 2.0 })[mkt] || null;
        const oddOk = !!(piso && p.odd >= piso);
        const evAlto = p.ev > 10; // historicamente decepciona: a casa costuma estar certa
        const grade = (rel < 60 && oddOk) ? "entrada" : (rel < 60 || (rel < 75 && oddOk)) ? "observar" : "aguardar";
        const nota = (100 - rel) * 2 + (oddOk ? 10 : 0) - (evAlto ? 8 : 0) + (rank === 1 ? 12 : rank === 2 ? 6 : 0) + (anc ? 8 : 0) - (veto ? 10 : 0);
        tudo.push({ liga, rel, pagando: cur, base: Math.round(base * 10) / 10, h: p.horario || "", jogo: p.nome, odd: p.odd, justa: p.justa, ev: p.ev, evAlto, piso, oddOk, rank, anc, veto, grade, nota, col: colunaPct(d.gamesAll || games, p.horario, mkt) });
      }
    }
    tudo.sort((a, b) => b.nota - a.nota);
    const out = tudo.slice(0, 3).map(({ nota, ...r }) => r);
    if (req.query.debug) {
      const dbg = { v: 3, ligasNoStore: Object.keys(store), porLiga: {} };
      // chaves de odds reais (pra descobrir se casa5+/fora5+ chegam no snapshot)
      const dLiga = store[Object.keys(store)[0]];
      if (dLiga) {
        const gU = (dLiga.upcomingRaw || [])[0];
        const gP = (dLiga.games || [])[dLiga.games.length - 1];
        dbg.oddsKeysUpcoming = gU && gU.odds ? Object.keys(gU.odds) : null;
        dbg.oddsKeysPassado = gP && gP.odds ? Object.keys(gP.odds) : null;
      }
      for (const liga of Object.keys(store)) {
        const d = store[liga];
        const evs = (d && d.upcoming && d.upcoming[mkt]) || [];
        dbg.porLiga[liga] = { nGames: d && d.games ? d.games.length : 0, tipoDmkt: typeof (d && d.upcoming && d.upcoming[mkt]), nEvs: Array.isArray(evs) ? evs.length : -1,
          chavesPrimeiro: Array.isArray(evs) && evs[0] ? Object.keys(evs[0]).slice(0, 14) : null };
      }
      return res.json(dbg);
    }
    dicasCache[mkt] = { ts: now, out };
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO DO PULO: P(pagar | seca atual do mercado) + distribuicao dos saltos entre greens =====
app.get("/api/estudopulo/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o35";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 300) return res.json({ erro: "historico insuficiente" });
    const games = d.gamesAll || d.games;
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10;
    // P(pagar | seca atual = k) e histograma dos pulos realizados
    const porSeca = {}; // k -> [n, pagou]
    const pulos = {};   // tamanho do salto -> vezes
    let seca = null;
    for (const g of games) {
      const pagou = pays(g, mkt);
      if (seca != null) {
        const k = seca >= 10 ? "10+" : String(seca);
        porSeca[k] = porSeca[k] || [0, 0]; porSeca[k][0]++; if (pagou) porSeca[k][1]++;
      }
      if (pagou) { if (seca != null) { const p = seca >= 12 ? "12+" : String(seca); pulos[p] = (pulos[p] || 0) + 1; } seca = 0; }
      else if (seca != null) seca++;
      else seca = pagou ? 0 : null;
      if (seca == null && !pagou) seca = 1;
    }
    const ps = {}; const ordem = ["0","1","2","3","4","5","6","7","8","9","10+"];
    for (const k of ordem) if (porSeca[k]) ps[k] = { jogos: porSeca[k][0], pagou: Math.round(porSeca[k][1] / porSeca[k][0] * 100) };
    res.json({ liga, mkt, base, P_pagar_dado_seca: ps, distribuicao_pulos: pulos });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ACUMULADOR DIARIO POR FAIXA DE HORA (persistente): responde se existe ciclo diario =====
const HORAS_FILE = "horas.json";
let horasSha = null;
let horasData = {};
async function carregaHoras() {
  if (!GH_T) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${HORAS_FILE}?ref=${GH_BRANCH}`, { headers: ghHead() });
    if (r.ok) { const j = await r.json(); horasSha = j.sha; horasData = JSON.parse(Buffer.from(j.content, "base64").toString()) || {}; }
  } catch (e) {}
}
async function salvaHoras() {
  if (!GH_T) return;
  try {
    const body = { message: "horas", content: Buffer.from(JSON.stringify(horasData)).toString("base64"), branch: GH_BRANCH };
    if (horasSha) body.sha = horasSha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${HORAS_FILE}`, { method: "PUT", headers: { ...ghHead(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { const j = await r.json(); horasSha = j.content.sha; }
  } catch (e) {}
}
carregaHoras();
function acumulaHoras() {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const agrupa = {};
    for (const liga of Object.keys(store)) {
      const d = store[liga]; const gAll = (d && d.gamesAll) || []; if (!gAll.length) continue;
      // separa os segmentos pela virada do dia (hora despenca: 23:xx -> 00:xx)
      const seg = [[]];
      for (const g of gAll) {
        const h = parseInt((g.horario || "").split(":")[0]); if (isNaN(h)) continue;
        const atual = seg[seg.length - 1];
        if (atual.length) { const hp = parseInt((atual[atual.length - 1].horario || "").split(":")[0]); if (h < hp - 12) seg.push([]); }
        seg[seg.length - 1].push(g);
      }
      const segs = seg.slice(-2);
      const datas = segs.length === 2 ? [ontem, hoje] : [hoje];
      segs.forEach((sg, ix) => {
        const data = datas[ix]; agrupa[data] = agrupa[data] || {};
        for (const mkt of ["o25", "o35", "ambas", "ge5"]) {
          const m = agrupa[data][mkt] = agrupa[data][mkt] || { "00-07": [0, 0], "07-12": [0, 0], "12-18": [0, 0], "18-24": [0, 0] };
          for (const g of sg) {
            const h = parseInt((g.horario || "").split(":")[0]); if (isNaN(h)) continue;
            const f = h < 7 ? "00-07" : h < 12 ? "07-12" : h < 18 ? "12-18" : "18-24";
            m[f][0]++; if (pays(g, mkt)) m[f][1]++;
          }
        }
      });
    }
    for (const [data, v] of Object.entries(agrupa)) horasData[data] = v; // sobrescreve: idempotente, sem dupla contagem
    salvaHoras();
  } catch (e) {}
}
setTimeout(acumulaHoras, 4 * 60000);
setInterval(acumulaHoras, 30 * 60000);
app.get("/api/horas", (req, res) => {
  try {
    const tot = {};
    for (const dia of Object.values(horasData)) for (const [mkt, fx] of Object.entries(dia)) for (const [f, [n, h]] of Object.entries(fx)) { (tot[mkt] = tot[mkt] || {}); (tot[mkt][f] = tot[mkt][f] || [0, 0]); tot[mkt][f][0] += n; tot[mkt][f][1] += h; }
    const fmt = {};
    for (const [mkt, fx] of Object.entries(tot)) { fmt[mkt] = {}; for (const [f, [n, h]] of Object.entries(fx)) fmt[mkt][f] = { jogos: n, pagou: n ? Math.round(h / n * 100) : null }; }
    res.json({ diasAcumulados: Object.keys(horasData).sort(), total: fmt });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO HORA DO DIA: pagamento por faixa de hora (hipotese: madrugada paga mais, manha menos) =====
app.get("/api/estudohora/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o25";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 200) return res.json({ erro: "historico insuficiente" });
    const games = d.gamesAll || d.games;
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10;
    const faixas = { "00-07": [0, 0], "07-12": [0, 0], "12-18": [0, 0], "18-24": [0, 0] };
    const porHora = {};
    for (const g of games) {
      const h = parseInt((g.horario || "").split(":")[0]);
      if (isNaN(h)) continue;
      const f = h < 7 ? "00-07" : h < 12 ? "07-12" : h < 18 ? "12-18" : "18-24";
      faixas[f][0]++; const pagou = pays(g, mkt); if (pagou) faixas[f][1]++;
      const hh = String(h).padStart(2, "0");
      porHora[hh] = porHora[hh] || [0, 0]; porHora[hh][0]++; if (pagou) porHora[hh][1]++;
    }
    const fmt = o => { const r = {}; for (const [k, [n, h]] of Object.entries(o)) r[k] = { jogos: n, pagou: n ? Math.round(h / n * 100) : null }; return r; };
    res.json({ liga, mkt, base, faixasHora: fmt(faixas), porHora: fmt(porHora) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO ANCORA: jogos com ancora pagam acima da base? (afirmacao do usuario) =====
app.get("/api/estudoancora/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o35";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 300) return res.json({ erro: "historico insuficiente" });
    const games = d.games;
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10;
    let comN = 0, comH = 0, forteN = 0, forteH = 0, semN = 0, semH = 0;
    const ini = Math.max(200, games.length - 150);
    for (let i = ini; i < games.length; i++) {
      const g = games[i];
      const hist = games.slice(0, i);
      let anc = null;
      try { anc = avaliaAncora({ nome: g.nome, casa: g.casa, fora: g.fora, odds: g.odds || {} }, anchorStats(hist), bigPlacarStats(hist)); } catch (e) {}
      const pagou = pays(g, mkt);
      if (anc) { comN++; if (pagou) comH++; if (String(anc.nivel || "").includes("FORTE")) { forteN++; if (pagou) forteH++; } }
      else { semN++; if (pagou) semH++; }
    }
    const pc = (h, n) => n ? Math.round(h / n * 100) : null;
    res.json({ liga, mkt, base,
      comAncora: { jogos: comN, pagou: pc(comH, comN) },
      ancoraFORTE: { jogos: forteN, pagou: pc(forteH, forteN) },
      semAncora: { jogos: semN, pagou: pc(semH, semN) } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO COLUNA + FAIXAS DE EV (hipoteses do usuario) =====
app.get("/api/estudocol/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o25";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 300) return res.json({ erro: "historico insuficiente" });
    const games = d.games;
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10;
    // --- taxa da coluna ANTES de cada jogo (12 ocorrencias anteriores do mesmo minuto) ---
    const porMin = {};
    const colAntes = new Array(games.length).fill(null);
    for (let i = 0; i < games.length; i++) {
      const h = games[i].horario || ""; const min = h.includes(":") ? h.split(":")[1] : null;
      if (!min) continue;
      const arr = porMin[min] || (porMin[min] = []);
      if (arr.length >= 4) colAntes[i] = Math.round(arr.slice(-12).reduce((a, b) => a + b, 0) / Math.min(12, arr.length) * 100);
      arr.push(pays(games[i], mkt) ? 1 : 0);
    }
    // TESTE 2: green em coluna FRACA (<=33%) -> proximo jogo paga mais?
    let fracaN = 0, fracaH = 0, gAnyN = 0, gAnyH = 0;
    for (let i = 0; i < games.length - 1; i++) {
      if (!pays(games[i], mkt)) continue;
      gAnyN++; if (pays(games[i + 1], mkt)) gAnyH++;
      if (colAntes[i] != null && colAntes[i] <= 33) { fracaN++; if (pays(games[i + 1], mkt)) fracaH++; }
    }
    // e o proximo jogo de coluna FORTE (>=50) em ate 3 apos o green na fraca
    let ffN = 0, ffH = 0;
    for (let i = 0; i < games.length - 3; i++) {
      if (!pays(games[i], mkt) || colAntes[i] == null || colAntes[i] > 33) continue;
      for (let j = i + 1; j <= i + 3 && j < games.length; j++) {
        if (colAntes[j] != null && colAntes[j] >= 50) { ffN++; if (pays(games[j], mkt)) ffH++; break; }
      }
    }
    // TESTE 1: faixas de EV (ultimos 140 jogos com odd) + CRUZADO com o estado da liga
    const JANx = Math.max(10, Math.min(120, parseInt(req.query.jan) || 20)); // janela da zona (20=1h, 60=3h)
    const serieX = chartSeries(games, mkt, JANx); // ponto k <-> jogo k+19
    const relAntes = i => { const k = i - JANx; return (k >= 0 && k < serieX.length && base) ? serieX[k] / base * 100 : null; };
    const faixas = { "EV>+10": [0, 0], "EV_0_a_+10": [0, 0], "EV_-10_a_0": [0, 0], "EV<-10": [0, 0] };
    const cruz = { EVpos_ligaPagante: [0, 0], EVpos_ligaMaxima: [0, 0], EVneg_ligaPagante: [0, 0], EVneg_ligaMaxima: [0, 0] };
    const ini = Math.max(150, games.length - 140);
    for (let i = ini; i < games.length; i++) {
      const g = games[i]; if (!g.odds || g.odds[oddKey(mkt)] == null) continue;
      let ev = null;
      try { ev = (fullEvalUpcoming([{ nome: g.nome, horario: "", casa: g.casa, fora: g.fora, odds: g.odds }], games.slice(0, i).slice(-400), mkt)[0] || {}).ev; } catch (e) {}
      if (ev == null) continue;
      const f = ev > 10 ? "EV>+10" : ev > 0 ? "EV_0_a_+10" : ev > -10 ? "EV_-10_a_0" : "EV<-10";
      faixas[f][0]++; const pagou = pays(g, mkt); if (pagou) faixas[f][1]++;
      const r = relAntes(i);
      if (r != null) {
        const estado = r >= 100 ? "ligaPagante" : r < 70 ? "ligaMaxima" : null; // pagante x abrindo maxima
        if (estado) { const ch = (ev > 0 ? "EVpos_" : "EVneg_") + estado; cruz[ch][0]++; if (pagou) cruz[ch][1]++; }
      }
    }
    const fx = {}; for (const [k, [n, h]] of Object.entries(faixas)) fx[k] = { jogos: n, pagou: n ? Math.round(h / n * 100) : null };
    const cz = {}; for (const [k, [n, h]] of Object.entries(cruz)) cz[k] = { jogos: n, pagou: n ? Math.round(h / n * 100) : null };
    // PROFUNDIDADE DA ZONA: o proximo jogo paga quanto conforme o quao fundo a liga esta?
    const prof = { "<40": [0, 0], "40-60": [0, 0], "60-85": [0, 0], "85-115": [0, 0], ">115": [0, 0] };
    for (let i = JANx; i < games.length; i++) {
      const r = relAntes(i); if (r == null) continue;
      const b2 = r < 40 ? "<40" : r < 60 ? "40-60" : r < 85 ? "60-85" : r <= 115 ? "85-115" : ">115";
      prof[b2][0]++; if (pays(games[i], mkt)) prof[b2][1]++;
    }
    const pf = {}; for (const [k, [n, h]] of Object.entries(prof)) pf[k] = { jogos: n, pagou: n ? Math.round(h / n * 100) : null };
    res.json({ liga, mkt, base,
      teste_EV_por_faixa: fx,
      cruzado_EV_x_estado: cz,
      porProfundidade: pf,
      teste_coluna: {
        aposGreen_qualquer: { n: gAnyN, proximoPagou: gAnyN ? Math.round(gAnyH / gAnyN * 100) : null },
        aposGreen_em_coluna_fraca: { n: fracaN, proximoPagou: fracaN ? Math.round(fracaH / fracaN * 100) : null },
        greenFraca_entao_colunaForte_em3: { n: ffN, pagou: ffN ? Math.round(ffH / ffN * 100) : null }
      } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO MAXIMAS (metrica do usuario): frequencia de pulo de 3+/4+ REDs por zona =====
app.get("/api/maximas/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o25";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 300) return res.json({ erro: "historico insuficiente" });
    const games = d.games;
    const base = games.filter(g => pays(g, mkt)).length / games.length * 100;
    const JAN = 20;
    const serieF = chartSeries(games, mkt, JAN); // ponto k <-> jogo k+JAN-1
    const zonas = { fria_menor60: [0,0,0], media_60a115: [0,0,0], alta_maior115: [0,0,0] }; // [n, maxima3, maxima4]
    for (let k = 0; k < serieF.length; k++) {
      const gi = k + JAN - 1;
      if (gi + 4 >= games.length) break;
      const rel = serieF[k] / base * 100;
      const z = rel < 60 ? "fria_menor60" : rel <= 115 ? "media_60a115" : "alta_maior115";
      const r1 = !pays(games[gi+1], mkt), r2 = !pays(games[gi+2], mkt), r3 = !pays(games[gi+3], mkt), r4 = !pays(games[gi+4], mkt);
      zonas[z][0]++;
      if (r1 && r2 && r3) zonas[z][1]++;
      if (r1 && r2 && r3 && r4) zonas[z][2]++;
    }
    const out = {};
    for (const [z, [n, m3, m4]] of Object.entries(zonas))
      out[z] = { momentos: n, pulou3casas: n ? Math.round(m3/n*1000)/10 : null, pulou4casas: n ? Math.round(m4/n*1000)/10 : null };
    // frequencia geral de maximas >=3 na liga (pra ranquear "ligas que abrem maxima toda linha")
    let runs3 = 0, i = 0;
    while (i < games.length) {
      if (!pays(games[i], mkt)) { let j = i; while (j < games.length && !pays(games[j], mkt)) j++; if (j - i >= 3) runs3++; i = j; }
      else i++;
    }
    res.json({ liga, mkt, base: Math.round(base*10)/10, porZona: out, maximas3_por100jogos: Math.round(runs3 / games.length * 1000) / 10 });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO 3H (tese do usuario): bloco de 3h bom -> o proximo bloco continua bom? =====
app.get("/api/estudo3h/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o25";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 300) return res.json({ erro: "historico insuficiente" });
    const games = d.games, TAM = 60; // ~3h de liga
    const blocos = [];
    for (let i = 0; i + TAM <= games.length; i += TAM) {
      const b = games.slice(i, i + TAM);
      blocos.push(Math.round(b.filter(g => pays(g, mkt)).length / TAM * 1000) / 10);
    }
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 1000) / 10;
    // transicoes: bloco ALTO (>= base) -> proximo bloco foi o que?
    let aa = 0, ab = 0, ba = 0, bb = 0; const prox = { altoDepois: [], baixoDepois: [] };
    for (let i = 0; i + 1 < blocos.length; i++) {
      const alto = blocos[i] >= base, proxAlto = blocos[i + 1] >= base;
      if (alto) { prox.altoDepois.push(blocos[i + 1]); proxAlto ? aa++ : ab++; }
      else { prox.baixoDepois.push(blocos[i + 1]); proxAlto ? ba++ : bb++; }
    }
    const med = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
    res.json({ liga, mkt, base, blocos,
      aposBlocoALTO: { n: aa + ab, continuouAlto: aa, caiu: ab, taxaMediaDoProximo: med(prox.altoDepois) },
      aposBlocoBAIXO: { n: ba + bb, subiu: ba, continuouBaixo: bb, taxaMediaDoProximo: med(prox.baixoDepois) } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESTUDO: tempo ate pagar apos cada sinal + temperatura da liga (leitura, nao altera nada) =====
const estudoCache = {};
app.get("/api/estudo/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o35";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 250) return res.json({ erro: "historico insuficiente" });
    const key = liga + "|" + mkt;
    if (estudoCache[key] && Date.now() - estudoCache[key].ts < 120000 && estudoCache[key].lu === d.lastUpdated) return res.json(estudoCache[key].out);
    const games = d.games;
    const baseG = games.filter(g => pays(g, mkt)).length / games.length;
    const basePct = Math.round(baseG * 1000) / 10;
    const JAN = Math.max(2, Math.min(20, games.length));
    const serieF = chartSeries(games, mkt, JAN); // ponto k <-> jogo k+JAN-1
    // distancia (em jogos) ate o primeiro pagamento a partir de gi+1
    const distPagar = gi => { for (let j = gi + 1; j < games.length; j++) { if (pays(games[j], mkt)) return j - gi; } return null; };
    const mede = idxs => {
      const ds = idxs.map(distPagar).filter(x => x != null);
      if (!ds.length) return { eventos: idxs.length, mediaJogos: null };
      const media = ds.reduce((a, b) => a + b, 0) / ds.length;
      const em3 = ds.filter(x => x <= 3).length / ds.length;
      return { eventos: idxs.length, mediaJogos: +media.toFixed(1), mediaMin: Math.round(media * 3), pagouEm3: Math.round(em3 * 100) };
    };
    // REGUA: a partir de um jogo QUALQUER (todos os pontos com folga de futuro)
    const todos = []; for (let gi = JAN; gi < games.length - 30; gi++) todos.push(gi);
    const regua = mede(todos);
    // eventos por sinal (replay das MESMAS regras do radar, na serie com drop igual analise)
    const evMin = [], evSub = [], evLtb = [];
    let stM = false, stS = false, ultLtb = -99;
    for (let k = 6; k < serieF.length - 1; k++) {
      const gi = k + JAN - 1; if (gi >= games.length - 1) break;
      const cur = serieF[k], antes = serieF[k - 5];
      const fundo = cur <= basePct * 0.7;
      const sobe = (cur - antes) >= 10 && cur <= basePct * 1.2;
      if (fundo && !stM) evMin.push(gi);
      if (sobe && !stS) evSub.push(gi);
      stM = fundo ? (cur < basePct * 0.85) : false;
      stS = sobe;
      if (k >= 25 && k - ultLtb >= 3) {
        try {
          const t = trendLines(serieF.slice(Math.max(0, k - 19), k + 1));
          if (t && t.rompimento && t.rompimento.tipo === "ROMPEU_LTB_CIMA") { evLtb.push(gi); ultLtb = k; }
        } catch (e) {}
      }
    }
    // EV+ (indicados: score>=30 e EV>0) — mede se O PROPRIO jogo pagou e, se nao, ate pagar
    const evPosIdx = []; let evPosGreen = 0;
    const ini = Math.max(150, games.length - 100);
    for (let i = ini; i < games.length - 1; i++) {
      const g = games[i]; if (!g.odds || !g.odds[oddKey(mkt)]) continue;
      const ev = fullEvalUpcoming([{ nome: g.nome, horario: "", casa: g.casa, fora: g.fora, odds: g.odds }], games.slice(0, i).slice(-400), mkt)[0] || {};
      if (ev.score != null && ev.score >= 30 && ev.ev > 0) { evPosIdx.push(i - 1); if (pays(g, mkt)) evPosGreen++; }
    }
    // temperatura: taxa da janela (relativa a base) x pagamento do proximo jogo
    const buckets = { "muito_fria_<60%": [0, 0], "fria_60-85%": [0, 0], "normal_85-115%": [0, 0], "quente_115-140%": [0, 0], "muito_quente_>140%": [0, 0] };
    for (let k = 0; k < serieF.length - 1; k++) {
      const gi = k + JAN - 1; if (gi + 1 >= games.length) break;
      const rel = serieF[k] / basePct;
      const b = rel < 0.6 ? "muito_fria_<60%" : rel < 0.85 ? "fria_60-85%" : rel < 1.15 ? "normal_85-115%" : rel < 1.4 ? "quente_115-140%" : "muito_quente_>140%";
      buckets[b][0]++; if (pays(games[gi + 1], mkt)) buckets[b][1]++;
    }
    const temperatura = {};
    for (const [b, [n, hit]] of Object.entries(buckets)) temperatura[b] = { jogos: n, proximoPagou: n ? Math.round(hit / n * 100) : null };
    // APOS PAGAR: o mercado emenda ou segura? (memoria serial)
    let ppN=0,ppH=0,pnN=0,pnH=0;
    for (let i = 1; i < games.length - 1; i++) {
      const prev = pays(games[i], mkt), nx = pays(games[i + 1], mkt);
      if (prev) { ppN++; if (nx) ppH++; } else { pnN++; if (nx) pnH++; }
    }
    // 1o pagamento que ENCERRA a seca fria (janela <60% do normal): o seguinte emenda?
    let frioN=0,frioH=0,frio2H=0;
    for (let k = 0; k < serieF.length - 2; k++) {
      const gi = k + JAN - 1; if (gi + 2 >= games.length) break;
      if (serieF[k] < basePct * 0.6 && pays(games[gi + 1], mkt)) { // seca fria + veio o 1o green
        frioN++;
        if (pays(games[gi + 2], mkt)) frioH++;
        if (pays(games[gi + 2], mkt) || pays(games[gi + 3], mkt)) frio2H++;
      }
    }
    const aposPagamento = {
      seguinte_apos_GREEN: ppN ? Math.round(ppH / ppN * 100) : null,
      seguinte_apos_RED: pnN ? Math.round(pnH / pnN * 100) : null,
      amostras: { aposGreen: ppN, aposRed: pnN },
      primeiroGreen_da_seca_fria: { eventos: frioN,
        seguinte_pagou: frioN ? Math.round(frioH / frioN * 100) : null,
        pagou_em_2: frioN ? Math.round(frio2H / frioN * 100) : null }
    };
    const out = { liga, mkt, base: basePct, aposPagamento,
      regua_sem_sinal: regua,
      minima: mede(evMin), subida: mede(evSub), quebraLTB: mede(evLtb),
      evPositivo: { eventos: evPosIdx.length, oProprioJogoPagou: evPosIdx.length ? Math.round(evPosGreen / evPosIdx.length * 100) : null, ...mede(evPosIdx) },
      temperatura };
    estudoCache[key] = { ts: Date.now(), lu: d.lastUpdated, out };
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// MEDICAO: o que aconteceu historicamente APOS cada quebra de LTB pra cima?
app.get("/api/ltbtest/:liga", (req, res) => {
  try {
    const liga = req.params.liga, mkt = req.query.mkt || "o35";
    const d = store[liga];
    if (!d || !d.games || d.games.length < 200) return res.json({ erro: "historico insuficiente" });
    const games = d.games;
    const JAN = Math.max(2, Math.min(20, games.length));
    const serieFull = chartSeries(games, mkt, JAN); // ponto k <-> jogo k+JAN-1
    const eventos = []; let ultI = -99;
    for (let i = 25; i <= serieFull.length; i++) {
      const win = serieFull.slice(Math.max(0, i - 20), i);
      let r = null;
      try { const t = trendLines(win); r = t && t.rompimento; } catch (e) {}
      if (r && r.tipo === "ROMPEU_LTB_CIMA" && i - ultI >= 3) {
        ultI = i;
        const gi = (i - 1) + JAN - 1;
        const nx = games[gi + 1], nx3 = games.slice(gi + 1, gi + 4);
        if (nx) eventos.push({ hora: games[gi].horario || "", prox: pays(nx, mkt), em3: nx3.some(g => pays(g, mkt)) });
      }
    }
    const base = Math.round(games.filter(g => pays(g, mkt)).length / games.length * 100);
    const pc = (arr, f) => arr.length ? Math.round(arr.filter(f).length / arr.length * 100) : null;
    res.json({ liga, mkt, base, quebras: eventos.length,
      pagouProximoJogo: pc(eventos, e => e.prox),
      pagouEmAte3Jogos: pc(eventos, e => e.em3),
      ultimas5: eventos.slice(-5) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ===== RADAR GLOBAL: minima/subida em TODAS as ligas+mercados (nao altera analises) =====
// Le o sinal ja calculado em s.computed (zero recalculo). Na TRANSICAO (entrou no fundo /
// virou subida) manda aviso via SSE com liga+mercado; quando a condicao acaba, sai do painel.
const RADAR_MKTS = ["o25", "o35", "ge5", "ambas"]; // unders FORA do radar/FIGHT por decisao do usuario (so consulta)
const radarEstado = {}; // liga|mkt -> {fundo, sobe}
const radarAtivos = {}; // liga|mkt|tipo -> info (painel do momento)
const radarUltimoAviso = {}; // liga|mkt|tipo -> ts (nao repete o mesmo aviso em <30min)
function podeAvisar(chave) {
  const ag = Date.now();
  const tregua = chave.endsWith("|minima") ? 60 * 60000 : 30 * 60000; // FIGHT: no maximo 1 por combo por hora
  if (radarUltimoAviso[chave] && ag - radarUltimoAviso[chave] < tregua) return false;
  radarUltimoAviso[chave] = ag; return true;
}
function atualizaRadar(liga, s) {
  try {
    for (const mkt of RADAR_MKTS) {
      const c = s.computed && s.computed[mkt]; if (!c || !c.sinal) continue;
      // RADAR SEM DROP-2: usa gamesAll (inclui os 2 jogos mais recentes) — alerta no
      // fechamento real do jogo. Grafico/analises continuam com drop-2 (fieis ao caramelo).
      const gAll = s.gamesAll || s.games || [];
      const JANR = Math.max(2, Math.min(20, gAll.length));
      const serie = gAll.length ? chartSeries(gAll, mkt, JANR).slice(-20) : (c.serie || []);
      const cur = serie.length ? serie[serie.length - 1] : null; // taxa atual (ultimo ponto, sem drop)
      const fita = gAll.slice(-6).map(g => pays(g, mkt) ? 1 : 0); // jogo a jogo (ultimos 6, sem drop)
      const k = liga + "|" + mkt;
      const prev = radarEstado[k] || {};
      // ZONA DE OPERACAO (estudo): minima = pagando <=60% do normal (janela dos ~31%).
      // Desarma no 1o GREEN (o edge cai apos o 1o pagamento — medido) e re-arma so apos
      // novo jogo sem pagar ainda na zona. Histerese de saida: >=85% do normal.
      const ultimoPagou = gAll.length ? pays(gAll[gAll.length - 1], mkt) : false;
      // mercados de base pequena (<15%, ex: 5+ gols) ficam FORA da minima: a janela de 20
      // jogos pula dezenas de pontos com 1 jogo — "<60%" ali e ruido, nao seca
      const fundo = cur != null && c.base != null && c.base >= 15 && !ultimoPagou &&
        (prev.fundo ? cur < c.base * 0.85 : cur <= c.base * 0.6);
      // SUBIDA SIMPLES: taxa subiu >=10 pontos nos ultimos 5 jogos (movimento real) e ainda
      // nao passou muito do normal (<=120%; chegar depois disso e atrasado).
      // Histerese: permanece enquanto o ganho nao morrer (>=3 pontos) e nao esticar (<=135%).
      const antes = serie.length >= 6 ? serie[serie.length - 6] : null;
      const ganho = (cur != null && antes != null) ? cur - antes : null;
      const sobe = ganho != null && c.base != null &&
        (prev.sobe ? (ganho >= 3 && cur <= c.base * 1.35) : (ganho >= 10 && cur <= c.base * 1.2));
      const primeira = !(k in radarEstado); // 1a leitura apos ligar: registra SEM avisar (mata a enxurrada pos-restart)
      if (fundo && !prev.fundo) {
        radarAtivos[k + "|minima"] = { liga, mkt, tipo: "minima", pagando: cur, base: c.base, rel: c.base ? Math.round(cur / c.base * 100) : null, fita, ts: Date.now() };
        if (!primeira && podeAvisar(k + "|minima")) avisaRadar(radarAtivos[k + "|minima"]);
      } else if (!fundo) delete radarAtivos[k + "|minima"];
      if (sobe && !prev.sobe) {
        radarAtivos[k + "|subida"] = { liga, mkt, tipo: "subida", pagando: cur, deOnde: antes, base: c.base, fita, ts: Date.now() };
        if (!primeira && podeAvisar(k + "|subida")) avisaRadar(radarAtivos[k + "|subida"]);
      } else if (!sobe) delete radarAtivos[k + "|subida"];
      // 💥 QUEBRA DE LTB pra cima (detector oficial do grafico, na serie SEM drop-2)
      let quebrouLTB = false;
      try { const t = trendLines(serie); quebrouLTB = !!(t && t.rompimento && t.rompimento.tipo === "ROMPEU_LTB_CIMA"); } catch (e) {}
      if (quebrouLTB && !prev.ltb) {
        radarAtivos[k + "|ltb"] = { liga, mkt, tipo: "ltb", pagando: cur, base: c.base, fita, ts: Date.now() };
        if (!primeira && podeAvisar(k + "|ltb")) avisaRadar(radarAtivos[k + "|ltb"]);
      } else if (!quebrouLTB) delete radarAtivos[k + "|ltb"];
      radarEstado[k] = { fundo, sobe, ltb: quebrouLTB };
    }
  } catch (e) {}
}

// ===== WEB PUSH: alerta de ZONA DE OPERACAO direto no sistema (funciona com aba congelada/fechada) =====
const PUSH_FILE = "push.json";
let pushSha = null;
let pushData = { vapid: null, subs: [] };
const NOMES_L = { copa: "Copa do Mundo", euro: "Euro Cup", super: "Super Léague", premier: "Premiership" };
const NOMES_M = { o25: "Over 2.5", o35: "Over 3.5", ambas: "Ambas Marcam", ge5: "5+ gols" };
async function salvaPush() {
  if (!GH_T) return;
  try {
    const body = { message: "push", content: Buffer.from(JSON.stringify(pushData, null, 1)).toString("base64"), branch: GH_BRANCH };
    if (pushSha) body.sha = pushSha;
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${PUSH_FILE}`, { method: "PUT", headers: { ...ghHead(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { const j = await r.json(); pushSha = j.content.sha; }
  } catch (e) {}
}
async function carregaPush() {
  if (GH_T) {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${PUSH_FILE}?ref=${GH_BRANCH}`, { headers: ghHead() });
      if (r.ok) { const j = await r.json(); pushSha = j.sha; const dados = JSON.parse(Buffer.from(j.content, "base64").toString()); if (dados) pushData = { vapid: dados.vapid || null, subs: dados.subs || [] }; }
    } catch (e) {}
  }
  if (webpush) {
    if (!pushData.vapid) { pushData.vapid = webpush.generateVAPIDKeys(); salvaPush(); }
    try { webpush.setVapidDetails("mailto:amd@live.local", pushData.vapid.publicKey, pushData.vapid.privateKey); } catch (e) {}
  }
}
carregaPush();
function enviaPushMinima(info) {
  if (!webpush || !pushData.vapid || !pushData.subs.length) return;
  if (!info || info.tipo !== "minima") return;
  const titulo = `🚨 ZONA DE OPERAÇÃO — ${NOMES_L[info.liga] || info.liga} · ${NOMES_M[info.mkt] || info.mkt}${info.rel != null ? ` (${info.rel}% do normal)` : ""}`;
  const corpo = `pagando ${info.pagando ?? "—"}% (normal ${info.base ?? "—"}%) — janela aberta AGORA`;
  const payload = JSON.stringify({ t: titulo, b: corpo, tag: info.liga + "|" + info.mkt });
  for (const s of [...pushData.subs]) {
    webpush.sendNotification(s, payload).catch(err => {
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        pushData.subs = pushData.subs.filter(x => x.endpoint !== s.endpoint);
        salvaPush();
      }
    });
  }
}

function avisaRadar(info) {
  const msg = `data: ${JSON.stringify({ tipo: "radar", alerta: info })}\n\n`; // BUGFIX: info.tipo sobrescrevia o rotulo "radar"
  for (const res of sseClientes) { try { res.write(msg); } catch (e) { sseClientes.delete(res); } }
  enviaPushMinima(info); // WEB PUSH: chega no sistema mesmo com aba congelada/fechada
}
app.get("/api/push/key", (req, res) => res.json({ key: (pushData.vapid && pushData.vapid.publicKey) || null, pronto: !!(webpush && pushData.vapid), inscritos: pushData.subs.length }));
app.post("/api/push/sub", (req, res) => {
  try {
    const s = req.body;
    if (!s || !s.endpoint) return res.status(400).json({ erro: "inscricao invalida" });
    if (!pushData.subs.find(x => x.endpoint === s.endpoint)) {
      pushData.subs.push(s);
      if (pushData.subs.length > 50) pushData.subs = pushData.subs.slice(-50);
      salvaPush();
    }
    res.json({ ok: true, inscritos: pushData.subs.length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
app.get("/api/radar", (req, res) => res.json(Object.values(radarAtivos).sort((a, b) => b.ts - a.ts)));

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

app.listen(PORT, () => console.log("AMD Live rodando na porta " + PORT));
