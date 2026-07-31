// ============================================================================
// RADAR AMD LIVE 1 no dashboard (AMD Live 2)
//
// Usa o MESMO motor do AMD Live 1 (motor.js -> AMD_MOTOR.radar): os quatro sinais
// calculados sobre a série do DIA (corte na virada do relógio do JOGO):
//   📉 mínima · 📈 subida · 💥 quebra de LTB · ↩️ pullback
//
// NÃO altera nenhum arquivo existente. Só escreve dentro de #radar, reaproveitando
// as mesmas classes (.radar-row / .radar-ico / .radar-txt) para o visual não mudar.
// Se o motor não estiver carregado, sai de fininho e deixa o radar antigo em paz.
// ============================================================================
(function () {
  "use strict";

  var API = "https://amd-coletor.onrender.com/api/grade?liga=";
  var LIGAS = [
    { id: "copa", nome: "Copa" },
    { id: "euro", nome: "Euro" },
    { id: "super", nome: "Super" },
    { id: "premier", nome: "Premier" }
  ];
  var MERCADOS = [
    { id: "o25", nome: "Over 2.5" },
    { id: "o35", nome: "Over 3.5" },
    { id: "ambas", nome: "Ambas Marcam" }
  ];

  // estado da histerese por liga|mercado (o sinal acende uma vez, não fica piscando)
  var estado = {};
  var cache = {};   // liga -> jogos já adaptados
  var INTERVALO = 60000;

  // ---- adaptador: formato do coletor -> formato do motor -------------------
  // coletor:  { hora: 2, minuto: 22, time_a, time_b, gols_a, gols_b, odds: {...} }
  // motor:    { horario: "02:22", nome: "A x B", a, b, total, odds: { o25, o35, ambs } }
  function adapta(p) {
    var a = p.gols_a, b = p.gols_b;
    if (a == null || b == null) return null;              // sem resultado ainda
    var hh = String(p.hora == null ? 0 : p.hora).padStart(2, "0");
    var mm = String(p.minuto == null ? 0 : p.minuto).padStart(2, "0");
    var o = p.odds || {};
    return {
      horario: hh + ":" + mm,
      nome: (p.time_a || "") + " x " + (p.time_b || ""),
      a: a, b: b,
      total: a + b,                                        // pays() lê ESTE campo
      odds: {
        o25: o["odd_over_2.5"] || null,
        o35: o["odd_over_3.5"] || null,
        ambs: o["odd_ambas_sim"] || null,
        u25: o["odd_under_2.5"] || null
      }
    };
  }

  function buscaLiga(liga) {
    return fetch(API + liga, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var lista = (j && j.partidas) || [];
        var jogos = [];
        for (var i = 0; i < lista.length; i++) {
          var g = adapta(lista[i]);
          if (g) jogos.push(g);
        }
        return jogos;                                      // já vem em ordem crescente
      })
      .catch(function () { return cache[liga] || []; });
  }

  // ---- desenho: mesmas classes do dashboard --------------------------------
  var ICONE = { minima: "↘", subida: "↗", ltb: "⚡", pull: "↩" };
  var TITULO = {
    minima: "MÍNIMA — mercado no fundo",
    subida: "SUBINDO — saiu do fundo",
    ltb: "ROMPEU LTB — virada de ciclo",
    pull: "PULLBACK — recuo e retomada"
  };
  var ORDEM = { ltb: 0, subida: 1, minima: 2, pull: 3 };

  function fitaHtml(fita) {
    if (!fita || !fita.length) return "";
    return "Últimos reais: " + fita.map(function (f) {
      return (f.p ? "🟢" : "🔴") + " " + f.m;
    }).join(" ");
  }

  function desenha(sinais) {
    var el = document.getElementById("radar");
    if (!el) return;
    if (!sinais.length) {
      el.innerHTML = '<div class="radar-row"><div class="radar-ico">·</div>' +
        '<div class="radar-txt">Sem sinal agora — nenhuma liga em mínima, subida, rompimento ou pullback.</div></div>';
      return;
    }
    sinais.sort(function (x, y) {
      return (ORDEM[x.tipo] - ORDEM[y.tipo]) || (y.rel || 0) - (x.rel || 0);
    });
    el.innerHTML = sinais.map(function (s) {
      var pct = (s.pagando == null ? "—" : s.pagando + "%");
      var base = (s.base == null ? "" : " · normal " + s.base + "%");
      return '<div class="radar-row">' +
        '<div class="radar-ico ' + (s.tipo === "minima" ? "min" : "") + '">' + (ICONE[s.tipo] || "•") + '</div>' +
        '<div class="radar-txt"><b>' + s.ligaNome + " · " + s.mktNome + "</b> — " + TITULO[s.tipo] +
        " · pagando " + pct + base +
        (s.fita && s.fita.length ? '<br><span class="radar-fita">' + fitaHtml(s.fita) + "</span>" : "") +
        "</div></div>";
    }).join("");
  }

  // ---- ciclo principal -----------------------------------------------------
  function roda() {
    if (typeof AMD_MOTOR === "undefined" || !AMD_MOTOR.radar) return;  // motor ausente: não faz nada
    var pendentes = LIGAS.map(function (L) {
      return buscaLiga(L.id).then(function (jogos) {
        cache[L.id] = jogos;
        var achados = [];
        for (var i = 0; i < MERCADOS.length; i++) {
          var M = MERCADOS[i];
          var chave = L.id + "|" + M.id;
          var r;
          try { r = AMD_MOTOR.radar(jogos, M.id, { estado: estado[chave] }); }
          catch (e) { continue; }
          estado[chave] = r.estado;
          // mostra o que está ACESO agora (não só o instante em que nasceu)
          var acesos = r.ativos || {};
          Object.keys(acesos).forEach(function (tipo) {
            if (!acesos[tipo]) return;
            achados.push({
              tipo: tipo, ligaNome: L.nome, mktNome: M.nome,
              pagando: r.cur, base: r.base,
              rel: r.base ? Math.round(r.cur / r.base * 100) : null,
              fita: (jogos.slice(-6).map(function (g) {
                return { p: AMD_MOTOR.pays(g, M.id) ? 1 : 0, m: (g.horario || "").split(":")[1] || "" };
              }))
            });
          });
        }
        return achados;
      });
    });
    Promise.all(pendentes).then(function (partes) {
      var todos = [];
      partes.forEach(function (p) { todos = todos.concat(p); });
      desenha(todos);
    });
  }

  function inicia() {
    roda();
    setInterval(roda, INTERVALO);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia);
  else inicia();
})();
