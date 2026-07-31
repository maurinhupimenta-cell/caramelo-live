// ============================================================================
// RANK DE TIMES (AMD Live 1) na página de análise do dashboard
//
// Quem mais paga por janela de tempo, por mercado — usando a mesma conta do
// AMD Live 1 (AMD_MOTOR.pays) sobre os jogos REAIS da liga selecionada.
//
// CORRIGE UM ERRO REAL: o rank estava mostrando times da Euro (Itália, Geórgia,
// Espanha…) enquanto a liga selecionada era a Super (Montevideo, Penarol…).
// Aqui a liga vem de #ligaOpts .on e os jogos vêm da API dessa liga.
//
// Escreve dentro de #rankTimes reaproveitando a estrutura existente:
//   .rkcard > h4 + .rklin ( .jan + .lista com <b>% </b> e <i class="fraca">(Nj)</i> )
// Nenhum arquivo existente é alterado.
// ============================================================================
(function () {
  "use strict";

  var API = "https://amd-coletor.onrender.com/api/grade?liga=";
  var INTERVALO = 90000;
  var JOGOS_HORA = 20;                    // 1 jogo a cada 3 min
  var JANELAS = [
    { rot: "3h", n: 3 * JOGOS_HORA },
    { rot: "6h", n: 6 * JOGOS_HORA },
    { rot: "12h", n: 12 * JOGOS_HORA },
    { rot: "24h", n: 24 * JOGOS_HORA }
  ];
  var MERCADOS = [
    { id: "o25", nome: "Over 2.5" },
    { id: "o35", nome: "Over 3.5" },
    { id: "ge5", nome: "5+ Gols" },
    { id: "ambas", nome: "Ambas Sim" }
  ];
  var MIN_JOGOS = 3;                      // menos que isso é ruído, não ranking
  var cache = {}, buscando = {};
  var meuHtml = null, escrevendo = false, observando = false;

  function adapta(p) {
    var a = p.gols_a, b = p.gols_b;
    if (a == null || b == null) return null;
    return {
      horario: String(p.hora == null ? 0 : p.hora).padStart(2, "0") + ":" +
               String(p.minuto == null ? 0 : p.minuto).padStart(2, "0"),
      timeA: (p.time_a || "").trim(), timeB: (p.time_b || "").trim(),
      a: a, b: b, total: a + b
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

  function ligaAtual() {
    var raiz = document.getElementById("ligaOpts");
    var el = raiz ? raiz.querySelector(".on,.active,[aria-pressed=true]") : null;
    var t = (el ? el.textContent : "").trim().toLowerCase();
    var nomes = ["copa", "euro", "super", "premier"];
    for (var i = 0; i < nomes.length; i++) if (t.indexOf(nomes[i]) >= 0) return nomes[i];
    return "copa";
  }

  // top 5 times da janela: % de jogos do time que pagaram o mercado
  function topDaJanela(jogos, mkt, n) {
    var fatia = jogos.length > n ? jogos.slice(-n) : jogos;
    var acc = {};
    for (var i = 0; i < fatia.length; i++) {
      var g = fatia[i];
      var pagou = AMD_MOTOR.pays(g, mkt) ? 1 : 0;
      [g.timeA, g.timeB].forEach(function (nome) {
        if (!nome) return;
        var s = acc[nome] || (acc[nome] = { n: 0, h: 0 });
        s.n++; s.h += pagou;
      });
    }
    var lista = [];
    for (var nome in acc) {
      if (acc[nome].n < MIN_JOGOS) continue;
      lista.push({ nome: nome, n: acc[nome].n, pct: Math.round(acc[nome].h / acc[nome].n * 100) });
    }
    lista.sort(function (x, y) { return (y.pct - x.pct) || (y.n - x.n); });
    return lista.slice(0, 5);
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, ""); }

  function desenha(jogos, liga) {
    var el = document.getElementById("rankTimes");
    if (!el) return;
    var html = MERCADOS.map(function (M) {
      var linhas = JANELAS.map(function (J) {
        var top = topDaJanela(jogos, M.id, J.n);
        var txt = top.length
          ? top.map(function (t, i) {
              return (i + 1) + "º " + esc(t.nome) + " <b>" + t.pct + "%</b> " +
                     '<i class="fraca">(' + t.n + "j)</i>";
            }).join(" · ")
          : '<i class="fraca">sem base suficiente</i>';
        return '<div class="rklin"><span class="jan">' + J.rot + '</span><span class="lista">' + txt + "</span></div>";
      }).join("");
      return '<div class="rkcard"><h4>' + M.nome + "</h4>" + linhas + "</div>";
    }).join("");

    escrevendo = true;
    el.innerHTML = html;
    meuHtml = el.innerHTML;
    escrevendo = false;
    vigia(el);

    // subtítulo "Top 5 por janela de tempo · <Liga>", se existir
    var sub = document.querySelector("#secRank .sub, #secRank .k, #secRank .subtitulo");
    if (sub && /top 5/i.test(sub.textContent || "")) {
      sub.textContent = "Top 5 por janela de tempo · " + liga.charAt(0).toUpperCase() + liga.slice(1);
    }
  }

  // o dashboard pode reescrever o bloco: devolve o conteúdo do motor
  // ANTI-TREMOR: tranca a propriedade innerHTML do bloco - so o motor escreve.
  var descritor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  function vigia(el) {
    if (observando || !el || !descritor) return;
    observando = true;
    try {
      Object.defineProperty(el, "innerHTML", {
        configurable: true,
        get: function () { return descritor.get.call(this); },
        set: function (v) { if (escrevendo) descritor.set.call(this, v); }
      });
    } catch (e) { observando = false; }
  }

  function roda() {
    if (typeof AMD_MOTOR === "undefined" || !AMD_MOTOR.pays) return;
    var liga = ligaAtual();
    buscar(liga).then(function (jogos) {
      if (!jogos || jogos.length < 30) return;
      desenha(jogos, liga);
    });
  }

  function inicia() {
    roda();
    setInterval(roda, INTERVALO);
    var opts = document.getElementById("ligaOpts");
    if (opts) opts.addEventListener("click", function () { meuHtml = null; setTimeout(roda, 350); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia);
  else inicia();
})();
