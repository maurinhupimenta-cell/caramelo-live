// ============================================================================
// BACKTEST AMD LIVE 1 no dashboard (AMD Live 2)
//
// Usa a MESMA matemática do AMD Live 1 (motor.js -> AMD_MOTOR.backtest):
// para cada jogo, refaz a avaliação usando SÓ os jogos anteriores (janela de 400).
// Indicação = score >= 30 E ev > 0. Lista as indicações das últimas 6 horas do
// relógio do jogo e marca com ⚠️ a maior EV+ que terminou em RED.
//
// Escreve nas MESMAS colunas da tabela que já existe (#backtest):
//   HORA | JOGO | PLACAR | SCORE | EV | RESULTADO | LIGA
// e reaproveita as classes bt-pos / bt-neg. Nada de CSS novo, nada de HTML novo.
// Não altera app.js, dados-reais.js, acumulado.js nem maxima.js.
// ============================================================================
(function () {
  "use strict";

  var API = "https://amd-coletor.onrender.com/api/grade?liga=";
  var INTERVALO = 90000;
  var cache = {}, buscando = {};
  var meuHtml = null, escrevendo = false, observando = false;
  var chaveAtual = null;   // liga|mercado desenhado por ultimo

  // mercados que a fonte NAO precifica: sem odd nao ha EV, e sem EV nao ha indicacao.
  var SEM_ODD = { ge5: "5+ gols" };

  function avisa(txt) {
    var tb = document.getElementById("backtest");
    if (!tb) return;
    escrevendo = true;
    tb.innerHTML = '<tr><td colspan="7">' + txt + "</td></tr>";
    meuHtml = tb.innerHTML;
    escrevendo = false;
    vigiaTabela(tb);
  }

  // O dashboard reescreve a tabela por chamada interna (nao passa pelo window),
  // entao um observador devolve o conteudo do motor assim que ela e sobreposta.
  function vigiaTabela(tb) {
    if (observando || !tb) return;
    observando = true;
    var obs = new MutationObserver(function () {
      if (escrevendo || !meuHtml) return;
      if (tb.innerHTML !== meuHtml) {
        escrevendo = true;
        tb.innerHTML = meuHtml;
        escrevendo = false;
      }
    });
    obs.observe(tb, { childList: true, subtree: true });
  }

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
        var out = [], lista = (j && j.partidas) || [];
        for (var i = 0; i < lista.length; i++) { var g = adapta(lista[i]); if (g) out.push(g); }
        cache[liga] = out; buscando[liga] = null; return out;
      })
      .catch(function () { buscando[liga] = null; return cache[liga] || []; });
    return buscando[liga];
  }

  // ---- seleção atual (mesmos seletores do dashboard) ----------------------
  function ativoEm(sel) {
    var raiz = document.querySelector(sel);
    if (!raiz) return null;
    var el = raiz.querySelector(".active,[aria-pressed=true],.on");
    return el ? (el.textContent || "").trim() : null;
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
    return "o25";
  }

  // ---- desenho: mesmas colunas e classes da tabela existente --------------
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, ""); }

  function desenha(bt, liga) {
    var tb = document.getElementById("backtest");
    if (!tb) return;
    var lista = (bt && bt.ultimos10indicados) || [];
    if (!lista.length) {
      tb.innerHTML = '<tr><td colspan="7">sem indicações nas últimas 6 horas do relógio do jogo</td></tr>';
      return;
    }
    var linhas = lista.slice().reverse().map(function (u) {
      var green = u.resultado === "GREEN";
      var evTxt = (u.ev > 0 ? "+" : "") + u.ev + "%";
      return "<tr>" +
        "<td>" + esc(u.horario) + "</td>" +
        "<td>" + (u.alerta ? "⚠️ " : "") + esc(u.nome) + "</td>" +
        "<td>" + esc(u.placar) + "</td>" +
        "<td>" + esc(u.score) + "</td>" +
        '<td class="' + (u.ev > 0 ? "bt-pos" : "bt-neg") + '">' + evTxt + "</td>" +
        '<td class="' + (green ? "bt-pos" : "bt-neg") + '">' + (green ? "✓" : "✗") + "</td>" +
        "<td>" + esc(liga) + "</td>" +
        "</tr>";
    }).join("");
    escrevendo = true;
    tb.innerHTML = linhas;
    meuHtml = tb.innerHTML;
    escrevendo = false;
    vigiaTabela(tb);

    // resumo honesto, se existir algum lugar para ele (não cria elemento novo)
    var alvo = document.getElementById("btResumo");
    if (alvo && bt.indicados) {
      alvo.textContent = "indicadas " + bt.indicados.n + " · acerto " +
        (bt.taxaIndicados == null ? "—" : bt.taxaIndicados + "%") +
        " · régua do mercado " + bt.baseGeral + "%";
    }
  }

  function roda() {
    if (typeof AMD_MOTOR === "undefined" || !AMD_MOTOR.backtest) return;
    var liga = ligaAtual(), mkt = mercadoAtual();
    var chave = liga + "|" + mkt;
    if (chave !== chaveAtual) {          // trocou de liga/mercado: nunca deixar a tabela velha
      chaveAtual = chave;
      meuHtml = null;
      avisa("calculando " + mkt.toUpperCase() + " · " + liga + "…");
    }
    if (SEM_ODD[mkt]) {
      avisa("A fonte não fornece odd para " + SEM_ODD[mkt] +
            " — sem odd não há EV, e sem EV não há indicação. Backtest indisponível neste mercado.");
      return;
    }
    buscar(liga).then(function (jogos) {
      if (!jogos || jogos.length < 160) return;   // o backtest precisa de base
      var bt;
      try { bt = AMD_MOTOR.backtest(jogos, mkt, 150); } catch (e) { return; }
      if (!bt || bt.erro) { avisa("sem base suficiente para o backtest deste mercado agora"); return; }
      ultimo = bt; ultimaLiga = liga;
      desenha(bt, liga);
    });
  }

  // ASSUME o renderBacktest do dashboard (ele continua sendo chamado pelos timers
  // existentes, mas quem escreve a tabela agora e este backtest). Sem editar app.js.
  var ultimo = null, ultimaLiga = null;
  function inicia() {
    try {
      window.renderBacktest = function () { if (ultimo) desenha(ultimo, ultimaLiga); };
    } catch (e) {}
    roda();
    setInterval(roda, INTERVALO);
    document.addEventListener("click", function (e) {
      var alvo = e.target;
      if (!alvo || !alvo.closest) return;
      if (alvo.closest("#markets, .tabrow, #cligaMenu, #qtd, #ligaOpts")) setTimeout(roda, 300);
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia);
  else inicia();
})();
