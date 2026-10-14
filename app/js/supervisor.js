/* =============================================================================
   SIPAV LT — Supervisor e solicitações
   =============================================================================
   O supervisor não usa a tela completa: tem uma própria, simples, feita para o
   celular (e que também funciona no computador). Ele monta a programação dos
   encarregados como pré-programação, envia o pacote, e o planejamento analisa,
   edita, devolve ou aprova. Só depois de aprovada ela é programação oficial.

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
    ancora: null
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
    document.body.classList.remove('modo-supervisor', 'sup-travado');
    E.modoSupervisor = false;
    ['supFolha', 'supGrade', 'supBarraTorres', 'supEnviar'].forEach(function (id) { ui.esconder(id); });
  }

  function trechoMudou() {
    S.trecho = E.trechoAtual;
    S.sol = null; S.minhas = [];
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
    document.addEventListener('keydown', function (ev) {
      if (!S.ativo || ev.key !== 'Escape') return;
      if (lista) fecharLista();
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
      return sol ? db.programacoesDaSolicitacao(sol.id) : [];
    }).then(function (minhas) {
      S.minhas = minhas;
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

  /** O que já está programado (oficial ou solicitado por outro) numa torre num dia. */
  function ocupacao(torreId, data, ignorarId) {
    return S.consulta.filter(function (p) {
      if (!p.torre || p.torre.id !== torreId || p.data !== data) return false;
      if (ignorarId && p.id === ignorarId) return false;
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

  /* ----------------------------------------------- A aba Minha solicitação -- */

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
      return '<div class="sup-status devolvida"><strong>Devolvida pelo planejamento</strong>' +
             '<p>' + esc(S.sol.motivo_devolucao || 'Corrija e envie de novo.') + '</p>' +
             '<p class="sup-fraco">Corrija o que está errado e envie de novo.</p></div>';
    }
    if (S.sol.status === 'ENVIADA') {
      return '<div class="sup-status enviada"><strong>Enviada para análise</strong>' +
             '<p>Enviada ' + esc(ui.quandoRelativo(S.sol.enviada_em)) + '. Aguardando o planejamento. ' +
             'Enquanto isso não dá para alterar.</p></div>';
    }
    if (S.sol.status === 'APROVADA') {
      return '<div class="sup-status aprovada"><strong>Aprovada</strong>' +
             '<p>O planejamento aprovou ' + esc(ui.quandoRelativo(S.sol.decidida_em)) +
             '. Já é programação oficial.</p></div>';
    }
    if (S.sol.status === 'PARCIAL' || S.sol.status === 'REPROVADA') {
      var ok = S.minhas.filter(function (p) { return p.situacao === 'APROVADA'; }).length;
      var recusadas = S.minhas.filter(function (p) { return p.situacao === 'RECUSADA'; }).length;
      var parcial = S.sol.status === 'PARCIAL';
      return '<div class="sup-status ' + (parcial ? 'enviada' : 'devolvida') + '"><strong>' +
             (parcial ? 'Aprovada em parte' : 'Reprovada') + '</strong>' +
             '<p>' + (ok ? ok + (ok === 1 ? ' programação aprovada' : ' programações aprovadas') + ' (já são oficiais) e ' : '') +
             recusadas + (recusadas === 1 ? ' reprovada' : ' reprovadas') + ', decidido ' + esc(ui.quandoRelativo(S.sol.decidida_em)) +
             '. O motivo de cada reprovada está abaixo.</p>' +
             '<p class="sup-fraco">Corrija o que for preciso e programe de novo.</p></div>';
    }
    return '<div class="sup-status"><strong>Rascunho</strong>' +
           '<p>Ainda não foi enviado. Quando terminar, toque em <b>Enviar para análise</b>.</p></div>';
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

    if (S.minhas.length) {
      var porDia = {};
      S.minhas.forEach(function (p) { (porDia[p.data] = porDia[p.data] || []).push(p); });

      html += Object.keys(porDia).sort().map(function (dia) {
        var linhas = porDia[dia].slice().sort(function (a, b) {
          var ea = a.encarregado ? a.encarregado.nome : '', eb = b.encarregado ? b.encarregado.nome : '';
          return ea.localeCompare(eb, 'pt-BR') || ((a.torre && a.torre.ordem) - (b.torre && b.torre.ordem));
        });
        return '<section class="sup-dia"><h3>' + esc(nomeCurtoDoDia(dia)) +
               '<span>' + linhas.length + (linhas.length === 1 ? ' programação' : ' programações') + '</span></h3>' +
               linhas.map(function (p) { return cartaoLinha(p, editavel && p.situacao === 'SOLICITADA'); }).join('') +
               '</section>';
      }).join('');
    }

    cont.innerHTML = html + '</div>';
    renderBarraDeEnvio();
    ui.icones();
  }

  function cartaoLinha(p, podeMexer) {
    var avisos = (p.situacao !== 'SOLICITADA' ? [] : ocupacao(p.torre.id, p.data, p.id)).map(function (o) {
      return '<p class="sup-aviso">⚠ Nesta torre, neste dia: ' + esc(textoDaOcupacao(o)) + '</p>';
    }).join('');

    var decisao = p.situacao === 'RECUSADA'
      ? '<p class="sup-recusa"><b>Reprovada.</b> ' + esc(p.motivo_recusa || 'Sem justificativa registrada.') + '</p>'
      : p.situacao === 'APROVADA'
        ? '<span class="sup-origem oficial">Aprovada, já é oficial</span>' : '';

    return '<div class="sup-card' + (p.situacao === 'RECUSADA' ? ' recusada' : '') + '">' +
      '<div class="sup-card-topo"><strong>' + esc(p.torre.identificador) + '</strong>' + chipAtividade(p.atividade) + '</div>' +
      '<div class="sup-card-meio"><span>' + esc(p.encarregado ? p.encarregado.nome : 'Sem encarregado') + '</span>' +
        '<span class="sup-pct">' + pct(p.percentual) + '</span>' +
        (p.cabo ? '<span class="sup-fraco">' + esc(String(p.cabo).replace('_', ' ')) + '</span>' : '') + '</div>' +
      (p.observacao ? '<p class="sup-fraco">' + esc(p.observacao) + '</p>' : '') +
      decisao + avisos +
      (podeMexer
        ? '<div class="sup-card-acoes">' +
            '<button type="button" data-acao="editar" data-id="' + p.id + '" aria-label="Editar"><i data-lucide="pencil" class="w-4 h-4"></i> Editar</button>' +
            '<button type="button" data-acao="apagar" data-id="' + p.id + '" aria-label="Apagar" class="perigo"><i data-lucide="trash-2" class="w-4 h-4"></i> Apagar</button>' +
          '</div>'
        : '') +
      '</div>';
  }

  function renderBarraDeEnvio() {
    var barra = $('supEnviar');
    if (!barra) return;
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    var mostrar = E.aba === 'solicitacao' && !S.erro && ehEditavel() && S.sol && n > 0;
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
    var linhas = '<p class="text-sm"><b>' + esc(p.torre.identificador) + '</b> · ' + esc(p.atividade ? p.atividade.nome : '') + '</p>' +
      '<p class="text-sm" style="color:var(--texto-suave)">' + esc(nomeCurtoDoDia(p.data)) + ' · ' +
        esc(p.encarregado ? p.encarregado.nome : 'sem encarregado') + ' · ' + pct(p.percentual) + '</p>' +
      (p.observacao ? '<p class="sup-fraco">' + esc(p.observacao) + '</p>' : '') +
      '<p class="sup-fraco" style="margin-top:.5rem">' + esc(p.situacao === 'APROVADA' ? 'Programação oficial.' : origemDe(p) +
        (p.solicitacao_id && S.sol && p.solicitacao_id === S.sol.id ? ' (a sua)' : '') + ', ainda não aprovada.') + '</p>';

    var botoes = [{ rotulo: 'Fechar', classe: 'btn-secundario' }];
    if (minha) {
      botoes = [
        { rotulo: 'Fechar', classe: 'btn-secundario' },
        { rotulo: 'Apagar', classe: 'btn-secundario btn-secundario-perigo', acao: function () { ui.fecharModal('modalGenerico'); apagarLinha(id); } },
        { rotulo: 'Editar', classe: 'btn-primario', acao: function () { ui.fecharModal('modalGenerico'); abrirFormulario(p); } }
      ];
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
      case 'bt-faixa': S.faixa = !S.faixa; S.ancora = null; atualizarBarraDeTorres(); break;
      case 'editar': abrirFormulario(S.minhas.filter(function (p) { return p.id === id; })[0]); break;
      case 'apagar': apagarLinha(id); break;
      case 'enviar': enviarPacote(); break;
      case 'fechar-form': fecharFormulario(); break;
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
    abrirFormulario(null, { modo: 'torre', torresTexto: textoDasTorres(marcadas) });
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
    ui.confirmar('Apagar programação',
      p.torre.identificador + ' · ' + (p.atividade ? p.atividade.nome : '') + ' · ' + nomeCurtoDoDia(p.data) + '. Sai da sua solicitação.',
      'Apagar').then(function (sim) {
      if (!sim) return;
      ui.processando('Apagando…');
      return db.removerProgramacao(id).then(atualizarTudo)
        .then(function () { ui.pronto(); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function enviarPacote() {
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    if (!S.sol || !n) return;
    ui.confirmar('Enviar para análise',
      'Vão ' + n + (n === 1 ? ' programação' : ' programações') + ' para o planejamento analisar. ' +
      'Depois de enviar você não altera mais, até o planejamento aprovar ou devolver.',
      'Enviar').then(function (sim) {
      if (!sim) return;
      ui.processando('Enviando…');
      return db.enviarSolicitacao(S.sol.id).then(atualizarTudo)
        .then(function () { ui.pronto(); ui.avisar('Enviado. O planejamento vai analisar.', 'sucesso', 5000); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  /* ---------------------------------------------------------- Formulário --- */

  /** Só os dias da janela dele (mais o da linha, se uma antiga é editada). */
  function diasDoFormulario() {
    var dias = diasDaJanela();
    Object.keys(F.dias).forEach(function (d) { if (dias.indexOf(d) === -1) dias.push(d); });
    return dias.sort();
  }
  function abrirFormulario(linha, opcoes) {
    opcoes = opcoes || {};
    if (S.sol && S.sol.status === 'ENVIADA') {
      ui.avisar('Está aguardando o planejamento. Dá para programar de novo depois da análise.', 'alerta', 5000);
      return;
    }

    F = {
      editId: linha ? linha.id : null,
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
        '<div class="sup-folha-topo"><strong>' + (edicao ? 'Editar programação' : 'Programar') + '</strong>' +
          '<button type="button" class="sup-x" data-acao="fechar-form" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>' +
        '<div class="sup-folha-corpo">' +

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
            '<div id="fDias" class="sup-dias-linha"></div>' +
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
      var pt = S.minhas.filter(function (p) { return p.id === F.editId; })[0].torre;
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
        return p.torre && p.torre.id === l.torre.torre_id && p.data === l.data && p.atividade && p.atividade.id === F.atvId &&
               (p.encarregado ? p.encarregado.id : '') === (F.encId || '') && p.id !== F.editId;
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

    // Dias
    $('fDias').innerHTML = diasDoFormulario().map(function (d) {
      return '<button type="button" class="sup-dia-chip' + (F.dias[d] ? ' ativo' : '') + (ui.fimDeSemana(d) ? ' fds' : '') +
             '" data-acao="dia-form" data-dia="' + d + '"><b>' + (d === hojeIso() ? 'Hoje' : esc(ui.diaDaSemana(d).slice(0, 3))) + '</b>' +
             esc(ui.dataCurta(d)) + '</button>';
    }).join('');

    var plano = planejar();

    if (edicao) {
      var p = S.minhas.filter(function (x) { return x.id === F.editId; })[0];
      $('fTorreFixa').textContent = p ? p.torre.identificador : '';
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
      ocupacao(l.torre.torre_id, l.data, F.editId).forEach(function (o) {
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
    salvar.textContent = edicao ? 'Salvar' : (plano.linhas.length ? 'Adicionar ' + plano.linhas.length : 'Adicionar');
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

  function fecharLista() { lista = null; ui.esconder('supLista'); }

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

  function abrirSolicitacoes() {
    ui.processando('Carregando as solicitações…');
    db.solicitacoesParaAnalise().then(function (lista) {
      ui.pronto();
      var corpo = lista.length
        ? '<div class="space-y-2">' + lista.map(function (s) {
            return '<div class="sol-linha"><div><strong>' + esc(s.supervisor ? s.supervisor.nome : '—') + '</strong>' +
                   '<p class="sup-fraco">' + esc(s.trecho ? s.trecho.nome : '') + ' · enviada ' + esc(ui.quandoRelativo(s.enviada_em)) + '</p></div>' +
                   '<button type="button" class="btn-primario" data-sol="' + s.id + '">Analisar</button></div>';
          }).join('') + '</div>'
        : '<p class="text-sm" style="color:var(--texto-suave)">Nenhuma solicitação esperando análise.</p>';

      ui.modalGenerico({ titulo: 'Solicitações dos supervisores', corpoHtml: corpo, botoes: [{ rotulo: 'Fechar', classe: 'btn-secundario' }] });
      Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-sol]'), function (b) {
        b.onclick = function () { analisar(b.getAttribute('data-sol')); };
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  var pacote = null;   // o que está sendo analisado

  function analisar(id) {
    ui.processando('Abrindo a solicitação…');
    Promise.all([db.solicitacoesParaAnalise(), db.programacoesDaSolicitacao(id)]).then(function (r) {
      var sol = r[0].filter(function (s) { return s.id === id; })[0];
      // O que já foi decidido (aprovado ou reprovado numa rodada anterior) não volta para a análise
      var linhas = r[1].filter(function (l) { return l.situacao === 'SOLICITADA'; });
      if (!sol) { ui.pronto(); ui.avisar('Esta solicitação já foi analisada.', 'alerta'); abrirSolicitacoes(); return; }

      var datas = linhas.map(function (l) { return l.data; }).sort();
      return Promise.all([
        db.programacoes({ de: datas[0], ate: datas[datas.length - 1] }),
        db.torres(sol.trecho_id)
      ]).then(function (x) {
        // Reabrindo depois de editar ou tirar uma linha, as marcas e a visão ficam como estavam
        var mesma = pacote && pacote.sol.id === id;
        var marcadas = {};
        if (mesma) linhas.forEach(function (l) { if (pacote.marcadas[l.id]) marcadas[l.id] = true; });
        pacote = { sol: sol, linhas: linhas, oficiais: x[0], torres: x[1], avisos: {},
                   marcadas: marcadas, visao: mesma ? pacote.visao : 'lista' };
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

  /** A lista: uma linha por programação, com a caixa de marcar. */
  function htmlDaLista(linhas) {
    return '<div class="sol-tabela"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase" style="color:var(--texto-fraco)">' +
      '<th class="py-1 pr-1" style="width:2rem"></th><th class="py-1 pr-2">Dia</th><th class="pr-2">Torre</th><th class="pr-2">Atividade</th>' +
      '<th class="pr-2">Encarregado</th><th class="pr-2">%</th><th></th></tr></thead><tbody>' +
      linhas.map(function (l) {
        var avisos = avisosDaLinha(l);
        return '<tr class="sol-linha-tab" data-linha="' + l.id + '">' +
          '<td class="py-1 pr-1"><input type="checkbox" class="sol-caixa" data-marcar="' + l.id + '" ' +
            'onclick="SIPAV.supervisor.marcarLinha(\'' + l.id + '\')" aria-label="Marcar"></td>' +
          '<td class="py-1 pr-2 whitespace-nowrap">' + esc(nomeCurtoDoDia(l.data)) + '</td>' +
          '<td class="pr-2"><strong>' + esc(l.torre.identificador) + '</strong></td>' +
          '<td class="pr-2">' + chipAtividade(l.atividade) + '</td>' +
          '<td class="pr-2">' + esc(l.encarregado ? l.encarregado.nome : '—') + '</td>' +
          '<td class="pr-2">' + pct(l.percentual) + '</td>' +
          '<td class="whitespace-nowrap"><button type="button" class="btn-lancar" data-ed="' + l.id + '">Editar</button> ' +
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

  function desenharPacote() {
    var p = pacote;
    var linhas = ordemDasLinhas(p.linhas);

    var visoes = [['lista', 'Lista'], ['grade', 'Grade'], ['enc', 'Por encarregado']].map(function (v) {
      return '<button type="button" class="sup-seg-btn' + (p.visao === v[0] ? ' ativo' : '') +
             '" onclick="SIPAV.supervisor.trocarVisao(\'' + v[0] + '\')">' + v[1] + '</button>';
    }).join('');

    var conteudo = p.visao === 'grade' ? htmlDaGrade(linhas) : p.visao === 'enc' ? htmlDoPorEncarregado(linhas) : htmlDaLista(linhas);

    var corpo = '<p class="sup-fraco" style="margin-bottom:.5rem">' + esc(p.sol.trecho ? p.sol.trecho.nome : '') +
      ' · ' + linhas.length + (linhas.length === 1 ? ' programação' : ' programações') +
      ' · enviada ' + esc(ui.quandoRelativo(p.sol.enviada_em)) + '</p>' +
      '<div class="sol-barra"><div class="sol-visoes">' + visoes + '</div>' +
        '<div class="sol-marcas"><span id="solMarcadas" class="sup-fraco"></span>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.marcarTodas()">Marcar todas</button>' +
          '<button type="button" class="btn-lancar" onclick="SIPAV.supervisor.limparMarcas()">Limpar</button></div></div>' +
      conteudo +
      '<p class="sup-fraco" id="solConferindo" style="margin-top:.5rem"></p>';

    ui.modalGenerico({
      titulo: 'Solicitação de ' + (p.sol.supervisor ? p.sol.supervisor.nome : 'supervisor'),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: abrirSolicitacoes },
        { rotulo: 'Devolver para corrigir…', classe: 'btn-secundario', acao: pedirMotivoDeDevolucao },
        { rotulo: 'Reprovar', classe: 'btn-secundario btn-secundario-perigo', acao: function () { decidir('reprovar'); } },
        { rotulo: 'Aprovar', classe: 'btn-primario', acao: function () { decidir('aprovar'); } }
      ]
    });

    document.querySelector('#modalGenerico .modal-caixa').classList.add('sol-larga');
    var bs = document.querySelectorAll('#genericoRodape button');
    p.btnReprovar = bs[2]; p.btnAprovar = bs[3];

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
    return pacote.linhas.filter(function (l) { return pacote.marcadas[l.id]; }).length;
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
      var dela = pacote.linhas.filter(function (l) { return l.torre.id === tid; });
      el.classList.toggle('sel', dela.length > 0 && dela.every(function (l) { return pacote.marcadas[l.id]; }));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-prog]'), function (el) {
      var id = el.getAttribute('data-prog');
      var marcada = !!pacote.marcadas[id];
      el.classList.toggle('chip-marcado', marcada);
      var m = el.querySelector('.chip-marca');
      if (m) m.classList.toggle('chip-marca-on', marcada);
    });

    var legenda = $('solMarcadas');
    if (legenda) legenda.textContent = n ? n + (n === 1 ? ' marcada' : ' marcadas') : 'Nenhuma marcada: os botões valem para todas';
    if (pacote.btnAprovar) pacote.btnAprovar.textContent = n ? 'Aprovar marcadas (' + n + ')' : 'Aprovar tudo';
    if (pacote.btnReprovar) pacote.btnReprovar.textContent = n ? 'Reprovar marcadas (' + n + ')' : 'Reprovar tudo';
  }

  function marcarLinha(id) {
    if (!pacote) return;
    if (pacote.marcadas[id]) delete pacote.marcadas[id]; else pacote.marcadas[id] = true;
    atualizarMarcas();
  }

  /** Na grade, tocar numa torre marca ou desmarca todas as linhas dela no pacote. */
  function marcarTorre(tid) {
    if (!pacote) return;
    var dela = pacote.linhas.filter(function (l) { return l.torre.id === tid; });
    var todas = dela.length > 0 && dela.every(function (l) { return pacote.marcadas[l.id]; });
    dela.forEach(function (l) { if (todas) delete pacote.marcadas[l.id]; else pacote.marcadas[l.id] = true; });
    atualizarMarcas();
  }

  function marcarTodas() {
    pacote.linhas.forEach(function (l) { pacote.marcadas[l.id] = true; });
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
        if (o.torre.id === l.torre.id && o.data === l.data) {
          av.push('Já tem ' + (o.atividade ? o.atividade.nome : '') + ' na torre neste dia (oficial' + (o.encarregado ? ', ' + o.encarregado.nome : '') + ')');
        }
      });
      p.avisos[l.id] = av;
    });
    desenharPacote();

    if (p.linhas.length > 60) { var n = $('solConferindo'); if (n) n.textContent = 'Muitas linhas: a sequência é conferida na aprovação.'; return; }

    var fila = p.linhas.slice(), feitas = 0, alvoId = p.sol.id;
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
      return db.removerProgramacao(id).then(function () { ui.pronto(); return recarregarPacote(); });
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

  /** Devolver o pacote inteiro para o supervisor corrigir e enviar de novo. */
  function pedirMotivoDeDevolucao() {
    ui.modalGenerico({
      titulo: 'Devolver para o supervisor corrigir',
      corpoHtml: '<p class="text-sm" style="margin-bottom:.5rem;color:var(--texto-suave)">A solicitação inteira volta para ele editar e enviar de novo. ' +
        'Nada é aprovado nem reprovado agora.</p>' +
        '<label class="rotulo">O que está errado? (o supervisor vai ler isto)</label>' +
        '<textarea id="solMotivo" class="campo" rows="4" placeholder="Ex.: a torre 88/2 não é desta semana; falta a atividade do dia 15."></textarea>',
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () { desenharPacote(); } },
        { rotulo: 'Devolver', classe: 'btn-primario', acao: function () {
          var motivo = $('solMotivo').value.trim();
          if (!motivo) { ui.avisar('Diga o que está errado.', 'alerta'); return; }
          ui.processando('Devolvendo…');
          db.devolverSolicitacao(pacote.sol.id, motivo).then(function () {
            ui.pronto(); ui.fecharModal('modalGenerico'); pacote = null;
            ui.avisar('Devolvida para o supervisor corrigir.', 'sucesso', 5000);
            atualizarContador(false);
          }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
        } }
      ]
    });
  }

  /* -- Aprovar e reprovar --------------------------------------------------- */

  /**
   * Sem nada marcado, o botão vale para todas. Com marcadas: "Aprovar marcadas" aprova essas e
   * reprova as outras; "Reprovar marcadas" reprova essas e aprova as outras. A janela de
   * confirmação diz o que vai acontecer e pede a justificativa do que for reprovado.
   */
  function decidir(modo) {
    var p = pacote;
    var ids = p.linhas.map(function (l) { return l.id; });
    var marcadas = ids.filter(function (id) { return p.marcadas[id]; });
    var aprovar;
    if (!marcadas.length) aprovar = modo === 'aprovar' ? ids : [];
    else if (modo === 'aprovar') aprovar = marcadas;
    else aprovar = ids.filter(function (id) { return !p.marcadas[id]; });
    var reprovar = ids.filter(function (id) { return aprovar.indexOf(id) === -1; });
    confirmarDecisao(aprovar, reprovar);
  }

  function resumoDeLinhas(ids) {
    return ids.map(function (id) {
      var l = pacote.linhas.filter(function (x) { return x.id === id; })[0];
      return '<li><b>' + esc(l.torre.identificador) + '</b> · ' + esc(l.atividade ? l.atividade.nome : '') + ' · ' +
             esc(nomeCurtoDoDia(l.data)) + ' · ' + esc(l.encarregado ? l.encarregado.nome : '—') + '</li>';
    }).join('');
  }

  function confirmarDecisao(aprovar, reprovar) {
    var corpo = '<div class="space-y-3">' +
      (aprovar.length
        ? '<div><p class="text-sm font-bold" style="color:#16A34A">Aprovar ' + aprovar.length + (aprovar.length === 1 ? ' programação' : ' programações') + '</p>' +
          '<p class="sup-fraco">Viram programação oficial e já aparecem na grade para todo mundo.</p>' +
          (aprovar.length <= 8 ? '<ul class="text-xs sol-resumo">' + resumoDeLinhas(aprovar) + '</ul>' : '') + '</div>'
        : '') +
      (reprovar.length
        ? '<div><p class="text-sm font-bold" style="color:#E11D48">Reprovar ' + reprovar.length + (reprovar.length === 1 ? ' programação' : ' programações') + '</p>' +
          '<ul class="text-xs sol-resumo">' + resumoDeLinhas(reprovar.slice(0, 12)) + '</ul>' +
          (reprovar.length > 12 ? '<p class="sup-fraco">e mais ' + (reprovar.length - 12) + '…</p>' : '') +
          '<label class="rotulo" style="margin-top:.5rem">Justificativa da reprovação (o supervisor vai ler)</label>' +
          '<textarea id="solMotivo" class="campo" rows="3" placeholder="Ex.: a torre 88/2 não é desta semana."></textarea></div>'
        : '') +
      '</div>';

    ui.modalGenerico({
      titulo: 'Confirmar a decisão',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () { desenharPacote(); } },
        { rotulo: 'Confirmar', classe: reprovar.length && !aprovar.length ? 'btn-perigo' : 'btn-primario', acao: function () {
          var motivo = reprovar.length ? $('solMotivo').value.trim() : '';
          if (reprovar.length && !motivo) { ui.avisar('Escreva a justificativa da reprovação.', 'alerta'); $('solMotivo').focus(); return; }
          executarDecisao(aprovar, motivo, false);
        } }
      ]
    });
  }

  function executarDecisao(aprovar, motivo, liberar) {
    ui.processando('Decidindo…');
    db.decidirSolicitacao(pacote.sol.id, aprovar, motivo, liberar).then(function (r) {
      ui.pronto();
      var recarregarOficial = window.SIPAV.app.recarregarProgramacoes;
      return Promise.resolve(recarregarOficial ? recarregarOficial() : null).then(function () {
        atualizarContador(false);
        if (r.falhas && r.falhas.length) { mostrarFalhasDaAprovacao(r); return; }
        ui.fecharModal('modalGenerico');
        pacote = null;
        var partes = [];
        if (r.aprovadas) partes.push(r.aprovadas + (r.aprovadas === 1 ? ' aprovada, já na grade' : ' aprovadas, já na grade'));
        if (r.reprovadas) partes.push(r.reprovadas + (r.reprovadas === 1 ? ' reprovada' : ' reprovadas'));
        ui.avisar(partes.join(' · ') + '.', 'sucesso', 6000);
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
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
        { rotulo: 'Aprovar mesmo assim', classe: 'btn-primario', acao: function () { executarDecisao(ids, '', true); } }
      ]
    });
  }
  window.SIPAV.supervisor = {
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
    atualizarContador: atualizarContador
  };})();
