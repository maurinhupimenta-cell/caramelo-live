// ============================================================================
// GRÁFICO AMD LIVE 1 no dashboard (AMD Live 2)
//
// Usa o MESMO motor do AMD Live 1:
//   📉 Janela móvel  -> AMD_MOTOR.chartJanela (média móvel; Qtd. Jogos = período real)
//   📐 Acumulado 00h -> AMD_MOTOR.acumulado   (corte na virada do relógio do JOGO,
//                                              faixas 3h/6h/12h/18h/24h/dia)
//
// Lê a mesma API do coletor que o dashboard já usa e desenha dentro do <svg id="chart">
// com as cores do próprio site (--green/--red/--blue/--line/--muted), mantendo a estética.
// Não altera app.js, acumulado.js nem dados-reais.js.
// ============================================================================
(function () {
  "use strict";

  var API = "https://amd-coletor.onrender.com/api/grade?liga=";
  var INTERVALO = 45000;
  var cache = {};      // liga -> jogos adaptados
  var buscando = {};

  function css(nome, alt) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || alt;
  }

  // ---- adaptador: coletor -> motor ----------------------------------------
  function adapta(p) {
    var a = p.gols_a, b = p.gols_b;
    if (a == null || b == null) return null;
    var o = p.odds || {};
    return {
      horario: String(p.hora == null ? 0 : p.hora).padStart(2, "0") + ":" +
               String(p.minuto == null ? 0 : p.minuto).padStart(2, "0"),
      nome: (p.time_a || "") + " x " + (p.time_b || ""),
      a: a, b: b, total: a + b,
      odds: {
        o25: o["odd_over_2.5"] || null, o35: o["odd_over_3.5"] || null,
        ambs: o["odd_ambas_sim"] || null, u25: o["odd_under_2.5"] || null
      }
    };
  }

  function buscar(liga) {
    if (buscando[liga]) return buscando[liga];
    buscando[liga] = fetch(API + liga, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var out = [];
        var lista = (j && j.partidas) || [];
        for (var i = 0; i < lista.length; i++) { var g = adapta(lista[i]); if (g) out.push(g); }
        cache[liga] = out;
        buscando[liga] = null;
        return out;
      })
      .catch(function () { buscando[liga] = null; return cache[liga] || []; });
    return buscando[liga];
  }

  // ---- lê a seleção atual direto da tela ----------------------------------
  // O dashboard marca o item ativo com a classe "active" (e aria-pressed="true").
  //   #qtd      -> 20/40/60/80/120/240/480  = PERÍODO da média (Qtd. Jogos)
  //   .tabrow   -> copa/euro/super/premier
  //   #markets  -> Over 2.5 / Over 3.5 / 5+ Gols / Ambas Marcam
  //   #grafmodo -> Janela móvel / Acumulado 00h
  //   #acumBar  -> 3h/6h/12h/18h/24h/desde 00h
  function ativoEm(sel) {
    var raiz = document.querySelector(sel);
    if (!raiz) return null;
    var el = raiz.querySelector(".active,[aria-pressed=true],.on");
    return el ? (el.textContent || "").trim() : null;
  }
  function janelaAtual() {
    var t = ativoEm("#qtd");
    var n = t ? parseInt(t.replace(/\D/g, ""), 10) : NaN;
    return (isFinite(n) && n >= 5) ? n : 20;
  }
  function ligaAtual() {
    var t = (ativoEm(".tabrow") || ativoEm("#cligaMenu") || "").toLowerCase();
    var nomes = ["copa", "euro", "super", "premier"];
    for (var i = 0; i < nomes.length; i++) if (t.indexOf(nomes[i]) >= 0) return nomes[i];
    return "copa";
  }
  function mercadoAtual() {
    var t = (ativoEm("#markets") || "").toLowerCase();
    if (t.indexOf("3.5") >= 0) return "o35";
    if (t.indexOf("5+") >= 0) return "ge5";
    if (t.indexOf("ambas") >= 0) return "ambas";
    if (t.indexOf("1.5") >= 0) return "o15";
    if (t.indexOf("0.5") >= 0) return "o05";
    return "o25";
  }
  function modoAcumulado() {
    var t = ativoEm("#grafmodo") || "";
    return /acumulado|00h/i.test(t);
  }
  function faixaAtual() {
    var t = (ativoEm("#acumBar") || "").toLowerCase();
    if (/^3h/.test(t)) return "h3";
    if (/^6h/.test(t)) return "h6";
    if (/^12h/.test(t)) return "h12";
    if (/^18h/.test(t)) return "h18";
    if (/^24h/.test(t)) return "h24";
    return "dia";
  }

  // ---- desenho (estética do dashboard) ------------------------------------
  function desenha(serie, horas, rotulo) {
    var svg = document.getElementById("chart");
    if (!svg) return;
    var vb = (svg.getAttribute("viewBox") || "0 0 1110 372").split(/\s+/).map(Number);
    var W = vb[2] || 1110, H = vb[3] || 372;
    var pad = 40, padB = 30;
    if (!serie || serie.length < 2) {
      svg.innerHTML = '<text x="' + (W / 2) + '" y="' + (H / 2) +
        '" fill="' + css("--muted", "#8fa3ad") + '" font-size="13" text-anchor="middle">juntando resultados…</text>';
      return;
    }
    var min = Math.min.apply(null, serie), max = Math.max.apply(null, serie);
    var folga = Math.max(3, (max - min) * 0.15);
    min = Math.max(0, min - folga); max = Math.min(100, max + folga);
    var rng = Math.max(1, max - min);
    var x = function (i) { return pad + i * ((W - pad * 1.5) / (serie.length - 1 || 1)); };
    var y = function (v) { return pad / 2 + (1 - (v - min) / rng) * (H - pad - padB); };

    var linhaCor = css("--line", "#162832"), mudo = css("--muted", "#96a5ad");
    var cur = serie[serie.length - 1], ant = serie[0];
    var cor = cur >= ant ? css("--green", "#18e34d") : css("--red", "#ff343d");

    var g = [];
    // grade horizontal (4 níveis)
    for (var k = 0; k <= 4; k++) {
      var v = min + rng * k / 4, yy = y(v);
      g.push('<line x1="' + pad + '" y1="' + yy.toFixed(1) + '" x2="' + (W - pad / 2) + '" y2="' + yy.toFixed(1) +
             '" stroke="' + linhaCor + '" stroke-width="1"/>');
      g.push('<text x="' + (pad - 6) + '" y="' + (yy + 4).toFixed(1) + '" fill="' + mudo +
             '" font-size="11" text-anchor="end">' + Math.round(v) + '%</text>');
    }
    // área + linha
    var pts = serie.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    g.push('<polygon points="' + x(0).toFixed(1) + "," + y(min).toFixed(1) + " " + pts + " " +
           x(serie.length - 1).toFixed(1) + "," + y(min).toFixed(1) + '" fill="' + cor + '" opacity="0.10"/>');
    g.push('<polyline points="' + pts + '" fill="none" stroke="' + cor + '" stroke-width="2.2" stroke-linejoin="round"/>');
    g.push('<circle cx="' + x(serie.length - 1).toFixed(1) + '" cy="' + y(cur).toFixed(1) + '" r="4" fill="' + cor + '"/>');
    // eixo de horas (a cada hora cheia)
    if (horas && horas.length === serie.length) {
      for (var i = 0; i < horas.length; i++) {
        var hh = String(horas[i] || "");
        if (!/:00$/.test(hh) && i !== 0) continue;
        g.push('<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" fill="' + mudo +
               '" font-size="10" text-anchor="middle">' + hh + '</text>');
      }
    }
    // rótulo do modo
    g.push('<text x="' + pad + '" y="' + (pad / 2 - 4) + '" fill="' + mudo + '" font-size="11">' + rotulo + '</text>');
    svg.innerHTML = g.join("");
  }

  // ---- ciclo ---------------------------------------------------------------
  function roda() {
    if (typeof AMD_MOTOR === "undefined") return;
    var liga = ligaAtual(), mkt = mercadoAtual(), jan = janelaAtual();
    buscar(liga).then(function (jogos) {
      if (!jogos || jogos.length < 3) return;
      if (modoAcumulado()) {
        var ac = AMD_MOTOR.acumulado(jogos, mkt, jan);
        if (!ac || !ac.faixas) return;
        var f = ac.faixas[faixaAtual()] || ac.faixas.dia;
        if (!f) return;
        desenha(f.serie, f.horas, "acumulado desde 00h · média de " + ac.janela + " · " + ac.jogos + " jogos");
      } else {
        var j = AMD_MOTOR.chartJanela(jogos, mkt, jan);
        if (!j) return;
        desenha(j.serie, j.horas, "janela móvel · MM" + j.janelaMM);
      }
    });
  }

  function inicia() {
    roda();
    setInterval(roda, INTERVALO);
    // redesenha quando o usuário troca modo/faixa/liga/mercado
    ["#qtd", "#grafmodo", "#acumBar", "#markets", ".tabrow", "#cligaMenu"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.addEventListener("click", function () { setTimeout(roda, 300); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia);
  else inicia();
})();
