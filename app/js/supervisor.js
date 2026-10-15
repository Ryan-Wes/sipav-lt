/* =============================================================================
   SIPAV LT — Supervisor e solicitações
   =============================================================================
   O supervisor não usa a tela completa: tem uma própria, simples, feita para o
   celular (e que também funciona no computador). Ele monta a programação dos
   encarregados como pré-programação, envia o pacote, e o planejamento analisa,
   edita, reprova ou aprova. Só depois de aprovada ela é programação oficial.

   Duas metades neste arquivo:
     · a tela do supervisor  (iniciar, render, formulário)
     · a caixa de solicitações do planejamento  (abrirSolicitacoes, analisar)
   O banco (db/54) é quem manda: o que a tela esconde, ele também recusa.
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  var db = window.SIPAV.db;
  var ui = window.SIPAV.ui;
  var E = window.SIPAV.estado;
  var $ = ui.$, esc = ui.esc;

  /* ------------------------------------------------------------ Estado ----- */

  var S = {
    ativo: false,
    trecho: null,
    sol: null,               // o pacote em andamento do supervisor neste trecho
    minhas: [],              // as linhas dele
    erro: null,
    consulta: [],            // espelho do que a tela completa carregou: oficial e pré-programações
    torres: [],
    torrePorNome: {},
    faixa: false,            // marcando uma faixa de torres na grade
    ancora: null,
    arrasto: false,          // arrastar pela grade marca várias torres (ligado pelo botão)
    arrastando: null,        // o arrasto em andamento: { modo: 'por' | 'tirar', ultimo, x, y }
    abaMinhas: null,         // a aba aberta dentro de Minhas programações (nula: a primeira com linhas)
    selLinhas: {}            // linhas marcadas na aba Minhas programações, para mexer em várias de uma vez
  };
  var F = null;              // o formulário aberto
  var atualizador = null;

  function hojeIso() { return ui.iso(new Date()); }

  function norm(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function nomeCurtoDoDia(iso) {
    return ui.diaDaSemana(iso).slice(0, 3).replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + ui.dataCurta(iso);
  }

  function encarregadoPorId(id) {
    return (E.encarregados || []).filter(function (e) { return e.id === id; })[0] || null;
  }

  function atividadePorId(id) {
    return (E.atividades || []).filter(function (a) { return a.id === id; })[0] || null;
  }

  function pct(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR') + '%';
  }

  function ehEditavel() { return !S.sol || S.sol.status === 'RASCUNHO' || S.sol.status === 'DEVOLVIDA'; }

  /** O planejamento já decidiu este pacote (tudo, parte ou nada aprovado). */
  function jaDecidida() { return !!S.sol && ['APROVADA', 'PARCIAL', 'REPROVADA'].indexOf(S.sol.status) !== -1; }

  /* ----------------------------------------------------- A janela dele ----- */

  /**
   * O supervisor programa só o semanal e o quinzenal dele: da próxima segunda-feira depois de
   * hoje, por duas semanas. Hoje quarta 14/10, é de 19/10 a 01/11. Não há programação para o que
   * já passou nem para os dias até a segunda: o resto ele só consulta.
   */
  function janela() {
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var falta = (8 - hoje.getDay()) % 7 || 7;      // dias até a próxima segunda (domingo = 1)
    var segunda = ui.somarDias(hoje, falta);
    return { de: ui.iso(segunda), ate: ui.iso(ui.somarDias(segunda, 13)) };
  }

  function diasDaJanela() {
    var j = janela(), dias = [];
    for (var i = 0; i < 14; i++) dias.push(ui.iso(ui.somarDias(ui.paraData(j.de), i)));
    return dias;
  }

  /* ------------------------------------------------ O calendário dele ----- */

  var SIGLAS_DO_DIA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  function siglaDoDia(iso) { return SIGLAS_DO_DIA[ui.paraData(iso).getDay()]; }

  /** Semanal (a primeira semana da janela) ou quinzenal (a segunda); vazio para o dia fora da janela. */
  function semanaDoDia(iso) {
    var i = diasDaJanela().indexOf(iso);
    return i === -1 ? '' : i < 7 ? 'Semanal' : 'Quinzenal';
  }

  /** O dia escrito para o botão: sigla do dia da semana em destaque, depois a data e se é semanal ou quinzenal. */
  function rotuloDoDia(iso) {
    if (!iso) return '<span class="sup-dia-vazio">SEM DATA</span>';
    var sem = semanaDoDia(iso);
    return '<b>' + siglaDoDia(iso) + '</b><span>' + esc(ui.dataCurta(iso)) + '</span>' +
      (sem ? '<em class="sup-sem-' + sem.toLowerCase() + '">' + sem + '</em>' : '');
  }

  /**
   * Só os dias que ele pode programar, em duas faixas: a semanal e a quinzenal. O dia da semana
   * vem grande, e a data pequena embaixo. `selecionados` é um mapa dia → true. `extras` são dias
   * fora da janela que já estão na linha (uma programação antiga), para ela não perder o dia.
   */
  function htmlDoCalendario(selecionados, acao, extras) {
    var dias = diasDaJanela();
    var grupos = [
      { id: 'semanal', rotulo: 'Semanal', dias: dias.slice(0, 7) },
      { id: 'quinzenal', rotulo: 'Quinzenal', dias: dias.slice(7) }
    ];
    var fora = (extras || []).filter(function (d) { return dias.indexOf(d) === -1; });
    if (fora.length) grupos.push({ id: 'outro', rotulo: 'Dia da programação', dias: fora });

    return '<div class="sup-cal">' + grupos.map(function (g) {
      var de = g.dias[0], ate = g.dias[g.dias.length - 1];
      return '<div class="sup-cal-grupo sup-cal-' + g.id + '"><div class="sup-cal-titulo"><b>' + g.rotulo.toUpperCase() + '</b>' +
        '<span>' + esc(ui.dataCurta(de)) + (ate !== de ? ' a ' + esc(ui.dataCurta(ate)) : '') + '</span></div>' +
        '<div class="sup-cal-dias">' + g.dias.map(function (d) {
          return '<button type="button" class="sup-cal-dia' + (selecionados && selecionados[d] ? ' ativo' : '') + (ui.paraData(d).getDay() === 0 ? ' dom' : '') +
            '" data-acao="' + acao + '" data-dia="' + d + '"><b>' + siglaDoDia(d) + '</b><span>' + esc(ui.dataCurta(d)) + '</span></button>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  var calendario = null;   // o seletor de um dia só, aberto por cima de outras janelas (o lote)

  /** Abre o calendário dele para escolher um dia. Serve ao lote do planejamento no modo supervisor. */
  function escolherDia(titulo, atual, aoEscolher) {
    calendario = { aoEscolher: aoEscolher };
    var marcado = {}; if (atual) marcado[atual] = true;
    $('supCalendario').innerHTML =
      '<div class="sup-folha-caixa sup-cal-caixa" role="dialog" aria-modal="true">' +
        '<div class="sup-folha-topo"><strong>' + esc(titulo || 'Escolher o dia') + '</strong>' +
          '<button type="button" class="sup-x" data-acao="cal-fechar" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
        '<div class="sup-folha-corpo">' + htmlDoCalendario(marcado, 'cal-dia', atual ? [atual] : []) +
          '<p class="sup-fraco">Você programa de ' + esc(ui.dataCurta(janela().de)) + ' a ' + esc(ui.dataCurta(janela().ate)) + '.</p></div>' +
      '</div>';
    ui.mostrar('supCalendario');
    ui.icones();
  }

  function fecharCalendario() {
    calendario = null;
    ui.esconder('supCalendario');
  }

  /* ------------------------------------------------------- Início e saída -- */

  /** Chamado depois que a tela completa carregou, já em modo supervisor. */
  function iniciar() {
    S.ativo = true;
    sincronizar();
    ligarEventos();
    escreverAviso();

    if (atualizador) clearInterval(atualizador);
    atualizador = setInterval(function () {
      if (!document.hidden && !F && !G && S.ativo) window.SIPAV.app.recarregarProgramacoes().catch(function () {});
    }, 60000);

    return carregarMinha();
  }

  function parar() {
    S.ativo = false;
    F = null; G = null;
    if (atualizador) { clearInterval(atualizador); atualizador = null; }
    document.body.classList.remove('modo-supervisor', 'sup-travado', 'sup-arrastando');
    E.modoSupervisor = false;
    ['supFolha', 'supGrade', 'supBarraTorres', 'supEnviar'].forEach(function (id) { ui.esconder(id); });
  }

  function trechoMudou() {
    S.trecho = E.trechoAtual;
    S.sol = null; S.minhas = []; S.selLinhas = {};
    E.supSel = {};
    S.faixa = false; S.ancora = null;
    sincronizar();
    atualizarBarraDeTorres();
    return carregarMinha();
  }

  /** A tela completa acabou de recarregar as programações: o que o supervisor consulta é o mesmo. */
  function aoRecarregar() {
    sincronizar();
    carregarMinha();
  }

  /** O aviso do alto: de que dia a que dia ele programa. */
  function escreverAviso() {
    var j = janela();
    var el = $('bannerSupervisor');
    if (!el) return;
    el.innerHTML = '<strong>Você programa de ' + esc(ui.dataCurta(j.de)) + ' a ' + esc(ui.dataCurta(j.ate)) +
      '</strong><span>o semanal e o quinzenal. O resto da programação é só para consultar.</span>';
    el.classList.remove('hidden');
  }

  var eventosLigados = false;

  function ligarEventos() {
    if (eventosLigados) return;
    eventosLigados = true;

    document.addEventListener('click', aoClicar);

    // Selecionar arrastando: pointer events servem ao dedo e ao mouse. Com o arrasto ligado a grade não rola
    // por toque (touch-action), e o clique que vem depois do toque é engolido, para não marcar duas vezes.
    document.addEventListener('pointerdown', aoComecarArrasto, true);
    document.addEventListener('pointermove', aoArrastar, true);
    document.addEventListener('pointerup', aoSoltarArrasto, true);
    document.addEventListener('pointercancel', aoSoltarArrasto, true);
    document.addEventListener('click', function (ev) {
      if (!S.ativo || !S.arrasto) return;
      if (ev.target.closest && ev.target.closest('#visaoGrade')) { ev.stopPropagation(); ev.preventDefault(); }
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (!S.ativo || ev.key !== 'Escape') return;
      if (calendario) fecharCalendario();
      else if (lista) fecharLista();
      else if (G) fecharGrade();
      else if (F) fecharFormulario();
    });
    document.addEventListener('visibilitychange', function () {
      if (S.ativo && !document.hidden && !F && !G) window.SIPAV.app.recarregarProgramacoes().catch(function () {});
    });
  }

  /* -------------------------------------------------------------- Dados ---- */

  /** As programações que a tela completa carregou: o oficial e as pré-programações, do trecho e da obra. */
  function todas() { return E.programacoesObra || E.programacoes || []; }

  /** Espelha o que a tela completa carregou: as torres do trecho e o que está programado na janela. */
  function sincronizar() {
    S.trecho = E.trechoAtual;
    S.torres = E.torres || [];
    S.torrePorNome = {};
    S.torres.forEach(function (t) { S.torrePorNome[norm(t.identificador).replace(/\s+/g, '')] = t; });
    S.consulta = todas();
  }

  /** O pacote dele neste trecho e as linhas dele. Sem a migração 54 a tabela não existe, e a aba diz isso. */
  function carregarMinha() {
    if (!E.trechoAtual) return Promise.resolve();
    return db.minhaSolicitacao(E.trechoAtual.id).then(function (sol) {
      S.sol = sol;
      S.erro = null;
      // Junto com o pacote atual vêm as reprovadas recentes de pacotes anteriores, para corrigir aos poucos
      return Promise.all([
        sol ? db.programacoesDaSolicitacao(sol.id) : [],
        db.reprovadasRecentes(E.trechoAtual.id).catch(function () { return []; })
      ]);
    }).then(function (r) {
      var ja = {};
      r[0].forEach(function (p) { ja[p.id] = true; });
      S.minhas = r[0].concat(r[1].filter(function (p) { return !ja[p.id]; }));
    }).catch(function (e) {
      S.erro = e.message;
    }).then(function () {
      atualizarSelo();
      if (E.aba === 'solicitacao') renderMinha();
    });
  }

  /** Recarrega a tela toda (grade, por encarregado) e o pacote dele. */
  function atualizarTudo() {
    return window.SIPAV.app.recarregarProgramacoes().then(carregarMinha);
  }

  /** A programação é dele? */
  function ehMinha(p) { return !!p && !!p.criado_por && !!E.perfil && p.criado_por === E.perfil.id; }

  /** Quem decidiu o pacote: o nome que vem do banco, ou "o planejamento" quando não veio. */
  function quemDecidiuOPacote() {
    return (S.sol && S.sol.decididor && S.sol.decididor.nome) || 'o planejamento';
  }

  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /** O pedido de alteração (ou de apagar) que está esperando para uma programação aprovada dele. */
  function pedidoDe(id) {
    return S.minhas.concat(todas()).filter(function (x) {
      return x.substitui_id === id && x.situacao === 'SOLICITADA';
    })[0] || null;
  }

  /** Programação aprovada dele, de hoje em diante, e sem o pacote dele travado na análise. */
  function podePedirAlteracao(p) {
    return p.situacao === 'APROVADA' && ehMinha(p) && p.data >= hojeIso() && !(S.sol && S.sol.status === 'ENVIADA');
  }

  /** Uma linha do jeito que se escreve num aviso: "0/1 · MONTAGEM · Seg 19/10 · Alielton · 100%". */
  function descricaoCurta(p) {
    return p.torre.identificador + ' · ' + (p.atividade ? p.atividade.nome : '') + ' · ' + nomeCurtoDoDia(p.data) + ' · ' +
      (p.encarregado ? p.encarregado.nome : 'sem encarregado') + ' · ' + pct(p.percentual);
  }

  /** O que já está programado (oficial ou solicitado por outro) numa torre num dia. */
  function ocupacao(torreId, data, ignorarId, ignorarId2) {
    return S.consulta.filter(function (p) {
      if (!p.torre || p.torre.id !== torreId || p.data !== data) return false;
      if (ignorarId && p.id === ignorarId) return false;
      // O pedido de alteração não conflita com a programação que ele mesmo vai substituir
      if (ignorarId2 && p.id === ignorarId2) return false;
      // O que está no meu pacote não conta como "de outro"
      if (S.sol && p.solicitacao_id === S.sol.id) return false;
      return true;
    });
  }

  function origemDe(p) {
    if (p.situacao === 'APROVADA') return 'Oficial';
    return 'Solicitada por ' + ((p.criador && p.criador.nome) || 'outro supervisor');
  }

  /** "MONTAGEM (Iran Alves), já na programação oficial" / "… já solicitada por Fulano". */
  function textoDaOcupacao(o) {
    return (o.atividade ? o.atividade.nome : 'Outra atividade') + (o.encarregado ? ' (' + o.encarregado.nome + ')' : '') +
      (o.situacao === 'APROVADA' ? ', já na programação oficial'
        : ', já solicitada por ' + ((o.criador && o.criador.nome) || 'outro supervisor'));
  }

  /* ------------------------------------------- A aba Minhas programações -- */

  function atualizarSelo() {
    var selo = $('seloMinhaSol');
    if (!selo) return;
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    selo.textContent = n;
    selo.classList.toggle('hidden', !n);
  }

  function chipAtividade(a) {
    var cor = a ? a.cor_fundo : '#94A3B8';
    return '<span class="sup-chip" style="background:' + cor + ';color:' + ui.corDoTexto(cor) + '">' +
           esc(a ? a.nome : '—') + '</span>';
  }

  function cartaoStatus() {
    if (!S.sol) {
      return '<div class="sup-status"><strong>Nenhuma programação em andamento</strong>' +
             '<p>Toque nas torres da <b>Grade</b>, ou no <b>+</b> de um dia em <b>Por Encarregado</b>, para começar. ' +
             'Quando terminar, envie para o planejamento analisar.</p></div>';
    }
    if (S.sol.status === 'DEVOLVIDA') {
      return '<div class="sup-status devolvida"><strong>Devolvida por ' + esc(quemDecidiuOPacote()) + '</strong>' +
             '<p>' + esc(S.sol.motivo_devolucao || 'Corrija e envie de novo.') + '</p>' +
             '<p class="sup-fraco">Corrija o que está errado e envie de novo.</p></div>';
    }
    if (S.sol.status === 'ENVIADA') {
      return '<div class="sup-status enviada"><strong>Enviada para análise</strong>' +
             '<p>Enviada ' + esc(ui.quandoRelativo(S.sol.enviada_em)) + '. Aguardando o planejamento. ' +
             'Enquanto isso não dá para alterar.</p></div>';
    }
    if (S.sol.status === 'APROVADA') {
      return '<div class="sup-status aprovada"><strong>Aprovada por ' + esc(quemDecidiuOPacote()) + '</strong>' +
             '<p>' + esc(maiuscula(quemDecidiuOPacote())) + ' aprovou ' + esc(ui.quandoRelativo(S.sol.decidida_em)) +
             '. Já é programação oficial.</p></div>';
    }
    if (S.sol.status === 'PARCIAL' || S.sol.status === 'REPROVADA') {
      // Aprovada é a oficial; o pedido de alteração ou de apagar aprovado fica CANCELADA (já foi aplicado)
      var ok = S.minhas.filter(function (p) { return p.situacao === 'APROVADA' || p.situacao === 'CANCELADA'; }).length;
      var recusadas = S.minhas.filter(function (p) { return p.situacao === 'RECUSADA'; }).length;
      var parcial = S.sol.status === 'PARCIAL';
      return '<div class="sup-status ' + (parcial ? 'enviada' : 'devolvida') + '"><strong>' +
             (parcial ? 'Aprovada em parte por ' : 'Reprovada por ') + esc(quemDecidiuOPacote()) + '</strong>' +
             '<p>' + (ok ? ok + (ok === 1 ? ' aprovada' : ' aprovadas') + ' (já valem na programação oficial) e ' : '') +
             recusadas + (recusadas === 1 ? ' reprovada' : ' reprovadas') + ', decidido ' + esc(ui.quandoRelativo(S.sol.decidida_em)) +
             '. O motivo de cada reprovada está abaixo.</p>' +
             '<p class="sup-fraco">Toque numa reprovada para corrigir, ou marque várias para trocar o encarregado de todas de uma vez. Depois é só enviar de novo.</p></div>';
    }
    return '<div class="sup-status"><strong>Rascunho</strong>' +
           '<p>Ainda não foi enviado. Quando terminar, toque em <b>Enviar para análise</b>.</p></div>';
  }

  /** Os grupos da aba, na ordem em que aparecem: o que fazer com cada linha está no próprio título. */
  var SECOES = [
    { id: 'enviar', titulo: 'Para enviar', rotuloAba: 'Para enviar', dica: 'Ainda não foram para o planejamento. Quando terminar, toque em <b>Enviar para análise</b>.' },
    { id: 'reprovadas', titulo: 'Reprovadas, para corrigir', rotuloAba: 'Reprovadas', dica: 'O planejamento não aprovou e devolveu para você corrigir. Toque numa para ver o motivo, corrigir e reapresentar.' },
    { id: 'analise', titulo: 'Enviadas, aguardando análise', rotuloAba: 'Em análise', dica: 'Estão com o planejamento. Enquanto isso não dá para alterar.' },
    { id: 'aprovadas', titulo: 'Aprovadas', rotuloAba: 'Aprovadas', dica: 'Já são programação oficial. Para mudar, toque na programação e faça o pedido.', recolhida: true }
  ];

  function secaoDe(p) {
    if (p.situacao === 'RECUSADA') return 'reprovadas';
    if (p.situacao === 'SOLICITADA') return ehEditavel() ? 'enviar' : 'analise';
    return 'aprovadas';
  }

  function renderMinha() {
    var cont = $('visaoSolicitacao');
    if (!cont) return;

    if (S.erro) {
      cont.innerHTML = '<div class="sup-status devolvida"><strong>Não foi possível abrir a solicitação</strong><p>' + esc(S.erro) +
        '</p><p class="sup-fraco">Se a mensagem fala de tabela ou função que não existe, falta aplicar a migração 54 no banco.</p></div>';
      renderBarraDeEnvio();
      return;
    }

    var editavel = ehEditavel();
    var html = '<div class="sup-minha">' + cartaoStatus();

    if (editavel || jaDecidida()) {
      html += '<button type="button" class="sup-programar" data-acao="por-encarregado">' +
              '<i data-lucide="plus" class="w-5 h-5"></i><span>Programar</span></button>';
    }

    // As linhas em quatro grupos, para ficar claro o que fazer com cada uma
    var porSecao = {};
    S.minhas.forEach(function (p) { (porSecao[secaoDe(p)] = porSecao[secaoDe(p)] || []).push(p); });

    // Abas dentro da aba: uma de cada vez, para a lista não ficar enorme. A que abre é a primeira com linhas
    var comLinhas = SECOES.filter(function (sec) { return (porSecao[sec.id] || []).length; });
    var padrao = comLinhas.length ? comLinhas[0].id : 'enviar';
    // Uma aba só vale se tem linhas (Para enviar também vale vazia, mas só quando dá para programar)
    var ativa = SECOES.some(function (sec) { return sec.id === S.abaMinhas && ((porSecao[sec.id] || []).length || (sec.id === 'enviar' && editavel)); })
      ? S.abaMinhas : padrao;
    S.abaMinhas = ativa;

    if (S.minhas.length) {
      html += '<div class="sup-abas-minhas" role="tablist">' + SECOES.filter(function (sec) {
        return (porSecao[sec.id] || []).length || (sec.id === 'enviar' && editavel);
      }).map(function (sec) {
        var n = (porSecao[sec.id] || []).length;
        return '<button type="button" role="tab" class="sup-aba-minhas sup-aba-' + sec.id + (sec.id === ativa ? ' ativa' : '') +
          '" data-acao="aba-minhas" data-aba="' + sec.id + '"><span>' + sec.rotuloAba + '</span><em>' + n + '</em></button>';
      }).join('') + '</div>';
    }

    SECOES.filter(function (sec) { return sec.id === ativa; }).forEach(function (sec) {
      var linhasDaSecao = porSecao[sec.id] || [];
      if (!linhasDaSecao.length && !(sec.id === 'enviar' && editavel && S.minhas.length)) return;

      var corpo = '';
      if (!linhasDaSecao.length) {
        corpo = '<p class="sup-fraco">Nada para enviar agora. Toque em <b>Programar</b> para adicionar.</p>';
      } else {
        var porDia = {};
        linhasDaSecao.forEach(function (p) { (porDia[p.data] = porDia[p.data] || []).push(p); });
        corpo = Object.keys(porDia).sort().map(function (dia) {
          var linhas = porDia[dia].slice().sort(function (a, b) {
            var ea = a.encarregado ? a.encarregado.nome : '', eb = b.encarregado ? b.encarregado.nome : '';
            return ea.localeCompare(eb, 'pt-BR') || ((a.torre && a.torre.ordem) - (b.torre && b.torre.ordem));
          });
          var marcaveisDoDia = linhas.filter(podeMarcar);
          return '<section class="sup-dia"><h3>' + esc(nomeCurtoDoDia(dia)) +
                 '<span>' + linhas.length + (linhas.length === 1 ? ' programação' : ' programações') + '</span>' +
                 (marcaveisDoDia.length > 1 ? '<button type="button" class="sup-dia-sel" data-acao="sel-dia" data-dia="' + dia + '" data-secao="' + sec.id + '">' +
                   (marcaveisDoDia.every(function (p) { return S.selLinhas[p.id]; }) ? 'Desmarcar o dia' : 'Marcar o dia') + '</button>' : '') + '</h3>' +
                 linhas.map(function (p) { return cartaoLinha(p, editavel && p.situacao === 'SOLICITADA'); }).join('') +
                 '</section>';
        }).join('');
      }

      var marcaveisDaSecao = linhasDaSecao.filter(podeMarcar);
      var botaoTodas = marcaveisDaSecao.length > 1
        ? '<button type="button" class="sup-seg-btn" data-acao="sel-secao" data-secao="' + sec.id + '">' +
          (marcaveisDaSecao.every(function (p) { return S.selLinhas[p.id]; }) ? 'Desmarcar todas' : 'Marcar todas') + '</button>' : '';
      // Reprovadas: dá para mandar de volta como estão, sem mexer (quando o motivo já foi resolvido por fora)
      if (sec.id === 'reprovadas' && marcaveisDaSecao.length) {
        botaoTodas += ' <button type="button" class="sup-seg-btn" data-acao="reapresentar-secao">Reapresentar todas</button>';
      }

      html += '<section class="sup-secao sup-secao-' + sec.id + '"><div class="sup-secao-topo"><p class="sup-fraco">' + sec.dica + '</p>' +
        (botaoTodas ? '<div class="sup-secao-botoes">' + botaoTodas + '</div>' : '') + '</div>' + corpo + '</section>';
    });
    cont.innerHTML = html + '</div>';
    // Marcas de linhas que já não existem saem
    Object.keys(S.selLinhas).forEach(function (id) { if (!S.minhas.some(function (p) { return p.id === id; })) delete S.selLinhas[id]; });
    atualizarBarraDeLinhas();
    renderBarraDeEnvio();
    ui.icones();
  }

  /** Dá para marcar a linha para mexer em várias: a ainda não enviada (menos pedido de apagar) e a reprovada dele. */
  function podeMarcar(p) {
    var tipo = p.exclusao ? 'apagar' : p.substitui_id ? 'alteracao' : '';
    return (ehEditavel() && p.situacao === 'SOLICITADA' && tipo !== 'apagar') ||
           (p.situacao === 'RECUSADA' && !p.exclusao && ehMinha(p));
  }

  /** O tipo do pedido: nenhum (linha comum), alteração ou apagar. */
  function tipoDoPedido(p) { return p.exclusao ? 'apagar' : p.substitui_id ? 'alteracao' : ''; }

  function cartaoLinha(p, podeMexer) {
    var tipo = tipoDoPedido(p);
    var avisos = (p.situacao !== 'SOLICITADA' || tipo === 'apagar' ? [] : ocupacao(p.torre.id, p.data, p.id, p.substitui_id)).map(function (o) {
      return '<p class="sup-aviso">⚠ Nesta torre, neste dia: ' + esc(textoDaOcupacao(o)) + '</p>';
    }).join('');

    // O que o pedido mexe: a programação oficial como está hoje
    var original = tipo ? todas().filter(function (x) { return x.id === p.substitui_id; })[0] : null;
    var era = tipo && original && p.situacao === 'SOLICITADA'
      ? '<p class="sup-fraco">Hoje é: ' + esc(descricaoCurta(original)) + '</p>' : '';

    var marca = tipo === 'apagar' ? '<span class="sup-pedido apagar">Pedido para apagar</span>'
      : tipo === 'alteracao' ? '<span class="sup-pedido">Pedido de alteração</span>' : '';

    var por = p.aprovador && p.aprovador.nome ? ' por ' + esc(p.aprovador.nome) : '';
    var decisao = '';
    if (p.situacao === 'RECUSADA') {
      decisao = '<p class="sup-recusa"><b>' + (tipo ? 'Pedido reprovado' : 'Reprovada') + por + '.</b> ' +
        esc(p.motivo_recusa || 'Sem justificativa registrada.') +
        (tipo ? ' A programação continua como estava.' : '') + '</p>';
    } else if (p.situacao === 'CANCELADA') {
      decisao = '<span class="sup-origem oficial">' + (tipo === 'apagar' ? 'Apagada, aprovado' : 'Alteração aprovada') + por + '</span>';
    } else if (p.situacao === 'APROVADA') {
      decisao = '<span class="sup-origem oficial">Aprovada' + por + ', já é oficial</span>';
    }

    // Reprovada dele (e que não é pedido de apagar): dá para corrigir tocando nela, e marcar para mexer em várias
    var corrigivel = p.situacao === 'RECUSADA' && !p.exclusao && ehMinha(p);
    var marcavel = (podeMexer && tipo !== 'apagar') || corrigivel;
    var acoes = '';
    if (corrigivel) {
      acoes = '<div class="sup-card-acoes">' +
        '<button type="button" data-acao="corrigir" data-id="' + p.id + '" aria-label="Corrigir"><i data-lucide="pencil" class="w-4 h-4"></i> Corrigir e reapresentar</button></div>';
    } else if (podeMexer) {
      acoes = '<div class="sup-card-acoes">' +
        (tipo === 'apagar' ? '' :
          '<button type="button" data-acao="editar" data-id="' + p.id + '" aria-label="Editar"><i data-lucide="pencil" class="w-4 h-4"></i> Editar</button>') +
        '<button type="button" data-acao="apagar" data-id="' + p.id + '" aria-label="Apagar" class="perigo"><i data-lucide="trash-2" class="w-4 h-4"></i> ' +
          (tipo ? 'Cancelar o pedido' : 'Apagar') + '</button></div>';
    } else if (podePedirAlteracao(p)) {
      // Aprovada e dele: não mexe direto, vai como pedido para o planejamento decidir
      var pendente = pedidoDe(p.id);
      acoes = pendente
        ? '<p class="sup-fraco">Já tem ' + (pendente.exclusao ? 'um pedido para apagar' : 'um pedido de alteração') + ' desta programação.</p>'
        : '<div class="sup-card-acoes">' +
            '<button type="button" data-acao="pedir-alteracao" data-id="' + p.id + '" aria-label="Pedir alteração"><i data-lucide="pencil" class="w-4 h-4"></i> Pedir alteração</button>' +
            '<button type="button" data-acao="pedir-apagar" data-id="' + p.id + '" aria-label="Pedir para apagar" class="perigo"><i data-lucide="trash-2" class="w-4 h-4"></i> Pedir para apagar</button>' +
          '</div>';
    }

    return '<div class="sup-card' + (p.situacao === 'RECUSADA' ? ' recusada' : '') + (tipo && p.situacao === 'SOLICITADA' ? ' pedido' : '') + (corrigivel ? ' tocavel' : '') + '"' +
      (corrigivel ? ' data-acao="corrigir" data-id="' + p.id + '"' : '') + '>' +
      '<div class="sup-card-topo">' +
        (marcavel ? '<input type="checkbox" class="sup-sel" data-acao="sel-linha" data-id="' + p.id + '"' +
          (S.selLinhas[p.id] ? ' checked' : '') + ' aria-label="Marcar">' : '') + '<strong>' + esc(p.torre.identificador) + '</strong>' + chipAtividade(p.atividade) + marca + '</div>' +
      '<div class="sup-card-meio"><span>' + esc(p.encarregado ? p.encarregado.nome : 'Sem encarregado') + '</span>' +
        '<span class="sup-pct">' + pct(p.percentual) + '</span>' +
        (p.cabo ? '<span class="sup-fraco">' + esc(String(p.cabo).replace('_', ' ')) + '</span>' : '') + '</div>' +
      (p.observacao ? '<p class="sup-fraco">' + esc(p.observacao) + '</p>' : '') +
      era + decisao + avisos + acoes +
      '</div>';
  }

  /* ---------------------------------- Mexer em várias linhas de uma vez ---- */

  function alternarLinha(id, marcada) {
    if (marcada) S.selLinhas[id] = true; else delete S.selLinhas[id];
    atualizarBarraDeLinhas();
    renderBarraDeEnvio();
  }

  /** Marca todas as dadas; se já estavam todas marcadas, desmarca. */
  function marcarVarias(linhas) {
    var todas = linhas.length > 0 && linhas.every(function (p) { return S.selLinhas[p.id]; });
    linhas.forEach(function (p) { if (todas) delete S.selLinhas[p.id]; else S.selLinhas[p.id] = true; });
    renderMinha();
  }

  /**
   * Manda as reprovadas de volta para "Para enviar" como estão, sem mudar nada (a correção foi feita
   * por fora, ou o motivo não pedia mudança). Depois é só enviar a solicitação.
   */
  function reapresentarSemMudar(ids) {
    var reprovadas = ids.map(function (id) { return S.minhas.filter(function (p) { return p.id === id; })[0]; })
      .filter(function (p) { return p && p.situacao === 'RECUSADA' && !p.exclusao; });
    if (!reprovadas.length) { ui.avisar('Marque pelo menos uma reprovada.', 'alerta', 4000); return; }
    ui.confirmar('Reapresentar ' + reprovadas.length + (reprovadas.length === 1 ? ' reprovada' : ' reprovadas'),
      'Elas voltam para "Para enviar" do jeito que estão, sem mudar nada. Depois é só tocar em Enviar para análise. ' +
      'Para mudar alguma coisa, toque na programação e use Corrigir e reapresentar.', 'Reapresentar').then(function (sim) {
      if (!sim) return;
      ui.processando('Reapresentando…');
      return garantirRascunho().then(function (sol) {
        return db.reapresentarReprovadas(reprovadas.map(function (p) { return p.id; }), sol.id, {});
      }).then(function (r) {
        S.selLinhas = {};
        return atualizarTudo().then(function () {
          ui.pronto();
          if (r.falhas && r.falhas.length) {
            ui.avisar(r.corrigidas + ' voltou(voltaram). Não deu: ' + r.falhas.slice(0, 2).map(function (f) { return f.torre + ' em ' + ui.dataCurta(f.data) + ': ' + f.motivo; }).join(' · '), 'alerta', 10000);
          } else {
            ui.avisar(r.corrigidas + (r.corrigidas === 1 ? ' voltou' : ' voltaram') + ' para "Para enviar". Envie a solicitação para o planejamento analisar de novo.', 'sucesso', 7000);
          }
        });
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(semMigracao58(e.message), 'erro', 9000); });
  }

  /** Apaga de uma vez as marcadas que ainda não foram enviadas. Reprovada não se apaga: fica no pacote antigo. */
  function apagarMarcadas() {
    var ids = Object.keys(S.selLinhas);
    var linhas = ids.map(function (id) { return S.minhas.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    var apagaveis = linhas.filter(function (p) { return p.situacao === 'SOLICITADA' && ehEditavel(); });
    var reprovadas = linhas.length - apagaveis.length;
    if (!apagaveis.length) {
      ui.avisar('As reprovadas não se apagam: corrija e reapresente, ou deixe como estão.', 'alerta', 6000);
      return;
    }
    var pedidos = apagaveis.filter(function (p) { return tipoDoPedido(p); }).length;
    ui.confirmar('Apagar ' + apagaveis.length + (apagaveis.length === 1 ? ' programação' : ' programações'),
      'Elas saem da sua solicitação.' + (pedidos ? ' Os pedidos de alteração ou de apagar que estiverem entre elas são cancelados, e a programação aprovada continua como está.' : '') +
        (reprovadas ? ' ' + reprovadas + (reprovadas === 1 ? ' marcada reprovada fica' : ' marcadas reprovadas ficam') + ', porque não se apagam.' : ''),
      'Apagar').then(function (sim) {
      if (!sim) return;
      ui.processando('Apagando ' + apagaveis.length + '…');
      var fila = apagaveis.slice(), feitas = 0, falhas = [];
      function um() {
        var p = fila.shift();
        if (!p) return Promise.resolve();
        return db.removerProgramacao(p.id).then(function () { feitas++; },
          function (e) { falhas.push(p.torre.identificador + ' em ' + ui.dataCurta(p.data) + ': ' + e.message); }).then(um);
      }
      return Promise.all([um(), um(), um(), um()]).then(function () {
        S.selLinhas = {};
        return atualizarTudo();
      }).then(function () {
        ui.pronto();
        if (falhas.length) ui.avisar(feitas + ' apagada(s). Não deu: ' + falhas.slice(0, 2).join(' · '), 'alerta', 9000);
        else ui.avisar(feitas + (feitas === 1 ? ' programação apagada.' : ' programações apagadas.'), 'sucesso', 4000);
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  /** A barra de baixo com as linhas marcadas (só na aba Minhas programações). */
  function atualizarBarraDeLinhas() {
    var barra = $('supBarraLinhas');
    if (!barra) return;
    var n = Object.keys(S.selLinhas).length;
    var mostrar = E.aba === 'solicitacao' && !S.erro && n > 0;
    barra.classList.toggle('hidden', !mostrar);
    var temReprovada = Object.keys(S.selLinhas).some(function (id) {
      var p = S.minhas.filter(function (x) { return x.id === id; })[0];
      return p && p.situacao === 'RECUSADA';
    });
    $('supBlReapresentar').classList.toggle('hidden', !temReprovada);
    if (mostrar) {
      $('supBlInfo').innerHTML = '<b>' + n + (n === 1 ? ' programação marcada' : ' programações marcadas') + '</b>' +
        '';
    }
  }

  /** Escolhe o encarregado e aplica nas marcadas: as ainda não enviadas mudam direto, as reprovadas voltam corrigidas. */
  function trocarEncarregadoDasMarcadas() {
    var ids = Object.keys(S.selLinhas);
    if (!ids.length) return;
    var itens = E.encarregados.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
      .map(function (e) { return { id: e.id, rotulo: e.nome }; });

    // A lista de escolha vive dentro da folha do formulário: aqui monta a folha só para ela
    $('supFolha').innerHTML = '<div id="supLista" class="sup-lista hidden"></div>';
    ui.mostrar('supFolha');
    document.body.classList.add('sup-travado');
    abrirLista('Trocar o encarregado de ' + ids.length + (ids.length === 1 ? ' programação' : ' programações'), itens, '', function (encId) {
      ui.esconder('supFolha');
      document.body.classList.remove('sup-travado');
      aplicarEncarregadoNasMarcadas(ids, encId);
    });
  }

  function aplicarEncarregadoNasMarcadas(ids, encId) {
    var linhas = ids.map(function (id) { return S.minhas.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    var abertas = linhas.filter(function (p) { return p.situacao === 'SOLICITADA'; });
    var reprovadas = linhas.filter(function (p) { return p.situacao === 'RECUSADA'; });
    var falhas = [], feitas = 0;

    ui.processando('Trocando o encarregado…');
    // Primeiro as reprovadas, que precisam de um pacote aberto
    var passo1 = reprovadas.length
      ? garantirRascunho().then(function (sol) {
          return db.reapresentarReprovadas(reprovadas.map(function (p) { return p.id; }), sol.id, { encarregado_id: encId })
            .then(function (r) {
              feitas += r.corrigidas || 0;
              (r.falhas || []).forEach(function (f) { falhas.push(f.torre + ' em ' + ui.dataCurta(f.data) + ': ' + f.motivo); });
            });
        })
      : Promise.resolve();

    passo1.then(function () {
      return abertas.reduce(function (antes, p) {
        return antes.then(function () {
          return db.atualizarProgramacao(p.id, { encarregado_id: encId })
            .then(function () { feitas++; }, function (e) { falhas.push(p.torre.identificador + ' em ' + ui.dataCurta(p.data) + ': ' + e.message); });
        });
      }, Promise.resolve());
    }).then(function () {
      S.selLinhas = {};
      return atualizarTudo();
    }).then(function () {
      ui.pronto();
      var enc = encarregadoPorId(encId);
      if (falhas.length) {
        ui.avisar(feitas + ' trocada(s) para ' + (enc ? enc.nome : 'sem encarregado') + '. Não deu: ' + falhas.slice(0, 2).join(' · '), 'alerta', 10000);
      } else {
        ui.avisar(feitas + (feitas === 1 ? ' programação agora é de ' : ' programações agora são de ') + (enc ? enc.nome : 'sem encarregado') +
          (reprovadas.length ? '. As reprovadas voltaram para a sua solicitação: envie de novo.' : '.'), 'sucesso', 7000);
      }
    }).catch(function (e) { ui.pronto(); ui.avisar(semMigracao58(e.message), 'erro', 9000); });
  }

  /** Antes da migração 58 a função das reprovadas não existe: diz isso em vez da mensagem do banco. */
  function semMigracao58(msg) {
    return /reapresentar_reprovadas|schema cache|Could not find the function/i.test(msg || '')
      ? 'Falta aplicar a migração 58 no banco para corrigir programação reprovada.' : msg;
  }

  function renderBarraDeEnvio() {
    var barra = $('supEnviar');
    if (!barra) return;
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    var mostrar = E.aba === 'solicitacao' && !S.erro && ehEditavel() && S.sol && n > 0 && !Object.keys(S.selLinhas).length;
    barra.classList.toggle('hidden', !mostrar);
    if (mostrar) $('supEnviarBotao').innerHTML = 'Enviar para análise <b>(' + n + ')</b>';
  }

  /* ------------------------------------------- Tocar na grade e nos chips --- */

  function bloqueadoPelaAnalise() {
    if (S.sol && S.sol.status === 'ENVIADA') {
      ui.avisar('Sua solicitação está aguardando o planejamento. Dá para programar de novo depois da análise.', 'alerta', 5000);
      return true;
    }
    return false;
  }

  /* ------------------------------------------- Selecionar arrastando ----- */

  function alternarArrasto() {
    S.arrasto = !S.arrasto;
    S.arrastando = null;
    document.body.classList.toggle('sup-arrastando', S.arrasto);
    var b = $('btnArrastar');
    if (b) {
      b.classList.toggle('ativo', S.arrasto);
      b.setAttribute('aria-pressed', S.arrasto ? 'true' : 'false');
      b.querySelector('.estado-arrastar').textContent = S.arrasto ? 'ligado' : 'desligado';
    }
    if (S.arrasto) ui.avisar('Passe o dedo pelas torres para marcar. Começando numa já marcada, desmarca. Desligue para rolar a tela.', 'info', 6000);
  }

  function torreDoPonto(x, y) {
    var el = document.elementFromPoint(x, y);
    var card = el && el.closest ? el.closest('#visaoGrade .cartao-torre') : null;
    return card ? card.getAttribute('data-torre') : null;
  }

  function aplicarNoArrasto(id) {
    if (!id) return;
    E.supSel = E.supSel || {};
    if (S.arrastando.modo === 'por') E.supSel[id] = true; else delete E.supSel[id];
    marcarCartao(id);
  }

  function aoComecarArrasto(ev) {
    if (!S.ativo || !S.arrasto || E.aba !== 'grade' || bloqueadoSilencioso()) return;
    var id = torreDoPonto(ev.clientX, ev.clientY);
    if (!id) return;
    E.supSel = E.supSel || {};
    // Começar numa torre já marcada desmarca; numa livre, marca
    S.arrastando = { modo: E.supSel[id] ? 'tirar' : 'por', ultimo: id, x: ev.clientX, y: ev.clientY };
    ev.preventDefault();
    aplicarNoArrasto(id);
    atualizarBarraDeTorres();
  }

  function aoArrastar(ev) {
    if (!S.ativo || !S.arrastando) return;
    ev.preventDefault();
    var a = S.arrastando;
    // Dedo rápido pula cartões: anda do ponto anterior ao atual de pouco em pouco
    var passos = Math.max(1, Math.ceil(Math.hypot(ev.clientX - a.x, ev.clientY - a.y) / 12));
    for (var i = 1; i <= passos; i++) {
      var id = torreDoPonto(a.x + (ev.clientX - a.x) * i / passos, a.y + (ev.clientY - a.y) * i / passos);
      if (id && id !== a.ultimo) { a.ultimo = id; aplicarNoArrasto(id); }
    }
    a.x = ev.clientX; a.y = ev.clientY;
    atualizarBarraDeTorres();
  }

  function aoSoltarArrasto() {
    if (!S.arrastando) return;
    S.arrastando = null;
    atualizarBarraDeTorres();
  }

  /** Sem aviso: o pacote enviado trava a programação, mas o toque na grade continua marcando para consulta. */
  function bloqueadoSilencioso() { return !!(S.sol && S.sol.status === 'ENVIADA'); }

  /** Tocar numa torre da grade marca ela para programar. Com "Faixa", da primeira à última. */
  function tocarTorre(id) {
    if (bloqueadoPelaAnalise()) return;
    E.supSel = E.supSel || {};

    if (S.faixa) {
      var ids = S.torres.map(function (t) { return t.torre_id; });
      if (!S.ancora) { S.ancora = id; E.supSel[id] = true; marcarCartao(id); atualizarBarraDeTorres(); return; }
      var i = ids.indexOf(S.ancora), j = ids.indexOf(id);
      for (var k = Math.min(i, j); k <= Math.max(i, j); k++) { E.supSel[ids[k]] = true; marcarCartao(ids[k]); }
      S.faixa = false; S.ancora = null;
      atualizarBarraDeTorres();
      return;
    }

    if (E.supSel[id]) delete E.supSel[id]; else E.supSel[id] = true;
    marcarCartao(id);
    atualizarBarraDeTorres();
  }

  function marcarCartao(id) {
    var el = document.querySelector('#visaoGrade [data-torre="' + id + '"]');
    if (el) el.classList.toggle('cartao-selecionado', !!E.supSel[id]);
  }

  function torresDaSelecao() {
    return S.torres.filter(function (t) { return E.supSel && E.supSel[t.torre_id]; });
  }

  function atualizarBarraDeTorres() {
    var barra = $('supBarraTorres');
    if (!barra) return;
    var marcadas = torresDaSelecao();
    var mostrar = E.aba === 'grade' && E.modoSupervisor && (marcadas.length > 0 || S.faixa);
    barra.classList.toggle('hidden', !mostrar);
    if (!mostrar) return;
    $('supBtInfo').innerHTML = marcadas.length
      ? '<b>' + marcadas.length + (marcadas.length === 1 ? ' torre' : ' torres') + '</b><span>' +
        esc(marcadas.slice(0, 5).map(function (t) { return t.identificador; }).join(', ')) + (marcadas.length > 5 ? '…' : '') + '</span>'
      : '<span>Toque na primeira torre da faixa</span>';
    $('supBtFaixa').classList.toggle('ativo', S.faixa);
    $('supBtFaixa').textContent = S.faixa ? (S.ancora ? 'Toque na última' : 'Toque na primeira') : 'Faixa';
    $('supBtProgramar').disabled = !marcadas.length;
  }

  function limparSelecaoDeTorres() {
    var ids = Object.keys(E.supSel || {});
    E.supSel = {};
    S.faixa = false; S.ancora = null;
    ids.forEach(marcarCartao);
    atualizarBarraDeTorres();
  }

  /** O + do dia ou o Lançar do encarregado, na aba Por Encarregado: abre a folha já nele (e no dia). */
  function programarParaEncarregado(encarregadoId, dia) {
    if (bloqueadoPelaAnalise()) return;
    abrirFormulario(null, { modo: 'encarregado', encId: encarregadoId || '', dia: dia || '' });
  }

  /** Tocar numa programação: editar ou apagar a dele, ou só ver de quem é. */
  function tocarProgramacao(id) {
    var p = todas().concat(E.programacoes || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;

    var minha = !!S.sol && p.solicitacao_id === S.sol.id && p.situacao === 'SOLICITADA' && ehEditavel();
    var aprovadaDele = podePedirAlteracao(p);
    var pedidoAberto = aprovadaDele ? pedidoDe(p.id) : null;
    var tipo = tipoDoPedido(p);

    var quem = p.situacao === 'APROVADA'
      ? 'Programação oficial' + (p.aprovador && p.aprovador.nome ? ', aprovada por ' + p.aprovador.nome : '') + '.'
      : tipo === 'alteracao' ? 'Pedido de alteração de ' + ((p.criador && p.criador.nome) || 'outro supervisor') + ', ainda não aprovado.'
      : origemDe(p) + (p.solicitacao_id && S.sol && p.solicitacao_id === S.sol.id ? ' (a sua)' : '') + ', ainda não aprovada.';

    var original = tipo === 'alteracao' ? todas().filter(function (x) { return x.id === p.substitui_id; })[0] : null;
    var linhas = '<p class="text-sm"><b>' + esc(p.torre.identificador) + '</b> · ' + esc(p.atividade ? p.atividade.nome : '') + '</p>' +
      '<p class="text-sm" style="color:var(--texto-suave)">' + esc(nomeCurtoDoDia(p.data)) + ' · ' +
        esc(p.encarregado ? p.encarregado.nome : 'sem encarregado') + ' · ' + pct(p.percentual) + '</p>' +
      (p.observacao ? '<p class="sup-fraco">' + esc(p.observacao) + '</p>' : '') +
      (original ? '<p class="sup-fraco" style="margin-top:.5rem">Hoje é: ' + esc(descricaoCurta(original)) + '</p>' : '') +
      '<p class="sup-fraco" style="margin-top:.5rem">' + esc(quem) + '</p>' +
      (pedidoAberto
        ? '<p class="sup-fraco" style="margin-top:.5rem">Você já pediu ' + (pedidoAberto.exclusao ? 'para apagar esta programação' : 'uma alteração desta programação') +
          '. Ele está no seu pacote, na aba Minhas programações.</p>' : '');

    var botoes = [{ rotulo: 'Fechar', classe: 'btn-secundario' }];
    if (minha) {
      botoes = [
        { rotulo: 'Fechar', classe: 'btn-secundario' },
        { rotulo: tipo ? 'Cancelar o pedido' : 'Apagar', classe: 'btn-secundario btn-secundario-perigo', acao: function () { ui.fecharModal('modalGenerico'); apagarLinha(id); } },
        { rotulo: 'Editar', classe: 'btn-primario', acao: function () { ui.fecharModal('modalGenerico'); abrirFormulario(p); } }
      ];
    } else if (aprovadaDele && !pedidoAberto) {
      // Aprovada e dele: alterar ou apagar vai como pedido, e o planejamento decide
      botoes = [
        { rotulo: 'Fechar', classe: 'btn-secundario' },
        { rotulo: 'Pedir para apagar', classe: 'btn-secundario btn-secundario-perigo', acao: function () { ui.fecharModal('modalGenerico'); pedirParaApagar(id); } },
        { rotulo: 'Pedir alteração', classe: 'btn-primario', acao: function () { ui.fecharModal('modalGenerico'); abrirFormulario(p); } }
      ];
      linhas += '<p class="sup-fraco" style="margin-top:.5rem">Já está aprovada. Para mudar, você faz o pedido e o planejamento decide. ' +
        'Até lá ela continua como está.</p>';
    }
    ui.modalGenerico({ titulo: 'Programação', corpoHtml: linhas, botoes: botoes });
  }

  /* ------------------------------------------------------------ Cliques ---- */

  function aoClicar(ev) {
    if (!S.ativo) return;
    var alvo = ev.target.closest ? ev.target.closest('[data-acao]') : null;
    if (!alvo) return;
    var acao = alvo.getAttribute('data-acao');
    var id = alvo.getAttribute('data-id');

    switch (acao) {
      case 'por-encarregado': programarParaEncarregado('', ''); break;
      case 'bt-programar': programarDaGrade(); break;
      case 'bt-limpar': limparSelecaoDeTorres(); break;
      case 'arrastar-alternar': alternarArrasto(); break;
      case 'bt-faixa': S.faixa = !S.faixa; S.ancora = null; atualizarBarraDeTorres(); break;
      case 'editar':
      case 'pedir-alteracao': abrirFormulario(S.minhas.filter(function (p) { return p.id === id; })[0]); break;
      case 'apagar': apagarLinha(id); break;
      case 'pedir-apagar': pedirParaApagar(id); break;
      case 'corrigir': abrirFormulario(S.minhas.filter(function (p) { return p.id === id; })[0]); break;
      case 'sel-linha': alternarLinha(id, alvo.checked); break;
      case 'sel-limpar': S.selLinhas = {}; renderMinha(); break;
      case 'aba-minhas': S.abaMinhas = alvo.getAttribute('data-aba'); S.selLinhas = {}; renderMinha(); break;
      case 'sel-secao': marcarVarias(S.minhas.filter(function (p) { return secaoDe(p) === alvo.getAttribute('data-secao') && podeMarcar(p); })); break;
      case 'sel-dia': marcarVarias(S.minhas.filter(function (p) {
        return p.data === alvo.getAttribute('data-dia') && secaoDe(p) === alvo.getAttribute('data-secao') && podeMarcar(p);
      })); break;
      case 'sel-apagar': apagarMarcadas(); break;
      case 'sel-reapresentar': reapresentarSemMudar(Object.keys(S.selLinhas)); break;
      case 'reapresentar-secao': reapresentarSemMudar(S.minhas.filter(function (p) { return secaoDe(p) === 'reprovadas' && podeMarcar(p); }).map(function (p) { return p.id; })); break;
      case 'sel-trocar-enc': trocarEncarregadoDasMarcadas(); break;
      case 'enviar': enviarPacote(); break;
      case 'fechar-form': fecharFormulario(); break;
      case 'cal-fechar': fecharCalendario(); break;
      case 'cal-dia': { var cb = calendario && calendario.aoEscolher; var dia = alvo.getAttribute('data-dia'); fecharCalendario(); if (cb) cb(dia); break; }
      case 'salvar-form': salvarFormulario(); break;
      case 'escolher-enc': escolherEncarregado(); break;
      case 'escolher-atv': escolherAtividade(); break;
      case 'cabo': F.cabo = alvo.getAttribute('data-valor'); atualizarFormulario(); break;
      case 'dia-form': alternarDiaDoFormulario(alvo.getAttribute('data-dia')); break;
      case 'distribuicao': F.distribuicao = alvo.getAttribute('data-valor'); atualizarFormulario(); break;
      case 'pct-rapido': F.pct = Number(alvo.getAttribute('data-valor')); $('fPct').value = F.pct; atualizarFormulario(); break;
      case 'tirar-torre': tirarTorre(alvo.getAttribute('data-nome')); break;
      case 'fechar-lista': fecharLista(); break;
      case 'item-lista': escolherDaLista(alvo.getAttribute('data-id')); break;
      case 'abrir-grade': abrirGradeDoFormulario(); break;
      case 'grade-torre': alternarTorreDaGrade(alvo.getAttribute('data-id')); break;
      case 'grade-faixa': G.faixa = !G.faixa; G.ancora = null; atualizarRodapeDaGrade(); break;
      case 'grade-fechar': fecharGrade(); break;
      case 'grade-ok': confirmarGrade(); break;
    }
  }

  /** Das torres marcadas na grade da tela: abre a folha com elas e falta escolher a atividade. */
  function programarDaGrade() {
    var marcadas = torresDaSelecao();
    if (!marcadas.length) return;
    if (bloqueadoPelaAnalise()) return;
    // O mesmo lote do planejamento: várias atividades de uma vez e uma data para cada torre
    window.SIPAV.app.abrirProgramacaoEmLote(null, '', 100, null, marcadas, null, {});
  }

  /** Nas linhas de um lote: onde já tem programação (oficial ou de outro supervisor) na mesma torre e dia. */
  function avisosDeOcupacao(linhas) {
    var vistos = {}, avisos = [];
    linhas.forEach(function (l) {
      if (!l.data) return;
      ocupacao(l.torreId, l.data).forEach(function (o) {
        if (vistos[o.id + l.torreId]) return;
        vistos[o.id + l.torreId] = true;
        avisos.push(l.identificador + ' em ' + ui.dataCurta(l.data) + ': ' + textoDaOcupacao(o));
      });
    });
    return avisos;
  }

  document.addEventListener('input', function (ev) {
    if (!S.ativo) return;
    if (ev.target.id === 'fTorres') {
      F.torresTexto = ev.target.value; atualizarFormulario();
    } else if (ev.target.id === 'fPct') {
      F.pct = Number(ev.target.value) || 0; atualizarFormulario();
    } else if (ev.target.id === 'fObs') {
      F.obs = ev.target.value;
    } else if (ev.target.id === 'listaBusca') {
      desenharLista(ev.target.value);
    } else if (ev.target.id === 'gradeBusca' && G) {
      G.busca = ev.target.value; desenharGrade();
    }
  });
  /* --------------------------------------------------- Apagar e enviar ----- */

  function apagarLinha(id) {
    var p = S.minhas.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var pedido = !!tipoDoPedido(p);
    ui.confirmar(pedido ? 'Cancelar o pedido' : 'Apagar programação',
      p.torre.identificador + ' · ' + (p.atividade ? p.atividade.nome : '') + ' · ' + nomeCurtoDoDia(p.data) +
        (pedido ? '. O pedido sai da sua solicitação e a programação aprovada continua como está.' : '. Sai da sua solicitação.'),
      pedido ? 'Cancelar o pedido' : 'Apagar').then(function (sim) {
      if (!sim) return;
      ui.processando(pedido ? 'Cancelando…' : 'Apagando…');
      return db.removerProgramacao(id).then(atualizarTudo)
        .then(function () { ui.pronto(); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /** Pedir para apagar uma programação já aprovada: vai no pacote dele, e só sai quando o planejamento aprovar. */
  function pedirParaApagar(id) {
    var p = S.minhas.concat(todas()).filter(function (x) { return x.id === id; })[0];
    if (!p || !podePedirAlteracao(p)) return;
    if (pedidoDe(p.id)) { ui.avisar('Já tem um pedido para esta programação.', 'alerta', 5000); return; }
    ui.confirmar('Pedir para apagar',
      descricaoCurta(p) + '. A programação só sai quando o planejamento aprovar o pedido; até lá ela continua como está.',
      'Pedir para apagar').then(function (sim) {
      if (!sim) return;
      ui.processando('Pedindo…');
      return garantirRascunho().then(function (sol) {
        return db.criarProgramacao({
          torreId: p.torre.id, atividadeId: p.atividade.id, encarregadoId: p.encarregado ? p.encarregado.id : null,
          data: p.data, percentual: p.percentual, observacao: p.observacao, cabo: p.cabo || null,
          situacao: 'SOLICITADA', solicitacaoId: sol.id, substituiId: p.id, exclusao: true
        });
      }).then(atualizarTudo).then(function () {
        ui.pronto();
        ui.avisar('Pedido feito. Envie a solicitação para o planejamento decidir.', 'sucesso', 6000);
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(semMigracao(e.message), 'erro', 8000); });
  }

  /** Antes da migração 56 a coluna do pedido não existe: diz isso em vez da mensagem do banco. */
  function semMigracao(msg) {
    return /substitui_id|exclusao/i.test(msg || '')
      ? 'Falta aplicar a migração 56 no banco para pedir alteração de programação aprovada.' : msg;
  }

  function enviarPacote() {
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    if (!S.sol || !n) return;
    ui.confirmar('Enviar para análise',
      'Vão ' + n + (n === 1 ? ' programação' : ' programações') + ' para o planejamento analisar. ' +
      'Depois de enviar você não altera mais, até o planejamento aprovar ou reprovar.',
      'Enviar').then(function (sim) {
      if (!sim) return;
      ui.processando('Enviando…');
      return db.enviarSolicitacao(S.sol.id).then(atualizarTudo)
        .then(function () { ui.pronto(); ui.avisar('Enviado. O planejamento vai analisar.', 'sucesso', 5000); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  /* ---------------------------------------------------------- Formulário --- */

  function abrirFormulario(linha, opcoes) {
    opcoes = opcoes || {};
    if (S.sol && S.sol.status === 'ENVIADA') {
      ui.avisar('Está aguardando o planejamento. Dá para programar de novo depois da análise.', 'alerta', 5000);
      return;
    }

    F = {
      editId: linha ? linha.id : null,
      torre: linha ? linha.torre : null,                      // a torre da linha editada (fixa)
      original: !!linha && linha.situacao === 'APROVADA',     // pedido de alteração de uma já aprovada
      reapresentar: !!linha && linha.situacao === 'RECUSADA', // reprovada que ele corrige e reapresenta
      linhaRecusada: linha && linha.situacao === 'RECUSADA' ? linha : null,
      substituiId: linha ? (linha.substitui_id || null) : null,
      linhaOriginal: linha && linha.situacao === 'APROVADA' ? linha : null,
      encId: linha && linha.encarregado ? linha.encarregado.id : (opcoes.encId || ''),
      atvId: linha && linha.atividade ? linha.atividade.id : '',
      cabo: linha ? (linha.cabo || '') : '',
      torresTexto: linha ? linha.torre.identificador : (opcoes.torresTexto || ''),
      dias: {},
      distribuicao: 'todas',
      pct: linha ? Number(linha.percentual) || 100 : 100,
      obs: linha ? (linha.observacao || '') : '',
      token: 0
    };
    if (linha) F.dias[linha.data] = true;
    else if (opcoes.dia) F.dias[opcoes.dia] = true;

    $('supFolha').innerHTML = esqueletoDoFormulario();
    ui.mostrar('supFolha');
    document.body.classList.add('sup-travado');
    if (linha) { $('fTorres').value = linha.torre.identificador; $('fObs').value = F.obs; $('fPct').value = F.pct; }
    else { $('fPct').value = 100; $('fTorres').value = F.torresTexto; }
    atualizarFormulario();
    ui.icones();

    // Cada caminho já abre o que falta escolher: por encarregado, a lista de encarregados;
    // por torre, as torres já vêm da grade e falta a atividade
    if (!linha && opcoes.modo === 'encarregado' && !opcoes.encId) escolherEncarregado();
    else if (!linha && (opcoes.modo === 'torre' || opcoes.encId)) escolherAtividade();
  }

  function fecharFormulario() {
    F = null;
    ui.esconder('supFolha');
    ui.esconder('supLista');
    if (!G) document.body.classList.remove('sup-travado');
  }

  function esqueletoDoFormulario() {
    var edicao = !!F.editId;
    return '' +
      '<div class="sup-folha-caixa" role="dialog" aria-modal="true">' +
        '<div class="sup-folha-topo"><strong>' + (F.original ? 'Pedir alteração' : F.reapresentar ? 'Corrigir e reapresentar' : edicao ? 'Editar programação' : 'Programar') + '</strong>' +
          '<button type="button" class="sup-x" data-acao="fechar-form" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
        '<div class="sup-folha-corpo">' +
          (F.reapresentar ? '<div class="sup-recusa-caixa"><strong>Reprovada' + (F.linhaRecusada.aprovador && F.linhaRecusada.aprovador.nome ? ' por ' + esc(F.linhaRecusada.aprovador.nome) : '') + '</strong>' +
            '<p>' + esc(F.linhaRecusada.motivo_recusa || 'Sem justificativa registrada.') + '</p>' +
            '<p class="sup-fraco">Corrija o que for preciso e reapresente: ela volta para a sua solicitação, e você envia de novo.</p></div>' : '') +
          (F.original ? '<div class="sup-aviso-caixa" style="margin-bottom:.75rem"><strong>Já está aprovada</strong>' +
            '<p class="sup-fraco">Isto não muda a programação agora: vai como pedido na sua solicitação, e vale quando o planejamento aprovar.</p></div>' : '') +

          '<div class="sup-bloco"><label>Encarregado</label>' +
            '<button type="button" id="fEnc" class="sup-seletor" data-acao="escolher-enc"></button></div>' +

          '<div class="sup-bloco"><label>Atividade</label>' +
            '<button type="button" id="fAtv" class="sup-seletor" data-acao="escolher-atv"></button></div>' +

          '<div class="sup-bloco hidden" id="fCaboBloco"><label>Cabo</label><div id="fCabo" class="sup-seg"></div></div>' +

          (edicao
            ? '<div class="sup-bloco"><label>Torre</label><div class="sup-torre-fixa"><strong id="fTorreFixa"></strong></div>' +
              '<textarea id="fTorres" class="hidden"></textarea></div>'
            : '<div class="sup-bloco"><label>Torres</label>' +
                '<textarea id="fTorres" rows="2" class="campo" placeholder="Ex.: 88/1, 89/1 ou 88/1 a 92/2" ' +
                  'autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>' +
                '<div id="fTorresChips" class="sup-chips"></div>' +
                '<button type="button" class="sup-link" data-acao="abrir-grade"><i data-lucide="layout-grid" class="w-4 h-4"></i> Escolher na grade de torres</button>' +
                '<p class="sup-fraco">Separe por vírgula. Para uma sequência, escreva <b>88/1 a 92/2</b>.</p></div>') +

          '<div class="sup-bloco"><label>' + (edicao ? 'Dia' : 'Dia (pode marcar mais de um)') + '</label>' +
            '<div id="fDias"></div>' +
            '<p class="sup-fraco">Você programa de ' + esc(ui.dataCurta(janela().de)) + ' a ' + esc(ui.dataCurta(janela().ate)) + '.</p></div>' +

          '<div class="sup-bloco hidden" id="fDistribBloco"><label>Como distribuir</label><div id="fDistrib" class="sup-seg"></div></div>' +

          '<div class="sup-bloco" id="fPctBloco"><label>Quanto da torre neste dia</label>' +
            '<div class="sup-pct-linha"><input type="number" id="fPct" class="campo" min="1" max="100" step="1" inputmode="numeric"><span>%</span>' +
              '<div class="sup-rapidos">' +
                [25, 50, 75, 100].map(function (v) {
                  return '<button type="button" data-acao="pct-rapido" data-valor="' + v + '">' + v + '%</button>';
                }).join('') +
              '</div></div>' +
            '<p class="sup-fraco" id="fPctNota"></p></div>' +

          '<div class="sup-bloco"><label>Observação (opcional)</label>' +
            '<input id="fObs" class="campo" placeholder="Ex.: equipe reduzida" autocomplete="off"></div>' +

          '<div id="fResumo" class="sup-resumo"></div>' +
        '</div>' +
        '<div class="sup-folha-rodape">' +
          '<button type="button" class="btn-secundario" data-acao="fechar-form">Cancelar</button>' +
          '<button type="button" class="btn-primario" id="fSalvar" data-acao="salvar-form"></button>' +
        '</div>' +
      '</div>' +
      '<div id="supLista" class="sup-lista hidden"></div>';
  }

  /* -- Torres: "88/1, 89/1" e "88/1 a 92/2" --------------------------------- */

  function lerTorres(texto) {
    var achadas = [], invalidas = [], vistas = {};
    function pegar(t) {
      if (!vistas[t.torre_id]) { vistas[t.torre_id] = true; achadas.push(t); }
    }
    function acharPorNome(n) { return S.torrePorNome[norm(n).replace(/\s+/g, '')] || null; }

    String(texto || '').split(/[,;\n]+/).forEach(function (pedaco) {
      pedaco = pedaco.trim();
      if (!pedaco) return;

      var faixa = /^(\S+)\s+(?:a|à|ate|até|ao)\s+(\S+)$/i.exec(pedaco);
      if (faixa) {
        var de = acharPorNome(faixa[1]), ate = acharPorNome(faixa[2]);
        if (!de || !ate) { invalidas.push(pedaco); return; }
        var i = S.torres.indexOf(de), j = S.torres.indexOf(ate);
        var passo = i <= j ? 1 : -1;
        for (var k = i; passo > 0 ? k <= j : k >= j; k += passo) pegar(S.torres[k]);
        return;
      }

      // Vários separados por espaço ("88/1 89/1")
      pedaco.split(/\s+/).forEach(function (n) {
        var t = acharPorNome(n);
        if (t) { pegar(t); return; }
        // "88" sozinho: as torres com esse número (88/1 e 88/2)
        if (/^\d+$/.test(n)) {
          var irmas = S.torres.filter(function (x) { return x.identificador.indexOf(n + '/') === 0; });
          if (irmas.length) { irmas.forEach(pegar); return; }
        }
        invalidas.push(n);
      });
    });
    return { torres: achadas, invalidas: invalidas };
  }

  function tirarTorre(nome) {
    var lidas = lerTorres($('fTorres').value);
    var restantes = lidas.torres.filter(function (t) { return t.identificador !== nome; })
      .map(function (t) { return t.identificador; }).concat(lidas.invalidas.filter(function (x) { return x !== nome; }));
    $('fTorres').value = restantes.join(', ');
    F.torresTexto = $('fTorres').value;
    atualizarFormulario();
  }

  /* -- Dias ---------------------------------------------------------------- */

  function alternarDiaDoFormulario(iso) {
    if (F.editId) { F.dias = {}; F.dias[iso] = true; }
    else if (F.dias[iso]) delete F.dias[iso];
    else F.dias[iso] = true;
    atualizarFormulario();
  }

  /* -- O que o formulário vai criar ---------------------------------------- */

  function planejar() {
    var dias = Object.keys(F.dias).sort();
    var lidas, torres;
    if (F.editId) {
      var pt = F.torre;
      torres = [{ torre_id: pt.id, identificador: pt.identificador, ordem: pt.ordem }];
      lidas = { torres: torres, invalidas: [] };
    } else {
      lidas = lerTorres(F.torresTexto);
      torres = lidas.torres;
    }
    var linhas = [];

    if (F.distribuicao === 'uma' && !F.editId && dias.length > 1 && torres.length > 1) {
      for (var i = 0; i < Math.min(dias.length, torres.length); i++) {
        linhas.push({ torre: torres[i], data: dias[i], percentual: F.pct || 100 });
      }
    } else {
      torres.forEach(function (t) {
        dias.forEach(function (d, i) {
          var p = F.pct || 100;
          if (dias.length > 1) {
            // A mesma torre em mais dias: o serviço se reparte, nunca 100% em cada um
            var fatia = Math.floor(10000 / dias.length) / 100;
            p = i < dias.length - 1 ? fatia : Math.round((100 - fatia * (dias.length - 1)) * 100) / 100;
          }
          linhas.push({ torre: t, data: d, percentual: p });
        });
      });
    }

    // O que já está lá com a mesma chave não se repete
    var ignoradas = [];
    var novas = linhas.filter(function (l) {
      var igual = S.consulta.concat(S.minhas).filter(function (p) {
        // Só vale o que está valendo: aprovada ou solicitada; nunca o pedido para apagar, a reprovada ou a consumida
        if (p.exclusao || (p.situacao !== 'APROVADA' && p.situacao !== 'SOLICITADA')) return false;
        return p.torre && p.torre.id === l.torre.torre_id && p.data === l.data && p.atividade && p.atividade.id === F.atvId &&
               (p.encarregado ? p.encarregado.id : '') === (F.encId || '') && p.id !== F.editId && p.id !== F.substituiId;
      })[0];
      if (igual) { ignoradas.push({ linha: l, origem: igual }); return false; }
      return true;
    });

    return { linhas: novas, ignoradas: ignoradas, invalidas: lidas.invalidas, dias: dias, torres: torres };
  }

  function atualizarFormulario() {
    if (!F) return;
    var edicao = !!F.editId;
    var enc = encarregadoPorId(F.encId), atv = atividadePorId(F.atvId);

    $('fEnc').innerHTML = enc ? '<span>' + esc(enc.nome) + '</span>' : '<span class="vazio">Escolher o encarregado</span>';
    $('fAtv').innerHTML = atv
      ? '<span><i class="sup-bolinha" style="background:' + atv.cor_fundo + '"></i>' + esc(atv.nome) + '</span>'
      : '<span class="vazio">Escolher a atividade</span>';

    // Cabo
    var pedeCabo = !!atv && window.SIPAV.app.pedeCabo(atv.id);
    $('fCaboBloco').classList.toggle('hidden', !pedeCabo);
    if (pedeCabo) {
      $('fCabo').innerHTML = window.SIPAV.app.opcoesDeCabo().map(function (o) {
        return '<button type="button" class="' + (F.cabo === o.valor ? 'ativo' : '') + '" data-acao="cabo" data-valor="' + o.valor + '">' + esc(o.rotulo) + '</button>';
      }).join('');
    } else { F.cabo = ''; }

    // Dias: só os da janela dele, em semanal e quinzenal
    $('fDias').innerHTML = htmlDoCalendario(F.dias, 'dia-form', Object.keys(F.dias));

    var plano = planejar();

    if (edicao) {
      $('fTorreFixa').textContent = F.torre ? F.torre.identificador : '';
    } else {
      // Chips das torres lidas
      var chips = plano.torres.map(function (t) {
        return '<span class="sup-torre-chip ok">' + esc(t.identificador) +
               ' <button type="button" data-acao="tirar-torre" data-nome="' + esc(t.identificador) + '" aria-label="Tirar">×</button></span>';
      }).concat(plano.invalidas.map(function (n) {
        return '<span class="sup-torre-chip erro" title="Não existe neste trecho">' + esc(n) +
               ' <button type="button" data-acao="tirar-torre" data-nome="' + esc(n) + '" aria-label="Tirar">×</button></span>';
      })).join('');
      $('fTorresChips').innerHTML = chips;
    }

    // Distribuição (só com mais de uma torre e mais de um dia)
    var distribuir = !edicao && plano.dias.length > 1 && plano.torres.length > 1;
    $('fDistribBloco').classList.toggle('hidden', !distribuir);
    if (distribuir) {
      $('fDistrib').innerHTML =
        '<button type="button" class="' + (F.distribuicao === 'todas' ? 'ativo' : '') + '" data-acao="distribuicao" data-valor="todas">Todas as torres em todos os dias</button>' +
        '<button type="button" class="' + (F.distribuicao === 'uma' ? 'ativo' : '') + '" data-acao="distribuicao" data-valor="uma">Uma torre por dia, na ordem</button>';
    } else if (F.distribuicao !== 'todas') { F.distribuicao = 'todas'; }

    // Percentual: com a mesma torre em mais de um dia, divide sozinho
    var divide = plano.dias.length > 1 && F.distribuicao === 'todas';
    $('fPctBloco').classList.toggle('hidden', divide);
    $('fPctNota').textContent = F.pct && F.pct > 100 ? 'No máximo 100%.' : '';

    // Resumo
    var html = '';
    var erros = [];
    if (!F.encId) erros.push('Escolha o encarregado.');
    if (!F.atvId) erros.push('Escolha a atividade.');
    if (pedeCabo && !F.cabo) erros.push('Escolha o cabo.');
    if (!edicao && !plano.torres.length && !plano.invalidas.length) erros.push('Escreva as torres.');
    if (plano.invalidas.length) erros.push('Torre que não existe neste trecho: ' + plano.invalidas.join(', ') + '. Tire ou corrija.');
    if (!plano.dias.length) erros.push('Escolha o dia.');
    if (F.pct > 100 || (!divide && (F.pct < 1))) erros.push('O percentual vai de 1 a 100.');

    if (erros.length) {
      html += '<ul class="sup-erros">' + erros.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    }

    if (plano.linhas.length && !erros.length) {
      var porDia = {};
      plano.linhas.forEach(function (l) {
        (porDia[l.data] = porDia[l.data] || []).push(l.torre.identificador + (l.percentual < 100 ? ' (' + pct(l.percentual) + ')' : ''));
      });
      html += '<div class="sup-resumo-caixa"><strong>' +
        (edicao ? 'Fica assim' : 'Vai criar ' + plano.linhas.length + (plano.linhas.length === 1 ? ' programação' : ' programações')) +
        '</strong>' + Object.keys(porDia).sort().slice(0, 8).map(function (d) {
          return '<p>' + esc(nomeCurtoDoDia(d)) + ': ' + esc(porDia[d].slice(0, 12).join(', ')) +
                 (porDia[d].length > 12 ? ' e mais ' + (porDia[d].length - 12) : '') + '</p>';
        }).join('') + (Object.keys(porDia).length > 8 ? '<p class="sup-fraco">…</p>' : '') + '</div>';
    }

    if (plano.ignoradas.length) {
      html += '<p class="sup-aviso">Já estão programadas e não vão se repetir: ' +
              esc(plano.ignoradas.slice(0, 6).map(function (i) { return i.linha.torre.identificador + ' em ' + ui.dataCurta(i.linha.data); }).join(', ')) +
              (plano.ignoradas.length > 6 ? ' e mais ' + (plano.ignoradas.length - 6) : '') + '.</p>';
    }

    // Quem já programou na mesma torre no mesmo dia
    var vistos = {}, conflitos = [];
    plano.linhas.forEach(function (l) {
      ocupacao(l.torre.torre_id, l.data, F.editId, F.substituiId).forEach(function (o) {
        var chave = o.id;
        if (vistos[chave]) return; vistos[chave] = true;
        conflitos.push(l.torre.identificador + ' em ' + ui.dataCurta(l.data) + ': ' + textoDaOcupacao(o));
      });
    });
    if (conflitos.length) {
      html += '<div class="sup-aviso-caixa"><strong>Atenção: já tem programação aí</strong>' +
        conflitos.slice(0, 6).map(function (c) { return '<p>⚠ ' + esc(c) + '</p>'; }).join('') +
        (conflitos.length > 6 ? '<p class="sup-fraco">e mais ' + (conflitos.length - 6) + '…</p>' : '') +
        '<p class="sup-fraco">Dá para programar mesmo assim, o planejamento confere.</p></div>';
    }

    html += '<div id="fSequencia"></div>';
    $('fResumo').innerHTML = html;

    var salvar = $('fSalvar');
    salvar.disabled = erros.length > 0 || !plano.linhas.length;
    salvar.textContent = edicao ? (F.original ? 'Pedir alteração' : F.reapresentar ? 'Corrigir e reapresentar' : 'Salvar') : (plano.linhas.length ? 'Adicionar ' + plano.linhas.length : 'Adicionar');
    ui.icones();

    conferirSequencia(plano, atv);
  }

  /** A atividade que vem antes: um aviso, e quem decide é o planejamento. */
  var agendaSequencia = null;
  function conferirSequencia(plano, atv) {
    clearTimeout(agendaSequencia);
    if (!atv || !plano.linhas.length || plano.linhas.length > 40) return;
    var meu = ++F.token;
    agendaSequencia = setTimeout(function () {
      var chaves = {}, tarefas = [];
      plano.linhas.forEach(function (l) {
        var k = l.torre.torre_id + '|' + l.data;
        if (!chaves[k]) { chaves[k] = true; tarefas.push(l); }
      });
      var avisos = [];
      var fila = tarefas.slice();
      function proximo() {
        var l = fila.shift();
        if (!l) return Promise.resolve();
        return db.motivoBloqueio(l.torre.torre_id, atv.id, l.data).then(function (m) {
          if (m) avisos.push(l.torre.identificador + ' em ' + ui.dataCurta(l.data) + ': ' + m);
        }).catch(function () {}).then(proximo);
      }
      Promise.all([proximo(), proximo(), proximo()]).then(function () {
        if (!F || F.token !== meu || !$('fSequencia')) return;
        if (!avisos.length) { $('fSequencia').innerHTML = ''; return; }
        $('fSequencia').innerHTML = '<div class="sup-aviso-caixa"><strong>Fora da sequência</strong>' +
          avisos.slice(0, 5).map(function (a) { return '<p>⚠ ' + esc(a) + '</p>'; }).join('') +
          (avisos.length > 5 ? '<p class="sup-fraco">e mais ' + (avisos.length - 5) + '…</p>' : '') +
          '<p class="sup-fraco">Vale confirmar com o planejamento. Dá para enviar mesmo assim.</p></div>';
      });
    }, 450);
  }

  /* -- Listas de escolha (encarregado e atividade) ------------------------- */

  var lista = null;

  function abrirLista(titulo, itens, selecionado, aoEscolher) {
    lista = { titulo: titulo, itens: itens, selecionado: selecionado, aoEscolher: aoEscolher };
    $('supLista').innerHTML =
      '<div class="sup-lista-caixa">' +
        '<div class="sup-folha-topo"><strong>' + esc(titulo) + '</strong>' +
          '<button type="button" class="sup-x" data-acao="fechar-lista" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
        '<div class="sup-lista-busca"><input id="listaBusca" class="campo" placeholder="Buscar…" autocomplete="off"></div>' +
        '<div id="listaItens" class="sup-lista-itens"></div>' +
      '</div>';
    ui.mostrar('supLista');
    desenharLista('');
    ui.icones();
    setTimeout(function () { var b = $('listaBusca'); if (b) b.focus(); }, 80);
  }

  function desenharLista(termo) {
    if (!lista) return;
    var t = norm(termo);
    var itens = lista.itens.filter(function (i) { return !t || norm(i.rotulo + ' ' + (i.sub || '')).indexOf(t) !== -1; });
    $('listaItens').innerHTML = itens.length
      ? itens.map(function (i) {
          return '<button type="button" class="sup-lista-item' + (i.id === lista.selecionado ? ' ativo' : '') +
                 '" data-acao="item-lista" data-id="' + esc(i.id) + '">' +
                 (i.cor ? '<i class="sup-bolinha" style="background:' + i.cor + '"></i>' : '') +
                 '<span>' + esc(i.rotulo) + (i.sub ? '<em>' + esc(i.sub) + '</em>' : '') + '</span></button>';
        }).join('')
      : '<p class="sup-vazio">Nada com essa busca.</p>';
  }

  function fecharLista() {
    lista = null;
    ui.esconder('supLista');
    // Aberta sozinha (trocar o encarregado das marcadas), sem formulário por baixo: fecha a folha também
    if (!F) { ui.esconder('supFolha'); if (!G) document.body.classList.remove('sup-travado'); }
  }

  function escolherDaLista(id) {
    var l = lista; fecharLista();
    if (l) l.aoEscolher(id);
  }

  function escolherEncarregado() {
    var itens = E.encarregados.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
      .map(function (e) { return { id: e.id, rotulo: e.nome }; });
    abrirLista('Encarregado', itens, F.encId, function (id) { F.encId = id; atualizarFormulario(); });
  }

  function escolherAtividade() {
    var itens = E.atividades.slice().sort(function (a, b) { return a.ordem_execucao - b.ordem_execucao; })
      .map(function (a) { return { id: a.id, rotulo: a.nome, cor: a.cor_fundo }; });
    abrirLista('Atividade', itens, F.atvId, function (id) { F.atvId = id; atualizarFormulario(); });
  }

  /* -- Salvar -------------------------------------------------------------- */

  function garantirRascunho() {
    if (S.sol && (S.sol.status === 'RASCUNHO' || S.sol.status === 'DEVOLVIDA')) return Promise.resolve(S.sol);
    return db.criarSolicitacao(E.trechoAtual.id).then(function (s) { S.sol = s; return s; });
  }

  function salvarFormulario() {
    var plano = planejar();
    if (!plano.linhas.length) return;
    var cabo = F.cabo || null;

    if (F.editId && F.original) {
      // A programação já é oficial: o que ele muda vai como pedido de alteração, no pacote dele
      var nova = plano.linhas[0], o = F.linhaOriginal;
      var pctNovo = plano.dias.length > 1 ? 100 : (F.pct || 100);
      var obs = (F.obs || '').trim() || null;
      var igualAoOficial = nova.data === o.data && F.atvId === (o.atividade ? o.atividade.id : '') &&
        (F.encId || '') === (o.encarregado ? o.encarregado.id : '') && Number(o.percentual) === Number(pctNovo) &&
        (o.observacao || null) === obs && (o.cabo || null) === cabo;
      if (igualAoOficial) { ui.avisar('Nada mudou em relação à programação aprovada.', 'alerta', 4000); return; }

      ui.processando('Pedindo…');
      garantirRascunho().then(function (sol) {
        return db.criarProgramacao({
          torreId: F.torre.id, atividadeId: F.atvId, encarregadoId: F.encId || null, data: nova.data,
          percentual: pctNovo, observacao: obs, cabo: cabo,
          situacao: 'SOLICITADA', solicitacaoId: sol.id, substituiId: o.id
        });
      }).then(atualizarTudo)
        .then(function () {
          ui.pronto(); fecharFormulario();
          ui.avisar('Pedido de alteração feito. Envie a solicitação para o planejamento decidir.', 'sucesso', 6000);
        })
        .catch(function (e) { ui.pronto(); ui.avisar(semMigracao(e.message), 'erro', 8000); });
      return;
    }

    if (F.editId && F.reapresentar) {
      var corr = plano.linhas[0];
      var campos = {
        atividade_id: F.atvId, encarregado_id: F.encId || null, data: corr.data,
        percentual: plano.dias.length > 1 ? 100 : (F.pct || 100), observacao: (F.obs || '').trim() || null, cabo: cabo
      };
      ui.processando('Corrigindo…');
      garantirRascunho().then(function (sol) { return db.reapresentarReprovadas([F.editId], sol.id, campos); })
        .then(function (r) {
          if (r.falhas && r.falhas.length) throw new Error(r.falhas[0].motivo);
          return atualizarTudo();
        })
        .then(function () {
          ui.pronto(); fecharFormulario();
          ui.avisar('Corrigida. Ela voltou para a sua solicitação: envie para o planejamento analisar de novo.', 'sucesso', 7000);
        })
        .catch(function (e) { ui.pronto(); ui.avisar(semMigracao58(e.message), 'erro', 9000); });
      return;
    }

    if (F.editId) {
      var l = plano.linhas[0];
      ui.processando('Salvando…');
      db.atualizarProgramacao(F.editId, {
        encarregado_id: F.encId || null, atividade_id: F.atvId, data: l.data,
        percentual: plano.dias.length > 1 ? 100 : (F.pct || 100), observacao: (F.obs || '').trim() || null, cabo: cabo
      }).then(atualizarTudo)
        .then(function () { ui.pronto(); fecharFormulario(); ui.avisar('Salvo.', 'sucesso', 3000); })
        .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
      return;
    }

    ui.processando('Adicionando ' + plano.linhas.length + '…');
    garantirRascunho().then(function (sol) {
      var fila = plano.linhas.slice(), feitas = 0, falhas = [];
      function um() {
        var l = fila.shift();
        if (!l) return Promise.resolve();
        return db.criarProgramacao({
          torreId: l.torre.torre_id, atividadeId: F.atvId, encarregadoId: F.encId, data: l.data,
          percentual: l.percentual, observacao: (F.obs || '').trim() || null, cabo: cabo,
          situacao: 'SOLICITADA', solicitacaoId: sol.id
        }).then(function () { feitas++; }, function (e) { falhas.push(l.torre.identificador + ' em ' + ui.dataCurta(l.data) + ': ' + e.message); })
          .then(um);
      }
      return Promise.all([um(), um(), um(), um()]).then(function () { return { feitas: feitas, falhas: falhas }; });
    }).then(function (r) {
      return atualizarTudo().then(function () {
        ui.pronto();
        if (r.falhas.length) {
          ui.avisar(r.feitas + ' adicionada(s). Não entrou: ' + r.falhas.slice(0, 2).join(' · '), 'alerta', 9000);
        } else {
          ui.avisar(r.feitas + (r.feitas === 1 ? ' programação adicionada.' : ' programações adicionadas.'), 'sucesso', 4000);
        }
        if (!r.falhas.length) { fecharFormulario(); limparSelecaoDeTorres(); }
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  /* ======================================================================== */
  /* GRADE DE TORRES — programar por torre                                    */
  /* ======================================================================== */

  /**
   * A grade que o planejamento vê, aqui para tocar: cada torre com o estado dela (a última
   * atividade concluída, ou a restrição) e o que já está programado nas próximas semanas,
   * seja oficial, seja solicitado. É daqui que o supervisor escolhe as torres.
   */
  var G = null;

  function ehPortico(t) { return norm(t.identificador).indexOf('portico') === 0; }

  /** O que já está programado numa torre, de hoje em diante: oficial, outros supervisores e o meu. */
  function programadasDaTorre(torreId) {
    var hoje = hojeIso();
    return S.consulta.filter(function (p) { return p.torre && p.torre.id === torreId && p.data >= hoje; })
      .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  }

  function cartaoDaGrade(t) {
    var restrito = !!t.tem_restricao;
    var cor = restrito ? '#E11D48' : (t.ultima_atividade_cor || null);
    var estado = ehPortico(t) ? 'Pórtico'
      : restrito ? 'Restrição ' + String(t.restricao_tipo || '').toLowerCase()
      : (t.ultima_atividade || 'Não iniciada');
    var estilo = cor ? 'border-color:' + ui.rgba(cor, 0.45) + ';border-top-color:' + cor + ';' : '';

    var progs = programadasDaTorre(t.torre_id);
    var lista = progs.slice(0, 3).map(function (p) {
      var minha = S.sol && p.solicitacao_id === S.sol.id;
      var origem = p.situacao === 'APROVADA' ? 'of' : minha ? 'mi' : 'so';
      return '<span class="sup-g-prog ' + origem + '" title="' + esc(origemDe(p)) + '">' +
        '<b>' + esc(ui.dataCurta(p.data)) + '</b> ' + esc(p.atividade ? p.atividade.nome : '') + '</span>';
    }).join('') + (progs.length > 3 ? '<span class="sup-g-prog mais">+' + (progs.length - 3) + '</span>' : '');

    var estaiada = t.estrutura === 'ESTAIADA';
    var pastilha = t.estrutura
      ? '<span class="pastilha-estrutura ' + (estaiada ? 'est' : 'aup') + '">' + (estaiada ? 'EST' : 'AUP') + '</span>' : '';

    return '<button type="button" class="cartao-torre sup-g-torre' + (restrito ? ' cartao-restrito' : '') +
      (progs.length ? ' cartao-programado' : '') + (G.sel[t.torre_id] ? ' sel' : '') +
      '" data-acao="grade-torre" data-id="' + t.torre_id + '"' + (estilo ? ' style="' + estilo + '"' : '') + '>' +
      '<span class="sup-g-ok"><i data-lucide="check" class="w-3 h-3"></i></span>' +
      '<span class="identidade"><span class="identificador">' + esc(t.identificador) + '</span>' + pastilha +
        '<span class="legenda"><span class="ponto-atividade" style="background:' + (cor || 'var(--borda-forte)') + '"></span>' +
        esc(estado) + '</span></span>' +
      (lista ? '<span class="sup-g-lista">' + lista + '</span>' : '') +
      '</button>';
  }

  function esqueletoDaGrade() {
    return '<div class="sup-folha-caixa sup-grade-caixa" role="dialog" aria-modal="true">' +
      '<div class="sup-folha-topo"><strong>Escolha as torres</strong>' +
        '<button type="button" class="sup-x" data-acao="grade-fechar" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
      '<div class="sup-grade-barra">' +
        '<input id="gradeBusca" class="campo" placeholder="Buscar torre (ex.: 88)" autocomplete="off" inputmode="text">' +
        '<button type="button" id="gradeFaixa" class="sup-seg-btn" data-acao="grade-faixa">Marcar faixa</button>' +
      '</div>' +
      '<p class="sup-fraco sup-grade-dica" id="gradeDica"></p>' +
      '<div class="sup-grade-rolagem"><div id="gradeCorpo" class="sup-grade"></div></div>' +
      '<div class="sup-folha-rodape sup-grade-rodape">' +
        '<div class="sup-grade-contagem" id="gradeContagem"></div>' +
        '<button type="button" class="btn-primario" id="gradeOk" data-acao="grade-ok">Continuar</button>' +
      '</div></div>';
  }

  function abrirGrade(preSelecionadas, aoConfirmar) {
    G = { sel: {}, busca: '', faixa: false, ancora: null, aoConfirmar: aoConfirmar };
    (preSelecionadas || []).forEach(function (t) { G.sel[t.torre_id] = true; });
    $('supGrade').innerHTML = esqueletoDaGrade();
    ui.mostrar('supGrade');
    document.body.classList.add('sup-travado');
    desenharGrade();
    atualizarRodapeDaGrade();
  }

  function desenharGrade() {
    var termo = norm(G.busca).replace(/\s+/g, '');
    var lista = S.torres.filter(function (t) {
      return !termo || norm(t.identificador).replace(/\s+/g, '').indexOf(termo) !== -1;
    });
    $('gradeCorpo').innerHTML = lista.length ? lista.map(cartaoDaGrade).join('') : '<p class="sup-vazio">Nenhuma torre com essa busca.</p>';
    ui.icones();
  }

  function marcarNaGrade() {
    Array.prototype.forEach.call(document.querySelectorAll('#gradeCorpo [data-acao="grade-torre"]'), function (el) {
      el.classList.toggle('sel', !!G.sel[el.getAttribute('data-id')]);
    });
    atualizarRodapeDaGrade();
  }

  function torresMarcadas() {
    return S.torres.filter(function (t) { return G.sel[t.torre_id]; });
  }

  function atualizarRodapeDaGrade() {
    if (!G) return;
    var marcadas = torresMarcadas();
    $('gradeContagem').innerHTML = marcadas.length
      ? '<b>' + marcadas.length + (marcadas.length === 1 ? ' torre' : ' torres') + '</b><span>' +
        esc(marcadas.slice(0, 6).map(function (t) { return t.identificador; }).join(', ')) + (marcadas.length > 6 ? '…' : '') + '</span>'
      : '<span>Toque nas torres para marcar</span>';
    $('gradeOk').disabled = !marcadas.length;
    $('gradeFaixa').classList.toggle('ativo', G.faixa);
    $('gradeFaixa').textContent = G.faixa ? (G.ancora ? 'Toque na última' : 'Toque na primeira') : 'Marcar faixa';
    $('gradeDica').textContent = G.faixa
      ? 'Faixa: toque na primeira torre e depois na última, e as do meio entram juntas.' : '';
  }

  function alternarTorreDaGrade(id) {
    if (!G) return;
    if (G.faixa) {
      if (!G.ancora) { G.ancora = id; G.sel[id] = true; marcarNaGrade(); return; }
      var i = S.torres.map(function (t) { return t.torre_id; }).indexOf(G.ancora);
      var j = S.torres.map(function (t) { return t.torre_id; }).indexOf(id);
      var de = Math.min(i, j), ate = Math.max(i, j);
      for (var k = de; k <= ate; k++) G.sel[S.torres[k].torre_id] = true;
      G.faixa = false; G.ancora = null;
      marcarNaGrade();
      return;
    }
    if (G.sel[id]) delete G.sel[id]; else G.sel[id] = true;
    marcarNaGrade();
  }

  /** "88/1 a 92/2, 95/1": as seguidas viram faixa, para o campo de torres não virar uma lista enorme. */
  function textoDasTorres(torres) {
    var posicoes = torres.map(function (t) { return S.torres.indexOf(t); }).sort(function (a, b) { return a - b; });
    var partes = [], i = 0;
    while (i < posicoes.length) {
      var j = i;
      while (j + 1 < posicoes.length && posicoes[j + 1] === posicoes[j] + 1) j++;
      var de = S.torres[posicoes[i]].identificador, ate = S.torres[posicoes[j]].identificador;
      if (j - i >= 2) partes.push(de + ' a ' + ate);
      else for (var k = i; k <= j; k++) partes.push(S.torres[posicoes[k]].identificador);
      i = j + 1;
    }
    return partes.join(', ');
  }

  function fecharGrade() {
    G = null;
    ui.esconder('supGrade');
    if (!F) document.body.classList.remove('sup-travado');
  }

  function confirmarGrade() {
    var texto = textoDasTorres(torresMarcadas());
    var depois = G.aoConfirmar;
    fecharGrade();
    if (depois) depois(texto);
  }

  /** De dentro do formulário: trocar as torres olhando a grade. */
  function abrirGradeDoFormulario() {
    var atuais = lerTorres($('fTorres').value).torres;
    abrirGrade(atuais, function (texto) {
      $('fTorres').value = texto;
      F.torresTexto = texto;
      atualizarFormulario();
    });
  }
  /* ======================================================================== */
  /* CAIXA DE SOLICITAÇÕES — o planejamento                                   */
  /* ======================================================================== */

  var contagemAnterior = null;

  /** O número no botão do planejamento. Avisa quando chega pacote novo. */
  function atualizarContador(avisarSeSubiu) {
    if (!E.perfil || (E.perfil.papel !== 'ADMIN' && E.perfil.papel !== 'PLANEJAMENTO')) return Promise.resolve();
    return db.quantasSolicitacoes().then(function (n) {
      var selo = $('seloSolicitacoes');
      if (selo) { selo.textContent = n; selo.classList.toggle('hidden', !n); }
      if (avisarSeSubiu && contagemAnterior != null && n > contagemAnterior) {
        ui.avisar('Chegou uma solicitação de supervisor para analisar.', 'sucesso', 6000);
      }
      contagemAnterior = n;
    }).catch(function () {});
  }

  function ligarSolicitacoesDoPlanejamento() {
    if (!E.perfil || (E.perfil.papel !== 'ADMIN' && E.perfil.papel !== 'PLANEJAMENTO')) return;
    ui.mostrar('btnSolicitacoes');
    atualizarContador(false);
    try {
      db.escutarSolicitacoes(function () { atualizarContador(true); });
    } catch (e) { /* sem a migração 54 o canal não existe, e o resto segue */ }
  }

  var NOME_DA_SITUACAO = { APROVADA: 'Aprovada', PARCIAL: 'Aprovada em parte', REPROVADA: 'Reprovada', DEVOLVIDA: 'Devolvida' };

  /** Só a última solicitação de cada supervisor em cada trecho pode ser reanalisada, e só se já foi decidida. */
  function decididasParaReanalisar(recentes) {
    var vistos = {}, saida = [];
    recentes.forEach(function (s) {
      var chave = s.supervisor_id + '|' + s.trecho_id;
      if (vistos[chave]) return;
      vistos[chave] = true;
      if (NOME_DA_SITUACAO[s.status]) saida.push(s);
    });
    return saida.slice(0, 10);
  }

  function abrirSolicitacoes() {
    ui.processando('Carregando as solicitações…');
    Promise.all([db.solicitacoesParaAnalise(), db.solicitacoesRecentes().catch(function () { return []; })]).then(function (r) {
      var lista = r[0], decididas = decididasParaReanalisar(r[1]);
      ui.pronto();
      var corpo = lista.length
        ? '<div class="space-y-2">' + lista.map(function (s) {
            return '<div class="sol-linha"><div><strong>' + esc(s.supervisor ? s.supervisor.nome : '—') + '</strong>' +
                   '<p class="sup-fraco">' + esc(s.trecho ? s.trecho.nome : '') + ' · enviada ' + esc(ui.quandoRelativo(s.enviada_em)) + '</p></div>' +
                   '<button type="button" class="btn-primario" data-sol="' + s.id + '">Analisar</button></div>';
          }).join('') + '</div>'
        : '<p class="text-sm" style="color:var(--texto-suave)">Nenhuma solicitação esperando análise.</p>';

      // A última de cada supervisor, já decidida: dá para voltar atrás e analisar de novo
      if (decididas.length) {
        corpo += '<div class="sol-decididas-lista"><p class="rotulo">Já decididas (a última de cada supervisor)</p><div class="space-y-2">' +
          decididas.map(function (s) {
            return '<div class="sol-linha"><div><strong>' + esc(s.supervisor ? s.supervisor.nome : '—') + '</strong>' +
              '<p class="sup-fraco">' + esc(s.trecho ? s.trecho.nome : '') + ' · ' + esc(NOME_DA_SITUACAO[s.status]) +
              (s.decididor && s.decididor.nome ? ' por ' + esc(s.decididor.nome) : '') +
              (s.decidida_em ? ' ' + esc(ui.quandoRelativo(s.decidida_em)) : '') + '</p></div>' +
              '<button type="button" class="btn-secundario" data-reanalisar="' + s.id + '">Reanalisar</button></div>';
          }).join('') + '</div></div>';
      }

      ui.modalGenerico({ titulo: 'Solicitações dos supervisores', corpoHtml: corpo, botoes: [{ rotulo: 'Fechar', classe: 'btn-secundario' }] });
      Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-sol]'), function (b) {
        b.onclick = function () { analisar(b.getAttribute('data-sol')); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-reanalisar]'), function (b) {
        b.onclick = function () { confirmarReanalise(b.getAttribute('data-reanalisar'), null); };
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /** Desfazer decisões: o pacote inteiro (linhas null) ou só as linhas dadas. */
  function confirmarReanalise(solId, linhas) {
    var inteiro = !linhas;
    ui.modalGenerico({
      titulo: inteiro ? 'Reanalisar a solicitação' : 'Reanalisar ' + linhas.length + (linhas.length === 1 ? ' linha' : ' linhas'),
      corpoHtml: '<div class="space-y-2 text-sm">' +
        '<p>Volta atrás na decisão e deixa ' + (inteiro ? 'a solicitação' : 'estas linhas') + ' esperando análise de novo:</p>' +
        '<ul class="sol-resumo text-xs">' +
          '<li>o que foi <b>aprovado</b> sai da programação oficial e volta a ser pré-programação do supervisor;</li>' +
          '<li>o que foi <b>reprovado</b> volta para a análise;</li>' +
          '<li>uma <b>alteração</b> aprovada devolve à oficial o que ela tinha antes, e um <b>pedido de apagar</b> aprovado traz a oficial de volta.</li>' +
        '</ul>' +
        '<p class="sup-fraco">Só vale para a última solicitação do supervisor naquele trecho. Fica registrado no histórico.</p></div>',
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () { if (pacote && pacote.sol.id === solId) desenharPacote(); else abrirSolicitacoes(); } },
        { rotulo: 'Reanalisar', classe: 'btn-primario', acao: function () {
          ui.processando('Reabrindo…');
          db.reabrirSolicitacao(solId, linhas).then(function (r) {
            ui.pronto();
            var rec = window.SIPAV.app.recarregarProgramacoes;
            return Promise.resolve(rec ? rec() : null).then(function () {
              atualizarContador(false);
              if (r.falhas && r.falhas.length) {
                ui.avisar(r.reabertas + ' voltou(voltaram) para análise. Não deu para desfazer ' + r.falhas.length + ': ' +
                          r.falhas.slice(0, 2).map(function (f) { return f.motivo; }).join(' · '), 'alerta', 10000);
              } else {
                ui.avisar(r.reabertas + (r.reabertas === 1 ? ' linha voltou' : ' linhas voltaram') + ' para análise.', 'sucesso', 5000);
              }
              return analisar(solId);
            });
          }).catch(function (e) { ui.pronto(); ui.avisar(semMigracao57(e.message), 'erro', 9000); });
        } }
      ]
    });
  }

  /** Antes da migração 57 as funções novas não existem: diz isso em vez da mensagem do banco. */
  function semMigracao57(msg) {
    return /p_reprovar|reabrir_solicitacao|decidir_solicitacao|schema cache|Could not find the function/i.test(msg || '')
      ? 'Falta aplicar a migração 57 no banco.' : msg;
  }

  var pacote = null;   // o que está sendo analisado

  function analisar(id) {
    ui.processando('Abrindo a solicitação…');
    Promise.all([db.solicitacoesParaAnalise(), db.programacoesDaSolicitacao(id)]).then(function (r) {
      var sol = r[0].filter(function (s) { return s.id === id; })[0];
      // O que já foi decidido (aprovado ou reprovado numa rodada anterior) não volta para a análise,
      // mas fica numa lista à parte, de onde dá para reanalisar
      var linhas = r[1].filter(function (l) { return l.situacao === 'SOLICITADA'; });
      var decididas = r[1].filter(function (l) { return ['APROVADA', 'CANCELADA', 'RECUSADA'].indexOf(l.situacao) !== -1; });
      if (!sol) { ui.pronto(); ui.avisar('Esta solicitação já foi analisada.', 'alerta'); abrirSolicitacoes(); return; }

      var datas = linhas.map(function (l) { return l.data; }).sort();
      // Os pedidos de alteração e de apagar mexem em programações oficiais: busca elas para mostrar "hoje é assim"
      var idsOficiais = linhas.filter(function (l) { return l.substitui_id; }).map(function (l) { return l.substitui_id; });
      return Promise.all([
        db.programacoes({ de: datas[0], ate: datas[datas.length - 1] }),
        db.torres(sol.trecho_id),
        db.programacoesPorIds(idsOficiais).catch(function () { return []; })
      ]).then(function (x) {
        // Reabrindo depois de editar ou tirar uma linha, as marcas e a visão ficam como estavam
        var mesma = pacote && pacote.sol.id === id;
        var marcadas = {}, reprovadas = {};
        if (mesma) linhas.forEach(function (l) {
          if (pacote.marcadas[l.id]) marcadas[l.id] = true;
          // As reprovadas ainda não concluídas continuam separadas depois de recarregar
          if (pacote.reprovadas[l.id] !== undefined) reprovadas[l.id] = pacote.reprovadas[l.id];
        });
        var originais = {};
        x[2].forEach(function (o) { originais[o.id] = o; });
        pacote = { sol: sol, linhas: linhas, decididas: decididas, oficiais: x[0], torres: x[1], avisos: {}, originais: originais,
                   marcadas: marcadas, reprovadas: reprovadas, visao: mesma ? pacote.visao : 'lista' };
        ui.pronto();
        conferirPacote();
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function ordemDasLinhas(linhas) {
    return linhas.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : ((a.torre.ordem - b.torre.ordem));
    });
  }

  function avisosDaLinha(l) {
    return (pacote.avisos[l.id] || []).map(function (a) { return '<div class="sup-aviso">⚠ ' + esc(a) + '</div>'; }).join('');
  }

  /** O que a linha é: programação nova, alteração de uma oficial, ou pedido para apagar uma oficial. */
  function rotuloDaLinha(l) { return l.exclusao ? 'Apagar' : l.substitui_id ? 'Alteração' : ''; }

  /** Nas linhas que mexem numa oficial: a marca e o que a oficial é hoje, para comparar. */
  function notaDoPedido(l) {
    if (!l.exclusao && !l.substitui_id) return '';
    var o = pacote.originais && pacote.originais[l.substitui_id];
    var hoje = o ? descricaoCurta(o) : 'a programação oficial não foi encontrada (pode já ter sido apagada)';
    return '<div class="sol-pedido"><span class="sol-tag' + (l.exclusao ? ' apagar' : '') + '">' +
      (l.exclusao ? 'Pedido para apagar' : 'Alteração de uma aprovada') + '</span> ' +
      (l.exclusao ? 'Sai da programação oficial: ' : 'Hoje é: ') + esc(hoje) + '</div>';
  }

  /** A lista: uma linha por programação, com a caixa de marcar. */
  function htmlDaLista(linhas) {
    return '<div class="sol-tabela"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase" style="color:var(--texto-fraco)">' +
      '<th class="py-1 pr-1" style="width:2rem"></th><th class="py-1 pr-2">Dia</th><th class="pr-2">Torre</th><th class="pr-2">Atividade</th>' +
      '<th class="pr-2">Encarregado</th><th class="pr-2">%</th><th></th></tr></thead><tbody>' +
      linhas.map(function (l) {
        var avisos = notaDoPedido(l) + avisosDaLinha(l);
        return '<tr class="sol-linha-tab" data-linha="' + l.id + '">' +
          '<td class="py-1 pr-1"><input type="checkbox" class="sol-caixa" data-marcar="' + l.id + '" ' +
            'onclick="SIPAV.supervisor.marcarLinha(\'' + l.id + '\')" aria-label="Marcar"></td>' +
          '<td class="py-1 pr-2 whitespace-nowrap">' + esc(nomeCurtoDoDia(l.data)) + '</td>' +
          '<td class="pr-2"><strong>' + esc(l.torre.identificador) + '</strong></td>' +
          '<td class="pr-2">' + chipAtividade(l.atividade) + '</td>' +
          '<td class="pr-2">' + esc(l.encarregado ? l.encarregado.nome : '—') + '</td>' +
          '<td class="pr-2">' + pct(l.percentual) + '</td>' +
          '<td class="whitespace-nowrap">' + (l.exclusao ? '' : '<button type="button" class="btn-lancar" data-ed="' + l.id + '">Editar</button> ') +
          '<button type="button" class="btn-lancar" data-rm="' + l.id + '">Tirar</button></td></tr>' +
          (avisos ? '<tr class="sol-linha-av" data-linha-av="' + l.id + '"><td></td><td colspan="6">' + avisos + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>';
  }

  /** A grade: só as torres do pacote, com o estado de cada uma, o que a solicitação põe nela e o que já é oficial. */
  function htmlDaGrade(linhas) {
    var porTorre = {}, ordem = [];
    linhas.forEach(function (l) {
      if (!porTorre[l.torre.id]) { porTorre[l.torre.id] = []; ordem.push(l.torre.id); }
      porTorre[l.torre.id].push(l);
    });
    var estado = {};
    (pacote.torres || []).forEach(function (t) { estado[t.torre_id] = t; });

    return '<div class="sup-grade sol-grade">' + ordem.sort(function (a, b) {
      var oa = estado[a] ? estado[a].ordem : porTorre[a][0].torre.ordem;
      var ob = estado[b] ? estado[b].ordem : porTorre[b][0].torre.ordem;
      return oa - ob;
    }).map(function (tid) {
      var t = estado[tid] || { identificador: porTorre[tid][0].torre.identificador };
      var restrito = !!t.tem_restricao;
      var cor = restrito ? '#E11D48' : (t.ultima_atividade_cor || null);
      var nomeEstado = restrito ? 'Restrição ' + String(t.restricao_tipo || '').toLowerCase() : (t.ultima_atividade || 'Não iniciada');
      var estilo = cor ? 'border-color:' + ui.rgba(cor, 0.45) + ';border-top-color:' + cor + ';' : '';
      var estaiada = t.estrutura === 'ESTAIADA';
      var pastilha = t.estrutura ? '<span class="pastilha-estrutura ' + (estaiada ? 'est' : 'aup') + '">' + (estaiada ? 'EST' : 'AUP') + '</span>' : '';

      var oficiais = pacote.oficiais.filter(function (o) { return o.torre && o.torre.id === tid; });
      var lista = ordemDasLinhas(porTorre[tid]).map(function (l) {
        return '<span class="sup-g-prog so" data-g-linha="' + l.id + '"><b>' + esc(ui.dataCurta(l.data)) + '</b> ' +
          (rotuloDaLinha(l) ? '<em class="sol-tag-mini' + (l.exclusao ? ' apagar' : '') + '">' + esc(rotuloDaLinha(l).toUpperCase()) + '</em> ' : '') +
          esc(l.atividade ? l.atividade.nome : '') + ' · ' + esc(l.encarregado ? l.encarregado.nome.split(' ')[0] : '—') + ' ' + pct(l.percentual) + '</span>';
      }).join('') + oficiais.map(function (o) {
        return '<span class="sup-g-prog of" title="Já é programação oficial"><b>' + esc(ui.dataCurta(o.data)) + '</b> ' +
          esc(o.atividade ? o.atividade.nome : '') + ' · ' + esc(o.encarregado ? o.encarregado.nome.split(' ')[0] : '—') + ' (oficial)</span>';
      }).join('');

      return '<button type="button" class="cartao-torre sup-g-torre" data-g-torre="' + tid + '"' + (estilo ? ' style="' + estilo + '"' : '') +
        ' onclick="SIPAV.supervisor.marcarTorre(\'' + tid + '\')">' +
        '<span class="sup-g-ok"><i data-lucide="check" class="w-3 h-3"></i></span>' +
        '<span class="identidade"><span class="identificador">' + esc(t.identificador) + '</span>' + pastilha +
          '<span class="legenda"><span class="ponto-atividade" style="background:' + (cor || 'var(--borda-forte)') + '"></span>' + esc(nomeEstado) + '</span></span>' +
        '<span class="sup-g-lista">' + lista + '</span></button>';
    }).join('') + '</div>';
  }

  /** O por encarregado, igual ao da tela do planejamento: o que a solicitação põe e o que já é oficial, semana a semana. */
  function htmlDoPorEncarregado(linhas) {
    var datas = linhas.map(function (l) { return l.data; }).sort();
    var segundas = [], seg = ui.segundaDaSemana(ui.paraData(datas[0]));
    var ultima = ui.iso(ui.segundaDaSemana(ui.paraData(datas[datas.length - 1])));
    for (var n = 0; n < 6 && ui.iso(seg) <= ultima; n++) { segundas.push(ui.iso(seg)); seg = ui.somarDias(seg, 7); }

    var porEnc = {}, ordem = [];
    linhas.forEach(function (l) {
      var nome = l.encarregado ? l.encarregado.nome : 'Sem encarregado';
      if (!porEnc[nome]) { porEnc[nome] = { id: l.encarregado ? l.encarregado.id : null, itens: [] }; ordem.push(nome); }
      porEnc[nome].itens.push(l);
    });

    var idsDoPacote = {};
    linhas.forEach(function (l) { idsDoPacote[l.id] = true; });
    var extra = {
      acao: function (p) { return idsDoPacote[p.id] ? 'SIPAV.supervisor.marcarLinha(\'' + p.id + '\')' : null; },
      marcada: function (p) { return !!pacote.marcadas[p.id]; }
    };

    return '<div class="space-y-4 sol-por-enc">' + ordem.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (nome) {
      var e = porEnc[nome];
      var oficiais = e.id ? pacote.oficiais.filter(function (o) {
        return (o.encarregado && o.encarregado.id === e.id) || (o.encarregado2 && o.encarregado2.id === e.id);
      }) : [];
      return window.SIPAV.render.painelDoEncarregadoParaAnalise(nome, e.itens.concat(oficiais), segundas, extra);
    }).join('') + '</div>';
  }

  /** As linhas que ainda estão em análise: as que não foram separadas como reprovadas. */
  function pendentes() {
    return pacote.linhas.filter(function (l) { return pacote.reprovadas[l.id] === undefined; });
  }

  function qtdReprovadas() {
    return pacote.linhas.length - pendentes().length;
  }

  /** Uma linha, em texto: "0/1 · MONTAGEM · Seg 19/10 · Alielton". */
  function resumoDaLinha(l) {
    return '<b>' + esc(l.torre.identificador) + '</b> · ' + esc(l.atividade ? l.atividade.nome : '') + ' · ' +
      esc(nomeCurtoDoDia(l.data)) + ' · ' + esc(l.encarregado ? l.encarregado.nome : '—');
  }

  /** A caixa das reprovadas: separadas aqui até eu concluir a análise, com o motivo e a volta para a análise. */
  function htmlDasReprovadas() {
    var rep = ordemDasLinhas(pacote.linhas.filter(function (l) { return pacote.reprovadas[l.id] !== undefined; }));
    if (!rep.length) return '';
    return '<div class="sol-reprovadas"><div class="sol-rep-topo"><div><b>Reprovadas (' + rep.length + ')</b>' +
      '<p class="sup-fraco">Voltam para o supervisor corrigir quando você concluir a análise. Dá para voltar atrás em qualquer uma.</p></div>' +
      '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.voltarTodasParaAnalise()">Voltar todas para análise</button></div>' +
      rep.map(function (l) {
        return '<div class="sol-rep-linha"><div class="min-w-0">' + (rotuloDaLinha(l) ? '<em class="sol-tag-mini' + (l.exclusao ? ' apagar' : '') + '">' + esc(rotuloDaLinha(l).toUpperCase()) + '</em> ' : '') +
          resumoDaLinha(l) + '<p class="sup-recusa">' + esc(pacote.reprovadas[l.id]) + '</p></div>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.voltarParaAnalise(\'' + l.id + '\')">Voltar para análise</button></div>';
      }).join('') + '</div>';
  }

  /** O que já foi decidido neste pacote (numa rodada anterior): dá para reanalisar linha por linha. */
  function htmlDasDecididas() {
    var dec = ordemDasLinhas((pacote.decididas || []));
    if (!dec.length) return '';
    return '<details class="sol-decididas"><summary>Já decididas neste pacote (' + dec.length + ')</summary>' +
      dec.map(function (l) {
        var tipo = l.exclusao ? 'apagar' : l.substitui_id ? 'alteracao' : '';
        var estado = l.situacao === 'RECUSADA' ? 'Reprovada'
          : l.situacao === 'CANCELADA' ? (tipo === 'apagar' ? 'Apagada' : 'Alteração aprovada') : 'Aprovada';
        var por = l.aprovador && l.aprovador.nome ? ' por ' + esc(l.aprovador.nome) : '';
        return '<div class="sol-rep-linha"><div class="min-w-0">' + resumoDaLinha(l) +
          '<p class="sup-fraco">' + estado + por + (l.situacao === 'RECUSADA' && l.motivo_recusa ? ': ' + esc(l.motivo_recusa) : '') + '</p></div>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.reanalisarLinha(\'' + l.id + '\')">Reanalisar</button></div>';
      }).join('') + '</details>';
  }

  function desenharPacote() {
    var p = pacote;
    var linhas = ordemDasLinhas(pendentes());
    var nRep = qtdReprovadas();

    var visoes = [['lista', 'Lista'], ['grade', 'Grade'], ['enc', 'Por encarregado']].map(function (v) {
      return '<button type="button" class="sup-seg-btn' + (p.visao === v[0] ? ' ativo' : '') +
             '" onclick="SIPAV.supervisor.trocarVisao(\'' + v[0] + '\')">' + v[1] + '</button>';
    }).join('');

    var conteudo = !linhas.length
      ? '<p class="sup-fraco" style="padding:.75rem 0">Nenhuma linha em análise.' + (nRep ? ' Veja as reprovadas abaixo e conclua.' : '') + '</p>'
      : p.visao === 'grade' ? htmlDaGrade(linhas) : p.visao === 'enc' ? htmlDoPorEncarregado(linhas) : htmlDaLista(linhas);

    var corpo = '<p class="sup-fraco" style="margin-bottom:.5rem">' + esc(p.sol.trecho ? p.sol.trecho.nome : '') +
      ' · ' + linhas.length + ' em análise' + (nRep ? ' · ' + nRep + (nRep === 1 ? ' reprovada' : ' reprovadas') : '') +
      ' · enviada ' + esc(ui.quandoRelativo(p.sol.enviada_em)) + '</p>' +
      '<div class="sol-barra"><div class="sol-visoes">' + visoes + '</div>' +
        '<div class="sol-marcas"><span id="solMarcadas" class="sup-fraco"></span>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.marcarTodas()">Marcar todas</button>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.limparMarcas()">Limpar</button></div></div>' +
      conteudo +
      '<p class="sup-fraco" id="solConferindo" style="margin-top:.5rem"></p>' +
      htmlDasReprovadas() + htmlDasDecididas();

    ui.modalGenerico({
      titulo: 'Solicitação de ' + (p.sol.supervisor ? p.sol.supervisor.nome : 'supervisor'),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: abrirSolicitacoes },
        { rotulo: 'Reprovar', classe: 'btn-secundario btn-secundario-perigo', acao: reprovar },
        { rotulo: 'Aprovar', classe: 'btn-primario', acao: aprovar }
      ]
    });

    document.querySelector('#modalGenerico .modal-caixa').classList.add('sol-larga');
    var bs = document.querySelectorAll('#genericoRodape button');
    p.btnReprovar = bs[1]; p.btnAprovar = bs[2];

    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-ed]'), function (b) {
      b.onclick = function () { editarLinhaDoPacote(b.getAttribute('data-ed')); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-rm]'), function (b) {
      b.onclick = function () { tirarLinhaDoPacote(b.getAttribute('data-rm')); };
    });
    ui.icones();
    atualizarMarcas();
  }
  /* -- Marcar o que se quer aprovar ou reprovar ---------------------------- */

  function qtdMarcadas() {
    return pendentes().filter(function (l) { return pacote.marcadas[l.id]; }).length;
  }

  /** Põe nas caixas, nas linhas, nas torres e nos cartões o que está marcado, e nos botões o que cada um vai fazer. */
  function atualizarMarcas() {
    if (!pacote) return;
    var n = qtdMarcadas();

    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo .sol-caixa'), function (c) {
      c.checked = !!pacote.marcadas[c.getAttribute('data-marcar')];
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-linha]'), function (tr) {
      tr.classList.toggle('marcada', !!pacote.marcadas[tr.getAttribute('data-linha')]);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-g-linha]'), function (el) {
      el.classList.toggle('marcada', !!pacote.marcadas[el.getAttribute('data-g-linha')]);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-g-torre]'), function (el) {
      var tid = el.getAttribute('data-g-torre');
      var dela = pendentes().filter(function (l) { return l.torre.id === tid; });
      el.classList.toggle('sel', dela.length > 0 && dela.every(function (l) { return pacote.marcadas[l.id]; }));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-prog]'), function (el) {
      var id = el.getAttribute('data-prog');
      var marcada = !!pacote.marcadas[id];
      el.classList.toggle('chip-marcado', marcada);
      var m = el.querySelector('.chip-marca');
      if (m) m.classList.toggle('chip-marca-on', marcada);
    });

    var m = pendentes().length, s = qtdReprovadas();
    var legenda = $('solMarcadas');
    if (legenda) legenda.textContent = n ? n + (n === 1 ? ' marcada' : ' marcadas') : 'Nenhuma marcada: os botões valem para todas as que estão em análise';
    if (pacote.btnAprovar) {
      pacote.btnAprovar.textContent = n ? 'Aprovar marcadas (' + n + ')'
        : m ? (s ? 'Aprovar o que sobrou (' + m + ')' : 'Aprovar tudo')
        : s ? 'Concluir (reprovar ' + s + ')' : 'Aprovar';
      pacote.btnAprovar.disabled = !m && !s;
    }
    if (pacote.btnReprovar) {
      pacote.btnReprovar.textContent = n ? 'Reprovar marcadas (' + n + ')' : 'Reprovar tudo';
      pacote.btnReprovar.disabled = !m;
    }
  }

  function marcarLinha(id) {
    if (!pacote) return;
    if (pacote.marcadas[id]) delete pacote.marcadas[id]; else pacote.marcadas[id] = true;
    atualizarMarcas();
  }

  /** Na grade, tocar numa torre marca ou desmarca todas as linhas dela no pacote. */
  function marcarTorre(tid) {
    if (!pacote) return;
    var dela = pendentes().filter(function (l) { return l.torre.id === tid; });
    var todas = dela.length > 0 && dela.every(function (l) { return pacote.marcadas[l.id]; });
    dela.forEach(function (l) { if (todas) delete pacote.marcadas[l.id]; else pacote.marcadas[l.id] = true; });
    atualizarMarcas();
  }

  function marcarTodas() {
    pendentes().forEach(function (l) { pacote.marcadas[l.id] = true; });
    atualizarMarcas();
  }

  function limparMarcas() {
    pacote.marcadas = {};
    atualizarMarcas();
  }

  function trocarVisao(v) {
    pacote.visao = v;
    desenharPacote();
  }

  /* -- Conferir antes de decidir ------------------------------------------- */

  /** Avisos de cada linha: sequência, duplicidade com o oficial, encarregado no mesmo dia. */
  function conferirPacote() {
    var p = pacote;
    p.linhas.forEach(function (l) {
      var av = [];
      p.oficiais.forEach(function (o) {
        // O pedido de alteração (ou de apagar) fica em cima da própria oficial: isso não é duplicidade
        if (l.exclusao || o.id === l.substitui_id) return;
        if (o.torre.id === l.torre.id && o.data === l.data) {
          av.push('Já tem ' + (o.atividade ? o.atividade.nome : '') + ' na torre neste dia (oficial' + (o.encarregado ? ', ' + o.encarregado.nome : '') + ')');
        }
      });
      p.avisos[l.id] = av;
    });
    desenharPacote();

    if (p.linhas.length > 60) { var n = $('solConferindo'); if (n) n.textContent = 'Muitas linhas: a sequência é conferida na aprovação.'; return; }

    // Apagar não tem sequência a conferir
    var fila = p.linhas.filter(function (l) { return !l.exclusao; }), feitas = 0, alvoId = p.sol.id;
    function proximo() {
      var l = fila.shift();
      if (!l || !pacote || pacote.sol.id !== alvoId) return Promise.resolve();
      return db.motivoBloqueio(l.torre.id, l.atividade.id, l.data).then(function (m) {
        if (m) (pacote.avisos[l.id] = pacote.avisos[l.id] || []).push('Fora da sequência: ' + m);
      }).catch(function () {}).then(function () {
        feitas++;
        var n = $('solConferindo'); if (n) n.textContent = 'Conferindo a sequência… ' + feitas + '/' + p.linhas.length;
        return proximo();
      });
    }
    Promise.all([proximo(), proximo(), proximo()]).then(function () {
      if (!pacote || pacote.sol.id !== alvoId) return;
      var n = $('solConferindo'); if (n) n.textContent = '';
      desenharPacote();
    });
  }

  function recarregarPacote() { return analisar(pacote.sol.id); }

  function tirarLinhaDoPacote(id) {
    ui.confirmar('Tirar da solicitação', 'Esta linha sai da solicitação e não vira programação.', 'Tirar').then(function (sim) {
      if (!sim) { desenharPacote(); return; }
      ui.processando('Tirando…');
      return db.removerProgramacao(id).then(function () { ui.pronto(); delete pacote.reprovadas[id]; return recarregarPacote(); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function editarLinhaDoPacote(id) {
    var l = pacote.linhas.filter(function (x) { return x.id === id; })[0];
    if (!l) return;

    var encs = E.encarregados.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    var atvs = E.atividades.slice().sort(function (a, b) { return a.ordem_execucao - b.ordem_execucao; });

    var corpo = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
      '<div><label class="rotulo">Torre</label><p class="text-sm font-bold">' + esc(l.torre.identificador) + '</p></div>' +
      '<div><label class="rotulo">Dia</label><input id="solData" type="date" class="campo" value="' + l.data + '"></div>' +
      '<div><label class="rotulo">Atividade</label><select id="solAtv" class="campo">' + atvs.map(function (a) {
        return '<option value="' + a.id + '"' + (l.atividade && a.id === l.atividade.id ? ' selected' : '') + '>' + esc(a.nome) + '</option>';
      }).join('') + '</select></div>' +
      '<div><label class="rotulo">Encarregado</label><select id="solEnc" class="campo"><option value="">— sem encarregado —</option>' + encs.map(function (e) {
        return '<option value="' + e.id + '"' + (l.encarregado && e.id === l.encarregado.id ? ' selected' : '') + '>' + esc(e.nome) + '</option>';
      }).join('') + '</select></div>' +
      '<div><label class="rotulo">Percentual</label><input id="solPct" type="number" min="1" max="100" class="campo" value="' + (Number(l.percentual) || 100) + '"></div>' +
      '<div><label class="rotulo">Observação</label><input id="solObs" class="campo" value="' + esc(l.observacao || '') + '"></div>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Editar a linha',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario', acao: function () { desenharPacote(); } },
        { rotulo: 'Salvar', classe: 'btn-primario', acao: function () {
          ui.processando('Salvando…');
          db.atualizarProgramacao(id, {
            data: $('solData').value, atividade_id: $('solAtv').value,
            encarregado_id: $('solEnc').value || null, percentual: Number($('solPct').value) || 100,
            observacao: $('solObs').value.trim() || null
          }).then(function () { ui.pronto(); return recarregarPacote(); })
            .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
        } }
      ]
    });
  }

  /* -- Aprovar e reprovar --------------------------------------------------- */

  /**
   * Reprovar não decide nada na hora: separa as linhas na caixa das reprovadas, com a justificativa,
   * e as outras continuam em análise. Só concluir (aprovar o que sobrou) manda a decisão para o banco.
   * Aprovar marcadas é imediato, só para as marcadas, e o resto segue em análise.
   */
  function reprovar() {
    var pend = pendentes();
    var marcadas = pend.filter(function (l) { return pacote.marcadas[l.id]; });
    var alvo = marcadas.length ? marcadas : pend;
    if (!alvo.length) return;
    pedirMotivoDeReprovacao(alvo.map(function (l) { return l.id; }));
  }

  function aprovar() {
    var pend = pendentes();
    var marcadas = pend.filter(function (l) { return pacote.marcadas[l.id]; });
    var separadas = {};
    pacote.linhas.forEach(function (l) { if (pacote.reprovadas[l.id] !== undefined) separadas[l.id] = pacote.reprovadas[l.id]; });

    if (marcadas.length) {
      // Só as marcadas: as outras em análise e as reprovadas separadas ficam como estão
      confirmarDecisao(marcadas.map(function (l) { return l.id; }), {}, true);
    } else {
      // Concluir: aprova o que sobrou e reprova o que foi separado
      confirmarDecisao(pend.map(function (l) { return l.id; }), separadas, false);
    }
  }

  function pedirMotivoDeReprovacao(ids) {
    var linhas = ids.map(function (id) { return pacote.linhas.filter(function (x) { return x.id === id; })[0]; });
    ui.modalGenerico({
      titulo: 'Reprovar ' + ids.length + (ids.length === 1 ? ' programação' : ' programações'),
      corpoHtml: '<div class="space-y-2">' +
        '<p class="sup-fraco">Elas voltam para o supervisor corrigir e reapresentar: ele vê o motivo que você escrever. ' +
          'Por enquanto ficam na caixa das reprovadas, aqui embaixo. Nada é decidido agora: só vale quando você concluir a análise, e dá para voltar atrás.</p>' +
        '<ul class="text-xs sol-resumo">' + resumoDeLinhas(ids.slice(0, 12)) + '</ul>' +
        (ids.length > 12 ? '<p class="sup-fraco">e mais ' + (ids.length - 12) + '…</p>' : '') +
        '<label class="rotulo">Justificativa da reprovação (o supervisor vai ler)</label>' +
        '<textarea id="solMotivo" class="campo" rows="3" placeholder="Ex.: a torre 88/2 não é desta semana."></textarea></div>',
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () { desenharPacote(); } },
        { rotulo: 'Reprovar', classe: 'btn-perigo', acao: function () {
          var motivo = $('solMotivo').value.trim();
          if (!motivo) { ui.avisar('Escreva a justificativa da reprovação.', 'alerta'); $('solMotivo').focus(); return; }
          linhas.forEach(function (l) { pacote.reprovadas[l.id] = motivo; delete pacote.marcadas[l.id]; });
          desenharPacote();
        } }
      ]
    });
  }

  function voltarParaAnalise(id) {
    if (!pacote) return;
    delete pacote.reprovadas[id];
    desenharPacote();
  }

  function voltarTodasParaAnalise() {
    if (!pacote) return;
    pacote.reprovadas = {};
    desenharPacote();
  }

  /** Uma linha já decidida numa rodada anterior volta para a análise. */
  function reanalisarLinha(id) {
    if (!pacote) return;
    confirmarReanalise(pacote.sol.id, [id]);
  }

  function resumoDeLinhas(ids) {
    return ids.map(function (id) {
      var l = pacote.linhas.filter(function (x) { return x.id === id; })[0];
      return '<li>' + (rotuloDaLinha(l) ? '<em class="sol-tag-mini' + (l.exclusao ? ' apagar' : '') + '">' + esc(rotuloDaLinha(l).toUpperCase()) + '</em> ' : '') +
             '<b>' + esc(l.torre.identificador) + '</b> · ' + esc(l.atividade ? l.atividade.nome : '') + ' · ' +
             esc(nomeCurtoDoDia(l.data)) + ' · ' + esc(l.encarregado ? l.encarregado.nome : '—') + '</li>';
    }).join('');
  }

  /** O que acontece com o que se aprova: a nova vira oficial, a alteração muda a oficial, o pedido de apagar a tira. */
  function textoDoQueAprova(ids) {
    var linhas = ids.map(function (id) { return pacote.linhas.filter(function (x) { return x.id === id; })[0]; });
    var apagar = linhas.filter(function (l) { return l.exclusao; }).length;
    var alterar = linhas.filter(function (l) { return !l.exclusao && l.substitui_id; }).length;
    var novas = linhas.length - apagar - alterar;
    var partes = [];
    if (novas) partes.push(novas === 1 ? 'A nova vira programação oficial e já aparece na grade para todo mundo' : 'As novas viram programação oficial e já aparecem na grade para todo mundo');
    if (alterar) partes.push(alterar === 1 ? 'a alteração muda a programação oficial' : 'as alterações mudam a programação oficial');
    if (apagar) partes.push(apagar === 1 ? 'o pedido para apagar tira a programação oficial da grade' : 'os pedidos para apagar tiram as programações oficiais da grade');
    var t = partes.join('; ');
    return esc(t.charAt(0).toUpperCase() + t.slice(1) + '.');
  }

  /**
   * A confirmação mostra o que vai ser aprovado e o que vai ser reprovado (com a justificativa de cada uma).
   * `parcial` é o aprovar só das marcadas: o resto continua em análise.
   */
  function confirmarDecisao(aprovar, reprovar, parcial) {
    var idsRep = Object.keys(reprovar);
    var corpo = '<div class="space-y-3">' +
      (aprovar.length
        ? '<div><p class="text-sm font-bold" style="color:#16A34A">Aprovar ' + aprovar.length + (aprovar.length === 1 ? ' programação' : ' programações') + '</p>' +
          '<p class="sup-fraco">' + textoDoQueAprova(aprovar) + '</p>' +
          (aprovar.length <= 8 ? '<ul class="text-xs sol-resumo">' + resumoDeLinhas(aprovar) + '</ul>' : '') + '</div>'
        : '') +
      (idsRep.length
        ? '<div><p class="text-sm font-bold" style="color:#E11D48">Reprovar ' + idsRep.length + (idsRep.length === 1 ? ' programação' : ' programações') + ' <span class="sup-fraco" style="font-weight:400">(voltam para o supervisor corrigir)</span></p>' +
          '<ul class="text-xs sol-resumo">' + idsRep.slice(0, 12).map(function (id) {
            var l = pacote.linhas.filter(function (x) { return x.id === id; })[0];
            return '<li>' + resumoDaLinha(l) + '<br><span class="sup-fraco">' + esc(reprovar[id]) + '</span></li>';
          }).join('') + '</ul>' +
          (idsRep.length > 12 ? '<p class="sup-fraco">e mais ' + (idsRep.length - 12) + '…</p>' : '') + '</div>'
        : '') +
      (parcial ? '<p class="sup-fraco">As outras linhas continuam em análise.</p>' : '<p class="sup-fraco">Concluindo, a solicitação sai da fila.</p>') +
      '</div>';

    ui.modalGenerico({
      titulo: parcial ? 'Aprovar as marcadas' : 'Concluir a análise',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () { desenharPacote(); } },
        { rotulo: parcial ? 'Aprovar' : 'Concluir', classe: 'btn-primario', acao: function () { executarDecisao(aprovar, reprovar, false); } }
      ]
    });
  }

  function executarDecisao(aprovar, reprovar, liberar) {
    ui.processando('Decidindo…');
    var solId = pacote.sol.id;
    db.decidirSolicitacao(solId, aprovar, reprovar, liberar).then(function (r) {
      ui.pronto();
      // O que acabou de ser reprovado deixa a caixa das separadas: já está decidido no banco
      Object.keys(reprovar).forEach(function (id) { delete pacote.reprovadas[id]; });
      var recarregarOficial = window.SIPAV.app.recarregarProgramacoes;
      return Promise.resolve(recarregarOficial ? recarregarOficial() : null).then(function () {
        atualizarContador(false);
        if (r.falhas && r.falhas.length) { mostrarFalhasDaAprovacao(r); return; }
        var partes = [];
        if (r.aprovadas) partes.push(r.aprovadas + (r.aprovadas === 1 ? ' aprovada, já na grade' : ' aprovadas, já na grade'));
        if (r.reprovadas) partes.push(r.reprovadas + (r.reprovadas === 1 ? ' reprovada' : ' reprovadas'));
        ui.avisar(partes.join(' · ') + '.', 'sucesso', 6000);
        if (r.fechada) { ui.fecharModal('modalGenerico'); pacote = null; return; }
        // Ainda sobra linha em análise: reabre a solicitação só com o que falta
        return analisar(solId);
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(semMigracao57(e.message), 'erro', 7000); });
  }

  function mostrarFalhasDaAprovacao(r) {
    var ids = r.falhas.map(function (f) { return f.id; });
    ui.modalGenerico({
      titulo: r.aprovadas + ' aprovada(s)' + (r.reprovadas ? ', ' + r.reprovadas + ' reprovada(s)' : '') + ', ' + r.falhas.length + ' barrada(s)',
      corpoHtml: '<p class="text-sm" style="margin-bottom:.5rem">A sequência barrou estas. Elas continuam na solicitação.</p>' +
        '<ul class="text-sm space-y-1">' + r.falhas.map(function (f) {
          return '<li><strong>' + esc(f.torre) + '</strong> · ' + esc(f.atividade) + ' · ' + esc(ui.dataCurta(f.data)) +
                 '<br><span class="sup-fraco">' + esc(f.motivo) + '</span></li>';
        }).join('') + '</ul>',
      botoes: [
        { rotulo: 'Voltar e editar', classe: 'btn-secundario', acao: function () { recarregarPacote(); } },
        { rotulo: 'Aprovar mesmo assim', classe: 'btn-primario', acao: function () { executarDecisao(ids, {}, true); } }
      ]
    });
  }  window.SIPAV.supervisor = {
    iniciar: iniciar,
    parar: parar,
    janela: janela,
    trechoMudou: trechoMudou,
    aoRecarregar: aoRecarregar,
    renderMinha: renderMinha,
    tocarTorre: tocarTorre,
    tocarProgramacao: tocarProgramacao,
    programarParaEncarregado: programarParaEncarregado,
    abrirSolicitacoes: abrirSolicitacoes,
    marcarLinha: marcarLinha,
    marcarTorre: marcarTorre,
    marcarTodas: marcarTodas,
    limparMarcas: limparMarcas,
    trocarVisao: trocarVisao,
    ligarSolicitacoesDoPlanejamento: ligarSolicitacoesDoPlanejamento,
    atualizarContador: atualizarContador,
    garantirRascunho: garantirRascunho,
    limparSelecao: limparSelecaoDeTorres,
    avisosDeOcupacao: avisosDeOcupacao,
    escolherDia: escolherDia,
    rotuloDoDia: rotuloDoDia,
    voltarParaAnalise: voltarParaAnalise,
    voltarTodasParaAnalise: voltarTodasParaAnalise,
    reanalisarLinha: reanalisarLinha
  };})();
