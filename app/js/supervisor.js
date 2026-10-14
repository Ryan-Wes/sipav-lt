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
    aba: 'minha',            // 'minha' | 'consultar'
    trecho: null,
    sol: null,               // o pacote em andamento do supervisor neste trecho
    minhas: [],              // as linhas dele
    consulta: [],            // o oficial e o que os outros solicitaram, de hoje a quatro semanas
    torres: [],
    torrePorNome: {},
    diaConsulta: null,
    busca: ''
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

  /* ------------------------------------------------------- Início e saída -- */

  /** Chamado depois que o login carregou obra, trechos, atividades e encarregados. */
  function iniciar() {
    S.ativo = true;
    $('supNome').textContent = E.perfil ? E.perfil.nome : '';

    $('supTrecho').innerHTML = E.trechos.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.nome) + '</option>';
    }).join('');
    var salvo = null;
    try { salvo = localStorage.getItem('sipav_sup_trecho'); } catch (e) {}
    S.trecho = E.trechos.filter(function (t) { return t.id === salvo; })[0] || E.trechos[0];
    E.trechoAtual = S.trecho;   // o cabo que se oferece depende do trecho
    $('supTrecho').value = S.trecho.id;

    ligarEventos();
    ui.esconder('telaCarregando');
    ui.esconder('telaLogin');
    ui.esconder('telaApp');
    ui.mostrar('telaSupervisor');
    ui.icones();

    return carregar().then(function () {
      // Atualiza sozinho de tempos em tempos e quando a pessoa volta para a aba
      if (atualizador) clearInterval(atualizador);
      atualizador = setInterval(function () { if (!document.hidden && !F) recarregar(true); }, 60000);
    });
  }

  function parar() {
    S.ativo = false;
    F = null;
    document.body.classList.remove('sup-travado');
    if (atualizador) { clearInterval(atualizador); atualizador = null; }
    ui.esconder('telaSupervisor');
  }

  var eventosLigados = false;

  function ligarEventos() {
    if (eventosLigados) return;
    eventosLigados = true;

    $('telaSupervisor').addEventListener('click', aoClicar);
    $('supTrecho').addEventListener('change', function (ev) {
      S.trecho = E.trechos.filter(function (t) { return t.id === ev.target.value; })[0] || S.trecho;
      E.trechoAtual = S.trecho;
      try { localStorage.setItem('sipav_sup_trecho', S.trecho.id); } catch (e) {}
      S.sol = null; S.minhas = [];
      carregar();
    });
    document.addEventListener('visibilitychange', function () {
      if (S.ativo && !document.hidden && !F) recarregar(true);
    });
  }

  /* -------------------------------------------------------------- Dados ---- */

  function indexarTorres() {
    S.torrePorNome = {};
    S.torres.forEach(function (t) { S.torrePorNome[norm(t.identificador).replace(/\s+/g, '')] = t; });
  }

  function carregar() {
    ui.processando('Carregando…');
    return recarregar(false).then(function () { ui.pronto(); }, function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /** Busca de novo o pacote, as linhas e o que os outros programaram. `calado` não mexe na tela se nada mudou. */
  function recarregar(calado) {
    var de = hojeIso();
    var ate = ui.iso(ui.somarDias(new Date(), 28));
    return Promise.all([
      db.torres(S.trecho.id),
      db.minhaSolicitacao(S.trecho.id),
      db.programacoesParaConsulta({ de: de, ate: ate })
    ]).then(function (r) {
      S.torres = r[0];
      indexarTorres();
      S.sol = r[1];
      S.consulta = r[2];
      return S.sol ? db.programacoesDaSolicitacao(S.sol.id) : [];
    }).then(function (minhas) {
      S.minhas = minhas;
      if (!S.diaConsulta || S.diaConsulta < hojeIso()) S.diaConsulta = hojeIso();
      render();
    }).catch(function (e) {
      if (!calado) throw e;
    });
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

  /* ------------------------------------------------------------- Render ---- */

  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('.sup-aba'), function (b) {
      b.classList.toggle('ativa', b.getAttribute('data-aba') === S.aba);
    });
    $('supCorpo').innerHTML = S.aba === 'minha' ? htmlMinha() : htmlConsultar();
    renderBarraDeEnvio();
    ui.icones();
  }

  function chipAtividade(a) {
    var cor = a ? a.cor_fundo : '#94A3B8';
    return '<span class="sup-chip" style="background:' + cor + ';color:' + ui.corDoTexto(cor) + '">' +
           esc(a ? a.nome : '—') + '</span>';
  }

  function cartaoStatus() {
    if (!S.sol) {
      return '<div class="sup-status"><strong>Nenhuma programação em andamento</strong>' +
             '<p>Toque em <b>Programar</b> para começar. Quando terminar, envie para o planejamento analisar.</p></div>';
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
    return '<div class="sup-status"><strong>Rascunho</strong>' +
           '<p>Ainda não foi enviado. Quando terminar, toque em <b>Enviar para análise</b>.</p></div>';
  }

  function htmlMinha() {
    var editavel = ehEditavel();
    var html = cartaoStatus();

    if (editavel || (S.sol && S.sol.status === 'APROVADA')) {
      html += '<button type="button" class="sup-programar" data-acao="programar">' +
              '<i data-lucide="plus" class="w-5 h-5"></i> Programar</button>';
    }

    if (!S.minhas.length) return html;

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

    return html;
  }

  function cartaoLinha(p, podeMexer) {
    var avisos = ocupacao(p.torre.id, p.data, p.id).map(function (o) {
      return '<p class="sup-aviso">⚠ Nesta torre, neste dia: ' + esc(textoDaOcupacao(o)) + '</p>';
    }).join('');

    return '<div class="sup-card">' +
      '<div class="sup-card-topo"><strong>' + esc(p.torre.identificador) + '</strong>' + chipAtividade(p.atividade) + '</div>' +
      '<div class="sup-card-meio"><span>' + esc(p.encarregado ? p.encarregado.nome : 'Sem encarregado') + '</span>' +
        '<span class="sup-pct">' + pct(p.percentual) + '</span>' +
        (p.cabo ? '<span class="sup-fraco">' + esc(String(p.cabo).replace('_', ' ')) + '</span>' : '') + '</div>' +
      (p.observacao ? '<p class="sup-fraco">' + esc(p.observacao) + '</p>' : '') +
      avisos +
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
    var n = S.minhas.filter(function (p) { return p.situacao === 'SOLICITADA'; }).length;
    var mostrar = S.aba === 'minha' && ehEditavel() && S.sol && n > 0;
    barra.classList.toggle('hidden', !mostrar);
    if (mostrar) {
      $('supEnviarBotao').innerHTML = 'Enviar para análise <b>(' + n + ')</b>';
    }
  }

  /* --------------------------------------------------------- Consultar ----- */

  function htmlConsultar() {
    var dias = [];
    for (var i = 0; i < 21; i++) dias.push(ui.iso(ui.somarDias(new Date(), i)));

    var chips = dias.map(function (d) {
      return '<button type="button" class="sup-dia-chip' + (d === S.diaConsulta ? ' ativo' : '') + (ui.fimDeSemana(d) ? ' fds' : '') +
             '" data-acao="dia-consulta" data-dia="' + d + '"><b>' + esc(ui.diaDaSemana(d).slice(0, 3)) + '</b>' +
             esc(ui.dataCurta(d)) + '</button>';
    }).join('');

    var termo = norm(S.busca);
    var lista = S.consulta.filter(function (p) {
      if (p.data !== S.diaConsulta) return false;
      if (!termo) return true;
      return norm((p.torre ? p.torre.identificador : '') + ' ' + (p.atividade ? p.atividade.nome : '') + ' ' +
                  (p.encarregado ? p.encarregado.nome : '')).indexOf(termo) !== -1;
    }).sort(function (a, b) {
      return (a.torre.ordem - b.torre.ordem) ||
             ((a.atividade ? a.atividade.ordem_execucao : 0) - (b.atividade ? b.atividade.ordem_execucao : 0));
    });

    var corpo = lista.length
      ? lista.map(function (p) {
          var minha = S.sol && p.solicitacao_id === S.sol.id;
          var rotulo = minha ? 'Minha solicitação' : origemDe(p);
          var classe = p.situacao === 'APROVADA' ? 'oficial' : minha ? 'minha' : 'solicitada';
          return '<div class="sup-card"><div class="sup-card-topo"><strong>' + esc(p.torre.identificador) + '</strong>' +
                 chipAtividade(p.atividade) + '</div>' +
                 '<div class="sup-card-meio"><span>' + esc(p.encarregado ? p.encarregado.nome : 'Sem encarregado') + '</span>' +
                 '<span class="sup-pct">' + pct(p.percentual) + '</span></div>' +
                 '<span class="sup-origem ' + classe + '">' + esc(rotulo) + '</span></div>';
        }).join('')
      : '<p class="sup-vazio">Nada programado ' + (termo ? 'com essa busca ' : '') + 'neste dia' +
        (S.trecho ? ' em ' + esc(S.trecho.nome) : '') + '.</p>';

    return '<p class="sup-fraco sup-dica">Veja o que já está programado antes de lançar: o que é oficial e o que outros ' +
             'supervisores solicitaram. Aqui só se consulta.</p>' +
           '<div class="sup-dias-linha">' + chips + '</div>' +
           '<input id="supBusca" class="campo sup-busca" placeholder="Buscar torre, encarregado ou atividade" value="' + esc(S.busca) + '" autocomplete="off">' +
           corpo;
  }

  /* ------------------------------------------------------------ Cliques ---- */

  function aoClicar(ev) {
    var alvo = ev.target.closest ? ev.target.closest('[data-acao]') : null;
    if (!alvo) return;
    var acao = alvo.getAttribute('data-acao');
    var id = alvo.getAttribute('data-id');

    switch (acao) {
      case 'aba': S.aba = alvo.getAttribute('data-aba'); render(); break;
      case 'atualizar': carregar(); break;
      case 'tema': window.SIPAV.app.alternarTema(); break;
      case 'sair': window.SIPAV.app.sair(); break;
      case 'programar': abrirFormulario(null); break;
      case 'editar': abrirFormulario(S.minhas.filter(function (p) { return p.id === id; })[0]); break;
      case 'apagar': apagarLinha(id); break;
      case 'enviar': enviarPacote(); break;
      case 'dia-consulta': S.diaConsulta = alvo.getAttribute('data-dia'); render(); break;
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
    }
  }

  document.addEventListener('input', function (ev) {
    if (!S.ativo) return;
    if (ev.target.id === 'supBusca') {
      S.busca = ev.target.value;
      var pos = ev.target.selectionStart;
      $('supCorpo').innerHTML = htmlConsultar();
      var campo = $('supBusca'); campo.focus(); try { campo.setSelectionRange(pos, pos); } catch (e) {}
      ui.icones();
    } else if (ev.target.id === 'fTorres') {
      F.torresTexto = ev.target.value; atualizarFormulario();
    } else if (ev.target.id === 'fPct') {
      F.pct = Number(ev.target.value) || 0; atualizarFormulario();
    } else if (ev.target.id === 'fObs') {
      F.obs = ev.target.value;
    } else if (ev.target.id === 'fOutraData') {
      var d = ev.target.value;
      if (d && d >= hojeIso()) { adicionarDia(d); ev.target.value = ''; }
    } else if (ev.target.id === 'listaBusca') {
      desenharLista(ev.target.value);
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
      return db.removerProgramacao(id).then(function () { return recarregar(false); })
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
      return db.enviarSolicitacao(S.sol.id).then(function () { return recarregar(false); })
        .then(function () { ui.pronto(); ui.avisar('Enviado. O planejamento vai analisar.', 'sucesso', 5000); });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  /* ---------------------------------------------------------- Formulário --- */

  function diasDoFormulario() {
    var dias = [];
    for (var i = 0; i < 14; i++) dias.push(ui.iso(ui.somarDias(new Date(), i)));
    Object.keys(F.dias).forEach(function (d) { if (dias.indexOf(d) === -1) dias.push(d); });
    return dias.sort();
  }

  function abrirFormulario(linha) {
    if (S.sol && S.sol.status === 'ENVIADA') {
      ui.avisar('Está aguardando o planejamento. Dá para programar de novo depois da análise.', 'alerta', 5000);
      return;
    }

    F = {
      editId: linha ? linha.id : null,
      encId: linha && linha.encarregado ? linha.encarregado.id : (lembrado('enc') || ''),
      atvId: linha && linha.atividade ? linha.atividade.id : '',
      cabo: linha ? (linha.cabo || '') : '',
      torresTexto: linha ? linha.torre.identificador : '',
      dias: {},
      distribuicao: 'todas',
      pct: linha ? Number(linha.percentual) || 100 : 100,
      obs: linha ? (linha.observacao || '') : '',
      token: 0
    };
    if (linha) F.dias[linha.data] = true;

    $('supFolha').innerHTML = esqueletoDoFormulario();
    ui.mostrar('supFolha');
    document.body.classList.add('sup-travado');
    if (linha) { $('fTorres').value = linha.torre.identificador; $('fObs').value = F.obs; $('fPct').value = F.pct; }
    else { $('fPct').value = 100; }
    atualizarFormulario();
    ui.icones();
  }

  function lembrado(chave) {
    try { return localStorage.getItem('sipav_sup_' + chave) || ''; } catch (e) { return ''; }
  }
  function lembrar(chave, valor) {
    try { localStorage.setItem('sipav_sup_' + chave, valor); } catch (e) {}
  }

  function fecharFormulario() {
    F = null;
    ui.esconder('supFolha');
    ui.esconder('supLista');
    document.body.classList.remove('sup-travado');
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
                '<p class="sup-fraco">Separe por vírgula. Para uma sequência, escreva <b>88/1 a 92/2</b>.</p></div>') +

          '<div class="sup-bloco"><label>' + (edicao ? 'Dia' : 'Dia (pode marcar mais de um)') + '</label>' +
            '<div id="fDias" class="sup-dias-linha"></div>' +
            '<label class="sup-outra">Outra data <input type="date" id="fOutraData" min="' + hojeIso() + '"></label></div>' +

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

  function adicionarDia(iso) {
    if (F.editId) F.dias = {};
    F.dias[iso] = true;
    atualizarFormulario();
  }

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
    abrirLista('Encarregado', itens, F.encId, function (id) { F.encId = id; lembrar('enc', id); atualizarFormulario(); });
  }

  function escolherAtividade() {
    var itens = E.atividades.slice().sort(function (a, b) { return a.ordem_execucao - b.ordem_execucao; })
      .map(function (a) { return { id: a.id, rotulo: a.nome, cor: a.cor_fundo }; });
    abrirLista('Atividade', itens, F.atvId, function (id) { F.atvId = id; atualizarFormulario(); });
  }

  /* -- Salvar -------------------------------------------------------------- */

  function garantirRascunho() {
    if (S.sol && (S.sol.status === 'RASCUNHO' || S.sol.status === 'DEVOLVIDA')) return Promise.resolve(S.sol);
    return db.criarSolicitacao(S.trecho.id).then(function (s) { S.sol = s; return s; });
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
      }).then(function () { return recarregar(false); })
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
      return recarregar(false).then(function () {
        ui.pronto();
        if (r.falhas.length) {
          ui.avisar(r.feitas + ' adicionada(s). Não entrou: ' + r.falhas.slice(0, 2).join(' · '), 'alerta', 9000);
        } else {
          ui.avisar(r.feitas + (r.feitas === 1 ? ' programação adicionada.' : ' programações adicionadas.'), 'sucesso', 4000);
        }
        if (!r.falhas.length) fecharFormulario();
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
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
      var linhas = r[1];
      if (!sol) { ui.pronto(); ui.avisar('Esta solicitação já foi analisada.', 'alerta'); abrirSolicitacoes(); return; }

      var datas = linhas.map(function (l) { return l.data; }).sort();
      var de = datas[0], ate = datas[datas.length - 1];
      return db.programacoes({ de: de, ate: ate }).then(function (oficiais) {
        pacote = { sol: sol, linhas: linhas, oficiais: oficiais, avisos: {} };
        ui.pronto();
        desenharPacote();
        conferirPacote();
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function desenharPacote() {
    var p = pacote;
    var linhas = p.linhas.slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : ((a.torre.ordem - b.torre.ordem));
    });

    var corpo = '<p class="sup-fraco" style="margin-bottom:.5rem">' + esc(p.sol.trecho ? p.sol.trecho.nome : '') +
      ' · ' + linhas.length + (linhas.length === 1 ? ' programação' : ' programações') +
      ' · enviada ' + esc(ui.quandoRelativo(p.sol.enviada_em)) + '</p>' +
      '<div class="sol-tabela"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase" style="color:var(--texto-fraco)">' +
      '<th class="py-1 pr-2">Dia</th><th class="pr-2">Torre</th><th class="pr-2">Atividade</th><th class="pr-2">Encarregado</th><th class="pr-2">%</th><th></th></tr></thead><tbody>' +
      linhas.map(function (l) {
        var avisos = (p.avisos[l.id] || []).map(function (a) { return '<div class="sup-aviso">⚠ ' + esc(a) + '</div>'; }).join('');
        return '<tr class="sol-linha-tab" data-id="' + l.id + '">' +
          '<td class="py-1 pr-2 whitespace-nowrap">' + esc(nomeCurtoDoDia(l.data)) + '</td>' +
          '<td class="pr-2"><strong>' + esc(l.torre.identificador) + '</strong></td>' +
          '<td class="pr-2">' + chipAtividade(l.atividade) + '</td>' +
          '<td class="pr-2">' + esc(l.encarregado ? l.encarregado.nome : '—') + '</td>' +
          '<td class="pr-2">' + pct(l.percentual) + '</td>' +
          '<td class="whitespace-nowrap"><button type="button" class="btn-lancar" data-ed="' + l.id + '">Editar</button> ' +
          '<button type="button" class="btn-lancar" data-rm="' + l.id + '">Tirar</button></td></tr>' +
          (avisos ? '<tr><td></td><td colspan="5">' + avisos + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>' +
      '<p class="sup-fraco" id="solConferindo" style="margin-top:.5rem"></p>';

    ui.modalGenerico({
      titulo: 'Solicitação de ' + (p.sol.supervisor ? p.sol.supervisor.nome : 'supervisor'),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Voltar', classe: 'btn-secundario', acao: abrirSolicitacoes },
        { rotulo: 'Devolver…', classe: 'btn-secundario', acao: pedirMotivoDeDevolucao },
        { rotulo: 'Aprovar tudo', classe: 'btn-primario', acao: aprovarPacote }
      ]
    });

    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-ed]'), function (b) {
      b.onclick = function () { editarLinhaDoPacote(b.getAttribute('data-ed')); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#genericoCorpo [data-rm]'), function (b) {
      b.onclick = function () { tirarLinhaDoPacote(b.getAttribute('data-rm')); };
    });
  }

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

  function pedirMotivoDeDevolucao() {
    ui.modalGenerico({
      titulo: 'Devolver para o supervisor',
      corpoHtml: '<label class="rotulo">O que está errado? (o supervisor vai ler isto)</label>' +
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

  function aprovarPacote() { executarAprovacao(false); }

  function executarAprovacao(liberar) {
    ui.processando('Aprovando…');
    db.aprovarSolicitacao(pacote.sol.id, liberar).then(function (r) {
      ui.pronto();
      var recarregarOficial = window.SIPAV.app.recarregarProgramacoes;
      var depois = recarregarOficial ? recarregarOficial() : Promise.resolve();
      return Promise.resolve(depois).then(function () {
        atualizarContador(false);
        if (r.falhas && r.falhas.length) { mostrarFalhasDaAprovacao(r); return; }
        ui.fecharModal('modalGenerico');
        pacote = null;
        ui.avisar(r.aprovadas + (r.aprovadas === 1 ? ' programação aprovada' : ' programações aprovadas') + ' e já são oficiais.', 'sucesso', 6000);
      });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  function mostrarFalhasDaAprovacao(r) {
    ui.modalGenerico({
      titulo: r.aprovadas + ' aprovada(s), ' + r.falhas.length + ' barrada(s)',
      corpoHtml: '<p class="text-sm" style="margin-bottom:.5rem">A sequência barrou estas. Elas continuam na solicitação.</p>' +
        '<ul class="text-sm space-y-1">' + r.falhas.map(function (f) {
          return '<li><strong>' + esc(f.torre) + '</strong> · ' + esc(f.atividade) + ' · ' + esc(ui.dataCurta(f.data)) +
                 '<br><span class="sup-fraco">' + esc(f.motivo) + '</span></li>';
        }).join('') + '</ul>',
      botoes: [
        { rotulo: 'Voltar e editar', classe: 'btn-secundario', acao: function () { recarregarPacote(); } },
        { rotulo: 'Aprovar mesmo assim', classe: 'btn-primario', acao: function () { executarAprovacao(true); } }
      ]
    });
  }

  window.SIPAV.supervisor = {
    iniciar: iniciar,
    parar: parar,
    abrirSolicitacoes: abrirSolicitacoes,
    ligarSolicitacoesDoPlanejamento: ligarSolicitacoesDoPlanejamento,
    atualizarContador: atualizarContador
  };
})();
