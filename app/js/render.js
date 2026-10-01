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
    torres: [], atividades: [], dependencias: [], encarregados: [], canteiros: [],
    programacoes: [], execucoes: [], movimentacoes: [],
    aba: 'grade', colunas: 'auto', filtroAtividade: '', filtroCanteiro: '', busca: '',
    // Recorte de datas da programação. de/ate nulos = todo o período.
    periodo: { modo: 'duas', de: null, ate: null },
    // Escolher torres clicando nos cartões, para mandar de uma vez para o lote.
    // Enquanto ligado, o clique marca em vez de abrir a torre.
    modoSelecao: false, selecionadas: {},
    // O mesmo, nos painéis por data / encarregado / atividade, mas marcando a
    // programação e não a torre. Só liga pelo "Selecionar vários" lá em cima.
    modoSelecaoProg: false, progSelecionadas: {}
  };

  var E = window.SIPAV.estado;

  /* ---------------------------------------------------------------- Apoio -- */

  function programacoesDaTorre(torreId) {
    return E.programacoes.filter(function (p) { return p.torre && p.torre.id === torreId; });
  }

  /** A execução apontada para esta programação, se houver. */
  function execucaoDa(programacaoId) {
    return E.execucoes.find(function (x) { return x.programacao_id === programacaoId; }) || null;
  }

  /** Quanto desta atividade, nesta torre, já saiu em campo (soma dos apontamentos). */
  function percentualExecutado(torreId, atividadeId) {
    return E.execucoes.reduce(function (soma, x) {
      return x.torre_id === torreId && x.atividade_id === atividadeId
        ? soma + (Number(x.percentual) || 0) : soma;
    }, 0);
  }

  /**
   * ✓ na programação que já saiu, com a data real no tooltip.
   *
   * Nos painéis a programação continua na lista — é o acompanhamento da semana, e
   * sumir com ela apagaria o que foi planejado. Mas antes ela aparecia igual à
   * pendente, e dava para achar que faltava fazer o que já tinha saído.
   */
  function marcaFeito(p) {
    var ex = execucaoDa(p.id);
    if (!ex) return '';
    var quando = ex.data_execucao !== p.data ? ' em ' + ui.dataCurta(ex.data_execucao) : '';
    return '<span class="marca-feito" title="Executada' + quando + '">✓</span>';
  }

  /**
   * A programação já virou estágio da torre?
   *
   * Executada E a atividade completa (a soma dos apontamentos chegou a 100%):
   * nesse caso o estágio no topo do cartão já diz isso, e a linha programada
   * dizia a mesma coisa de novo — a informação aparecia duas vezes.
   *
   * Executada pela metade não conta. Um estai de cinco partes com 20% apontados
   * não é estágio nenhum ainda, e se a linha sumisse o progresso ficaria sem
   * lugar no cartão.
   */
  function refletidaNoEstagio(p) {
    if (!execucaoDa(p.id) || !p.torre || !p.atividade) return false;
    return percentualExecutado(p.torre.id, p.atividade.id) >= 100;
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

  /* O min() garante que em tela estreita o cartão vire uma coluna só em vez de
     estourar a largura. O número fixo de colunas ainda é respeitado no desktop;
     em tela pequena o app.css o substitui por auto-fill. */
  /** 50 → "50%", 12.5 → "12,5%" */
  function pct(n) {
    var v = Number(n);
    if (isNaN(v)) return '';
    return (Math.round(v * 100) / 100).toLocaleString('pt-BR') + '%';
  }

  /**
   * "50%" ou, quando se sabe quais partes são, "50% · A C". As letras são as
   * partes da escavação (pés ou estais) que a programação cobre; MC é o mastro
   * central.
   */
  function rotuloParcial(p) {
    var t = pct(p.percentual);
    if (p.partes) t += ' · ' + String(p.partes).split(',').join(' ');
    return t;
  }

  function colunasCss() {
    if (E.colunas === 'auto') return 'repeat(auto-fill, minmax(min(100%, 158px), 1fr))';
    return 'repeat(' + E.colunas + ', minmax(0, 1fr))';
  }

  /* -------------------------------------------------------- Cartão torre -- */

  /* ------------------------------------------- Dependências transitivas --- */

  var fechoDependencias = null;

  /** Refeito a cada render: 28 atividades, custo irrelevante. */
  function montarFecho() {
    var diretas = {};
    E.dependencias.forEach(function (d) {
      (diretas[d.atividade_id] = diretas[d.atividade_id] || []).push(d.requer_atividade_id);
    });

    function subir(id, acc, visto) {
      (diretas[id] || []).forEach(function (r) {
        if (visto[r]) return;
        visto[r] = true;
        acc[r] = true;
        subir(r, acc, visto);
      });
    }

    fechoDependencias = {};
    Object.keys(diretas).forEach(function (id) {
      var acc = {};
      subir(id, acc, {});
      fechoDependencias[id] = acc;
    });
  }

  /** a depende de b, direta ou indiretamente? */
  function dependeDe(a, b) {
    if (!fechoDependencias) montarFecho();
    return !!(fechoDependencias[a] && fechoDependencias[a][b]);
  }

  /* --------------------------------------------------- Cartão de torre --- */

  function cartaoTorre(torre) {
    // A view torre_situacao expõe a chave como torre_id, não id.
    //
    // Só o que ainda é plano: a programação cuja atividade já foi concluída em
    // campo virou o estágio da torre, que está no topo do cartão. Mostrar as duas
    // coisas era informação em dobro. O selo e o destaque do cartão contam daqui,
    // então também deixam de contar o que já saiu.
    var progs = programacoesDaTorre(torre.torre_id).filter(function (p) {
      return !refletidaNoEstagio(p);
    });
    var restrito = torre.tem_restricao;

    var classes = ['cartao-torre'];
    if (E.modoSelecao && E.selecionadas[torre.torre_id]) classes.push('cartao-selecionado');
    if (restrito)       classes.push('cartao-restrito');
    if (progs.length)   classes.push('cartao-programado');

    // A linha do topo e o ponto mostram o ESTADO da torre. Programação é plano,
    // não estado, e por isso não pinta o cartão — ela tem selo e lista próprios.
    var corEstado = restrito ? '#E11D48' : (torre.ultima_atividade_cor || null);
    var estado = restrito
      ? 'Restrição ' + String(torre.restricao_tipo || '').toLowerCase()
      : (torre.ultima_atividade || 'Não iniciada');

    // Por data. Empate de data cai na ordem de execução, que é a única leitura
    // possível de "o que teria que vir primeiro".
    var ordenadas = progs.slice().sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      var oa = a.atividade ? a.atividade.ordem_execucao : 9999;
      var ob = b.atividade ? b.atividade.ordem_execucao : 9999;
      return oa - ob;
    });

    // Conflito de data: duas atividades no mesmo dia em que uma depende da
    // outra. Duas atividades independentes no mesmo dia são normais na obra.
    var conflito = {};
    ordenadas.forEach(function (p) {
      ordenadas.forEach(function (q) {
        if (p === q || p.data !== q.data || !p.atividade || !q.atividade) return;
        if (dependeDe(q.atividade.id, p.atividade.id)) {
          conflito[p.id] = true;
          conflito[q.id] = true;
        }
      });
    });

    var lista = ordenadas.length
      ? '<div class="lista-prog">' + ordenadas.map(function (p) {
          var cor = p.atividade ? p.atividade.cor_fundo : '#94A3B8';
          return '<span class="item-prog">' +
            '<span class="ponto-atividade" style="background:' + cor + ';margin-top:.25rem"></span>' +
            '<span class="flex-1">' +
              '<span class="data">' + ui.dataCurta(p.data) +
                '<b class="dia-curto' + (ui.fimDeSemana(p.data) ? ' fim-de-semana' : '') + '">' +
                  esc(ui.diaDaSemana(p.data).slice(0, 3)) + '</b>' +
              '</span> ' +
              esc(p.atividade ? p.atividade.nome : '—') +
              marcaFeito(p) +
              // Sempre aparece. O 100% vem apagado, para a parte repartida seguir
              // chamando mais atenção que o serviço inteiro
              '<span class="parcial' + (Number(p.percentual) >= 100 ? ' cheio' : '') + '">' +
                rotuloParcial(p) + '</span>' +
              (p.encarregado
                ? '<span class="encarregado">' + esc(p.encarregado.nome) + '</span>'
                : '') +
            '</span>' +
            (conflito[p.id]
              ? '<i data-lucide="alert-triangle" class="conflito" style="width:11px;height:11px"></i>'
              : '') +
          '</span>';
        }).join('') + '</div>'
      : '';

    var selo = ordenadas.length
      ? '<span class="selo-prog" title="' + ordenadas.length + ' programada(s)">' +
          '<i data-lucide="calendar-check" style="width:10px;height:10px"></i>' +
          ordenadas.length +
        '</span>'
      : '';

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
      (torre.estrutura ? ' · ' + (estaiada ? 'estaiada' : 'autoportante') : '') +
      ' — ' + esc(estado) +
      (ordenadas.length ? ' · ' + ordenadas.length + ' programada(s)' : '');

    // Contorno inteiro na cor do estado: cheia em cima, diluída nos lados e na
    // base, para o cartão ter a cor sem virar um bloco de contorno grosso.
    var estilo = corEstado
      ? 'border-color:' + ui.rgba(corEstado, 0.45) + ';border-top-color:' + corEstado + ';'
      : '';

    return '' +
      // data-torre é o que a seleção por arrasto usa para saber de quem é cada
      // retângulo na tela, sem ter que remontar a grade.
      '<div class="' + classes.join(' ') + '" data-torre="' + torre.torre_id + '" ' +
           (estilo ? 'style="' + estilo + '" ' : '') +
           'onclick="SIPAV.app.abrirTorre(\'' + torre.torre_id + '\')" ' +
           'title="' + dica + '">' +
        selo +
        '<span class="identidade">' +
          '<span class="identificador">' + esc(torre.identificador) + '</span>' +
          pastilha +
          modelo +
          '<span class="legenda">' +
            '<span class="ponto-atividade" style="background:' +
              (corEstado || 'var(--borda-forte)') + '"></span>' +
            esc(estado) +
          '</span>' +
        '</span>' +
        lista +
      '</div>';
  }

  function renderGrade() {
    montarFecho();                 // a cadeia pode ter sido editada na tela
    var lista = torresFiltradas();
    var cont = $('visaoGrade');

    cont.style.gridTemplateColumns = colunasCss();
    cont.innerHTML = lista.map(cartaoTorre).join('');

    $('estadoVazio').classList.toggle('hidden', E.torres.length > 0);
  }

  /* ----------------------------------------------- Visões de quadrante --- */

  /**
   * @param {object} op quais partes mostrar. O que já está no título do bloco
   *                    é omitido: repetir só rouba espaço de quem precisa.
   *                    `empilhado` põe o segundo dado numa linha própria, em vez
   *                    de tudo lado a lado — é o que salva a visão por data, onde
   *                    atividade e encarregado juntos quebram o nome da atividade
   *                    em três linhas e desalinham a grade inteira.
   */
  function chipProgramacao(p, op) {
    op = op || {};
    var cor = p.atividade ? p.atividade.cor_fundo : '#94A3B8';

    var pastilha = op.atividade === false
      // Sem a pastilha da atividade, um ponto mantém a cor presente
      ? '<span class="ponto-atividade" style="background:' + cor + '"></span>'
      : '<span class="chip-atividade" style="background:' + cor + ';color:' +
          ui.corDoTexto(cor) + '">' + esc(p.atividade ? p.atividade.nome : '—') + '</span>';

    var alerta = p.override_motivo
      ? '<i data-lucide="alert-triangle" class="w-3 h-3 text-amber-500 shrink-0" ' +
        'title="Programada fora da sequência"></i>'
      : '';

    var torre = op.torre === false ? ''
      : '<span class="chip-torre">' + esc(p.torre ? p.torre.identificador : '?') + '</span>';

    // A data com o dia da semana: a obra se guia por dia da semana, e "01/10"
    // sozinho obriga a ir olhar no calendário para saber se é quarta ou sábado.
    var data = op.data === false ? ''
      : '<span class="chip-data">' + esc(ui.dataCurta(p.data)) +
        '<b class="chip-dia' + (ui.fimDeSemana(p.data) ? ' fim-de-semana' : '') + '">' +
          esc(ui.diaDaSemana(p.data).slice(0, 3)) + '</b></span>';

    var enc = (op.encarregado === false || !p.encarregado) ? ''
      : '<span class="chip-encarregado">' + esc(p.encarregado.nome) + '</span>';

    var parcial = '<span class="chip-parcial' + (Number(p.percentual) >= 100 ? ' cheio' : '') + '">' +
      rotuloParcial(p) + '</span>' + marcaFeito(p);

    // Com "selecionar vários" ligado, o clique marca em vez de abrir a torre.
    // Desligado, tudo se comporta como sempre — quem não liga não vê diferença.
    var marcando = !!E.modoSelecaoProg;
    var marcado = marcando && !!E.progSelecionadas[p.id];

    var acao = marcando
      ? 'SIPAV.app.alternarProgramacaoMarcada(\'' + p.id + '\')'
      : 'SIPAV.app.abrirTorre(\'' + (p.torre ? p.torre.id : '') + '\')';

    // A lixeira some no modo seleção: lá o apagar é o da barra, e duas portas
    // para a mesma coisa na mesma tela é convite para clicar na errada.
    var lixeira = (op.apagar === false || marcando) ? ''
      : '<button class="chip-lixeira" title="Apagar esta programação" ' +
          'onclick="event.stopPropagation();SIPAV.app.apagarUmaProgramacao(\'' + p.id + '\')">' +
          '<i data-lucide="trash-2" class="w-3 h-3"></i></button>';

    var marca = marcando
      ? '<span class="chip-marca' + (marcado ? ' chip-marca-on' : '') + '"></span>' : '';

    var abrir = '<div class="chip-prog' + (op.empilhado ? ' empilhado' : '') +
      (marcado ? ' chip-marcado' : '') + '" onclick="' + acao + '">';

    if (!op.empilhado) {
      return abrir + marca + torre + data + pastilha + enc + parcial + alerta + lixeira + '</div>';
    }

    return abrir +
      '<div class="chip-linha">' + marca + torre + data + pastilha + parcial + alerta +
        lixeira + '</div>' +
      (enc ? '<div class="chip-linha chip-abaixo">' + enc + '</div>' : '') +
    '</div>';
  }

  function blocoQuadrante(titulo, subtitulo, itens, op) {
    // Conta torre distinta, não linha de programação. Três atividades na mesma
    // torre no mesmo dia são uma torre só — antes o cabeçalho dizia "9 torres"
    // onde havia 3, e somava o km três vezes.
    var t = totais(itens);
    var movs = (op && op.movs) || [];

    // Dia só com movimentação: sem torre, sem atividade. Mostrar "0 torres · 0,00 km"
    // diria que a obra parou, quando o que há é uma explicação.
    var resumo = itens.length
      ? t.torres + (t.torres === 1 ? ' torre' : ' torres') + ' · ' + ui.km(t.km) + ' km' +
        (itens.length !== t.torres
          ? ' · ' + itens.length + (itens.length === 1 ? ' atividade' : ' atividades')
          : '')
      : 'sem atividade nas torres';
    if (op && op.resumo) resumo = op.resumo;

    return '' +
      '<section class="bloco-quadrante painel overflow-hidden">' +
        '<header class="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">' +
          '<div class="min-w-0">' +
            '<h3 class="font-bold text-slate-800">' + esc(titulo) + '</h3>' +
            (subtitulo ? '<p class="text-xs text-slate-500">' + esc(subtitulo) + '</p>' : '') +
          '</div>' +
          '<span class="text-xs font-semibold text-slate-500 shrink-0">' + resumo + '</span>' +
        '</header>' +
        (op && op.porEncarregado && itens.length
          ? linhasPorEncarregado(itens, op)
          : '') +
        (!(op && op.porEncarregado && itens.length) && (itens.length || movs.length)
          ? '<div class="p-3 grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">' +
              emOrdemDeData(itens, movs).map(function (e) {
                return e.m ? cartaoMovimentacao(e.m, true) : chipProgramacao(e.p, op);
              }).join('') +
            '</div>'
          : '') +
      '</section>';
  }

  /**
   * Uma linha por encarregado, uma embaixo da outra, com o nome à esquerda e os
   * cartões dele em ordem de data — o desenho da planilha da ISA, onde cada
   * encarregado ocupa uma linha dentro do item. Quem não tem encarregado fica por
   * último.
   */
  function linhasPorEncarregado(itens, op) {
    var g = agrupar(itens.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
    }), function (p) { return p.encarregado ? p.encarregado.nome : ''; });

    var nomes = g.ordem.slice().sort(function (a, b) {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    return nomes.map(function (nome) {
      var lista = g.mapa[nome];
      var t = totais(lista);
      return '<div class="linha-enc">' +
               '<div class="linha-enc-nome">' + esc(nome || 'Sem encarregado') +
                 '<span>' + t.torres + (t.torres === 1 ? ' torre' : ' torres') + '</span>' +
               '</div>' +
               '<div class="linha-enc-cartoes grid gap-2" ' +
                    'style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">' +
                 lista.map(function (p) { return chipProgramacao(p, op); }).join('') +
               '</div>' +
             '</div>';
    }).join('');
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

  /* ---------------------------------------------------- Movimentação ------ */

  /**
   * Mudança de trecho de encarregado, deslocamento de máquina, dia sem atividade.
   *
   * Não é programação: não tem torre nem atividade. Existe para um dia vazio nos
   * painéis não ser um mistério — pode ser mudança, chuva, falta de material, ou
   * programação que ninguém lançou, e vazio não diz qual.
   */
  var ICONE_MOVIMENTACAO = {
    MUDANCA_TRECHO: 'arrow-right-left', MUDANCA_MAQUINA: 'truck', OUTRO: 'ban'
  };

  /** Os tipos, com o nome que a obra usa, na ordem em que aparecem. */
  var TIPOS_DE_MOVIMENTACAO = [
    { tipo: 'MUDANCA_TRECHO',  titulo: 'Mudança de trecho (encarregado)' },
    { tipo: 'MUDANCA_MAQUINA', titulo: 'Deslocamento de máquina' },
    { tipo: 'OUTRO',           titulo: 'Outro motivo (dia sem atividade)' }
  ];

  function podeEditarMovimentacao() {
    return !!E.perfil && (E.perfil.papel === 'ADMIN' || E.perfil.papel === 'PLANEJAMENTO');
  }

  /**
   * Filtrar por atividade, canteiro ou torre é pedir "só isto". Movimentação não
   * é nenhuma dessas coisas e apareceria como ruído no meio do que se procura.
   */
  function movimentacoesVisiveis() {
    if (E.filtroAtividade || E.filtroCanteiro || (E.busca || '').trim()) return [];

    var de = E.periodo.de, ate = E.periodo.ate;
    return (E.movimentacoes || []).filter(function (m) {
      if (ate && m.data > ate) return false;
      if (de && m.data < de) return false;
      return movimentacaoDoTrecho(m);
    });
  }

  /** O canteiro atende o trecho que está na tela? (um canteiro serve vários) */
  function canteiroServeOTrecho(id) {
    var atual = E.trechoAtual ? E.trechoAtual.id : null;
    var c = (E.canteiros || []).find(function (x) { return x.id === id; });
    return !!c && (c.trechos || []).indexOf(atual) !== -1;
  }

  /**
   * Uma movimentação pertence a este trecho se foi registrada nele ou se um dos
   * canteiros dela atende o trecho. Assim quem sai de um canteiro e quem chega no
   * outro veem a mesma linha.
   */
  function movimentacaoDoTrecho(m) {
    var atual = E.trechoAtual ? E.trechoAtual.id : null;
    if (m.trecho_id === atual) return true;
    if (m.canteiro_origem_id && canteiroServeOTrecho(m.canteiro_origem_id)) return true;
    return !!(m.canteiro_destino_id && canteiroServeOTrecho(m.canteiro_destino_id));
  }

  /** O dia em que ela é desenhada. É sempre um dia só. */
  function diaDaMovimentacao(m) {
    return m.data;
  }

  function nomeDoCanteiro(m, lado) {
    var c = m['canteiro_' + lado];
    if (c) return c.nome;
    var id = m['canteiro_' + lado + '_id'];
    var x = (E.canteiros || []).find(function (k) { return k.id === id; });
    return x ? x.nome : '—';
  }

  /** "vai para Barra", "vem de Igarité" — conforme o canteiro que atende este trecho. */
  function rotaDeCanteiro(m) {
    if (m.canteiro_origem_id && canteiroServeOTrecho(m.canteiro_origem_id) &&
        !(m.canteiro_destino_id && canteiroServeOTrecho(m.canteiro_destino_id))) {
      return 'vai para ' + nomeDoCanteiro(m, 'destino');
    }
    if (m.canteiro_destino_id && canteiroServeOTrecho(m.canteiro_destino_id) &&
        !(m.canteiro_origem_id && canteiroServeOTrecho(m.canteiro_origem_id))) {
      return 'vem de ' + nomeDoCanteiro(m, 'origem');
    }
    return nomeDoCanteiro(m, 'origem') + ' → ' + nomeDoCanteiro(m, 'destino');
  }

  function textoDaMovimentacao(m) {
    if (m.tipo === 'OUTRO') return m.observacao || 'Sem atividade';

    // Só o fato, como na planilha de programação: "mudança de máquina". A
    // observação, se alguém quis dizer qual, vem junto.
    if (m.tipo === 'MUDANCA_MAQUINA') {
      return 'Deslocamento de máquina' + (m.observacao ? ' · ' + m.observacao : '');
    }

    return 'Muda de canteiro · ' + rotaDeCanteiro(m);
  }

  /**
   * A movimentação como cartão da grade, no mesmo molde da programação: no lugar
   * da torre vão as setinhas (ou o caminhão, ou o "proibido"), e ela entra na
   * mesma ordem de data das torres, no dia em que aconteceu.
   */
  function cartaoMovimentacao(m, comQuem) {
    var quando = '<span class="chip-data">' + esc(ui.dataCurta(m.data)) +
      '<b class="chip-dia' + (ui.fimDeSemana(m.data) ? ' fim-de-semana' : '') + '">' +
      esc(ui.diaDaSemana(m.data).slice(0, 3)) + '</b></span>';

    // Em "por data" não há o nome do encarregado no título do bloco: entra aqui
    var texto = (comQuem && m.encarregado ? m.encarregado.nome + ' · ' : '') + textoDaMovimentacao(m);
    var dica = textoDaMovimentacao(m) +
      (m.tipo === 'MUDANCA_TRECHO' && m.observacao ? ' — ' + m.observacao : '');

    var editavel = podeEditarMovimentacao();

    return '<div class="chip-prog chip-mov-card' + (editavel ? ' chip-mov-editavel' : '') + '" ' +
             (editavel ? 'onclick="SIPAV.app.abrirMovimentacao(\'' + m.id + '\')" ' : '') +
             'title="' + esc(dica) + '">' +
             '<span class="chip-torre chip-torre-mov">' +
               '<i data-lucide="' + (ICONE_MOVIMENTACAO[m.tipo] || 'ban') + '" class="w-4 h-4"></i>' +
             '</span>' +
             quando +
             '<span class="chip-mov-texto">' + esc(texto) + '</span>' +
           '</div>';
  }

  /**
   * Programações e movimentações na ordem de data. No mesmo dia a movimentação
   * vem primeiro: é de onde a pessoa saiu antes de chegar às torres.
   */
  function emOrdemDeData(progs, movs) {
    var eventos = progs.map(function (p) { return { data: p.data, p: p }; })
      .concat((movs || []).map(function (m) { return { data: diaDaMovimentacao(m), m: m }; }));

    return eventos.map(function (e, i) { e.i = i; return e; }).sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if (!!a.m !== !!b.m) return a.m ? -1 : 1;
      return a.i - b.i;
    });
  }
  function vazio(mensagem) {
    return '<div class="text-center py-16 text-slate-400">' +
             '<i data-lucide="calendar-x" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>' +
             '<p class="text-sm">' + esc(mensagem) + '</p>' +
           '</div>';
  }

  /** Torres distintas e km somado de um conjunto de programações. */
  function totais(itens) {
    var torres = {}, km = 0;
    itens.forEach(function (p) {
      if (p.torre && !torres[p.torre.id]) {
        torres[p.torre.id] = true;
        km += Number(p.torre.km) || 0;
      }
    });
    return { torres: Object.keys(torres).length, km: km };
  }

  /**
   * Por data, agrupada por semana. A programação é semanal: ver 15 dias
   * corridos sem separação obrigava a contar no dedo onde uma semana acaba.
   */
  function renderPorData() {
    var lista = programacoesVisiveis().slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
    });
    var movs = movimentacoesVisiveis();
    var cont = $('visaoDatas');
    if (!lista.length && !movs.length) {
      cont.innerHTML = vazio('Nenhuma atividade programada neste trecho');
      return;
    }

    // Semana → o que há nela. A movimentação entra junto: um dia em que só há
    // mudança de trecho ou de máquina também é um dia, e tem que aparecer.
    var semanas = {}, ordemSemanas = [];
    function daSemana(iso) {
      var seg = ui.iso(ui.segundaDaSemana(ui.paraData(iso)));
      if (!semanas[seg]) { semanas[seg] = { progs: [], movs: [] }; ordemSemanas.push(seg); }
      return semanas[seg];
    }
    lista.forEach(function (p) { daSemana(p.data).progs.push(p); });
    movs.forEach(function (m) { daSemana(diaDaMovimentacao(m)).movs.push(m); });
    ordemSemanas.sort();

    cont.innerHTML = ordemSemanas.map(function (segunda) {
      var s = semanas[segunda];
      var t = totais(s.progs);
      var domingo = ui.iso(ui.somarDias(ui.paraData(segunda), 6));
      var progsPorDia = agrupar(s.progs, function (p) { return p.data; });
      var movsPorDia = agrupar(s.movs, diaDaMovimentacao);

      var dias = Object.keys(progsPorDia.mapa).concat(
        Object.keys(movsPorDia.mapa).filter(function (d) { return !progsPorDia.mapa[d]; })
      ).sort();

      return '' +
        '<section class="space-y-3">' +
          '<header class="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-1" ' +
                  'style="border-bottom:2px solid var(--acento)">' +
            '<h2 class="text-sm font-bold uppercase tracking-wide" style="color:var(--acento)">' +
              'Semana de ' + ui.dataCurta(segunda) + ' a ' + ui.dataCurta(domingo) +
            '</h2>' +
            '<span class="text-xs font-semibold text-slate-500">' +
              (s.progs.length
                ? t.torres + (t.torres === 1 ? ' torre' : ' torres') + ' · ' +
                  ui.km(t.km) + ' km · ' +
                  s.progs.length + (s.progs.length === 1 ? ' atividade' : ' atividades')
                : 'sem atividade nas torres') +
            '</span>' +
          '</header>' +
          dias.map(function (data) {
            // A data esta no titulo do bloco, entao sai do chip. O encarregado
            // desce para a segunda linha: lado a lado, o nome da atividade quebra
            // em tres linhas e a grade perde o alinhamento.
            return blocoQuadrante(ui.dataLonga(data), null, progsPorDia.mapa[data] || [],
              { torre: true, data: false, atividade: true, encarregado: true, empilhado: true,
                movs: movsPorDia.mapa[data] || [] });
          }).join('') +
        '</section>';
    }).join('');
  }

  function renderPorEncarregado() {
    var lista = programacoesVisiveis();
    var movs = movimentacoesVisiveis();
    var cont = $('visaoEncarregados');
    if (!lista.length && !movs.length) {
      cont.innerHTML = vazio('Nenhuma atividade programada neste trecho');
      return;
    }

    var ordenada = lista.slice().sort(function (a, b) {
      var na = a.encarregado ? a.encarregado.nome : 'zzz';
      var nb = b.encarregado ? b.encarregado.nome : 'zzz';
      if (na !== nb) return na < nb ? -1 : 1;
      return a.data < b.data ? -1 : 1;
    });

    var g = agrupar(ordenada, function (p) { return p.encarregado ? p.encarregado.nome : 'Sem encarregado'; });

    // Movimentação por encarregado. Quem passou o período inteiro em outro trecho
    // não tem atividade nenhuma aqui — e é justamente o que sumiria do painel sem
    // explicação. Ele também ganha bloco, só com a movimentação.
    var movsPorEnc = agrupar(movs.filter(function (m) { return m.encarregado; }),
                             function (m) { return m.encarregado.nome; });
    var movsSemEnc = movs.filter(function (m) { return !m.encarregado; });
    var extras = movsPorEnc.ordem.filter(function (n) { return !g.mapa[n]; })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

    // Consolidado no topo: é o número que a fiscalização e a coordenação pedem,
    // e que antes só dava para somar olhando bloco a bloco.
    var resumo = g.ordem.map(function (nome) {
      var itens = g.mapa[nome];
      var t = totais(itens);
      var datas = {};
      itens.forEach(function (p) { datas[p.data] = true; });
      return { nome: nome, torres: t.torres, km: t.km,
               dias: Object.keys(datas).length, atividades: itens.length };
    });

    var geral = totais(lista);

    var tabela =
      '<section class="bloco-quadrante painel overflow-hidden">' +
        '<header class="px-4 py-2.5 bg-slate-50 border-b border-slate-200">' +
          '<h3 class="font-bold text-slate-800">Consolidado por encarregado</h3>' +
          '<p class="text-xs text-slate-500">' +
            ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) + '</p>' +
        '</header>' +
        '<div class="overflow-x-auto"><table class="w-full text-sm">' +
          '<thead><tr class="text-left text-xs uppercase tracking-wide text-slate-500">' +
            '<th class="px-4 py-2 font-semibold">Encarregado</th>' +
            '<th class="px-3 py-2 font-semibold text-right">Torres</th>' +
            '<th class="px-3 py-2 font-semibold text-right">km</th>' +
            '<th class="px-3 py-2 font-semibold text-right">Atividades</th>' +
            '<th class="px-4 py-2 font-semibold text-right">Dias</th>' +
          '</tr></thead><tbody>' +
          resumo.map(function (r) {
            return '<tr class="border-t border-slate-200">' +
              '<td class="px-4 py-2 font-medium text-slate-700">' + esc(r.nome) + '</td>' +
              '<td class="px-3 py-2 text-right text-slate-600">' + r.torres + '</td>' +
              '<td class="px-3 py-2 text-right text-slate-600">' + ui.km(r.km) + '</td>' +
              '<td class="px-3 py-2 text-right text-slate-600">' + r.atividades + '</td>' +
              '<td class="px-4 py-2 text-right text-slate-600">' + r.dias + '</td>' +
            '</tr>';
          }).join('') +
          '<tr class="border-t-2 border-slate-300 font-bold">' +
            '<td class="px-4 py-2 text-slate-800">Total do trecho</td>' +
            '<td class="px-3 py-2 text-right text-slate-800">' + geral.torres + '</td>' +
            '<td class="px-3 py-2 text-right text-slate-800">' + ui.km(geral.km) + '</td>' +
            '<td class="px-3 py-2 text-right text-slate-800">' + lista.length + '</td>' +
            '<td class="px-4 py-2"></td>' +
          '</tr>' +
        '</tbody></table></div>' +
        '<p class="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-200">' +
          'O total de torres não é a soma da coluna: uma torre atendida por dois ' +
          'encarregados conta uma vez só no trecho.' +
        '</p>' +
      '</section>';

    cont.innerHTML = (lista.length ? tabela : '') + g.ordem.concat(extras).map(function (nome) {
      var itens = g.mapa[nome] || [];
      var datas = {};
      itens.forEach(function (p) { datas[p.data] = true; });
      var qtd = Object.keys(datas).length;

      // Dentro do encarregado, separado por semana: a de hoje é a SEMANAL e a
      // seguinte é a QUINZENAL, que é como a gente chama e como vai para a ISA.
      // A movimentação entra na mesma ordem, no dia em que aconteceu, e não numa
      // faixa à parte embaixo: é um dia do encarregado como os outros.
      var porSemana = agrupar(emOrdemDeData(itens, movsPorEnc.mapa[nome]),
        function (e) { return ui.iso(ui.segundaDaSemana(ui.paraData(e.data))); });

      var corpo = porSemana.ordem.map(function (segunda) {
        return '<div class="faixa-semana">' +
                 '<span class="faixa-semana-nome">' + esc(nomeDaSemana(segunda)) + '</span>' +
                 '<span class="faixa-semana-datas">' +
                   esc(ui.dataCurta(segunda)) + ' a ' +
                   esc(ui.dataCurta(ui.iso(ui.somarDias(ui.paraData(segunda), 6)))) +
                 '</span>' +
               '</div>' +
               '<div class="p-3 grid gap-2" ' +
                    'style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">' +
                 porSemana.mapa[segunda].map(function (e) {
                   return e.m
                     ? cartaoMovimentacao(e.m, false)
                     : chipProgramacao(e.p, { torre: true, data: true,
                                              atividade: true, encarregado: false });
                 }).join('') +
               '</div>';
      }).join('');

      var t = totais(itens);

      return '' +
        '<section class="bloco-quadrante painel overflow-hidden">' +
          '<header class="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">' +
            '<div class="min-w-0">' +
              '<h3 class="font-bold text-slate-800">' + esc(nome) + '</h3>' +
              '<p class="text-xs text-slate-500">' +
                (qtd ? qtd + (qtd === 1 ? ' dia programado' : ' dias programados')
                     : 'nenhum dia programado') + '</p>' +
            '</div>' +
            '<span class="text-xs font-semibold text-slate-500 shrink-0">' +
              (itens.length
                ? t.torres + (t.torres === 1 ? ' torre' : ' torres') + ' · ' + ui.km(t.km) + ' km · ' +
                  itens.length + (itens.length === 1 ? ' atividade' : ' atividades')
                : 'sem atividade nas torres') +
            '</span>' +
          '</header>' +
          corpo +
        '</section>';
    }).join('') +

    // Máquinas e o que não é de ninguém: movimentação sem encarregado
    (movsSemEnc.length
      ? blocoQuadrante('Máquinas e outros', 'sem encarregado', [],
          { movs: movsSemEnc })
      : '');
  }

  /**
   * Como a obra chama a semana: a de hoje é a semanal, a seguinte é a
   * quinzenal. É o vocabulário da reunião de sexta e o da planilha da ISA.
   *
   * O que cair fora dessas duas ganha a data, sem apelido — inventar "terceira
   * semana" seria criar nome que ninguém usa.
   */
  function nomeDaSemana(segundaIso) {
    var desta = ui.iso(ui.segundaDaSemana());
    var proxima = ui.iso(ui.somarDias(ui.segundaDaSemana(), 7));

    if (segundaIso === desta) return 'Semanal';
    if (segundaIso === proxima) return 'Quinzenal';

    var passada = segundaIso < desta;
    return (passada ? 'Semana passada de ' : 'Semana de ') + ui.dataCurta(segundaIso);
  }

  function renderPorAtividade() {
    var lista = programacoesVisiveis();
    var movs = movimentacoesVisiveis();
    var cont = $('visaoAtividades');
    if (!lista.length && !movs.length) { cont.innerHTML = vazio('Nenhuma atividade programada neste trecho'); return; }

    // Ordem de execução, não alfabética (post-it 2)
    var ordenada = lista.slice().sort(function (a, b) {
      var oa = a.atividade ? a.atividade.ordem_execucao : 9999;
      var ob = b.atividade ? b.atividade.ordem_execucao : 9999;
      if (oa !== ob) return oa - ob;
      return a.data < b.data ? -1 : 1;
    });

    var g = agrupar(ordenada, function (p) { return p.atividade ? p.atividade.nome : 'Sem atividade'; });
    cont.innerHTML = g.ordem.map(function (nome) {
      // A atividade já está no título do bloco; o espaço vai para o encarregado
      return blocoQuadrante(nome, null, g.mapa[nome],
        { torre: true, data: true, atividade: false, encarregado: false, porEncarregado: true });
    }).join('') +

    // A movimentação também é algo que aconteceu numa data, então tem o seu lugar
    // aqui: um grupo por tipo, depois das atividades, em ordem de data
    TIPOS_DE_MOVIMENTACAO.map(function (tipo) {
      var doTipo = movs.filter(function (m) { return m.tipo === tipo.tipo; });
      if (!doTipo.length) return '';
      return blocoQuadrante(tipo.titulo, null, [],
        { movs: doTipo, resumo: doTipo.length + (doTipo.length === 1 ? ' registro' : ' registros') });
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

    // O botão de limpar só aparece quando há o que limpar
    var filtrando = !!(E.filtroAtividade || E.filtroCanteiro ||
                       (E.busca || '').trim() || E.periodo.de || E.periodo.ate);
    var btnLimpar = $('btnLimparFiltros');
    if (btnLimpar) btnLimpar.classList.toggle('hidden', !filtrando);

    // O período não entra aqui: ele está escrito na primeira caixa de filtro,
    // na mesma linha, a dois palmos de distância. Estava no resumo para uma
    // torre programada fora do recorte não parecer perdida, mas esse caso já
    // tem aviso próprio na hora de gravar.
    $('resumoEstatisticas').innerHTML =
      '<span style="opacity:.75">' + E.torres.length + ' torres · </span>' +
      '<strong>' + qtd + ' programadas</strong>' +
      '<span style="opacity:.75"> · ' + ui.km(kmProgramado) + ' km</span>';

    $('resumoEstatisticas').title =
      E.torres.length + ' torres · ' + qtd + ' programadas · ' +
      ui.km(kmProgramado) + ' km · ' + ui.rotuloPeriodo(E.periodo.de, E.periodo.ate);
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
    programacoesVisiveis: programacoesVisiveis,
    execucaoDa: execucaoDa,
    torresFiltradas: torresFiltradas
  };
})();
