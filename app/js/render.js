/* =============================================================================
   SIPAV LT — Renderização das visões
   =============================================================================
   Lê SIPAV.estado e desenha. Não fala com o banco e não altera estado.
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  var ui = window.SIPAV.ui;
  var $ = ui.$, esc = ui.esc;

  /** Estado compartilhado, preenchido por app.js. */
  window.SIPAV.estado = {
    perfil: null, obra: null,
    trechos: [], trechoAtual: null,
    torres: [], atividades: [], encarregados: [], canteiros: [], programacoes: [],
    aba: 'grade', colunas: 'auto', filtroAtividade: '', filtroCanteiro: '', busca: ''
  };

  var E = window.SIPAV.estado;

  /* ---------------------------------------------------------------- Apoio -- */

  function programacoesDaTorre(torreId) {
    return E.programacoes.filter(function (p) { return p.torre && p.torre.id === torreId; });
  }

  function torresFiltradas() {
    var busca = (E.busca || '').trim().toLowerCase();
    return E.torres.filter(function (t) {
      if (busca && t.identificador.toLowerCase().indexOf(busca) === -1) return false;
      if (E.filtroAtividade && t.ultima_atividade_id !== E.filtroAtividade) return false;
      if (E.filtroCanteiro && t.canteiro_id !== E.filtroCanteiro) return false;
      return true;
    });
  }

  function colunasCss() {
    if (E.colunas === 'auto') return 'repeat(auto-fill, minmax(84px, 1fr))';
    return 'repeat(' + E.colunas + ', minmax(0, 1fr))';
  }

  /* -------------------------------------------------------- Cartão torre -- */

  function cartaoTorre(torre) {
    // A view torre_situacao expõe a chave como torre_id, não id
    var progs = programacoesDaTorre(torre.torre_id);
    var temProg = progs.length > 0;
    var restrito = torre.tem_restricao;

    var classes = ['cartao-torre'];
    var estilo = '';

    if (restrito) {
      classes.push('cartao-restrito');
    } else if (temProg) {
      classes.push('cartao-programado');
    } else if (torre.ultima_atividade_cor) {
      // Cor viva só na borda; o fundo é um véu dela. O texto continua vindo do
      // tema, então a legibilidade não depende da cor da atividade.
      var cor = torre.ultima_atividade_cor;
      estilo = 'border-color:' + cor + ';border-width:2px;' +
               'background:' + ui.rgba(cor, 0.16) + ';';
    }

    // Legenda: o que importa ver de relance
    var legenda;
    if (temProg) {
      var prox = progs.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; })[0];
      legenda = ui.dataCurta(prox.data) + ' · ' + (prox.atividade ? prox.atividade.nome : '');
    } else if (restrito) {
      legenda = 'Restrição ' + String(torre.restricao_tipo || '').toLowerCase();
    } else {
      legenda = torre.ultima_atividade || 'Não iniciada';
    }

    // Estrutura e modelo, cada um na sua linha
    var estaiada = torre.estrutura === 'ESTAIADA';
    var pastilha = torre.estrutura
      ? '<span class="pastilha-estrutura ' + (estaiada ? 'est' : 'aup') + '">' +
          (estaiada ? 'EST' : 'AUP') +
        '</span>'
      : '';
    var modelo = torre.modelo
      ? '<span class="modelo">' + esc(torre.modelo) + '</span>'
      : '';

    var dica = esc(torre.identificador) +
      (torre.modelo ? ' · ' + esc(torre.modelo) : '') +
      (torre.estrutura ? ' · ' + (torre.estrutura === 'ESTAIADA' ? 'estaiada' : 'autoportante') : '') +
      ' — ' + esc(legenda);

    return '' +
      '<div class="' + classes.join(' ') + '" style="' + estilo + '" ' +
           'onclick="SIPAV.app.abrirTorre(\'' + torre.torre_id + '\')" ' +
           'title="' + dica + '">' +
        (temProg ? '<span class="selo-contagem">' + progs.length + '</span>' : '') +
        '<span class="identificador">' + esc(torre.identificador) + '</span>' +
        pastilha +
        modelo +
        '<span class="legenda">' + esc(legenda) + '</span>' +
      '</div>';
  }

  function renderGrade() {
    var lista = torresFiltradas();
    var cont = $('visaoGrade');

    cont.style.gridTemplateColumns = colunasCss();
    cont.innerHTML = lista.map(cartaoTorre).join('');

    $('estadoVazio').classList.toggle('hidden', E.torres.length > 0);
  }

  /* ----------------------------------------------- Visões de quadrante --- */

  function chipProgramacao(p, mostrarTorre) {
    var cor = p.atividade ? p.atividade.cor_fundo : '#94a3b8';
    var txt = ui.corDoTexto(cor);
    return '' +
      '<div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 cursor-pointer hover:border-indigo-300 transition" ' +
           'onclick="SIPAV.app.abrirTorre(\'' + (p.torre ? p.torre.id : '') + '\')">' +
        (mostrarTorre
          ? '<span class="font-bold text-sm text-slate-800 min-w-[42px]">' + esc(p.torre ? p.torre.identificador : '?') + '</span>'
          : '') +
        '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" ' +
              'style="background:' + cor + ';color:' + txt + '">' +
          esc(p.atividade ? p.atividade.nome : '—') +
        '</span>' +
        (p.encarregado ? '<span class="text-xs text-slate-500 truncate">' + esc(p.encarregado.nome) + '</span>' : '') +
        (p.override_motivo
          ? '<i data-lucide="alert-triangle" class="w-3 h-3 text-amber-500 shrink-0" title="Programada fora da sequência"></i>'
          : '') +
      '</div>';
  }

  function blocoQuadrante(titulo, subtitulo, itens, mostrarTorre) {
    var totalKm = itens.reduce(function (s, p) { return s + (p.torre ? Number(p.torre.km) || 0 : 0); }, 0);
    return '' +
      '<section class="bloco-quadrante bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">' +
        '<header class="flex items-baseline justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">' +
          '<div>' +
            '<h3 class="font-bold text-slate-800">' + esc(titulo) + '</h3>' +
            (subtitulo ? '<p class="text-xs text-slate-500">' + esc(subtitulo) + '</p>' : '') +
          '</div>' +
          '<span class="text-xs font-semibold text-slate-500">' +
            itens.length + (itens.length === 1 ? ' torre' : ' torres') + ' · ' + ui.km(totalKm) + ' km' +
          '</span>' +
        '</header>' +
        '<div class="p-3 grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">' +
          itens.map(function (p) { return chipProgramacao(p, mostrarTorre !== false); }).join('') +
        '</div>' +
      '</section>';
  }

  /** Agrupa programações por uma chave, preservando ordem de inserção. */
  function agrupar(lista, chave) {
    var mapa = {}, ordem = [];
    lista.forEach(function (p) {
      var k = chave(p);
      if (!mapa[k]) { mapa[k] = []; ordem.push(k); }
      mapa[k].push(p);
    });
    return { mapa: mapa, ordem: ordem };
  }

  function programacoesVisiveis() {
    var busca = (E.busca || '').trim().toLowerCase();
    return E.programacoes.filter(function (p) {
      if (E.filtroAtividade && (!p.atividade || p.atividade.id !== E.filtroAtividade)) return false;
      if (E.filtroCanteiro && (!p.torre || p.torre.canteiro_id !== E.filtroCanteiro)) return false;
      if (busca && (!p.torre || p.torre.identificador.toLowerCase().indexOf(busca) === -1)) return false;
      return true;
    });
  }

  function vazio(mensagem) {
    return '<div class="text-center py-16 text-slate-400">' +
             '<i data-lucide="calendar-x" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>' +
             '<p class="text-sm">' + esc(mensagem) + '</p>' +
           '</div>';
  }

  function renderPorData() {
    var lista = programacoesVisiveis().slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
    });
    var cont = $('visaoDatas');
    if (!lista.length) { cont.innerHTML = vazio('Nenhuma atividade programada neste trecho'); return; }

    var g = agrupar(lista, function (p) { return p.data; });
    cont.innerHTML = g.ordem.map(function (data) {
      return blocoQuadrante(ui.dataLonga(data), null, g.mapa[data], true);
    }).join('');
  }

  function renderPorEncarregado() {
    var lista = programacoesVisiveis();
    var cont = $('visaoEncarregados');
    if (!lista.length) { cont.innerHTML = vazio('Nenhuma atividade programada neste trecho'); return; }

    var ordenada = lista.slice().sort(function (a, b) {
      var na = a.encarregado ? a.encarregado.nome : 'zzz';
      var nb = b.encarregado ? b.encarregado.nome : 'zzz';
      if (na !== nb) return na < nb ? -1 : 1;
      return a.data < b.data ? -1 : 1;
    });

    var g = agrupar(ordenada, function (p) { return p.encarregado ? p.encarregado.nome : 'Sem encarregado'; });
    cont.innerHTML = g.ordem.map(function (nome) {
      var itens = g.mapa[nome];
      var datas = {};
      itens.forEach(function (p) { datas[p.data] = true; });
      var qtd = Object.keys(datas).length;
      return blocoQuadrante(nome, qtd + (qtd === 1 ? ' dia programado' : ' dias programados'), itens, true);
    }).join('');
  }

  function renderPorAtividade() {
    var lista = programacoesVisiveis();
    var cont = $('visaoAtividades');
    if (!lista.length) { cont.innerHTML = vazio('Nenhuma atividade programada neste trecho'); return; }

    // Ordem de execução, não alfabética (post-it 2)
    var ordenada = lista.slice().sort(function (a, b) {
      var oa = a.atividade ? a.atividade.ordem_execucao : 9999;
      var ob = b.atividade ? b.atividade.ordem_execucao : 9999;
      if (oa !== ob) return oa - ob;
      return a.data < b.data ? -1 : 1;
    });

    var g = agrupar(ordenada, function (p) { return p.atividade ? p.atividade.nome : 'Sem atividade'; });
    cont.innerHTML = g.ordem.map(function (nome) {
      return blocoQuadrante(nome, null, g.mapa[nome], true);
    }).join('');
  }

  /* ---------------------------------------------------------- Estatística -- */

  function renderEstatisticas() {
    var torresProgramadas = {};
    var kmProgramado = 0;

    E.programacoes.forEach(function (p) {
      if (p.torre && !torresProgramadas[p.torre.id]) {
        torresProgramadas[p.torre.id] = true;
        kmProgramado += Number(p.torre.km) || 0;
      }
    });

    var qtd = Object.keys(torresProgramadas).length;
    $('resumoEstatisticas').innerHTML =
      '<span style="opacity:.75">' + E.torres.length + ' torres · </span>' +
      '<strong>' + qtd + ' programadas</strong>' +
      '<span style="opacity:.75"> · ' + ui.km(kmProgramado) + ' km</span>';
  }

  /* --------------------------------------------------------------- Tudo --- */

  var VISOES = {
    grade:        { div: 'visaoGrade',        aba: 'abaGrade',        fn: renderGrade },
    datas:        { div: 'visaoDatas',        aba: 'abaDatas',        fn: renderPorData },
    encarregados: { div: 'visaoEncarregados', aba: 'abaEncarregados', fn: renderPorEncarregado },
    atividades:   { div: 'visaoAtividades',   aba: 'abaAtividades',   fn: renderPorAtividade }
  };

  function tudo() {
    Object.keys(VISOES).forEach(function (chave) {
      var v = VISOES[chave];
      var ativa = chave === E.aba;

      // display inline em vez da classe hidden: a grade precisa de display:grid
      // quando visível, e inline style sempre vence a classe utilitária.
      $(v.div).style.display = !ativa ? 'none' : (chave === 'grade' ? 'grid' : 'block');
      $(v.aba).classList.toggle('aba-ativa', ativa);
    });

    VISOES[E.aba].fn();
    renderEstatisticas();
    ui.icones();
  }

  window.SIPAV.render = {
    tudo: tudo,
    programacoesDaTorre: programacoesDaTorre,
    torresFiltradas: torresFiltradas
  };
})();
