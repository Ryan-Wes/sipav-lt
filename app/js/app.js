/* =============================================================================
   SIPAV LT — Orquestração
   =============================================================================
   Fluxo de autenticação, carga de dados, tempo real e ações do usuário.
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  var db = window.SIPAV.db;
  var ui = window.SIPAV.ui;
  var render = window.SIPAV.render;
  var E = window.SIPAV.estado;

  var $ = ui.$, esc = ui.esc;

  // Confere no console qual build está carregado. Sobe junto com o ?v= do HTML.
  var VERSAO = 'v107 · 2026-10-01';

  var torreAberta = null;
  var cancelarEscuta = null;

  // id da programação sendo alterada. Nulo = o formulário está criando uma nova.
  var programacaoEmEdicao = null;

  var ROTULO_PAPEL = {
    ADMIN: 'Administrador',
    PLANEJAMENTO: 'Planejamento',
    SUPERVISOR: 'Supervisor',
    LEITURA: 'Consulta'
  };

  /* ======================================================================== */
  /* INICIALIZAÇÃO                                                            */
  /* ======================================================================== */

  function iniciar() {
    console.log('%cSIPAV LT ' + VERSAO, 'color:#F97316;font-weight:bold');

    aplicarLogos();

    try {
      db.iniciar();
    } catch (e) {
      return falhaFatal(e.message);
    }

    db.auth.sessao()
      .then(function (sessao) {
        if (sessao) {
          // Guarda o e-mail da sessão atual: assim o próximo login já vem
          // preenchido mesmo que a pessoa nunca tenha digitado nesta máquina
          // depois que o "lembrar e-mail" passou a existir.
          if (sessao.user && sessao.user.email) {
            try { localStorage.setItem('sipav_ultimo_email', sessao.user.email); } catch (e) {}
          }
          return entrarNaAplicacao();
        }
        mostrarLogin();
      })
      .catch(function (e) { falhaFatal(e.message); });

    db.auth.aoMudar(function (sessao) {
      if (!sessao) mostrarLogin();
    });

    $('formLogin').addEventListener('submit', aoEnviarLogin);

    // Esc fecha a janela aberta. Clicar no fundo escuro não fecha: com formulário
    // grande, um clique que escapa do campo jogava fora tudo o que eu tinha
    // preenchido. Fechar é no X ou no Esc, que ninguém aperta sem querer.
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      fecharMenus();

      var abertos = document.querySelectorAll('.modal:not(.hidden)');
      if (!abertos.length) return;

      // A de cima, não a primeira do documento. A confirmação abre por cima da
      // janela da torre, e pegar a primeira fechava a de trás deixando a
      // pergunta pendurada — quem chamou ficava esperando resposta para sempre.
      var aberto = abertos[abertos.length - 1];

      // Na confirmação o Esc é o mesmo que Cancelar, pelo mesmo motivo.
      if (aberto.id === 'modalConfirmacao') {
        var cancelar = aberto.querySelector('.btn-secundario');
        if (cancelar) { cancelar.click(); return; }
      }
      ui.fecharModal(aberto.id);
    });

    // Arrastar pela grade marca as torres do retângulo, no modo seleção
    document.addEventListener('mousedown', iniciarLaco);

    // Clique fora fecha os menus suspensos
    document.addEventListener('click', function (ev) {
      var alvo = ev.target;

      // Alvo que já saiu do DOM não tem mais ancestrais, e passaria por
      // "clique fora" mesmo tendo sido dentro. Acontece quando algo redesenha
      // o elemento durante o próprio clique.
      if (!alvo || !document.contains(alvo)) return;

      if (!alvo.closest || !alvo.closest('.menu-wrap')) fecharMenus();

      // O mesmo para as listas de busca. Sem isto, abrir a lista de atividades
      // e desistir obrigava a escolher uma qualquer só para poder fechar, e
      // depois tirá-la.
      if (!alvo.closest || !alvo.closest('.combo')) fecharCombos();
    });
  }

  /** Fecha as listas de busca que estiverem abertas. */
  function fecharCombos() {
    Array.prototype.forEach.call(document.querySelectorAll('.combo-lista'), function (c) {
      c.classList.add('hidden');
    });
  }

  function falhaFatal(mensagem) {
    ui.esconder('telaCarregando');
    document.body.innerHTML =
      '<div class="min-h-screen flex items-center justify-center p-6 bg-slate-100">' +
        '<div class="max-w-md bg-white border border-rose-200 rounded-2xl p-6 text-center shadow-sm">' +
          '<div class="inline-flex p-3 bg-rose-100 rounded-2xl mb-3">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2">' +
              '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>' +
              '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '</div>' +
          '<h1 class="font-bold text-slate-900 mb-1">Não foi possível iniciar</h1>' +
          '<p class="text-sm text-slate-600">' + esc(mensagem) + '</p>' +
        '</div>' +
      '</div>';
  }

  function mostrarLogin() {
    if (cancelarEscuta) { cancelarEscuta(); cancelarEscuta = null; }
    ui.esconder('telaCarregando');
    ui.esconder('telaApp');
    ui.mostrar('telaLogin');
    ui.icones();

    // Em file:// o navegador não trata a página como site, então o gerenciador
    // de senhas não preenche nada. Lembramos o último e-mail por conta própria
    // e já deixamos o cursor na senha.
    var ultimo = null;
    try { ultimo = localStorage.getItem('sipav_ultimo_email'); } catch (e) {}

    if (ultimo && !$('loginEmail').value) $('loginEmail').value = ultimo;
    setTimeout(function () {
      ($('loginEmail').value ? $('loginSenha') : $('loginEmail')).focus();
    }, 60);
  }

  function aoEnviarLogin(ev) {
    ev.preventDefault();
    var btn = $('btnEntrar');
    var erro = $('loginErro');

    erro.classList.add('hidden');
    btn.disabled = true;

    var email = $('loginEmail').value.trim();

    db.auth.entrar(email, $('loginSenha').value)
      .then(function () {
        try { localStorage.setItem('sipav_ultimo_email', email); } catch (e) {}
        $('loginSenha').value = '';
        return entrarNaAplicacao();
      })
      .catch(function (e) {
        erro.textContent = e.message;
        erro.classList.remove('hidden');
      })
      .then(function () { btn.disabled = false; });
  }

  function sair() {
    ui.confirmar('Sair do sistema', 'Você precisará entrar novamente.', 'Sair')
      .then(function (sim) {
        if (!sim) return;
        db.sairPresenca();
        return db.auth.sair().then(mostrarLogin);
      });
  }

  /* ======================================================================== */
  /* CARGA DE DADOS                                                           */
  /* ======================================================================== */

  function entrarNaAplicacao() {
    ui.esconder('telaLogin');
    ui.mostrar('telaCarregando');
    $('textoCarregando').textContent = 'Carregando dados da obra…';

    return db.auth.perfil()
      .then(function (perfil) {
        if (!perfil) {
          throw new Error(
            'Seu usuário ainda não tem perfil cadastrado no sistema. ' +
            'Peça ao administrador para liberar seu acesso.'
          );
        }
        if (!perfil.ativo) throw new Error('Seu acesso está desativado.');

        E.perfil = perfil;
        $('nomeUsuario').textContent = perfil.nome;
        $('papelUsuario').textContent = ROTULO_PAPEL[perfil.papel] || perfil.papel;

        // Só quem pode registrar vê o botão: o banco recusaria o resto, e um botão
        // que sempre dá "sem permissão" é pior que botão nenhum.
        $('btnMovimentacao').classList.toggle('hidden', !podeRegistrarMovimentacao());

        return Promise.all([
          db.obra(), db.trechos(), db.atividades(), db.encarregados(), db.canteiros(),
          db.dependencias()
        ]);
      })
      .then(function (r) {
        E.obra = r[0]; E.trechos = r[1]; E.atividades = r[2];
        E.encarregados = r[3]; E.canteiros = r[4]; E.dependencias = r[5];
        $('nomeObra').textContent = E.obra.nome;

        if (!E.trechos.length) {
          throw new Error('Nenhum trecho cadastrado. Rode o seed do banco (db/02-seed.sql).');
        }

        preencherSeletorTrecho();
        preencherFiltroAtividade();
        // o filtro de canteiro depende do trecho, então vai em carregarTrecho()

        var salvo = localStorage.getItem('sipav_trecho');
        E.trechoAtual = E.trechos.find(function (t) { return t.id === salvo; }) || E.trechos[0];
        $('seletorTrecho').value = E.trechoAtual.id;

        E.colunas = localStorage.getItem('sipav_colunas') || 'auto';
        $('filtroColunas').value = E.colunas;

        restaurarPeriodo();
        return carregarTrecho();
      })
      .then(function () {
        ui.esconder('telaCarregando');
        ui.mostrar('telaApp');
        ligarTempoReal();
        ui.icones();
      })
      .catch(function (e) {
        ui.esconder('telaCarregando');
        ui.mostrar('telaLogin');
        $('loginErro').textContent = e.message;
        $('loginErro').classList.remove('hidden');
        ui.icones();
      });
  }

  function filtroProgramacao() {
    return {
      trechoId: E.trechoAtual.id,
      de: E.periodo.de,
      ate: E.periodo.ate
    };
  }

  /**
   * Apontamentos vêm SEM recorte de data, de propósito: uma programação de 25/09
   * pode ter sido executada em 03/10. Filtrando por data, ela apareceria como
   * pendente só porque a execução caiu fora da janela.
   */
  function filtroExecucao() {
    return { trechoId: E.trechoAtual.id };
  }

  function carregarTrecho() {
    if (!E.trechoAtual) return Promise.resolve();
    return Promise.all([
      db.torres(E.trechoAtual.id),
      db.programacoes(filtroProgramacao()),
      db.execucoes(filtroExecucao()),
      db.movimentacoes()
    ]).then(function (r) {
      E.torres = r[0];
      E.programacoes = r[1];
      E.execucoes = r[2];
      E.movimentacoes = r[3];
      preencherFiltroCanteiro();
      render.tudo();
    });
  }

  function recarregarProgramacoes() {
    return Promise.all([
      db.torres(E.trechoAtual.id),
      db.programacoes(filtroProgramacao()),
      db.execucoes(filtroExecucao()),
      db.movimentacoes()
    ]).then(function (r) {
      E.torres = r[0];
      E.programacoes = r[1];
      E.execucoes = r[2];
      E.movimentacoes = r[3];
      render.tudo();
      if (torreAberta) renderListaDoModal();
    });
  }

  /* ---------------------------------------------------------- Tempo real -- */

  var recargaAgendada = null;

  function ligarTempoReal() {
    cancelarEscuta = db.escutarProgramacoes(function () {
      // Agrupa rajadas de eventos numa recarga só
      clearTimeout(recargaAgendada);
      recargaAgendada = setTimeout(function () {
        recarregarProgramacoes().catch(function () { /* silencioso */ });
      }, 350);
    });
    ui.mostrar('indicadorTempoReal');
    ligarPresenca();
  }

  /* ------------------------------------------------------------ Presença -- */

  function euNaPresenca() {
    return {
      id: E.perfil.id,
      nome: E.perfil.nome || E.perfil.email || 'Alguém',
      papel: E.perfil.papel || ''
    };
  }

  function ligarPresenca() {
    db.entrarPresenca(euNaPresenca(), renderPresenca)
      .then(anunciarTrechoAtual)
      .catch(function () { /* presença é conforto, não pode derrubar a tela */ });

    // Sai na hora em vez de esperar o servidor perceber que caiu
    window.addEventListener('beforeunload', function () { db.sairPresenca(); });
  }

  function anunciarTrechoAtual() {
    if (!E.perfil) return;
    db.anunciarTrecho(euNaPresenca(), E.trechoAtual ? E.trechoAtual.nome : null)
      .catch(function () {});
  }

  function renderPresenca(lista) {
    var outros = lista.filter(function (p) { return !p.souEu; });
    $('contagemPresenca').textContent = outros.length ? '· ' + lista.length : '';

    $('listaPresenca').innerHTML = lista.map(function (p) {
      var iniciais = p.nome.trim().split(/\s+/).slice(0, 2)
        .map(function (x) { return x[0]; }).join('').toUpperCase();

      return '' +
        '<div class="item-presenca">' +
          '<span class="avatar-presenca">' + esc(iniciais) + '</span>' +
          '<div class="min-w-0 flex-1">' +
            '<p class="text-sm font-semibold truncate" style="color:var(--texto)">' +
              esc(p.nome) + (p.souEu ? ' <span style="color:var(--texto-fraco)">(você)</span>' : '') +
            '</p>' +
            '<p class="text-xs truncate" style="color:var(--texto-fraco)">' +
              (p.trecho ? esc(p.trecho) : 'sem trecho aberto') +
              (p.abas > 1 ? ' · ' + p.abas + ' abas' : '') +
            '</p>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  /* ======================================================================== */
  /* CONTROLES DE TELA                                                        */
  /* ======================================================================== */

  function preencherSeletorTrecho() {
    $('seletorTrecho').innerHTML = E.trechos.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.nome) + '</option>';
    }).join('');
    $('seletorTrecho').onchange = function (ev) {
      var escolhido = ev.target.value;
      E.trechoAtual = E.trechos.find(function (t) { return t.id === escolhido; });
      localStorage.setItem('sipav_trecho', E.trechoAtual.id);
      anunciarTrechoAtual();
      ui.processando('Carregando trecho…');
      carregarTrecho().then(ui.pronto).catch(function (e) {
        ui.pronto(); ui.avisar(e.message, 'erro');
      });
    };
  }

  function preencherFiltroAtividade() {
    $('filtroAtividade').innerHTML =
      '<option value="">Todas as atividades</option>' +
      E.atividades.map(function (a) {
        return '<option value="' + a.id + '">' + esc(a.nome) + '</option>';
      }).join('');
  }

  /**
   * Só oferece os canteiros que atuam no trecho aberto. Canteiro sem trecho
   * declarado aparece sempre — é o caso do que foi criado na importação.
   */
  function preencherFiltroCanteiro() {
    var trechoId = E.trechoAtual ? E.trechoAtual.id : null;

    var doTrecho = E.canteiros.filter(function (c) {
      if (!c.trechos || !c.trechos.length) return true;
      return c.trechos.indexOf(trechoId) !== -1;
    });

    // Sem canteiro no trecho, o filtro só ocuparia espaço
    $('filtroCanteiro').parentNode.style.display = doTrecho.length ? '' : 'none';

    $('filtroCanteiro').innerHTML =
      '<option value="">Todos os canteiros</option>' +
      doTrecho.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.nome) + '</option>';
      }).join('');

    // O canteiro escolhido pode não existir no trecho novo
    if (E.filtroCanteiro && !doTrecho.some(function (c) { return c.id === E.filtroCanteiro; })) {
      E.filtroCanteiro = '';
    }
    $('filtroCanteiro').value = E.filtroCanteiro || '';
  }

  /* ---------------------------------------------------------- Menus ------- */

  function fecharMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.menu'), function (m) {
      m.classList.add('hidden');
    });
  }

  function alternarMenu(id) {
    var alvo = $(id);
    var jaAberto = alvo && !alvo.classList.contains('hidden');
    fecharMenus();
    if (alvo && !jaAberto) alvo.classList.remove('hidden');

    // Sem ui.icones() aqui de propósito: os ícones dos menus já foram
    // materializados na carga, e recriá-los trocaria o próprio elemento
    // clicado por um nó novo no meio do evento.
  }

  /* ---------------------------------------------------------- Logotipos --- */

  // Versão branca no tema escuro, preta no claro. A troca é feita pela origem
  // da imagem, e não escondendo uma das duas por CSS: assim o navegador baixa
  // só a que está em uso.
  var LOGOS = {
    dark: {
      logoLogin:   'img/completo-branco.png',
      logoSimbolo: 'img/simbolo-branco.webp',
      logoTexto:   'img/texto-branco.webp'
    },
    light: {
      logoLogin:   'img/completo-preto.webp',
      logoSimbolo: 'img/simbolo-preto.png',
      logoTexto:   'img/texto-preto.webp'
    }
  };

  function aplicarLogos() {
    var jogo = LOGOS[document.documentElement.classList.contains('dark') ? 'dark' : 'light'];
    Object.keys(jogo).forEach(function (id) {
      var el = $(id);
      if (el) el.src = jogo[id];
    });
  }

  /** Alterna claro/escuro e guarda a escolha. Padrão da aplicação é escuro. */
  function alternarTema() {
    var escuro = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('sipav_tema', escuro ? 'dark' : 'light'); } catch (e) {}
    aplicarLogos();
    ui.icones();
  }

  /* ---------------------------------------------------------- Período ----- */

  function calcularPeriodo(modo) {
    var seg = ui.segundaDaSemana();
    switch (modo) {
      case 'semana':
        return { de: ui.iso(seg), ate: ui.iso(ui.somarDias(seg, 6)) };
      case 'proxima':
        return { de: ui.iso(ui.somarDias(seg, 7)), ate: ui.iso(ui.somarDias(seg, 13)) };
      case 'duas':
        return { de: ui.iso(seg), ate: ui.iso(ui.somarDias(seg, 13)) };
      case 'mes':
        return { de: ui.iso(ui.primeiroDiaDoMes()), ate: ui.iso(ui.ultimoDiaDoMes()) };
      case 'custom':
        return { de: $('periodoDe').value || null, ate: $('periodoAte').value || null };
      default:
        return { de: null, ate: null };            // 'tudo'
    }
  }

  function aplicarPeriodo(modo, recarregar) {
    var custom = modo === 'custom';

    $('periodoDe').classList.toggle('hidden', !custom);
    $('periodoAte').classList.toggle('hidden', !custom);

    if (custom) {
      // Ao entrar no personalizado, começa com o que estava valendo
      if (!$('periodoDe').value)  $('periodoDe').value  = E.periodo.de  || ui.hoje();
      if (!$('periodoAte').value) $('periodoAte').value = E.periodo.ate || ui.hoje();
    }

    var p = calcularPeriodo(modo);
    E.periodo = { modo: modo, de: p.de, ate: p.ate };
    $('filtroPeriodo').value = modo;

    try {
      localStorage.setItem('sipav_periodo', JSON.stringify(E.periodo));
    } catch (e) {}

    if (!recarregar) return Promise.resolve();

    ui.processando('Carregando período…');
    return recarregarProgramacoes()
      .then(ui.pronto)
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function mudarPeriodo(modo) { aplicarPeriodo(modo, true); }

  /** Restaura o período salvo. Padrão: semana atual mais a próxima — é o
   *  horizonte de planejamento, e evita que algo lançado para a semana que vem
   *  suma da tela logo depois de gravado. */
  function restaurarPeriodo() {
    var salvo = null;
    try { salvo = JSON.parse(localStorage.getItem('sipav_periodo')); } catch (e) {}

    if (salvo && salvo.modo === 'custom') {
      $('periodoDe').value  = salvo.de  || '';
      $('periodoAte').value = salvo.ate || '';
    }
    return aplicarPeriodo(salvo && salvo.modo ? salvo.modo : 'duas', false);
  }

  function trocarAba(aba) {
    E.aba = aba;
    // Seletor de colunas só faz sentido na grade
    $('filtroColunas').parentNode.style.display = aba === 'grade' ? '' : 'none';

    // "Selecionar vários" marca programação, que só aparece nos painéis. Sair
    // deles com o modo ligado deixaria uma barra de apagar sobre a grade.
    $('caixaSelecaoProg').classList.toggle('hidden', aba === 'grade');
    if (aba === 'grade' && E.modoSelecaoProg) { alternarSelecaoProgramacoes(false); return; }

    render.tudo();
    renderBarraSelecaoProg();
  }

  function mudarColunas(valor) {
    E.colunas = valor;
    localStorage.setItem('sipav_colunas', valor);
    render.tudo();
  }

  function renderizar() {
    E.filtroAtividade = $('filtroAtividade').value;
    E.filtroCanteiro = $('filtroCanteiro').value;
    E.busca = $('filtroBusca').value;
    render.tudo();
  }

  /**
   * Tira todos os recortes de uma vez e mostra a obra inteira do trecho.
   * O período entra na conta: ele esconde programação tanto quanto os outros.
   * As colunas da grade não, porque são preferência de exibição, não filtro.
   */
  function limparFiltros() {
    $('filtroAtividade').value = '';
    $('filtroCanteiro').value = '';
    $('filtroBusca').value = '';

    E.filtroAtividade = '';
    E.filtroCanteiro = '';
    E.busca = '';

    aplicarPeriodo('tudo', true);
  }

  /* ======================================================================== */
  /* MODAL DE PROGRAMAÇÃO                                                     */
  /* ======================================================================== */

  /**
   * @param {boolean} [forcar] abre mesmo no modo seleção. Usado por quem já
   *   sabe que quer a janela — o clique na linha do editar em lote, por
   *   exemplo, que sem isto só marcava a torre e não abria nada.
   */
  function abrirTorre(torreId, forcar) {
    // Fim de um arrasto, não um clique: o gesto já decidiu o que marcar
    if (arrastou && !forcar) return;
    // Modo seleção: o clique no cartão escolhe em vez de abrir
    if (E.modoSelecao && !forcar) { alternarTorreSelecionada(torreId); return; }
    torreAberta = E.torres.find(function (t) { return t.torre_id === torreId; });
    if (!torreAberta) return;

    $('modalTorreNome').textContent = torreAberta.identificador;
    $('modalTorreKm').textContent = ui.km(torreAberta.km);
    $('modalTorreCanteiro').textContent = torreAberta.canteiro ? torreAberta.canteiro + ' · ' : '';

    var partesTipo = [];
    if (torreAberta.estrutura) {
      partesTipo.push(torreAberta.estrutura === 'ESTAIADA' ? 'Estaiada' : 'Autoportante');
    }
    if (torreAberta.modelo) partesTipo.push(torreAberta.modelo);
    $('modalTorreTipo').textContent = partesTipo.length ? partesTipo.join(' ') + ' · ' : '';
    $('modalTorreUltima').textContent = torreAberta.ultima_atividade || 'Não iniciada';

    var selo = $('modalTorreRestricao');
    if (torreAberta.tem_restricao) {
      selo.textContent = 'Restrição ' + String(torreAberta.restricao_tipo).toLowerCase();
      selo.classList.remove('hidden');
    } else {
      selo.classList.add('hidden');
    }

    preencherAtividades([]);

    preencherEncarregado('');

    $('campoData').value = ui.hoje();
    mostrarDiaDaSemana();
    $('campoObservacao').value = '';
    $('campoCabo').value = '';
    $('campoPercentual').value = 100;
    programacaoEmEdicao = null;
    atualizarModoFormulario();
    limparAvisos();
    atualizarAtalhosPercentual();
    renderListaDoModal();

    ui.abrirModal('modalProgramacao');
    mudarAtividade();
  }

  /* ------------------------------------------------------------- Cabo ----- */

  /**
   * As seis etapas de para-raio/OPGW existem em duas versões na planilha da ISA:
   * seção 4.1 para o para-raio convencional e 4.2 para o OPGW. A obra tem as
   * duas condições — Buritirama leva OPGW dos dois lados, Barra–Correntina leva
   * para-raio de um lado e OPGW do outro —, então quem programa precisa dizer
   * qual é.
   *
   * O condutor tem seção própria (4.3) e não entra aqui, nem o piloto dele: o
   * pilotinho é o cabo-guia do para-raio/OPGW, o piloto é o do condutor.
   */
  var ATIVIDADES_COM_CABO = [
    'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO',
    'LANÇAMENTO DO PILOTINHO',
    'LANÇAMENTO DO CABO OPGW/PR',
    'NIVELAMENTO OPGW / PARA-RAIO',
    'GRAMPEAÇÃO OPGW / PARA-RAIO',
    'ANCORAGEM OPGW / PARA-RAIO'
  ];

  /** O valor do enum, como o campo fala. */
  function rotuloCabo(cabo) {
    if (cabo === 'PARA_RAIO') return 'PARA-RAIO';
    if (cabo === 'OPGW_DIREITO') return 'OPGW DIR.';
    if (cabo === 'OPGW_ESQUERDO') return 'OPGW ESQ.';
    return cabo;
  }

  /**
   * Os cabos que o trecho aberto tem. Nem todos têm a mesma configuração: Barra –
   * Correntina e Campo Formoso – Barra têm para-raio e OPGW; Buritirama – Barra e
   * Juazeiro – Campo Formoso têm dois OPGW, um de cada lado, e nenhum para-raio.
   * Oferecer "para-raio" onde ele não existe é convidar ao erro.
   */
  function opcoesDeCabo() {
    var doisLados = !!E.trechoAtual && E.trechoAtual.cabo_modelo === 'OPGW_DOIS_LADOS';
    return doisLados
      ? [{ valor: 'OPGW_DIREITO',  rotulo: 'OPGW direito' },
         { valor: 'OPGW_ESQUERDO', rotulo: 'OPGW esquerdo' }]
      : [{ valor: 'OPGW',      rotulo: 'OPGW' },
         { valor: 'PARA_RAIO', rotulo: 'Para-raio 3/8 / Dotterel' }];
  }

  function htmlOpcoesDeCabo(selecionado) {
    return '<option value="">Escolha o cabo…</option>' +
      opcoesDeCabo().map(function (o) {
        return '<option value="' + o.valor + '"' + (o.valor === selecionado ? ' selected' : '') + '>' +
               esc(o.rotulo) + '</option>';
      }).join('');
  }

  /** "OPGW ou para-raio" / "OPGW direito ou esquerdo", para as mensagens. */
  function textoDasOpcoesDeCabo() {
    return opcoesDeCabo().map(function (o) {
      return o.rotulo.replace(' 3/8 / Dotterel', '').toLowerCase().replace('opgw', 'OPGW');
    }).join(' ou ');
  }

  /**
   * Onde a atividade fica na cadeia.
   *
   * Serve para gravar na ordem certa quando duas caem no mesmo dia: o gatilho
   * pede o pré-requisito já gravado, e no mesmo dia quem chega primeiro decide.
   */
  function ordemDaAtividade(atividadeId) {
    var a = E.atividades.find(function (x) { return x.id === atividadeId; });
    return a ? Number(a.ordem_execucao) || 0 : 0;
  }

  function pedeCabo(atividadeId) {
    var a = E.atividades.find(function (x) { return x.id === atividadeId; });
    return !!a && ATIVIDADES_COM_CABO.indexOf(a.nome) !== -1;
  }

  /**
   * Escavação não se faz de uma vez: a torre é escavada por parte, e nem sempre na
   * ordem. Pode sair o pé A e o C antes do B. Por isso o seletor marca as partes
   * que se quer programar, em qualquer combinação, e o percentual sai da conta.
   *
   * Autoportante tem quatro pés. Estaiada tem quatro estais mais o mastro
   * central, cinco partes.
   *
   * Os nomes são os de campo: A, B, C e D. "2 pés" obriga o encarregado a traduzir
   * de cabeça; "pés A e C" é o que ele fala.
   *
   * Cada parte vale a mesma fatia do serviço. Se um dia o mastro central pesar
   * mais que um estai, é aqui que isso vira peso por parte.
   */
  function partesDaEscavacao(atividadeId, estrutura) {
    var a = E.atividades.find(function (x) { return x.id === atividadeId; });
    var nome = a ? normalizar(a.nome) : '';

    // O mastro central é uma coisa só: ou está feito ou não está.
    if (nome.indexOf('- mc') !== -1 || nome.indexOf('mastro') !== -1) return null;

    var quatro = function (prefixo) {
      return ['A', 'B', 'C', 'D'].map(function (l) {
        return { cod: l, rotulo: prefixo + ' ' + l };
      });
    };

    // A escavação só dos estais são quatro, sem o centro no meio da conta.
    if (nome.indexOf('estai') !== -1) return { titulo: 'Estais', itens: quatro('estai') };

    if (estrutura === 'AUTOPORTANTE') return { titulo: 'Pés', itens: quatro('pé') };

    // Estaiada pela escavação inteira: quatro estais e o centro
    return {
      titulo: 'Estais e centro',
      itens: quatro('estai').concat([{ cod: 'MC', rotulo: 'centro' }])
    };
  }

  function ehEscavacao(atividadeId) {
    var a = E.atividades.find(function (x) { return x.id === atividadeId; });
    return !!a && normalizar(a.nome).indexOf('escavacao') === 0;
  }

  /**
   * As partes marcadas valem para uma torre e uma atividade. Trocar de torre ou de
   * atividade descarta a marcação: letras de uma torre não são da outra.
   */
  var partesMarcadas = { chave: '', letras: [] };

  function chaveDasPartes() {
    return torreAberta && atividadesEscolhidas.length === 1
      ? torreAberta.torre_id + '|' + atividadesEscolhidas[0] : '';
  }

  /** Letras já programadas em OUTRAS programações desta torre e atividade → data. */
  function partesJaProgramadas() {
    var mapa = {};
    if (!torreAberta || atividadesEscolhidas.length !== 1) return mapa;

    render.programacoesDaTorre(torreAberta.torre_id).forEach(function (p) {
      if (!p.partes || !p.atividade || p.atividade.id !== atividadesEscolhidas[0]) return;
      if (p.id === programacaoEmEdicao) return;
      String(p.partes).split(',').forEach(function (l) { mapa[l] = p.data; });
    });
    return mapa;
  }

  /**
   * Só aparece em escavação, e só com uma atividade escolhida: com várias, o
   * percentual é o mesmo para todas e a marcação diria respeito a uma só.
   */
  function atualizarAtalhosPercentual() {
    var caixa = $('atalhosPercentual');
    if (!caixa) return;

    var def = (torreAberta && atividadesEscolhidas.length === 1 &&
               ehEscavacao(atividadesEscolhidas[0]))
      ? partesDaEscavacao(atividadesEscolhidas[0], torreAberta.estrutura)
      : null;

    caixa.classList.toggle('hidden', !def);
    if (!def) { caixa.innerHTML = ''; partesMarcadas = { chave: '', letras: [] }; return; }

    var chave = chaveDasPartes();
    if (partesMarcadas.chave !== chave) partesMarcadas = { chave: chave, letras: [] };

    // Percentual digitado à mão que não bate com as letras: vale o que foi
    // digitado, e a marcação sai para não mentir sobre o que ele cobre.
    var fatia = 100 / def.itens.length;
    var atual = Number($('campoPercentual').value);
    if (partesMarcadas.letras.length &&
        Math.abs(partesMarcadas.letras.length * fatia - atual) > 0.01) {
      partesMarcadas.letras = [];
    }

    var jaFeitas = partesJaProgramadas();

    caixa.innerHTML =
      '<span class="atalho-nota" style="margin:0 .25rem 0 0">' + esc(def.titulo) + '</span>' +
      def.itens.map(function (it) {
        var data = jaFeitas[it.cod];
        var ativo = partesMarcadas.letras.indexOf(it.cod) !== -1;
        return '<button type="button" class="atalho-pct' + (ativo ? ' atalho-pct-ativo' : '') + '" ' +
                 (data ? 'disabled title="Já programado para ' + ui.dataCurta(data) + '" ' : '') +
                 'onclick="SIPAV.app.alternarParteEscavacao(\'' + it.cod + '\')">' +
                 esc(it.rotulo) + (data ? '<b>' + ui.dataCurta(data) + '</b>' : '') +
               '</button>';
      }).join('') +
      '<span class="atalho-nota">marque as partes, em qualquer ordem</span>' +
      (!db.temPartes()
        ? '<span class="atalho-nota" style="color:#F59E0B">falta aplicar a migração 40: ' +
          'só o percentual fica gravado, não as letras</span>'
        : '');
  }

  function alternarParteEscavacao(cod) {
    if (!torreAberta || atividadesEscolhidas.length !== 1) return;
    var def = partesDaEscavacao(atividadesEscolhidas[0], torreAberta.estrutura);
    if (!def) return;

    // O botão já vem desabilitado; isto cobre quem chegar aqui por outro caminho
    if (partesJaProgramadas()[cod]) return;

    var chave = chaveDasPartes();
    if (partesMarcadas.chave !== chave) partesMarcadas = { chave: chave, letras: [] };

    var i = partesMarcadas.letras.indexOf(cod);
    if (i === -1) partesMarcadas.letras.push(cod); else partesMarcadas.letras.splice(i, 1);

    // Sempre na ordem da tela, para "A,C" e não "C,A"
    var ordem = def.itens.map(function (it) { return it.cod; });
    partesMarcadas.letras.sort(function (x, y) { return ordem.indexOf(x) - ordem.indexOf(y); });

    // Sem nenhuma marcada volta ao serviço inteiro, que é o padrão do formulário
    var n = partesMarcadas.letras.length;
    $('campoPercentual').value = n ? Math.round(n * 100 / def.itens.length * 100) / 100 : 100;
    mostrarSomaPercentual();
    atualizarAtalhosPercentual();
  }

  /** "A,C" para gravar, ou null quando nada foi marcado. */
  function partesParaGravar() {
    if (!db.temPartes()) return null;
    if (partesMarcadas.chave !== chaveDasPartes() || !partesMarcadas.letras.length) return null;
    return partesMarcadas.letras.join(',');
  }

  /** Mostra ou esconde o seletor de cabo conforme a atividade escolhida. */
  function atualizarCampoCabo() {
    var precisa = atividadesEscolhidas.some(pedeCabo);
    $('blocoCabo').classList.toggle('hidden', !precisa);

    // As opções dependem do trecho. O valor escolhido só sobrevive se ainda for
    // uma delas: um "OPGW" antigo num trecho de dois lados volta vazio, e o
    // formulário cobra o lado.
    var sel = $('campoCabo');
    var atual = sel.value;
    sel.innerHTML = htmlOpcoesDeCabo();
    sel.value = precisa && opcoesDeCabo().some(function (o) { return o.valor === atual; }) ? atual : '';
  }

  /* -------------------------------------------------------- Atividades ---- */

  /**
   * Várias atividades de uma vez.
   *
   * Encarregado que faz abertura de acesso, supressão de área e supressão da
   * faixa na mesma torre no mesmo dia é rotina — são três programações, mas não
   * precisam ser três idas ao modal.
   *
   * Com UMA escolhida, tudo funciona como antes: precedência, aviso de serviço
   * repetido e soma de percentual, todos ao vivo. Com mais de uma, essas
   * conferências passam para a hora de gravar, e o relato final diz quais
   * entraram e quais não — mesmo caminho da programação em lote, que já provou
   * funcionar.
   */
  var atividadesEscolhidas = [];

  /**
   * A data de cada atividade, quando escolho mais de uma na mesma torre.
   *
   * Só guarda as que eu mexi. As outras acompanham a data lá de cima — mudo a
   * data da torre e elas vão junto, menos as que já tinham data própria.
   *
   * Existe porque a cadeia exige o pré-requisito programado para uma data
   * ANTERIOR, não igual: supressão e escavação no mesmo dia trava a escavação,
   * mesmo com a supressão ali do lado.
   */
  var dataAtividade = {};   // { atividadeId: 'aaaa-mm-dd' }

  function dataDaAtividade(base, id) {
    return dataAtividade[id] || base || '';
  }

  function mudarDataAtividade(id, valor) {
    if (valor) dataAtividade[id] = valor; else delete dataAtividade[id];
    renderChipsAtividade();
    mudarAtividade();
  }

  function renderChipsAtividade() {
    // campoAtividade guarda a primeira: é ela que alimenta as checagens ao vivo
    $('campoAtividade').value = atividadesEscolhidas[0] || '';

    var base = $('campoData') ? $('campoData').value : '';
    var varias = atividadesEscolhidas.length > 1;

    $('chipsAtividade').classList.toggle('com-data', varias);

    $('chipsAtividade').innerHTML = atividadesEscolhidas.map(function (id) {
      var a = E.atividades.find(function (x) { return x.id === id; });
      if (!a) return '';
      var cor = a.cor_fundo || '#94A3B8';
      var quando = dataDaAtividade(base, id);
      var dia = quando ? ui.diaDaSemana(quando).slice(0, 3) : '';

      return '<span class="chip-escolhido" style="background:' + cor + ';color:' +
               ui.corDoTexto(cor) + '">' + esc(a.nome) +
               // A data por atividade só aparece com mais de uma: com uma só ela
               // seria a mesma coisa que a data lá de cima, repetida à toa
               (varias
                 ? '<span class="chip-quando">' +
                     '<input type="date" value="' + esc(quando) + '" ' +
                            'onchange="SIPAV.app.mudarDataAtividade(\'' + id + '\', this.value)" ' +
                            'onclick="event.stopPropagation()">' +
                     (dia ? '<b>' + esc(dia) + '</b>' : '') +
                   '</span>'
                 : '') +
               '<button type="button" onclick="SIPAV.app.tirarAtividade(\'' + id + '\')" ' +
               'title="Tirar">&times;</button>' +
             '</span>';
    }).join('');

    $('buscaAtividade').placeholder = atividadesEscolhidas.length
      ? 'Adicionar outra atividade…' : 'Buscar atividade…';
  }

  /**
   * A atividade existe nesta torre?
   *
   * Autoportante não tem estai nem mastro central: oferecer ESCAVAÇÃO - ESTAI
   * numa AUP é oferecer serviço que não existe. Melhor não aparecer na lista do
   * que aparecer e ser recusada na gravação.
   */
  function cabeNaTorre(atividade, estrutura) {
    if (!atividade || !atividade.so_para_estrutura) return true;
    if (!estrutura) return true;   // torre sem tipo cadastrado: não escondo nada
    return atividade.so_para_estrutura === estrutura;
  }

  function filtrarAtividades() {
    var termo = normalizar(($('buscaAtividade').value || '').trim());
    var estrutura = torreAberta ? torreAberta.estrutura : null;

    var lista = E.atividades.filter(function (a) {
      if (atividadesEscolhidas.indexOf(a.id) !== -1) return false;
      if (!cabeNaTorre(a, estrutura)) return false;
      return !termo || normalizar(a.nome).indexOf(termo) !== -1;
    });

    // As do último lançamento sobem para o topo. Lançando a mesma atividade
    // torre atrás de torre, ela é a que eu quero em nove de cada dez aberturas
    // da lista — e ficava no meio de trinta e cinco nomes.
    var ultimas = ultimoLancamento ? ultimoLancamento.atividades : [];
    lista.sort(function (a, b) {
      var ia = ultimas.indexOf(a.id), ib = ultimas.indexOf(b.id);
      if ((ia !== -1) !== (ib !== -1)) return ia !== -1 ? -1 : 1;
      return 0;   // o resto mantém a ordem de execução que já vinha
    });

    $('listaAtividades').innerHTML = cabecalhoCombo(
      lista.length + (lista.length === 1 ? ' atividade' : ' atividades')) +
      (lista.length
      ? lista.map(function (a) {
          var cor = a.cor_fundo || '#94A3B8';
          return '<button type="button" class="combo-item" ' +
                 'onmousedown="SIPAV.app.escolherAtividade(\'' + a.id + '\')">' +
                 '<span class="ponto-atividade" style="background:' + cor + '"></span>' +
                 esc(a.nome) +
                 (ultimas.indexOf(a.id) !== -1
                   ? '<span class="combo-ultima">última</span>' : '') +
                 '</button>';
        }).join('')
      : '<p class="px-3 py-2 text-xs" style="color:var(--texto-fraco)">' +
        (atividadesEscolhidas.length ? 'Todas já escolhidas' : 'Nenhuma atividade com esse nome') + '</p>');

    $('listaAtividades').classList.remove('hidden');
  }

  /**
   * Barra de cima da lista de busca, com o X.
   *
   * A lista não tinha como fechar: quem abria e desistia precisava escolher uma
   * qualquer e depois tirar. Agora fecha no X, no Esc e clicando fora dela —
   * inclusive dentro da própria janela.
   */
  function cabecalhoCombo(rotulo) {
    return '<div class="combo-topo">' +
             '<span>' + esc(rotulo) + '</span>' +
             '<button type="button" title="Fechar (Esc)" ' +
                     'onmousedown="SIPAV.app.fecharCombos()">&times;</button>' +
           '</div>';
  }

  function escolherAtividade(id) {
    // Editando, trocar a atividade substitui em vez de somar: a linha é uma só
    if (programacaoEmEdicao) atividadesEscolhidas = [id];
    else if (atividadesEscolhidas.indexOf(id) === -1) atividadesEscolhidas.push(id);

    $('buscaAtividade').value = '';
    $('listaAtividades').classList.add('hidden');
    renderChipsAtividade();
    mudarAtividade();
  }

  function tirarAtividade(id) {
    atividadesEscolhidas = atividadesEscolhidas.filter(function (x) { return x !== id; });
    renderChipsAtividade();
    mudarAtividade();
  }

  function teclaAtividade(ev) {
    var caixa = $('listaAtividades');
    var itens = caixa.querySelectorAll('.combo-item');

    if (ev.key === 'Escape') { caixa.classList.add('hidden'); return; }

    // Backspace com o campo vazio tira a última escolhida
    if (ev.key === 'Backspace' && !$('buscaAtividade').value && atividadesEscolhidas.length) {
      ev.preventDefault();
      tirarAtividade(atividadesEscolhidas[atividadesEscolhidas.length - 1]);
      return;
    }

    if (ev.key === 'Enter' && itens.length) {
      ev.preventDefault();
      itens[0].dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  /** Repõe o seletor a partir de uma lista de ids. */
  function preencherAtividades(ids) {
    dataAtividade = {};
    atividadesEscolhidas = (ids || []).filter(function (id) {
      return E.atividades.some(function (a) { return a.id === id; });
    });
    $('buscaAtividade').value = '';
    $('listaAtividades').classList.add('hidden');
    renderChipsAtividade();
  }

  /** Trocar a atividade mexe no seletor de cabo e na checagem de precedência. */
  function mudarAtividade() {
    atualizarCampoCabo();
    atualizarAtalhosPercentual();
    // Passa por aqui ao escolher, tirar ou mudar a data de uma atividade
    atualizarAvisoRetroativo();

    // Com várias escolhidas, a checagem de precedência ao vivo perde o sentido:
    // ela é por atividade, e cinco painéis empilhados seriam piores que nenhum.
    // Essa fica para a gravação, que responde uma a uma.
    if (atividadesEscolhidas.length > 1) {
      limparAvisos();
      $('somaPercentual').textContent =
        atividadesEscolhidas.length + ' atividades escolhidas · a sequência é ' +
        'conferida ao gravar, uma por uma';
      $('somaPercentual').style.color = 'var(--texto-fraco)';
      // A duplicidade não: ela olha cada atividade na sua data e cabe num aviso
      // só. Lançar em cima de uma equipe é erro calado demais para esperar.
      verificarMesmoServico();
      return;
    }

    mostrarSomaPercentual();
    verificarBloqueio();
    verificarMesmoServico();
  }

  /* ------------------------------------------- O último lançamento ------- */

  /**
   * O que acabei de lançar, para a próxima torre já ter à mão.
   *
   * A programação anda assim: injeção de nata com o mesmo encarregado, torre
   * atrás de torre, mudando só o dia. Reabrir o combo e digitar o mesmo nome
   * vinte vezes é onde o dedo erra e onde se perde tempo.
   *
   * Vive só nesta aba: fechou o SIPAV, esquece. É atalho do que estou fazendo
   * agora, não preferência guardada.
   */
  var ultimoLancamento = null;

  function guardarUltimoLancamento(dados) {
    if (!dados || !dados.atividades || !dados.atividades.length) return;
    ultimoLancamento = dados;
  }

  /** Nome curto do que ficou guardado, para o botão e para o topo das listas. */
  function resumoUltimoLancamento() {
    if (!ultimoLancamento) return null;

    var nomes = ultimoLancamento.atividades.map(function (id) {
      var a = E.atividades.find(function (x) { return x.id === id; });
      return a ? a.nome : null;
    }).filter(Boolean);

    if (!nomes.length) return null;   // atividade apagada do cadastro

    var enc = ultimoLancamento.encarregadoId
      ? (E.encarregados.find(function (e) { return e.id === ultimoLancamento.encarregadoId; }) || {}).nome
      : null;

    return { nomes: nomes, encarregado: enc || null };
  }

  /**
   * O botão de repetir, dentro da janela da torre.
   *
   * Preenche, não grava: ainda dá para trocar a data, o percentual ou tirar uma
   * atividade antes de confirmar. Preencher sozinho ao abrir seria mais rápido e
   * mais perigoso — lançaria a atividade errada na torre que eu só fui olhar.
   */
  function renderUltimoLancamento() {
    var caixa = $('blocoUltimo');
    if (!caixa) return;

    var r = resumoUltimoLancamento();

    // Não aparece enquanto edito uma programação: ali o formulário já está
    // preenchido com ela, e um botão que troca tudo seria uma armadilha.
    if (!r || programacaoEmEdicao) {
      caixa.classList.add('hidden');
      caixa.innerHTML = '';
      return;
    }

    caixa.innerHTML =
      '<button type="button" class="btn-repetir" onclick="SIPAV.app.repetirUltimoLancamento()">' +
        '<i data-lucide="corner-up-left" class="w-3 h-3"></i>' +
        '<span class="repetir-rotulo">Repetir o último</span>' +
        '<span class="repetir-o-que">' + esc(r.nomes.join(' · ')) +
          (r.encarregado ? ' · ' + esc(r.encarregado) : '') +
        '</span>' +
      '</button>';

    caixa.classList.remove('hidden');
    ui.icones();
  }

  function repetirUltimoLancamento() {
    if (!ultimoLancamento) return;

    // As que ainda existem no cadastro
    var ids = ultimoLancamento.atividades.filter(function (id) {
      return E.atividades.some(function (a) { return a.id === id; });
    });
    if (!ids.length) { ui.avisar('A atividade do último lançamento não existe mais.', 'alerta'); return; }

    preencherAtividades(ids);
    preencherEncarregado(ultimoLancamento.encarregadoId || '');

    if (ultimoLancamento.percentual) $('campoPercentual').value = ultimoLancamento.percentual;
    if (ultimoLancamento.cabo) $('campoCabo').value = ultimoLancamento.cabo;

    // A data não vem junto: é ela que muda de uma torre para a outra, e é o
    // único campo que eu realmente tenho que pensar a cada lançamento.
    mudarAtividade();
    $('campoData').focus();
  }

  /* ----------------------------------------------------- Dia da semana ---- */

  /**
   * A planilha da ISA é uma grade de SEG a DOM, e o pessoal programa pensando
   * "quinta o Mário sobe na 51/1". Só a data numérica obriga a converter de
   * cabeça toda vez, e é onde nasce erro de um dia.
   */
  function mostrarDiaDaSemana() {
    var campo = $('diaDaSemana');
    if (!campo) return;

    var iso = $('campoData').value;
    if (!iso) { campo.textContent = ''; campo.className = 'dia-semana'; return; }

    var domingo = ui.paraData(iso).getDay() === 0;
    campo.textContent = ui.diaDaSemana(iso) + (domingo ? ' · DSR na planilha' : '');
    campo.className = 'dia-semana' + (ui.fimDeSemana(iso) ? ' fim-de-semana' : '');
  }

  function mudarData() {
    mostrarDiaDaSemana();
    renderChipsAtividade();
    atualizarAvisoRetroativo();
    verificarBloqueio();
    verificarConflito();
    verificarMesmoServico();
  }

  /* ------------------------------------------------------- Encarregado ---- */

  /**
   * Combo com busca em vez de lista suspensa.
   *
   * O valor de verdade mora no input escondido `campoEncarregado`, que continua
   * respondendo a `.value` como o <select> respondia — por isso o resto do
   * fluxo de gravação não mudou.
   */
  var encMarcado = -1;   // item destacado pelas setas

  function encarregadosFiltrados() {
    var termo = normalizar($('buscaEncarregado').value.trim());
    if (!termo) return E.encarregados.slice(0, 50);
    return E.encarregados.filter(function (e) {
      return normalizar(e.nome).indexOf(termo) !== -1;
    });
  }

  function filtrarEncarregados() {
    var lista = encarregadosFiltrados();
    encMarcado = -1;

    // O do último lançamento sobe: é o mesmo encarregado torre atrás de torre,
    // e o nome dele ficava perdido no meio de dezenas.
    var ultimo = ultimoLancamento ? ultimoLancamento.encarregadoId : null;
    if (ultimo) {
      lista = lista.slice().sort(function (a, b) {
        if ((a.id === ultimo) !== (b.id === ultimo)) return a.id === ultimo ? -1 : 1;
        return 0;
      });
    }

    $('listaEncarregados').innerHTML =
      cabecalhoCombo(lista.length + (lista.length === 1 ? ' encarregado' : ' encarregados')) +
      '<button type="button" class="combo-item" onmousedown="SIPAV.app.escolherEncarregado(\'\')">' +
        '<span style="color:var(--texto-fraco)">— sem encarregado —</span>' +
      '</button>' +
      (lista.length
        ? lista.map(function (e) {
            return '<button type="button" class="combo-item" ' +
                   'onmousedown="SIPAV.app.escolherEncarregado(\'' + e.id + '\')">' +
                   esc(e.nome) +
                   (e.id === ultimo ? '<span class="combo-ultima">último</span>' : '') +
                   '</button>';
          }).join('')
        : '<p class="px-3 py-2 text-xs" style="color:var(--texto-fraco)">' +
          'Nenhum encarregado com esse nome</p>');

    $('listaEncarregados').classList.remove('hidden');
  }

  function escolherEncarregado(id) {
    var e = E.encarregados.find(function (x) { return x.id === id; });
    $('campoEncarregado').value = id || '';
    $('buscaEncarregado').value = e ? e.nome : '';
    $('listaEncarregados').classList.add('hidden');
    verificarConflito();
  }

  /** Setas percorrem, Enter escolhe, Esc fecha sem mexer no que já estava. */
  function teclaEncarregado(ev) {
    var caixa = $('listaEncarregados');
    var itens = caixa.querySelectorAll('.combo-item');

    if (ev.key === 'Escape') { caixa.classList.add('hidden'); return; }
    if (!itens.length) return;

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (caixa.classList.contains('hidden')) filtrarEncarregados();
      encMarcado += (ev.key === 'ArrowDown' ? 1 : -1);
      if (encMarcado < 0) encMarcado = itens.length - 1;
      if (encMarcado >= itens.length) encMarcado = 0;
      Array.prototype.forEach.call(itens, function (it, i) {
        it.classList.toggle('marcado', i === encMarcado);
      });
      itens[encMarcado].scrollIntoView({ block: 'nearest' });
      return;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      // Sem seta, Enter pega o primeiro da lista — que é o que o dedo espera
      var alvo = itens[encMarcado >= 0 ? encMarcado : (itens.length > 1 ? 1 : 0)];
      if (alvo) alvo.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  /** Repõe o combo a partir do id, ao abrir a torre ou ao editar. */
  function preencherEncarregado(id) {
    var e = id && E.encarregados.find(function (x) { return x.id === id; });
    $('campoEncarregado').value = e ? e.id : '';
    $('buscaEncarregado').value = e ? e.nome : '';
    $('listaEncarregados').classList.add('hidden');
  }

  /* -------------------------------------------------------- Percentual ---- */

  /**
   * Quanto desta atividade já está repartido nesta torre.
   *
   * Sem isso, programar 50% e depois 80% do mesmo serviço passa batido. A soma
   * não é travada de propósito — o planejamento pode cobrir só parte da
   * atividade na quinzena —, mas passar de 100% quase sempre é engano.
   */
  function mostrarSomaPercentual() {
    var campo = $('somaPercentual');
    if (!campo || !torreAberta) return;

    var atividadeId = $('campoAtividade').value;
    var outras = render.programacoesDaTorre(torreAberta.torre_id).filter(function (p) {
      return p.atividade && p.atividade.id === atividadeId && p.id !== programacaoEmEdicao;
    });

    if (!outras.length) { campo.textContent = ''; campo.style.color = 'var(--texto-fraco)'; return; }

    var jaTem = outras.reduce(function (s, p) { return s + (Number(p.percentual) || 100); }, 0);
    var agora = Number($('campoPercentual').value) || 0;
    var total = jaTem + agora;

    campo.textContent = 'Já programado ' + formatarPercentual(jaTem) + ' em ' +
      outras.length + (outras.length === 1 ? ' dia' : ' dias') +
      ' · total ficaria ' + formatarPercentual(total);
    campo.style.color = total > 100 ? '#F59E0B' : 'var(--texto-fraco)';
  }

  /** 50 → "50%", 12.5 → "12,5%" */
  function formatarPercentual(n) {
    var v = Number(n) || 0;
    return (Math.round(v * 100) / 100).toLocaleString('pt-BR') + '%';
  }

  /**
   * "Executado em 07/10 · programado para 05/10 (2 dias de atraso)".
   *
   * Lê a foto que o banco guardou no apontamento, e não a data de hoje da
   * programação: se ela foi adiada depois, é a original que diz se a meta bateu.
   * Quando a foto ainda não existe (antes da db/38), cai na data viva.
   */
  function textoDoExecutado(ex, p) {
    var prog = ex.data_programada || p.data;
    var orig = ex.data_programada_original || prog;
    var dias = Math.round((ui.paraData(ex.data_execucao) - ui.paraData(prog)) / 86400000);

    var t = 'Executado em ' + ui.dataCurta(ex.data_execucao);

    if (dias === 0) {
      t += ' · no prazo';
    } else {
      var n = Math.abs(dias);
      t += ' · programado para ' + ui.dataCurta(prog) + ' (' + n +
           (n === 1 ? ' dia' : ' dias') + (dias > 0 ? ' de atraso)' : ' adiantado)');
    }

    // Adiaram a programação antes de executar: a meta original era outra
    if (orig !== prog) t += ' · originalmente ' + ui.dataCurta(orig);

    t += ' · ' + formatarPercentual(ex.percentual);
    return t;
  }

  function renderListaDoModal() {
    if (!torreAberta) return;
    var progs = render.programacoesDaTorre(torreAberta.torre_id)
      .slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });

    $('modalContagem').textContent = progs.length;
    $('btnLimparTorre').classList.toggle('hidden', progs.length < 2);

    if (!progs.length) {
      $('modalListaProgramacoes').innerHTML =
        '<p class="text-sm text-slate-400 italic py-3 text-center">Nenhuma atividade programada ainda</p>';
      return;
    }

    $('modalListaProgramacoes').innerHTML = progs.map(function (p) {
      var cor = p.atividade ? p.atividade.cor_fundo : '#94a3b8';
      var ex = render.execucaoDa(p.id);

      return '' +
        '<div class="flex items-center gap-3 rounded-lg border px-3 py-2 ' +
             (ex ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50') + '">' +
          '<div class="w-1.5 h-9 rounded-full shrink-0" style="background:' + cor + '"></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-semibold text-slate-800 truncate">' +
              esc(p.atividade ? p.atividade.nome : '—') +
              (p.cabo ? ' <span class="selo-cabo">' + esc(rotuloCabo(p.cabo)) + '</span>' : '') +
              ' <span class="selo-parcial' + (Number(p.percentual) >= 100 ? ' cheio' : '') + '">' +
                formatarPercentual(p.percentual) + '</span>' +
            '</p>' +
            '<p class="text-xs text-slate-500">' +
              ui.dataLonga(p.data) +
              (p.encarregado ? ' · ' + esc(p.encarregado.nome) : '') +
              (p.observacao ? ' · ' + esc(p.observacao) : '') +
            '</p>' +
            (ex
              ? '<p class="text-xs text-emerald-700 font-medium mt-0.5 flex items-center gap-1">' +
                  '<i data-lucide="check-circle" class="w-3 h-3"></i> ' +
                  esc(textoDoExecutado(ex, p)) +
                '</p>'
              : '') +
            (p.override_motivo
              ? '<p class="text-xs text-amber-600 mt-0.5 flex items-center gap-1">' +
                  '<i data-lucide="alert-triangle" class="w-3 h-3"></i> ' +
                  'Fora da sequência: ' + esc(p.override_motivo) + '</p>'
              : '') +
          '</div>' +
          // Copiar para outras torres: abre o lote já com atividade, encarregado,
          // percentual e cabo desta linha. É o caminho mais curto para "essa
          // mesma coisa, nas próximas dez torres".
          '<button onclick="SIPAV.app.copiarParaOutrasTorres(\'' + p.id + '\')" ' +
                  'class="p-1.5 rounded-lg transition shrink-0 text-slate-300 hover:bg-slate-100" ' +
                  'style="color:var(--texto-fraco)" title="Copiar esta atividade para outras torres">' +
            '<i data-lucide="copy-plus" class="w-4 h-4"></i>' +
          '</button>' +
          '<button onclick="SIPAV.app.alternarExecucao(\'' + p.id + '\')" ' +
                  'class="p-1.5 rounded-lg transition shrink-0 ' +
                  (ex ? 'text-emerald-600 hover:bg-emerald-100' : 'text-slate-300 hover:bg-emerald-100 hover:text-emerald-600') + '" ' +
                  'title="' + (ex ? 'Desfazer apontamento' : 'Marcar como executado') + '">' +
            '<i data-lucide="' + (ex ? 'check-circle-2' : 'circle') + '" class="w-5 h-5"></i>' +
          '</button>' +
          '<button onclick="SIPAV.app.editarProgramacao(\'' + p.id + '\')" ' +
                  'class="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition" ' +
                  'title="Alterar">' +
            '<i data-lucide="pencil" class="w-4 h-4"></i>' +
          '</button>' +
          '<button onclick="SIPAV.app.removerProgramacao(\'' + p.id + '\')" ' +
                  'class="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition" ' +
                  'title="Remover">' +
            '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
          '</button>' +
        '</div>';
    }).join('');

    ui.icones();
  }

  /* ------------------------------------------------ Data que já passou ------ */

  /**
   * O banco recusa data no passado sem justificativa, e antes nenhuma tela tinha
   * onde escrevê-la: o lote até dizia que era "aviso, não bloqueio", e o banco
   * bloqueava. Aqui o campo aparece assim que a data é escolhida, não depois de
   * o servidor recusar.
   */
  function datasNoPassado(datas) {
    var hoje = ui.hoje();
    return datas.filter(function (d) { return d && d < hoje; });
  }

  /**
   * As datas desta gravação que precisam de justificativa.
   *
   * Editando, só conta se a data MUDOU: corrigir o encarregado de uma
   * programação que já era da semana passada não é escolher uma data no passado.
   * O banco aplica a mesma regra, e a tela tem que concordar com ele.
   */
  function datasQueExigemJustificativa() {
    var base = $('campoData').value;
    if (!base) return [];

    if (programacaoEmEdicao) {
      var atual = E.programacoes.find(function (x) { return x.id === programacaoEmEdicao; });
      if (atual && atual.data === base) return [];
      return datasNoPassado([base]);
    }

    return datasNoPassado(atividadesEscolhidas.length
      ? atividadesEscolhidas.map(function (id) { return dataDaAtividade(base, id); })
      : [base]);
  }

  function atualizarAvisoRetroativo() {
    var caixa = $('avisoRetroativo');
    if (!caixa) return;

    var passadas = datasQueExigemJustificativa();

    if (!passadas.length) {
      caixa.classList.add('hidden');
      $('campoJustificativaRetro').value = '';
      return;
    }

    var maisAntiga = passadas.slice().sort()[0];
    $('textoRetroativo').textContent = passadas.length === 1
      ? ui.dataCurta(maisAntiga) + ' (' + ui.diaDaSemana(maisAntiga) + ') já passou.'
      : passadas.length + ' datas já passaram, a mais antiga é ' + ui.dataCurta(maisAntiga) + '.';

    caixa.classList.remove('hidden');
    ui.icones();
  }

  function limparAvisos() {
    ui.esconder('avisoBloqueio');
    ui.esconder('avisoConflito');
    ui.esconder('avisoMesmoServico');
    $('campoOverride').checked = false;
    $('campoOverrideMotivo').value = '';
    $('campoOverrideMotivo').classList.add('hidden');
    $('campoPermitirDuplo').checked = false;
    $('btnAdicionar').disabled = false;
  }

  /**
   * Alguém já está nesse serviço, nessa torre, nesse dia.
   *
   * Dividir a atividade entre duas equipes no mesmo dia é rotina em campo — o
   * banco deixa, desde que sejam encarregados diferentes. Mas lançar em cima sem
   * perceber também acontece, então avisa e pede confirmação explícita.
   *
   * Roda sobre o que já está em memória: a lista da torre acabou de ser
   * desenhada no próprio modal, não vale ida ao banco.
   */
  function verificarMesmoServico() {
    if (!torreAberta) return;

    var base = $('campoData').value;
    if (!base || !atividadesEscolhidas.length) {
      ui.esconder('avisoMesmoServico');
      return;
    }

    var daTorre = render.programacoesDaTorre(torreAberta.torre_id);
    var conflitos = [];

    // Todas as escolhidas, cada uma na sua data. Antes olhava só a primeira e a
    // data lá de cima, então escolher duas atividades fazia o aviso sumir — e
    // lançar em cima de uma equipe passava calado.
    atividadesEscolhidas.forEach(function (id) {
      var quando = dataDaAtividade(base, id);
      var a = E.atividades.find(function (x) { return x.id === id; });

      daTorre.forEach(function (p) {
        if (p.id === programacaoEmEdicao) return;
        if (p.data !== quando) return;
        if (!p.atividade || p.atividade.id !== id) return;

        conflitos.push({
          atividade: a ? a.nome : '',
          data: quando,
          quem: (p.encarregado ? p.encarregado.nome : 'sem encarregado') +
                ' (' + formatarPercentual(p.percentual) + ')'
        });
      });
    });

    if (!conflitos.length) {
      ui.esconder('avisoMesmoServico');
      $('campoPermitirDuplo').checked = false;
      return;
    }

    var varias = atividadesEscolhidas.length > 1;

    $('textoMesmoServico').textContent = conflitos.map(function (c) {
      return c.quem + ' já está' + (varias ? ' em ' + c.atividade : '') +
             ' nesta torre em ' + ui.dataCurta(c.data);
    }).join(' · ') +
      '. Se a equipe vai dividir o serviço, siga — vale conferir os percentuais.';

    ui.mostrar('avisoMesmoServico');
    ui.icones();
  }

  // Cada consulta de bloqueio recebe um número. Só a mais recente pode pintar a
  // tela: sem isso, trocar de atividade rápido fazia a resposta antiga chegar
  // por último e sobrescrever a nova — o bloqueio parecia ligar "às vezes".
  var seqBloqueio = 0;

  /** Consulta a regra de precedência no banco e avisa antes de gravar. */
  function verificarBloqueio() {
    if (!torreAberta) return;
    var atividadeId = $('campoAtividade').value;
    var data = $('campoData').value;
    if (!atividadeId || !data) return;

    // Trocou de atividade ou de data: o override anterior não vale mais
    $('campoOverride').checked = false;
    $('campoOverrideMotivo').value = '';
    $('campoOverrideMotivo').classList.add('hidden');

    var meu = ++seqBloqueio;
    $('btnAdicionar').disabled = true;

    db.motivoBloqueio(torreAberta.torre_id, atividadeId, data)
      .then(function (motivo) {
        if (meu !== seqBloqueio) return;   // resposta atrasada, descarta
        aplicarBloqueio(motivo);
      })
      .catch(function (e) {
        if (meu !== seqBloqueio) return;
        // Falhar calado deixava o aviso com o estado da atividade anterior.
        // Melhor dizer que não deu para verificar do que mentir que está livre.
        aplicarBloqueio('Não foi possível verificar a sequência agora: ' + e.message +
                        '. O banco recusa de qualquer forma se estiver fora de ordem.');
      });

    verificarConflito();
  }

  function aplicarBloqueio(motivo) {
    if (motivo) {
      $('textoBloqueio').textContent = motivo;
      ui.mostrar('avisoBloqueio');
      $('btnAdicionar').disabled = !$('campoOverride').checked;
    } else {
      ui.esconder('avisoBloqueio');
      $('btnAdicionar').disabled = false;
    }
    ui.icones();
  }

  function alternarOverride() {
    var marcado = $('campoOverride').checked;
    $('campoOverrideMotivo').classList.toggle('hidden', !marcado);
    $('btnAdicionar').disabled = !marcado;
    if (marcado) $('campoOverrideMotivo').focus();
  }

  function verificarConflito() {
    var encarregadoId = $('campoEncarregado').value;
    var data = $('campoData').value;
    if (!encarregadoId || !data || !torreAberta) { ui.esconder('avisoConflito'); return; }

    db.conflitosDoEncarregado(encarregadoId, data, torreAberta.torre_id)
      .then(function (lista) {
        if (!lista.length) { ui.esconder('avisoConflito'); return; }
        var torres = lista.map(function (c) { return c.torre ? c.torre.identificador : '?'; });
        var enc = E.encarregados.find(function (x) { return x.id === encarregadoId; });
        var nome = enc ? enc.nome : 'o encarregado';
        $('textoConflito').textContent =
          nome + ' já está programado em ' + ui.dataCurta(data) + ' na(s) torre(s) ' +
          torres.join(', ') + '. Confira se a equipe dá conta.';
        ui.mostrar('avisoConflito');
        ui.icones();
      })
      .catch(function () { /* aviso, não bloqueio */ });
  }

  /** Parte entrou e parte não: dizer qual é qual, com o motivo de cada recusa. */
  function relatarAtividades(criadas, recusadas) {
    ui.modalGenerico({
      titulo: 'Programação da torre ' + (torreAberta ? torreAberta.identificador : ''),
      corpoHtml:
        '<div class="space-y-2">' +
          (criadas.length
            ? '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3">' +
                '<p class="text-sm font-semibold text-emerald-800">' +
                  criadas.length + ' programada(s)</p>' +
                '<p class="text-xs text-emerald-800 mt-1">' + esc(criadas.join(' · ')) + '</p>' +
              '</div>'
            : '') +
          '<div class="rounded-lg border border-rose-200 bg-rose-50 p-3">' +
            '<p class="text-sm font-semibold text-rose-800">' + recusadas.length + ' não entrou</p>' +
            '<div class="text-xs text-rose-800 mt-1 space-y-1">' +
              recusadas.map(function (r) {
                return '<p><strong>' + esc(r.nome) + '</strong> — ' + esc(r.motivo) + '</p>';
              }).join('') +
            '</div>' +
            '<p class="text-xs text-rose-700 mt-2">' +
              'Em geral é precedência. Para forçar, adicione uma de cada vez e marque ' +
              '"programar mesmo assim" com a justificativa.' +
            '</p>' +
          '</div>' +
        '</div>',
      botoes: [{ rotulo: 'Fechar', classe: 'btn-primario' }]
    });
  }

  function adicionarProgramacao() {
    if (!torreAberta) return;

    var override = $('campoOverride').checked;
    var motivo = $('campoOverrideMotivo').value.trim();

    if (override && !motivo) {
      ui.avisar('Descreva a justificativa para programar fora da sequência.', 'alerta');
      $('campoOverrideMotivo').focus();
      return;
    }

    if (!atividadesEscolhidas.length) {
      ui.avisar('Escolha pelo menos uma atividade.', 'alerta');
      $('buscaAtividade').focus();
      return;
    }

    var percentual = Number($('campoPercentual').value) || 100;
    if (percentual <= 0 || percentual > 100) {
      ui.avisar('O percentual tem que ficar entre 1 e 100.', 'alerta');
      $('campoPercentual').focus();
      return;
    }

    // Sem o cabo o relatório da ISA não sabe se a linha é da seção 4.1 ou da
    // 4.2. Melhor cobrar agora do que descobrir na hora de exportar.
    var cabo = $('campoCabo').value || null;
    var faltaCabo = atividadesEscolhidas.filter(function (id) { return pedeCabo(id); });
    if (faltaCabo.length && !cabo) {
      ui.avisar('Escolha o cabo: ' + textoDasOpcoesDeCabo() + '.', 'alerta');
      $('campoCabo').focus();
      return;
    }

    // Dividir o serviço entre equipes é legítimo, mas tem que ser deliberado.
    // Vale para todas as atividades escolhidas, cada uma na sua data.
    var avisoDuplo = !$('avisoMesmoServico').classList.contains('hidden');
    if (avisoDuplo && !$('campoPermitirDuplo').checked) {
      ui.avisar('Já tem gente nesse serviço. Marque "adicionar outro mesmo assim" para dividir.', 'alerta', 6000);
      $('campoPermitirDuplo').focus();
      return;
    }

    // Data que já passou pede justificativa própria. Não é a do "programar mesmo
    // assim": aquela desliga a conferência de sequência, esta só libera a data.
    var justRetro = $('campoJustificativaRetro').value.trim();
    var exigeJustificativa = datasQueExigemJustificativa().length > 0;

    if (exigeJustificativa && !justRetro) {
      ui.avisar('Informe por que está programando para uma data que já passou.', 'alerta', 6000);
      $('campoJustificativaRetro').focus();
      return;
    }

    var editando = programacaoEmEdicao;
    var comuns = {
      encarregadoId: $('campoEncarregado').value || null,
      data: $('campoData').value,
      observacao: $('campoObservacao').value.trim() || null,
      percentual: percentual,
      overrideMotivo: override ? motivo : null
    };

    ui.processando(editando ? 'Salvando alteração…'
      : 'Gravando ' + atividadesEscolhidas.length + ' programação(ões)…');

    var criadas = [], recusadas = [];

    // Uma por atividade, em sequência. Em bloco o trigger de precedência
    // recusaria tudo junto sem dizer qual atividade travou.
    var gravar = editando
      ? db.atualizarProgramacao(editando, {
          atividade_id:    atividadesEscolhidas[0],
          encarregado_id:  comuns.encarregadoId,
          data:            comuns.data,
          observacao:      comuns.observacao,
          override_motivo: comuns.overrideMotivo,
          // Só vai quando a data mudou para o passado. undefined não entra no
          // JSON, então uma justificativa que já existia não é apagada.
          justificativa_retroativa: exigeJustificativa ? justRetro : undefined,
          cabo:            pedeCabo(atividadesEscolhidas[0]) ? cabo : null,
          percentual:      percentual,
          // undefined não entra no JSON: sem a db/40 a coluna nem é tocada
          partes:          db.temPartes() ? partesParaGravar() : undefined
        })
      // Em ordem de data e, no mesmo dia, de ordem de execução: a cadeia precisa
      // da supressão gravada antes da escavação, senão o gatilho recusa a segunda
      // por precedência. Desde que o mesmo dia passou a liberar, as duas caem na
      // mesma data e a ordem entre elas é o que decide.
      : atividadesEscolhidas.slice().sort(function (x, y) {
          var dx = dataDaAtividade(comuns.data, x), dy = dataDaAtividade(comuns.data, y);
          if (dx !== dy) return dx < dy ? -1 : 1;
          return ordemDaAtividade(x) - ordemDaAtividade(y);
        }).reduce(function (antes, id) {
          return antes.then(function () {
            var a = E.atividades.find(function (x) { return x.id === id; });
            return db.criarProgramacao({
              torreId: torreAberta.torre_id,
              atividadeId: id,
              encarregadoId: comuns.encarregadoId,
              data: dataDaAtividade(comuns.data, id),
              observacao: comuns.observacao,
              situacao: E.perfil.papel === 'SUPERVISOR' ? 'SOLICITADA' : 'APROVADA',
              overrideMotivo: comuns.overrideMotivo,
              // Só as atividades cuja PRÓPRIA data passou: com datas por
              // atividade, uma pode estar no passado e a outra não.
              justificativaRetroativa:
                dataDaAtividade(comuns.data, id) < ui.hoje() ? justRetro : null,
              cabo: pedeCabo(id) ? cabo : null,
              percentual: percentual,
              partes: atividadesEscolhidas.length === 1 ? partesParaGravar() : null
            })
              .then(function () { criadas.push(a ? a.nome : id); })
              .catch(function (e) { recusadas.push({ nome: a ? a.nome : id, motivo: e.message }); });
          });
        }, Promise.resolve());

    gravar
      .then(function () {
        // Uma atividade só e ela foi recusada: erro direto, como era antes
        if (!editando && !criadas.length && recusadas.length === 1) {
          throw new Error(recusadas[0].motivo);
        }
      })
      .then(function () {
        // Guarda o que acabou de entrar, para a próxima torre já ter à mão.
        // Só o que entrou: se tudo foi recusado, não é um lançamento a repetir.
        if (criadas.length) {
          guardarUltimoLancamento({
            atividades: atividadesEscolhidas.slice(),
            encarregadoId: comuns.encarregadoId,
            data: comuns.data,
            percentual: percentual,
            cabo: cabo
          });
        }

        preencherAtividades([]);
        $('campoObservacao').value = '';
        $('campoCabo').value = '';
        $('campoPercentual').value = 100;
        // A data continua no formulário. Se ainda for do passado a caixa
        // reaparece — mas vazia: a justificativa de uma torre não vale para a
        // próxima.
        $('campoJustificativaRetro').value = '';
        preencherEncarregado('');
        atualizarCampoCabo();
        atualizarAtalhosPercentual();
        programacaoEmEdicao = null;
        atualizarModoFormulario();
        limparAvisos();
        verificarMesmoServico();
        return recarregarProgramacoes();
      })
      .then(function () {
        ui.pronto();

        // Gravou fora do recorte de datas: a linha existe, mas não aparece.
        // Sem este aviso, parece que o lançamento se perdeu.
        var data = $('campoData').value;
        var fora = (E.periodo.de && data < E.periodo.de) ||
                   (E.periodo.ate && data > E.periodo.ate);

        if (recusadas.length) {
          // Parte entrou e parte não: detalhar, senão fica a dúvida de qual é qual
          relatarAtividades(criadas, recusadas);
        } else if (fora) {
          ui.avisar('Gravada para ' + ui.dataCurta(data) + ', fora do período exibido (' +
                    ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) +
                    '). Troque o período para vê-la.', 'alerta', 7000);
        } else if (editando) {
          ui.avisar('Programação alterada.', 'sucesso');
        } else {
          ui.avisar(criadas.length === 1 ? 'Programação adicionada.'
            : criadas.length + ' programações adicionadas.', 'sucesso');
        }
        verificarBloqueio();
      })
      .catch(function (e) {
        ui.pronto();
        ui.avisar(e.message, 'erro', 6000);
      });
  }

  /* ---------------------------------------------- Apontar o executado ----- */

  /**
   * Marca ou desmarca uma programação como executada. É o que transforma o
   * SIPAV de ferramenta de planejar em registro do que a obra andou: daqui saem
   * produtividade por encarregado, aderência da programação e curva de avanço.
   */
  function alternarExecucao(id) {
    var p = E.programacoes.find(function (x) { return x.id === id; });
    if (!p) return;

    var ex = render.execucaoDa(id);

    if (ex) {
      ui.confirmar(
        'Desfazer apontamento',
        esc(p.atividade ? p.atividade.nome : 'A atividade') + ' volta a constar como ' +
        'pendente, e o estágio da torre recua se não houver nada mais avançado.',
        'Desfazer'
      ).then(function (sim) {
        if (!sim) return;
        ui.processando('Desfazendo…');
        return db.desfazerApontamento(id)
          .then(recarregarProgramacoes)
          .then(function () { ui.pronto(); ui.avisar('Apontamento desfeito.', 'sucesso'); });
      }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
      return;
    }

    // Data real de execução: por padrão a programada, mas ela pode ter escorregado
    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-sm text-slate-600">' +
          '<strong>' + esc(p.atividade ? p.atividade.nome : '—') + '</strong> na torre ' +
          '<strong>' + esc(p.torre.identificador) + '</strong>' +
          (p.encarregado ? ', com ' + esc(p.encarregado.nome) : '') + '.' +
        '</p>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="rotulo">Executado em</label>' +
            '<input id="dataExecucao" type="date" class="campo" value="' + p.data + '"></div>' +
          // Quanto saiu. O padrão é o programado: um estai de cinco partes é 20%.
          // Apontar como 100 faria a torre constar como escavada inteira.
          '<div><label class="rotulo">Quanto saiu (%)</label>' +
            '<input id="pctExecucao" type="number" min="1" max="100" step="1" class="campo" ' +
                   'value="' + (Number(p.percentual) || 100) + '"></div>' +
        '</div>' +
        '<div><label class="rotulo">Observação <span class="text-slate-400 font-normal">(opcional)</span></label>' +
          '<input id="obsExecucao" class="campo" placeholder="Ex.: concluído com equipe reduzida"></div>' +
        '<p class="text-xs text-slate-400">' +
          'Programado para ' + ui.dataLonga(p.data) + '. Se saiu em outro dia, corrija a ' +
          'data. Fica gravado que foi programado para este dia e feito no outro — é disso ' +
          'que sai o controle de metas, e continua valendo mesmo que a programação seja ' +
          'adiada ou apagada depois.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Apontar execução',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Confirmar execução', classe: 'btn-primario', acao: function () {
            var data = $('dataExecucao').value;
            var obs  = $('obsExecucao').value.trim() || null;
            var pctEx = Number($('pctExecucao').value);
            if (!data) { ui.avisar('Informe a data de execução.', 'alerta'); return; }
            if (!(pctEx > 0 && pctEx <= 100)) {
              ui.avisar('O quanto saiu tem que ficar entre 1 e 100.', 'alerta');
              $('pctExecucao').focus();
              return;
            }

            ui.processando('Apontando…');
            db.apontarExecucao(p, data, obs, pctEx)
              .then(recarregarProgramacoes)
              .then(function () {
                ui.pronto();
                ui.fecharModal('modalGenerico');
                ui.avisar('Execução apontada.', 'sucesso');
              })
              .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
          } }
      ]
    });
  }

  /* ------------------------------------------------- Alterar e limpar ----- */

  /**
   * Abre uma programação da lista do "editar em lote" na janela da torre.
   *
   * Vinte linhas na régua e uma fora dela: para ajustar essa uma, fechar o lote
   * e ir caçar a torre na grade é caminho longo demais. Aqui o clique na linha
   * abre a torre com a programação já em edição.
   */
  function editarDaEdicaoEmLote(id) {
    var x = edicaoLote.find(function (y) { return y.id === id; });
    if (!x) return;

    ui.fecharModal('modalGenerico');
    abrirTorre(x.torreId, true);
    editarProgramacao(id);
  }

  /** Traz a programação para o formulário, que passa a alterar em vez de criar. */
  function editarProgramacao(id) {
    var p = E.programacoes.find(function (x) { return x.id === id; });
    if (!p) return;

    programacaoEmEdicao = id;

    preencherAtividades(p.atividade ? [p.atividade.id] : []);
    $('campoData').value        = p.data;
    mostrarDiaDaSemana();
    preencherEncarregado(p.encarregado ? p.encarregado.id : '');
    $('campoObservacao').value  = p.observacao || '';

    atualizarCampoCabo();
    $('campoCabo').value = p.cabo || '';
    $('campoPercentual').value = p.percentual == null ? 100 : p.percentual;
    partesMarcadas = {
      chave: p.atividade ? torreAberta.torre_id + '|' + p.atividade.id : '',
      letras: p.partes ? String(p.partes).split(',') : []
    };
    atualizarAtalhosPercentual();

    atualizarModoFormulario();
    verificarBloqueio();
    verificarMesmoServico();

    // verificarBloqueio limpa a justificativa; devolve a original depois dela,
    // para quem estava editando não ter que redigitar o motivo.
    if (p.override_motivo) $('campoOverrideMotivo').value = p.override_motivo;

    $('campoData').focus();
  }

  function cancelarEdicao() {
    programacaoEmEdicao = null;
    preencherAtividades([]);
    $('campoObservacao').value = '';
    $('campoCabo').value = '';
    $('campoPercentual').value = 100;
    $('campoJustificativaRetro').value = '';
    atualizarModoFormulario();
    atualizarCampoCabo();
    atualizarAtalhosPercentual();
    verificarBloqueio();
  }

  function atualizarModoFormulario() {
    var editando = !!programacaoEmEdicao;
    $('tituloFormulario').textContent   = editando ? 'Alterando programação' : 'Nova atividade';
    $('rotuloBtnAdicionar').textContent = editando ? 'Salvar alteração' : 'Adicionar programação';
    $('btnCancelarEdicao').classList.toggle('hidden', !editando);
    // Passa por aqui toda vez que o formulário troca de modo, que é exatamente
    // quando o botão de repetir precisa aparecer ou sumir.
    renderUltimoLancamento();
    // E quando a exigência de justificativa muda: editar a mesma data não pede
    atualizarAvisoRetroativo();
    ui.icones();
  }

  function limparProgramacoesDaTorre() {
    if (!torreAberta) return;
    var torre = torreAberta;
    var quantas = render.programacoesDaTorre(torre.torre_id).length;

    ui.confirmar(
      'Limpar a torre ' + torre.identificador,
      'Serão removidas ' + quantas + ' programações desta torre dentro do período exibido (' +
      ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) + '). Fica registrado no histórico.',
      'Limpar'
    ).then(function (sim) {
      if (!sim) return;
      ui.processando('Limpando…');
      return db.limparProgramacoesDaTorre(torre.torre_id, E.periodo.de, E.periodo.ate)
        .then(recarregarProgramacoes)
        .then(function () {
          ui.pronto();
          cancelarEdicao();
          ui.avisar('Programações da torre removidas.', 'sucesso');
        });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /**
   * Limpeza sempre limitada ao trecho aberto e ao período exibido. Nunca a obra
   * inteira: com quatro pessoas programando ao mesmo tempo, um "limpar tudo"
   * apagaria o trabalho de quem está em outro trecho.
   */
  function limparProgramacoesDoPeriodo() {
    if (!E.trechoAtual) return;

    var quantas = E.programacoes.length;
    if (!quantas) { ui.avisar('Não há programação no período exibido.', 'alerta'); return; }

    ui.confirmar(
      'Limpar ' + quantas + (quantas === 1 ? ' programação' : ' programações'),
      'De ' + E.trechoAtual.nome + ', no período ' +
      ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) + '. ' +
      'Outros trechos e outras datas não são tocados. Cada remoção fica registrada ' +
      'no histórico, com seu nome.',
      'Limpar ' + quantas
    ).then(function (sim) {
      if (!sim) return;
      ui.processando('Limpando ' + quantas + ' programações…');
      return db.limparProgramacoesDoPeriodo(E.trechoAtual.id, E.periodo.de, E.periodo.ate)
        .then(function (apagadas) {
          return recarregarProgramacoes().then(function () {
            ui.pronto();
            ui.avisar(apagadas + ' programações removidas.', 'sucesso', 5000);
          });
        });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function removerProgramacao(id) {
    ui.confirmar('Remover programação', 'Esta atividade sai da programação da torre.', 'Remover')
      .then(function (sim) {
        if (!sim) return;
        ui.processando('Removendo…');
        return db.removerProgramacao(id)
          .then(recarregarProgramacoes)
          .then(function () { ui.pronto(); ui.avisar('Programação removida.', 'sucesso'); });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /* ======================================================================== */
  /* ESTÁGIO DA TORRE                                                         */
  /* ======================================================================== */

  /**
   * O estágio não é um campo: ele é derivado do histórico de execuções. Corrigir
   * significa reescrever as execuções inferidas desta torre — as que vieram da
   * planilha.
   *
   * O apontamento feito em campo é outra coisa, e só sai daqui com confirmação.
   * Antes ele nunca era tocado, e o resultado era uma mentira dupla: escolher
   * "nada executado" numa torre com apontamento não fazia o estágio voltar, o
   * histórico gravava "corrigiu para nada executado" e a tela dizia "Estágio
   * atualizado". Quem corrigia achava que tinha funcionado.
   */
  var apontadoNaTorre = [];   // o que foi apontado em campo na torre aberta

  function abrirCorrigirEstagio() {
    if (!torreAberta) return;
    var torre = torreAberta;

    ui.processando('Conferindo o que foi apontado…');

    db.execucoesDaTorre(torre.torre_id)
      .then(function (lista) {
        ui.pronto();
        apontadoNaTorre = lista;
        montarCorrigirEstagio(torre);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  function montarCorrigirEstagio(torre) {
    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-sm text-slate-600">' +
          'A torre <strong>' + esc(torre.identificador) + '</strong> consta hoje em ' +
          '<strong>' + esc(torre.ultima_atividade || 'nada executado') + '</strong>.' +
        '</p>' +
        '<div><label class="rotulo">Última atividade executada</label>' +
          '<select id="estagioNovo" class="campo" ' +
                  'onchange="SIPAV.app.mostrarConflitosDoEstagio()">' +
            '<option value="">— nada executado —</option>' +
            E.atividades.map(function (a) {
              return '<option value="' + a.id + '"' +
                     (a.id === torre.ultima_atividade_id ? ' selected' : '') + '>' +
                     esc(a.nome) + '</option>';
            }).join('') +
          '</select></div>' +

        // Preenchido por mostrarConflitosDoEstagio: o que foi apontado em campo
        // e ficaria acima do estágio escolhido
        '<div id="estagioConflitos" class="hidden rounded-lg border border-amber-300 bg-amber-50 p-3">' +
          '<p class="text-sm font-semibold text-amber-900">Há execução apontada em campo acima disso</p>' +
          '<ul id="estagioConflitosLista" class="text-xs text-amber-800 mt-1 space-y-0.5"></ul>' +
          '<label class="flex items-start gap-2 text-sm text-amber-900 mt-2 cursor-pointer">' +
            '<input type="checkbox" id="estagioDesfazer" class="rounded border-amber-400 mt-0.5">' +
            '<span>Desfazer esses apontamentos. As programações voltam a constar como ' +
            'pendentes, e o histórico guarda quem desfez.</span>' +
          '</label>' +
        '</div>' +

        // Execução parcial acima do estágio não segura a torre ali, então não
        // impede voltar. Mas fica no banco, e quem corrige precisa saber disso.
        '<p id="estagioParciais" class="hidden text-xs text-slate-500"></p>' +

        '<p class="text-xs text-slate-500">' +
          'Marca essa atividade e todas as <strong>obrigatórias anteriores</strong> como ' +
          'executadas. As condicionais ficam de fora, porque não há como saber se esta ' +
          'torre levou perfuração em rocha, tubulão ou pré-moldado.' +
        '</p>' +
        '<p class="text-xs text-slate-400">' +
          'Isso muda a cor da torre na grade e o que as regras de bloqueio consideram ' +
          'feito. Fica gravado com o seu nome e marcado como correção manual, separado ' +
          'do que veio da planilha.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Corrigir estágio — torre ' + torre.identificador,
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Salvar estágio', classe: 'btn-primario', acao: salvarEstagio }
      ]
    });

    mostrarConflitosDoEstagio();
  }

  /**
   * O que foi apontado em campo e ficaria ACIMA do estágio escolhido.
   *
   * Só conta a atividade que já está completa (soma dos percentuais em 100):
   * é ela que define o estágio. Um estai de cinco partes com 20% apontados não
   * está segurando a torre naquele estágio, então não impede voltar.
   */
  function gruposApontadosAcima(atividadeEscolhidaId) {
    var alvo = atividadeEscolhidaId
      ? E.atividades.find(function (a) { return a.id === atividadeEscolhidaId; })
      : null;
    var ordemAlvo = alvo ? alvo.ordem_execucao : 0;

    var porAtividade = {};
    apontadoNaTorre.forEach(function (x) {
      var g = porAtividade[x.atividade_id] = porAtividade[x.atividade_id] ||
        { nome: x.atividade ? x.atividade.nome : '—',
          ordem: x.atividade ? x.atividade.ordem_execucao : 0,
          soma: 0, linhas: [] };
      g.soma += Number(x.percentual) || 0;
      g.linhas.push(x);
    });

    return Object.keys(porAtividade)
      .map(function (id) { return porAtividade[id]; })
      .filter(function (g) { return g.ordem > ordemAlvo; })
      .sort(function (a, b) { return a.ordem - b.ordem; });
  }

  /** As completas: são elas que seguram o estágio, então só elas impedem voltar. */
  function conflitosDoEstagio(atividadeEscolhidaId) {
    return gruposApontadosAcima(atividadeEscolhidaId)
      .filter(function (g) { return g.soma >= 100; });
  }

  function mostrarConflitosDoEstagio() {
    var caixa = $('estagioConflitos');
    if (!caixa) return;

    var escolhida = $('estagioNovo').value;
    var conflitos = conflitosDoEstagio(escolhida);
    var parciais = gruposApontadosAcima(escolhida).filter(function (g) { return g.soma < 100; });

    caixa.classList.toggle('hidden', !conflitos.length);
    $('estagioDesfazer').checked = false;

    $('estagioConflitosLista').innerHTML = conflitos.map(function (g) {
      var datas = g.linhas.map(function (x) { return ui.dataCurta(x.data_execucao); }).join(', ');
      return '<li><strong>' + esc(g.nome) + '</strong> — apontada em ' + esc(datas) + '</li>';
    }).join('');

    var nota = $('estagioParciais');
    nota.classList.toggle('hidden', !parciais.length);
    nota.textContent = parciais.length
      ? 'Também há execução parcial de ' + parciais.map(function (g) {
          return g.nome + ' (' + g.soma + '%)';
        }).join(', ') + '. Ela não muda o estágio e fica como está.'
      : '';
  }

  function salvarEstagio() {
    var torre = torreAberta;
    if (!torre) return;

    var id = $('estagioNovo').value;
    var registros = [];
    var nova = null;

    if (id) {
      var a = E.atividades.find(function (x) { return x.id === id; });
      if (a) {
        nova = a.nome;
        expandirEstagio(a).forEach(function (aid) {
          registros.push({ torreId: torre.torre_id, atividadeId: aid });
        });
      }
    }

    // O que foi apontado acima do estágio escolhido. Sem desfazer, o estágio não
    // volta — então não finjo que voltou: peço a confirmação ou recuso.
    var conflitos = conflitosDoEstagio(id);
    var desfazer = conflitos.length && $('estagioDesfazer').checked;

    if (conflitos.length && !desfazer) {
      ui.avisar('Há execução apontada em campo acima de ' + (nova || 'nada executado') +
                '. Marque "Desfazer esses apontamentos", ou escolha um estágio mais avançado.',
                'alerta', 7000);
      $('estagioDesfazer').focus();
      return;
    }

    // Todas as linhas daquelas atividades, inclusive as parciais: o que sobraria
    // seria um pedaço de uma atividade que a pessoa acabou de dizer que não houve.
    var idsParaDesfazer = [];
    conflitos.forEach(function (g) {
      g.linhas.forEach(function (x) { idsParaDesfazer.push(x.id); });
    });

    var anterior = torre.ultima_atividade || null;

    ui.processando('Atualizando estágio…');

    (desfazer ? db.desfazerApontamentos(idsParaDesfazer) : Promise.resolve(true))
      .then(function () { return db.limparCargaInicial([torre.torre_id]); })
      .then(function () {
        return db.registrarCargaInicial(registros, 'Estágio corrigido manualmente');
      })
      .then(function () {
        return db.registrarCorrecaoEstagio(torre.torre_id, nova, anterior);
      })
      .then(recarregarProgramacoes)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');

        // Reabre com os dados novos, para o cabeçalho refletir a correção
        var atualizada = E.torres.find(function (t) { return t.torre_id === torre.torre_id; });
        if (atualizada) abrirTorre(atualizada.torre_id);

        // Confere o resultado em vez de confiar nele. Dizer "atualizado" sem
        // olhar foi exatamente o erro de antes.
        var ficou = atualizada ? (atualizada.ultima_atividade || null) : null;
        if (atualizada && ficou !== nova) {
          ui.avisar('O estágio ficou em ' + (ficou || 'nada executado') + ', não em ' +
                    (nova || 'nada executado') + '. Confira o que está apontado nesta torre.',
                    'alerta', 9000);
        } else {
          ui.avisar(desfazer
            ? 'Estágio atualizado. ' + idsParaDesfazer.length + ' apontamento(s) desfeito(s).'
            : 'Estágio atualizado.', 'sucesso');
        }
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /* ======================================================================== */
  /* HISTÓRICO                                                                */
  /* ======================================================================== */

  var ESTILO_ACAO = {
    CRIOU:   { cor: '#10B981', icone: 'plus',    verbo: 'programou' },
    ALTEROU: { cor: '#F59E0B', icone: 'pencil',  verbo: 'alterou' },
    REMOVEU: { cor: '#E11D48', icone: 'trash-2', verbo: 'removeu' },
    ESTAGIO: { cor: '#0284C7', icone: 'flag',    verbo: 'corrigiu o estágio' }
  };

  var ROTULO_CAMPO = {
    data: 'Data', atividade: 'Atividade', encarregado: 'Encarregado',
    situacao: 'Situação', observacao: 'Observação', estagio: 'Estágio'
  };

  function linhaHistorico(h, mostrarTorre) {
    var e = ESTILO_ACAO[h.acao] || ESTILO_ACAO.ALTEROU;

    // Correção de estágio não tem data nem encarregado: a frase é outra
    var alvo = h.acao === 'ESTAGIO'
      ? (mostrarTorre ? 'da torre ' + esc(h.torre_identificador) : 'desta torre') +
        ' para <strong>' + esc(h.atividade_nome || 'nada executado') + '</strong>'
      : (mostrarTorre ? 'torre ' + esc(h.torre_identificador) + ' · ' : '') +
        '<strong>' + esc(h.atividade_nome || '—') + '</strong>' +
        ' em ' + ui.dataCurta(h.data) +
        (h.encarregado_nome ? ' · ' + esc(h.encarregado_nome) : '');

    var detalhe = '';
    if ((h.acao === 'ALTEROU' || h.acao === 'ESTAGIO') && h.mudancas) {
      detalhe = Object.keys(h.mudancas).map(function (campo) {
        var m = h.mudancas[campo];
        var de   = campo === 'data' ? ui.dataCurta(m.de)   : (m.de   || '—');
        var para = campo === 'data' ? ui.dataCurta(m.para) : (m.para || '—');
        return '<div class="text-xs text-slate-500">' +
                 (ROTULO_CAMPO[campo] || campo) + ': ' +
                 '<span class="line-through opacity-70">' + esc(de) + '</span> → ' +
                 '<strong>' + esc(para) + '</strong></div>';
      }).join('');
    }

    if (h.override_motivo) {
      detalhe += '<div class="text-xs text-amber-600 mt-0.5">' +
                 'Fora da sequência: ' + esc(h.override_motivo) + '</div>';
    }

    return '' +
      '<div class="flex gap-3 rounded-lg border border-slate-200 px-3 py-2">' +
        '<span class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5" ' +
              'style="background:' + e.cor + '22;color:' + e.cor + '">' +
          '<i data-lucide="' + e.icone + '" class="w-3 h-3"></i></span>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm text-slate-700">' +
            '<strong>' + esc(h.quem_nome || 'desconhecido') + '</strong> ' + e.verbo + ' ' + alvo +
          '</p>' +
          detalhe +
        '</div>' +
        '<span class="text-[11px] text-slate-400 shrink-0 whitespace-nowrap mt-0.5">' +
          esc(ui.quandoRelativo(h.quando)) + '</span>' +
      '</div>';
  }

  function montarHistorico(lista, titulo, mostrarTorre, comFiltros) {
    var filtros = '';

    if (comFiltros) {
      // As pessoas saem do próprio histórico: quem nunca mexeu não precisa
      // aparecer no seletor.
      var pessoas = [];
      lista.forEach(function (h) {
        if (h.quem_nome && pessoas.indexOf(h.quem_nome) === -1) pessoas.push(h.quem_nome);
      });
      pessoas.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

      filtros =
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="caixa-filtro">' +
            '<i data-lucide="user" class="w-3.5 h-3.5" style="color:var(--texto-fraco)"></i>' +
            '<select id="histQuem" class="select-filtro" onchange="SIPAV.app.filtrarHistorico()">' +
              '<option value="">Todo mundo</option>' +
              pessoas.map(function (p) {
                return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="caixa-filtro">' +
            '<i data-lucide="git-branch" class="w-3.5 h-3.5" style="color:var(--texto-fraco)"></i>' +
            '<select id="histTrecho" class="select-filtro" onchange="SIPAV.app.filtrarHistorico()">' +
              '<option value="">Toda a obra</option>' +
              E.trechos.map(function (t) {
                return '<option value="' + t.id + '"' +
                       (E.trechoAtual && t.id === E.trechoAtual.id ? '' : '') + '>' +
                       esc(t.nome) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<span id="histContagem" class="resumo"></span>' +
        '</div>';
    }

    var corpo = lista.length
      ? '<div id="histLista" class="space-y-1.5">' +
          lista.map(function (h) { return linhaHistorico(h, mostrarTorre); }).join('') +
        '</div>'
      : '<div id="histLista"><p class="text-sm text-slate-400 italic text-center py-8">' +
          'Nenhuma alteração registrada ainda.</p></div>';

    ui.modalGenerico({
      titulo: titulo,
      corpoHtml:
        '<div class="space-y-3">' +
          '<p class="text-xs text-slate-500">' +
            'Registro gravado pelo banco a cada criação, alteração ou remoção. ' +
            'Não pode ser editado nem apagado pela aplicação.' +
          '</p>' + filtros + corpo +
        '</div>'
    });

    if (comFiltros) filtrarHistorico();
  }

  function abrirHistoricoDaTorre() {
    if (!torreAberta) return;
    var torre = torreAberta;
    ui.processando('Carregando histórico…');
    db.historicoDaTorre(torre.torre_id)
      .then(function (lista) {
        ui.pronto();
        montarHistorico(lista, 'Histórico da torre ' + torre.identificador, false);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /**
   * Histórico da obra inteira, com filtro por pessoa e por trecho.
   *
   * Nasceu preso ao trecho aberto, e com a equipe dividida por trecho cada um
   * via só o próprio trabalho — dava a impressão de que o sistema não registrava
   * o que os outros faziam. Agora o padrão é a obra toda.
   */
  var historicoCarregado = [];

  function abrirHistoricoDoTrecho() {
    ui.processando('Carregando histórico…');
    db.historicoDoTrecho(null, 300)
      .then(function (lista) {
        ui.pronto();
        historicoCarregado = lista;
        montarHistorico(lista, 'Últimas alterações', true, true);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /** Aplica os dois seletores sobre o que já veio do banco. */
  function filtrarHistorico() {
    var quem   = $('histQuem') ? $('histQuem').value : '';
    var trecho = $('histTrecho') ? $('histTrecho').value : '';

    var lista = historicoCarregado.filter(function (h) {
      if (quem && h.quem_nome !== quem) return false;
      if (trecho && h.trecho_id !== trecho) return false;
      return true;
    });

    $('histLista').innerHTML = lista.length
      ? lista.map(function (h) { return linhaHistorico(h, true); }).join('')
      : '<p class="text-sm text-slate-400 italic text-center py-8">' +
        'Nenhuma alteração com esses filtros.</p>';

    $('histContagem').textContent =
      lista.length + (lista.length === 1 ? ' alteração' : ' alterações');
    ui.icones();
  }

  /* ======================================================================== */
  /* PROGRAMAÇÃO EM LOTE                                                      */
  /* ======================================================================== */

  /**
   * Mesma atividade em várias torres, uma data por torre.
   *
   * É o padrão que a própria planilha da ISA mostra: um encarregado pega uma
   * sequência de torres e anda uma por dia — 46/2 segunda, 47/1 terça, 47/2
   * quarta. Fazer isso torre a torre são dez modais.
   *
   * O bloqueio de precedência continua valendo: cada linha é uma programação
   * normal e o banco recusa o que estiver fora de sequência. O que o lote traz é
   * o relato de quais passaram e quais não.
   */
  /* ------------------------------------------- Selecionar pelos cartões --- */

  /**
   * Escolher as torres clicando na grade, em vez de caçar identificador na
   * lista. É a forma natural quando o planejamento está olhando o mapa da linha
   * e decide "essas aqui".
   *
   * Enquanto o modo está ligado, clicar no cartão marca em vez de abrir a torre.
   */
  function alternarModoSelecao() {
    E.modoSelecao = !E.modoSelecao;
    if (!E.modoSelecao) E.selecionadas = {};
    document.body.classList.toggle('modo-selecao', E.modoSelecao);
    if (E.aba !== 'grade') trocarAba('grade');
    render.tudo();
    renderBarraSelecao();
  }

  function alternarTorreSelecionada(torreId) {
    if (E.selecionadas[torreId]) delete E.selecionadas[torreId];
    else E.selecionadas[torreId] = true;
    render.tudo();
    renderBarraSelecao();
  }

  function limparSelecao() {
    E.selecionadas = {};
    render.tudo();
    renderBarraSelecao();
  }

  /** Marca tudo que está visível com os filtros atuais. */
  function selecionarTodasVisiveis() {
    render.torresFiltradas().forEach(function (t) { E.selecionadas[t.torre_id] = true; });
    render.tudo();
    renderBarraSelecao();
  }

  /* ------------------------------------------- Seleção por arrasto -------- */

  /**
   * Marcar torres arrastando pela grade.
   *
   * Uma torre por clique é trinta cliques para uma frente inteira, e dá para
   * pular uma sem perceber. O arrasto pega o trecho contínuo de uma vez, que é
   * como a frente anda em campo.
   *
   * Começa de qualquer lugar da grade, inclusive de cima de um cartão: clico no
   * primeiro, seguro e saio arrastando pelos outros. A primeira versão só
   * começava no vazio, e como os cartões ocupam a grade quase inteira, sobrava
   * só a beirada à direita para pegar.
   *
   * O clique continua existindo: só vira arrasto depois de andar alguns pixels.
   * Soltar sem andar é clique e marca aquela torre, como sempre.
   */
  var laco = null;   // { x0, y0, caixa, jaMarcadas, subtraindo, mexeu }

  function iniciarLaco(ev) {
    if (!E.modoSelecao || ev.button !== 0) return;

    var grade = $('visaoGrade');
    if (!grade || !grade.contains(ev.target)) return;

    // Não sequestra o que já é interativo dentro do cartão
    if (ev.target.closest && ev.target.closest('button, a, input, select')) return;

    ev.preventDefault();

    laco = {
      x0: ev.pageX, y0: ev.pageY, caixa: null,
      // Com Alt o arrasto desmarca em vez de marcar, e as que já estavam
      // marcadas antes do arrasto continuam marcadas nos dois casos.
      subtraindo: ev.altKey,
      jaMarcadas: Object.keys(E.selecionadas).reduce(function (m, id) {
        m[id] = true; return m;
      }, {}),
      // Começou em cima de um cartão: se virar arrasto, ele entra junto mesmo
      // que o ponteiro saia dali antes de eu desenhar o retângulo.
      origem: ev.target.closest ? ev.target.closest('.cartao-torre') : null,
      mexeu: false
    };

    document.addEventListener('mousemove', moverLaco);
    document.addEventListener('mouseup', soltarLaco);
  }

  function moverLaco(ev) {
    if (!laco) return;

    var x = Math.min(laco.x0, ev.pageX), y = Math.min(laco.y0, ev.pageY);
    var l = Math.abs(ev.pageX - laco.x0), a = Math.abs(ev.pageY - laco.y0);

    // Tremida de mão não é arrasto
    if (!laco.mexeu && l < 5 && a < 5) return;

    // O retângulo só nasce quando vira arrasto de verdade. Criar no mousedown
    // deixava um ponto piscando a cada clique simples.
    if (!laco.mexeu) {
      laco.mexeu = true;
      laco.caixa = document.createElement('div');
      laco.caixa.className = 'laco-selecao';
      document.body.appendChild(laco.caixa);

      // O cartão onde o arrasto começou entra junto, mesmo que o ponteiro já
      // tenha saído dele: foi nele que eu cliquei.
      if (laco.origem && !laco.subtraindo) {
        var idOrigem = laco.origem.getAttribute('data-torre');
        if (idOrigem) laco.jaMarcadas[idOrigem] = true;
      }
    }

    laco.caixa.style.left = x + 'px';
    laco.caixa.style.top = y + 'px';
    laco.caixa.style.width = l + 'px';
    laco.caixa.style.height = a + 'px';
    laco.caixa.classList.toggle('laco-tirando', laco.subtraindo);

    // Marca ao vivo: eu vejo o que vai pegar enquanto ainda dá para ajustar
    var area = { x1: x, y1: y, x2: x + l, y2: y + a };
    var mudou = false;

    Array.prototype.forEach.call(
      document.querySelectorAll('#visaoGrade .cartao-torre'), function (el) {
        var id = el.getAttribute('data-torre');
        if (!id) return;

        var r = el.getBoundingClientRect();
        var dentro = !(r.right + window.scrollX  < area.x1 ||
                       r.left  + window.scrollX  > area.x2 ||
                       r.bottom + window.scrollY < area.y1 ||
                       r.top    + window.scrollY > area.y2);

        var deve = laco.subtraindo
          ? (laco.jaMarcadas[id] && !dentro)
          : (laco.jaMarcadas[id] || dentro);

        if (!!E.selecionadas[id] === deve) return;
        if (deve) E.selecionadas[id] = true; else delete E.selecionadas[id];
        el.classList.toggle('cartao-selecionado', deve);
        mudou = true;
      });

    if (mudou) renderBarraSelecao();
  }

  function soltarLaco() {
    if (!laco) return;

    var mexeu = laco.mexeu;
    if (laco.caixa && laco.caixa.parentNode) laco.caixa.parentNode.removeChild(laco.caixa);
    laco = null;

    document.removeEventListener('mousemove', moverLaco);
    document.removeEventListener('mouseup', soltarLaco);

    if (!mexeu) return;

    // Houve arrasto: o clique que vem logo depois é do mesmo gesto e marcaria
    // de novo a torre onde soltei, desfazendo o que o arrasto acabou de fazer.
    arrastou = true;
    setTimeout(function () { arrastou = false; }, 0);

    render.tudo();
    renderBarraSelecao();
  }

  var arrastou = false;

  function renderBarraSelecao() {
    var barra = $('barraSelecao');
    var n = Object.keys(E.selecionadas).length;

    barra.classList.toggle('hidden', !E.modoSelecao);
    if (!E.modoSelecao) return;

    $('contagemSelecao').textContent =
      n ? n + (n === 1 ? ' torre selecionada' : ' torres selecionadas')
        : 'Clique nos cartões para escolher';
    $('btnProgramarSelecao').disabled = !n;
    $('btnEditarSelecao').disabled = !n;
    $('btnApagarSelecao').disabled = !n;
    $('btnLimparSelecao').classList.toggle('hidden', !n);
  }

  /** Abre o lote já com o que está marcado na grade. */
  function programarSelecionadas() {
    var ids = Object.keys(E.selecionadas);
    if (!ids.length) return;

    var torres = ids.map(function (id) {
      return E.torres.find(function (t) { return t.torre_id === id; });
    }).filter(Boolean);

    // Na ordem da linha, que é como a obra anda — e como as datas serão dadas
    torres.sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });

    var h = loteHerdado;
    loteHerdado = null;
    abrirProgramacaoEmLote(
      h ? h.atividadeId : null,
      h ? h.encarregadoId : null,
      h ? h.percentual : 100,
      h ? h.cabo : null,
      torres
    );
  }

  /**
   * Programar as torres marcadas na grade.
   *
   * A janela repete a da programação individual de propósito: quem aprende uma
   * sabe a outra. Em cima, o mesmo formulário — atividades, data, encarregado,
   * percentual. Embaixo, uma linha por torre marcada, com os mesmos valores já
   * preenchidos e livres para ajuste, que é o que permite andar a linha uma torre
   * por dia.
   *
   * Só se chega aqui pela seleção na grade. Escolher torre digitando
   * identificador era um caminho paralelo que ninguém usava e que dava margem a
   * marcar torre errada sem ver.
   */
  /**
   * O lote tem duas listas, e elas não são a mesma coisa.
   *
   * loteTorres é o que marquei na grade. loteLinhas é o que vai virar
   * programação: uma linha para cada torre e cada atividade, com data,
   * encarregado e percentual próprios. Vinte torres e duas atividades são
   * quarenta linhas, e é isso mesmo — são quarenta programações.
   *
   * Antes a data era da torre e a atividade carregava um "+N dias" em cima
   * dela. Ninguém entendia o campo, nem eu.
   */
  var loteTorres = [];         // [{torreId, identificador, data, encarregadoId}]
  var loteLinhas = [];         // [{torreId, identificador, atividadeId, data, encarregadoId, percentual, bloqueio}]
  var loteAtividades = [];     // ids
  var loteUltimoLote = [];     // ids das programações do último lote, para desfazer
  var lotePadrao = { encarregadoId: '', percentual: 100 };

  /** Dia seguinte, pulando domingo, que é DSR. */
  function diaSeguinteUtil(iso) {
    var d = ui.somarDias(ui.paraData(iso), 1);
    while (d.getDay() === 0) d = ui.somarDias(d, 1);
    return ui.iso(d);
  }

  /**
   * Refaz as linhas quando as torres ou as atividades mudam, preservando o que
   * eu já tinha ajustado à mão.
   *
   * A atividade nova nasce no mesmo dia da anterior daquela torre. É o normal
   * da obra: a mesma equipe escava e instala o pré-moldado no mesmo dia, e
   * ainda pode ter gente reaterrando na sequência. Se for para separar, é só
   * mudar a data da linha.
   */
  function sincronizarLinhasLote() {
    var antigas = {};
    loteLinhas.forEach(function (l) { antigas[l.torreId + '|' + l.atividadeId] = l; });

    var novas = [];
    loteTorres.forEach(function (t) {
      var anterior = null;
      loteAtividades.forEach(function (aid) {
        var achada = antigas[t.torreId + '|' + aid];
        if (achada) { novas.push(achada); anterior = achada; return; }

        // t.data e t.encarregadoId só vêm preenchidos quando a torre entrou por
        // uma sequência já programada; pela grade a torre entra sem data.
        var nova = {
          torreId: t.torreId, identificador: t.identificador, atividadeId: aid,
          data: anterior ? anterior.data : (t.data || ''),
          encarregadoId: t.encarregadoId || lotePadrao.encarregadoId,
          percentual: lotePadrao.percentual,
          bloqueio: null
        };
        novas.push(nova);
        anterior = nova;
      });
    });

    loteLinhas = novas;
  }

  /**
   * @param {object} [sequencia] datas e encarregados já prontos por torre, de
   *   uma programação que já existe: { torreId: {data, encarregadoId} }. Vem do
   *   "repetir sequência"; pela grade não vem nada e a torre entra sem data.
   */
  function abrirProgramacaoEmLote(atividadeId, encarregadoId, percentual, cabo,
                                  torresIniciais, sequencia) {
    if (!E.trechoAtual) return;

    var torres = torresIniciais || [];
    if (!torres.length) {
      ui.avisar('Marque as torres na grade primeiro, pelo botão Selecionar.', 'alerta', 5000);
      return;
    }

    var herdado = sequencia || {};

    dataAtividade = {};
    lotePadrao = { encarregadoId: encarregadoId || '', percentual: percentual || 100 };
    loteAtividades = atividadeId ? [atividadeId] : [];
    loteLinhas = [];
    loteTorres = torres.map(function (t) {
      var h = herdado[t.torre_id] || {};
      return {
        torreId: t.torre_id, identificador: t.identificador,
        data: h.data || '', encarregadoId: h.encarregadoId || ''
      };
    });
    sincronizarLinhasLote();

    var opcoesEnc = E.encarregados.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.nome) + '</option>';
    }).join('');

    var corpo =
      '<div class="space-y-4">' +

        '<p class="text-xs" style="color:var(--texto-fraco)">' +
          'O que você preencher aqui vale para as <strong>' + loteTorres.length +
          '</strong> torres marcadas. Cada atividade vira uma linha ali embaixo, com data, encarregado e percentual próprios.' +
        '</p>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div class="sm:col-span-2">' +
            '<label class="rotulo">Atividade</label>' +
            '<div class="combo">' +
              '<div id="chipsAtividadeLote" class="chips-escolhidos"></div>' +
              '<input id="buscaAtividadeLote" class="campo" autocomplete="off" ' +
                     'placeholder="Buscar atividade…" ' +
                     'oninput="SIPAV.app.filtrarAtividadesLote()" ' +
                     'onfocus="SIPAV.app.filtrarAtividadesLote()" ' +
                     'onkeydown="SIPAV.app.teclaAtividadeLote(event)">' +
              '<div id="listaAtividadesLote" class="combo-lista hidden"></div>' +
            '</div>' +
          '</div>' +

          '<div>' +
            '<label class="rotulo">Data</label>' +
            '<input id="loteBase" type="date" class="campo" value="' + ui.hoje() + '" ' +
                   'onchange="SIPAV.app.mudarDataBaseLote()">' +
            '<p id="loteDiaSemana" class="dia-semana"></p>' +
            // As três formas de preencher as datas, no mesmo lugar. A terceira é
            // o antigo "repetir sequência": era um caminho separado, começando
            // por uma atividade antiga para chegar numa nova, e ninguém entendia
            // de onde vinham as torres. Aqui as torres são as que eu marquei.
            '<div class="flex flex-wrap gap-1 mt-1">' +
              '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                      'onclick="SIPAV.app.distribuirLote(false)">Mesma data em todas</button>' +
              '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                      'onclick="SIPAV.app.distribuirLote(true)">Uma torre por dia</button>' +
              // Lista suspensa, não janela: a janela do lote é o modalGenerico, e
              // abrir outra por cima come a de trás.
              '<span class="combo" style="display:inline-block">' +
                '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                        'onclick="SIPAV.app.abrirCopiarDatas()">Copiar de outra atividade…</button>' +
                '<div id="listaCopiarDatas" class="combo-lista hidden" style="min-width:260px"></div>' +
              '</span>' +
            '</div>' +
          '</div>' +

          '<div>' +
            '<label class="rotulo">Percentual da torre</label>' +
            '<div class="flex items-center gap-2">' +
              '<input id="lotePercentual" type="number" min="1" max="100" step="1" class="campo" ' +
                     'value="' + (percentual || 100) + '" ' +
                     'onchange="SIPAV.app.aplicarPercentualLote()">' +
              '<span class="text-sm font-semibold shrink-0" style="color:var(--texto-fraco)">%</span>' +
            '</div>' +
          '</div>' +

          '<div class="sm:col-span-2">' +
            '<label class="rotulo">Encarregado</label>' +
            '<select id="loteEncarregado" class="campo" ' +
                    'onchange="SIPAV.app.aplicarEncarregadoLote()">' +
              '<option value="">— sem encarregado —</option>' + opcoesEnc +
            '</select>' +
          '</div>' +

          '<div id="loteBlocoCabo" class="hidden sm:col-span-2">' +
            '<label class="rotulo">Cabo</label>' +
            '<select id="loteCabo" class="campo">' + htmlOpcoesDeCabo(cabo) + '</select>' +
          '</div>' +
        '</div>' +

        // Um campo só para o lote inteiro: o motivo de programar para o passado
        // costuma ser o mesmo para todas ("lançamento atrasado da semana 39").
        // Fica fora da lista que se redesenha, então o que eu escrevi não some
        // quando eu mexo numa data.
        '<div id="loteAvisoData" class="hidden rounded-lg border border-amber-300 bg-amber-50 p-3">' +
          '<div class="flex gap-2">' +
            '<i data-lucide="history" class="w-4 h-4 text-amber-600 shrink-0 mt-0.5"></i>' +
            '<div class="flex-1">' +
              '<p id="loteTextoData" class="text-sm text-amber-800"></p>' +
              '<input id="loteJustificativa" class="campo mt-2" autocomplete="off" ' +
                     'placeholder="Por que está programando para o passado? (fica registrado)">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pt-3" style="border-top:1px solid var(--borda)">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
            '<label class="rotulo" style="margin-bottom:0">O que vai ser programado</label>' +
            '<div class="flex items-center gap-2">' +
              '<button id="btnConferirLote" class="btn-secundario" ' +
                      'style="font-size:.6875rem;padding:.25rem .5rem" ' +
                      'onclick="SIPAV.app.conferirLote()">Conferir sequência</button>' +
              '<span id="loteResumo" class="resumo"></span>' +
            '</div>' +
          '</div>' +
          '<div id="loteEscolhidas"></div>' +
        '</div>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Programar ' + loteTorres.length + ' torres — ' + E.trechoAtual.nome,
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Programar', classe: 'btn-primario', acao: gravarLote }
      ]
    });

    renderChipsAtividadeLote();
    mudarDataBaseLote();
    renderLoteEscolhidas();
  }

  /** Abre o lote herdando tudo de uma programação que já existe. */
  function copiarParaOutrasTorres(id) {
    var p = E.programacoes.find(function (x) { return x.id === id; });
    if (!p) return;
    ui.fecharModal('modalProgramacao');
    ui.avisar('Marque na grade as torres que vão receber esta atividade.', 'info', 6000);
    if (!E.modoSelecao) alternarModoSelecao();
    loteHerdado = {
      atividadeId: p.atividade ? p.atividade.id : null,
      encarregadoId: p.encarregado ? p.encarregado.id : null,
      percentual: p.percentual, cabo: p.cabo
    };
  }

  var loteHerdado = null;

  /* ------------------------------------------- Copiar datas de outra ------ */

  /**
   * Preenche as datas do lote com as de outra atividade, nas mesmas torres.
   *
   * Do Alessandro: quando tem escavação, aproveita a mesma sequência de torres
   * por dia para instalar o pré-moldado. Montar a distribuição de uma semana
   * leva tempo — torre por torre, dia por dia — e remontar na mão é onde o erro
   * entra: uma torre fora do dia certo e a equipe viaja à toa.
   *
   * Isto já foi um caminho separado, "repetir uma sequência", começando pela
   * atividade antiga para chegar na nova. Ninguém entendia de onde saíam as
   * torres, nem eu. Agora é só mais um jeito de preencher a data, ao lado dos
   * outros dois, e as torres são as que eu marquei na grade.
   */
  function datasDisponiveisParaCopiar() {
    var doLote = {};
    loteTorres.forEach(function (t) { doLote[t.torreId] = true; });

    var porAtividade = {};

    E.programacoes.forEach(function (p) {
      if (!p.atividade || !p.torre || !p.data) return;
      if (!doLote[p.torre.id]) return;
      if (loteAtividades.indexOf(p.atividade.id) !== -1) return;   // ela mesma não

      var g = porAtividade[p.atividade.id];
      if (!g) g = porAtividade[p.atividade.id] = { atividade: p.atividade, torres: {}, quantas: 0 };

      var atual = g.torres[p.torre.id];
      if (atual) {
        // Lançada duas vezes na torre, percentual dividido em dois dias. Vale a
        // data mais cedo: é quando a equipe entrou naquela torre.
        if (p.data < atual.data) {
          atual.data = p.data;
          atual.encarregadoId = p.encarregado ? p.encarregado.id : '';
        }
        return;
      }

      g.torres[p.torre.id] = {
        data: p.data,
        encarregadoId: p.encarregado ? p.encarregado.id : ''
      };
      g.quantas++;
    });

    return Object.keys(porAtividade).map(function (id) {
      var g = porAtividade[id];
      var datas = Object.keys(g.torres).map(function (t) { return g.torres[t].data; }).sort();
      g.de = datas[0];
      g.ate = datas[datas.length - 1];
      return g;
    }).sort(function (a, b) {
      return (a.atividade.ordem_execucao || 0) - (b.atividade.ordem_execucao || 0);
    });
  }

  function abrirCopiarDatas() {
    var grupos = datasDisponiveisParaCopiar();

    if (!grupos.length) {
      ui.avisar('Nenhuma outra atividade programada nestas torres, no período exibido.',
                'alerta', 6000);
      return;
    }

    var caixa = $('listaCopiarDatas');
    if (!caixa) return;

    // Já aberta, o mesmo clique fecha
    if (!caixa.classList.contains('hidden')) {
      caixa.classList.add('hidden');
      return;
    }

    caixa.innerHTML =
      '<p class="text-xs px-2 py-1.5" style="color:var(--texto-fraco)">' +
        'Cada torre recebe a data que já tem nessa atividade. O encarregado vem ' +
        'junto; o percentual não muda.' +
      '</p>' +
      grupos.map(function (g) {
        var cor = g.atividade.cor_fundo || '#94A3B8';
        var faltam = loteTorres.length - g.quantas;
        return '<button type="button" class="seq-item" ' +
                 'onmousedown="SIPAV.app.copiarDatasDe(\'' + g.atividade.id + '\')">' +
                 '<span class="seq-ativ" style="background:' + cor + ';color:' +
                   ui.corDoTexto(cor) + '">' + esc(g.atividade.nome) + '</span>' +
                 '<span class="seq-resumo">' +
                   g.quantas + ' de ' + loteTorres.length + ' torre(s) · ' +
                   esc(ui.dataCurta(g.de)) +
                   (g.de === g.ate ? '' : ' a ' + esc(ui.dataCurta(g.ate))) +
                   (faltam ? ' · ' + faltam + ' sem data' : '') +
                 '</span>' +
               '</button>';
      }).join('');

    caixa.classList.remove('hidden');
  }

  function copiarDatasDe(atividadeId) {
    var g = datasDisponiveisParaCopiar().find(function (x) {
      return x.atividade.id === atividadeId;
    });
    if (!g) { ui.avisar('Atividade não encontrada.', 'erro'); return; }

    var semData = [];

    loteLinhas.forEach(function (l) {
      var h = g.torres[l.torreId];
      if (!h) {
        // Torre marcada que não tem a atividade de origem. Fica como está, e eu
        // digo quais são — sumir com elas seria pior.
        if (!l.data && semData.indexOf(l.identificador) === -1) semData.push(l.identificador);
        return;
      }
      l.data = h.data;
      if (h.encarregadoId) l.encarregadoId = h.encarregadoId;
      l.bloqueio = null;
    });

    $('listaCopiarDatas').classList.add('hidden');
    renderLoteEscolhidas();

    ui.avisar(semData.length
      ? 'Datas copiadas. Sem ' + g.atividade.nome + ': ' + semData.join(', ') +
        ' — preencha a data dessas na mão.'
      : 'Datas de ' + g.atividade.nome + ' copiadas.',
      semData.length ? 'alerta' : 'sucesso', semData.length ? 8000 : 4000);
  }

  /* --------------------------------------------- Atividades do lote ------- */

  function renderChipsAtividadeLote() {
    $('chipsAtividadeLote').innerHTML = loteAtividades.map(function (id) {
      var a = E.atividades.find(function (x) { return x.id === id; });
      if (!a) return '';
      var cor = a.cor_fundo || '#94A3B8';
      return '<span class="chip-escolhido" style="background:' + cor + ';color:' +
               ui.corDoTexto(cor) + '">' + esc(a.nome) +
               '<button type="button" onclick="SIPAV.app.tirarAtividadeLote(\'' + id + '\')" ' +
               'title="Tirar">&times;</button>' +
             '</span>';
    }).join('');

    $('buscaAtividadeLote').placeholder = loteAtividades.length
      ? 'Adicionar outra atividade…' : 'Buscar atividade…';

    var precisa = loteAtividades.some(pedeCabo);
    $('loteBlocoCabo').classList.toggle('hidden', !precisa);
    if (!precisa) $('loteCabo').value = '';

    // Trocar a atividade invalida a conferência anterior
    sincronizarLinhasLote();
    loteLinhas.forEach(function (x) { x.bloqueio = null; });
    renderLoteEscolhidas();
    conferirLoteAoVivo();
  }

  function filtrarAtividadesLote() {
    var termo = normalizar(($('buscaAtividadeLote').value || '').trim());
    var lista = E.atividades.filter(function (a) {
      if (loteAtividades.indexOf(a.id) !== -1) return false;
      return !termo || normalizar(a.nome).indexOf(termo) !== -1;
    });

    $('listaAtividadesLote').innerHTML = lista.length
      ? lista.map(function (a) {
          var cor = a.cor_fundo || '#94A3B8';
          return '<button type="button" class="combo-item" ' +
                 'onmousedown="SIPAV.app.escolherAtividadeLote(\'' + a.id + '\')">' +
                 '<span class="ponto-atividade" style="background:' + cor + '"></span>' +
                 esc(a.nome) + '</button>';
        }).join('')
      : '<p class="px-3 py-2 text-xs" style="color:var(--texto-fraco)">' +
        (loteAtividades.length ? 'Todas já escolhidas' : 'Nenhuma atividade com esse nome') + '</p>';

    $('listaAtividadesLote').classList.remove('hidden');
  }

  function escolherAtividadeLote(id) {
    if (loteAtividades.indexOf(id) === -1) loteAtividades.push(id);
    $('buscaAtividadeLote').value = '';
    $('listaAtividadesLote').classList.add('hidden');
    renderChipsAtividadeLote();
  }

  function tirarAtividadeLote(id) {
    loteAtividades = loteAtividades.filter(function (x) { return x !== id; });
    renderChipsAtividadeLote();
  }

  function teclaAtividadeLote(ev) {
    var itens = $('listaAtividadesLote').querySelectorAll('.combo-item');
    if (ev.key === 'Escape') { $('listaAtividadesLote').classList.add('hidden'); return; }

    if (ev.key === 'Backspace' && !$('buscaAtividadeLote').value && loteAtividades.length) {
      ev.preventDefault();
      tirarAtividadeLote(loteAtividades[loteAtividades.length - 1]);
      return;
    }
    if (ev.key === 'Enter' && itens.length) {
      ev.preventDefault();
      itens[0].dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  /* ----------------------------------------------- Preencher em massa ----- */

  /**
   * Data no passado é legítima quando se está arrumando o registro, mas o banco
   * exige dizer por quê — é a primeira coisa que a fiscalização pergunta.
   *
   * Isto aqui já foi um aviso que dizia "tudo bem, confira antes de gravar", e
   * o banco recusava do mesmo jeito, sem nenhum campo para explicar. O aviso
   * prometia o que a regra não deixava. Agora o campo está aqui, na hora.
   */
  function avisarDataPassada(datas) {
    var passadas = datasNoPassado(datas);
    var caixa = $('loteAvisoData');
    if (!caixa) return;

    if (!passadas.length) {
      caixa.classList.add('hidden');
      $('loteJustificativa').value = '';
      return;
    }

    var maisAntiga = passadas.slice().sort()[0];
    $('loteTextoData').textContent =
      passadas.length + (passadas.length === 1 ? ' data já passou' : ' datas já passaram') +
      ', a mais antiga é ' + ui.dataCurta(maisAntiga) + ' (' + ui.diaDaSemana(maisAntiga) +
      '). Diga o motivo — vale para todas as que estão no passado.';
    caixa.classList.remove('hidden');
    ui.icones();
  }

  function mudarDataBaseLote() {
    var iso = $('loteBase').value;
    var campo = $('loteDiaSemana');
    if (campo) {
      if (!iso) { campo.textContent = ''; campo.className = 'dia-semana'; }
      else {
        var domingo = ui.paraData(iso).getDay() === 0;
        campo.textContent = ui.diaDaSemana(iso) + (domingo ? ' · DSR na planilha' : '');
        campo.className = 'dia-semana' + (ui.fimDeSemana(iso) ? ' fim-de-semana' : '');
      }
    }
    renderLoteEscolhidas();
  }

  /**
   * Espalha a data base pelas linhas.
   *
   * @param {boolean} sequencial uma torre por dia útil, em vez de todas juntas
   *
   * As atividades da mesma torre ficam todas no mesmo dia: escavar e instalar o
   * pré-moldado no mesmo dia é o normal. Quem quiser separar muda a data da
   * linha, que está ali do lado.
   */
  function distribuirLote(sequencial) {
    var base = $('loteBase').value;
    if (!base) { ui.avisar('Informe a data.', 'alerta'); return; }

    var dia = base;

    loteTorres.forEach(function (t, i) {
      if (sequencial && i > 0) dia = diaSeguinteUtil(dia);

      loteLinhas.filter(function (l) { return l.torreId === t.torreId; })
        .forEach(function (l) {
          l.data = dia;
          l.bloqueio = null;
        });
    });

    renderLoteEscolhidas();
    conferirLoteAoVivo();
  }

  function aplicarEncarregadoLote() {
    var id = $('loteEncarregado').value;
    lotePadrao.encarregadoId = id;
    loteLinhas.forEach(function (x) { x.encarregadoId = id; });
    renderLoteEscolhidas();
  }

  function percentualPadraoLote() {
    var v = Number($('lotePercentual') ? $('lotePercentual').value : 100);
    return (v > 0 && v <= 100) ? v : 100;
  }

  function aplicarPercentualLote() {
    var campo = $('lotePercentual');
    var v = Number(campo.value);
    if (!(v > 0 && v <= 100)) {
      ui.avisar('O percentual tem que ficar entre 1 e 100.', 'alerta');
      campo.value = 100;
      v = 100;
    }
    lotePadrao.percentual = v;
    loteLinhas.forEach(function (x) { x.percentual = v; });
    renderLoteEscolhidas();
  }

  /* ------------------------------------------------- Linha por linha ------ */

  function linhaLote(i) {
    return loteLinhas[Number(i)] || null;
  }

  function mudarDataLote(i, valor) {
    var x = linhaLote(i);
    if (x) { x.data = valor; x.bloqueio = null; renderLoteEscolhidas(); conferirLoteAoVivo(); }
  }

  function mudarEncarregadoLote(i, valor) {
    var x = linhaLote(i);
    if (x) x.encarregadoId = valor;
  }

  /**
   * Passar de 100% não é aviso, é recusa: a soma dos percentuais vira a coluna
   * TOTAL do relatório da ISA, e torre e meia não existe.
   */
  function mudarPercentualLote(i, valor, campo) {
    var v = Number(valor);
    var x = linhaLote(i);
    if (!x) return;

    if (!(v > 0 && v <= 100)) {
      ui.avisar('O percentual tem que ficar entre 1 e 100.', 'alerta');
      if (campo) campo.value = x.percentual || 100;
      return;
    }
    x.percentual = v;
    renderLoteEscolhidas();
  }

  /**
   * Tira uma linha. Se era a última daquela torre, a torre sai da marcação da
   * grade junto — senão ela ficaria marcada lá fora sem nada para gravar.
   */
  function removerLinhaLote(i) {
    var x = linhaLote(i);
    if (!x) return;

    loteLinhas.splice(Number(i), 1);

    var sobrou = loteLinhas.some(function (l) { return l.torreId === x.torreId; });
    if (!sobrou) {
      loteTorres = loteTorres.filter(function (t) { return t.torreId !== x.torreId; });
      delete E.selecionadas[x.torreId];
    }

    if (!loteTorres.length) {
      ui.fecharModal('modalGenerico');
      ui.avisar('Nenhuma torre sobrou no lote.', 'info');
      render.tudo(); renderBarraSelecao();
      return;
    }
    renderLoteEscolhidas();
  }

  /**
   * Uma linha por torre e atividade — é uma linha por programação que vai ser
   * criada. O identificador só aparece na primeira linha de cada torre: repetir
   * "46/1" quatro vezes seguidas só atrapalha a leitura.
   */
  function renderLoteEscolhidas() {
    var caixa = $('loteEscolhidas');
    if (!caixa) return;

    var travadas = loteLinhas.filter(function (x) { return x.bloqueio; }).length;

    $('loteResumo').textContent = loteAtividades.length
      ? loteTorres.length + ' × ' + loteAtividades.length + ' = ' +
        loteLinhas.length + ' programações'
      : loteTorres.length + ' torre(s) · escolha a atividade';

    avisarDataPassada(loteLinhas.map(function (x) { return x.data; }));

    if (!loteAtividades.length) {
      caixa.innerHTML =
        '<p class="text-xs py-3 text-center" style="color:var(--texto-fraco)">' +
          loteTorres.map(function (t) { return esc(t.identificador); }).join(', ') +
        '</p>';
      return;
    }

    var opcoesEnc = E.encarregados.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.nome) + '</option>';
    }).join('');

    var torreAnterior = null;

    caixa.innerHTML =
      '<div class="space-y-1 max-h-72 overflow-y-auto barra-fina">' +
      loteLinhas.map(function (x, i) {
        var a = E.atividades.find(function (y) { return y.id === x.atividadeId; });
        var cor = a && a.cor_fundo ? a.cor_fundo : '#94A3B8';
        var primeira = x.torreId !== torreAnterior;
        torreAnterior = x.torreId;

        var dia = x.data ? ui.diaDaSemana(x.data) : '';
        var fds = x.data && ui.fimDeSemana(x.data);
        var passada = x.data && x.data < ui.hoje();

        return '<div class="lote-linha' + (x.bloqueio ? ' lote-travada' : '') +
                          (primeira ? ' lote-torre-nova' : '') + '">' +
          '<span class="lote-id">' + (primeira ? esc(x.identificador) : '') + '</span>' +
          '<span class="lote-ativ" style="background:' + cor + ';color:' +
            ui.corDoTexto(cor) + '">' + esc(a ? a.nome : '—') + '</span>' +
          '<input type="date" class="campo lote-campo' + (passada ? ' lote-passada' : '') + '" ' +
                 'style="width:130px" value="' + (x.data || '') + '" ' +
                 'onchange="SIPAV.app.mudarDataLote(' + i + ', this.value)">' +
          '<span class="lote-dia' + (fds ? ' fim-de-semana' : '') + '">' +
            esc(dia.slice(0, 3)) + '</span>' +
          '<select class="campo lote-campo lote-enc" style="width:140px" ' +
                  'onchange="SIPAV.app.mudarEncarregadoLote(' + i + ', this.value)">' +
            '<option value="">— sem encarregado —</option>' + opcoesEnc +
          '</select>' +
          '<span class="lote-pct">' +
            '<input type="number" min="1" max="100" step="1" class="campo lote-campo" ' +
                   'style="width:52px;text-align:right" value="' + (x.percentual || 100) + '" ' +
                   'onchange="SIPAV.app.mudarPercentualLote(' + i + ', this.value, this)">' +
            '<span>%</span>' +
          '</span>' +
          '<button class="lote-remover" onclick="SIPAV.app.removerLinhaLote(' + i + ')" ' +
                  'title="Tirar do lote">&times;</button>' +
          (x.bloqueio
            ? '<p class="lote-motivo">' + esc(x.bloqueio) + '</p>'
            : '') +
        '</div>';
      }).join('') + '</div>' +
      (travadas
        ? '<p class="text-xs mt-2 text-rose-500 font-semibold">' + travadas +
          ' lançamento(s) fora da sequência. Tire da lista ou programe um a um, ' +
          'pelo cartão, com a justificativa.</p>'
        : '');

    Array.prototype.forEach.call(caixa.querySelectorAll('.lote-enc'), function (sel, i) {
      sel.value = loteLinhas[i] ? (loteLinhas[i].encarregadoId || '') : '';
    });
  }

  /**
   * Pergunta a precedência ao banco ANTES de gravar.
   *
   * Sem isto só se descobre o bloqueio depois de já ter gravado metade, e quem
   * está lançando não sabe o que fez de errado — o que é justamente o perfil do
   * supervisor que vai pré-programar.
   */
  function conferirLote() {
    if (!loteAtividades.length) {
      ui.avisar('Escolha a atividade antes de conferir.', 'alerta');
      return;
    }
    var semData = loteLinhas.filter(function (x) { return !x.data; });
    if (semData.length) { ui.avisar('Informe as datas antes de conferir.', 'alerta'); return; }

    ui.processando('Conferindo a sequência…');

    conferirLinhasLote()
      .then(function () {
        ui.pronto();
        renderLoteEscolhidas();
        var travadas = loteLinhas.filter(function (y) { return y.bloqueio; }).length;
        ui.avisar(travadas
          ? travadas + ' lançamento(s) fora da sequência — veja o motivo em cada linha.'
          : 'Sequência conferida: todos liberados.', travadas ? 'alerta' : 'sucesso', 5000);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /** Pergunta o bloqueio de cada linha. Sem mexer na tela: quem chama decide. */
  function conferirLinhasLote() {
    var desta = ++versaoConferencia;

    return Promise.all(loteLinhas.map(function (x) {
      return db.motivoBloqueio(x.torreId, x.atividadeId, x.data)
        .catch(function () { return null; })
        .then(function (motivo) {
          // Trocou de atividade no meio da consulta: a resposta velha não vale
          if (desta !== versaoConferencia) return;
          x.bloqueio = motivo || null;
        });
    }));
  }

  var versaoConferencia = 0;
  var timerConferencia = null;

  /**
   * Confere sozinho, logo depois de eu mexer.
   *
   * Antes eu só descobria o que não ia entrar depois de clicar em Programar e
   * ler o relatório do que falhou — perdia o lançamento inteiro e voltava para
   * o começo. Agora a linha fica vermelha com o motivo enquanto eu ainda estou
   * montando o lote.
   *
   * Espera meio segundo porque o ajuste vem em rajada: escolhi a atividade,
   * mudei a data, apliquei o encarregado. Sem isso seriam três rodadas de
   * consulta ao banco para cada mexida.
   */
  function conferirLoteAoVivo() {
    clearTimeout(timerConferencia);

    if (!loteAtividades.length || !loteLinhas.length) return;
    if (loteLinhas.some(function (x) { return !x.data; })) return;

    timerConferencia = setTimeout(function () {
      conferirLinhasLote().then(function () {
        // A janela pode ter sido fechada enquanto a consulta ia e voltava
        if ($('loteEscolhidas')) renderLoteEscolhidas();
      });
    }, 500);
  }

  /**
   * Grava uma a uma, de propósito.
   *
   * Um insert em bloco seria mais rápido, mas o trigger de precedência recusa a
   * linha inteira e não dá para saber qual travou. Assim cada uma responde por si
   * e o relato no fim diz exatamente o que não entrou e por quê.
   */
  function gravarLote() {
    if (!loteAtividades.length) {
      ui.avisar('Escolha pelo menos uma atividade.', 'alerta');
      $('buscaAtividadeLote').focus();
      return;
    }

    var semData = loteLinhas.filter(function (x) { return !x.data; });
    if (semData.length) {
      ui.avisar(semData.length + ' lançamento(s) sem data.', 'alerta');
      return;
    }

    var cabo = $('loteCabo') ? ($('loteCabo').value || null) : null;
    if (loteAtividades.some(pedeCabo) && !cabo) {
      ui.avisar('Escolha o cabo: ' + textoDasOpcoesDeCabo() + '.', 'alerta');
      $('loteCabo').focus();
      return;
    }

    // Data que já passou: o banco recusa sem justificativa. Cobro aqui, antes de
    // gravar, e não deixo o servidor recusar uma a uma depois de eu ter clicado.
    var justRetro = $('loteJustificativa').value.trim();
    var linhasNoPassado = loteLinhas.filter(function (x) { return x.data < ui.hoje(); });

    if (linhasNoPassado.length && !justRetro) {
      ui.avisar(linhasNoPassado.length + ' lançamento(s) estão no passado. ' +
                'Diga o motivo antes de programar.', 'alerta', 6000);
      $('loteJustificativa').focus();
      return;
    }

    var situacao = E.perfil.papel === 'SUPERVISOR' ? 'SOLICITADA' : 'APROVADA';

    // Em ordem de data e, no mesmo dia, de ordem de execução: o gatilho pede o
    // pré-requisito já gravado. Com as duas na mesma data, quem chega primeiro
    // é o que decide se a segunda passa.
    var tarefas = loteLinhas.slice().sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return ordemDaAtividade(a.atividadeId) - ordemDaAtividade(b.atividadeId);
    });

    ui.processando('Programando ' + tarefas.length + ' lançamento(s)…');

    var ok = [], falhou = [], ids = [];

    tarefas.reduce(function (antes, t) {
      return antes.then(function () {
        var a = E.atividades.find(function (y) { return y.id === t.atividadeId; });
        var rotulo = t.identificador + ' · ' + (a ? a.nome : '');
        return db.criarProgramacao({
          torreId: t.torreId,
          atividadeId: t.atividadeId,
          encarregadoId: t.encarregadoId || null,
          data: t.data,
          percentual: t.percentual || 100,
          cabo: pedeCabo(t.atividadeId) ? cabo : null,
          // Só nas linhas cuja data passou; as futuras seguem sem
          justificativaRetroativa: t.data < ui.hoje() ? justRetro : null,
          situacao: situacao
        })
          .then(function (nova) { ok.push(rotulo); if (nova && nova.id) ids.push(nova.id); })
          .catch(function (e) { falhou.push({ torre: rotulo, motivo: e.message }); });
      });
    }, Promise.resolve())
      .then(recarregarProgramacoes)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        loteUltimoLote = ids;
        if (E.modoSelecao) limparSelecao();
        relatarLote(ok, falhou);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /** Apaga o que o último lote criou. Errar 15 de uma vez tem que sair barato. */
  function desfazerUltimoLote() {
    if (!loteUltimoLote.length) return;
    var quantos = loteUltimoLote.length;

    ui.confirmar('Desfazer o lote',
      'Apaga as ' + quantos + ' programações que acabaram de ser criadas. ' +
      'O histórico guarda o registro da remoção.', 'Desfazer')
      .then(function (sim) {
        if (!sim) return;
        ui.processando('Desfazendo…');
        return loteUltimoLote.reduce(function (antes, id) {
          return antes.then(function () {
            return db.removerProgramacao(id).catch(function () { /* já pode ter sumido */ });
          });
        }, Promise.resolve())
          .then(recarregarProgramacoes)
          .then(function () {
            loteUltimoLote = [];
            ui.pronto();
            ui.fecharModal('modalGenerico');
            ui.avisar(quantos + ' programação(ões) desfeita(s).', 'sucesso');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function relatarLote(ok, falhou) {
    var botoes = [{ rotulo: 'Fechar', classe: 'btn-secundario' }];
    if (loteUltimoLote.length) {
      botoes.push({ rotulo: 'Desfazer', classe: 'btn-perigo', acao: desfazerUltimoLote });
    }

    if (!falhou.length) {
      ui.modalGenerico({
        titulo: 'Programação em lote',
        corpoHtml:
          '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3">' +
            '<p class="text-sm font-semibold text-emerald-800">' +
              ok.length + ' lançamento(s) programado(s)</p>' +
            '<p class="text-xs text-emerald-800 mt-1">' + esc(ok.join(' · ')) + '</p>' +
            '<p class="text-xs text-emerald-700 mt-2">' +
              'Se algo saiu errado, o botão Desfazer apaga tudo de uma vez.</p>' +
          '</div>',
        botoes: botoes
      });
      return;
    }

    ui.modalGenerico({
      titulo: 'Programação em lote',
      corpoHtml:
        '<div class="space-y-2">' +
          (ok.length
            ? '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3">' +
                '<p class="text-sm font-semibold text-emerald-800">' + ok.length + ' programado(s)</p>' +
                '<p class="text-xs text-emerald-800 mt-1">' + esc(ok.join(' · ')) + '</p>' +
              '</div>'
            : '') +
          '<div class="rounded-lg border border-rose-200 bg-rose-50 p-3">' +
            '<p class="text-sm font-semibold text-rose-800">' + falhou.length + ' não entrou</p>' +
            '<div class="text-xs text-rose-800 mt-1 space-y-1">' +
              falhou.map(function (f) {
                return '<p><strong>' + esc(f.torre) + '</strong> — ' + esc(f.motivo) + '</p>';
              }).join('') +
            '</div>' +
            '<p class="text-xs text-rose-700 mt-2">' +
              'Quase sempre é precedência. O botão <strong>Conferir sequência</strong> mostra ' +
              'isso antes de gravar. Para forçar, programe uma a uma pelo cartão da torre, ' +
              'com a justificativa.' +
            '</p>' +
          '</div>' +
        '</div>',
      botoes: botoes
    });
  }

  /* ========================================================================= */
  /* APAGAR PELOS PAINÉIS                                                      */
  /* ========================================================================= */

  /**
   * Apagar onde eu estou olhando.
   *
   * Nos painéis por data e por encarregado a programação errada salta aos olhos
   * — está ali, no dia errado ou com a equipe errada. Até agora, para apagar,
   * era preciso decorar de que torre ela era, voltar para a grade, achar a
   * torre e abrir. A lixeira fica no próprio chip.
   *
   * A seleção em massa só liga no "Selecionar vários" lá em cima. Enquanto
   * desmarcado o clique no chip continua abrindo a torre, como sempre — quem
   * não liga não vê diferença nenhuma.
   */
  function alternarSelecaoProgramacoes(ligado) {
    E.modoSelecaoProg = !!ligado;
    E.progSelecionadas = {};

    var check = $('checkSelecaoProg');
    if (check) check.checked = E.modoSelecaoProg;

    render.tudo();
    renderBarraSelecaoProg();
  }

  function alternarProgramacaoMarcada(id) {
    if (E.progSelecionadas[id]) delete E.progSelecionadas[id];
    else E.progSelecionadas[id] = true;

    render.tudo();
    renderBarraSelecaoProg();
  }

  function limparSelecaoProgramacoes() {
    E.progSelecionadas = {};
    render.tudo();
    renderBarraSelecaoProg();
  }

  /** Só as que estão na tela: as que o filtro escondeu não entram. */
  function marcarTodasProgramacoesVisiveis() {
    render.programacoesVisiveis().forEach(function (p) {
      E.progSelecionadas[p.id] = true;
    });
    render.tudo();
    renderBarraSelecaoProg();
  }

  function renderBarraSelecaoProg() {
    var barra = $('barraSelecaoProg');
    if (!barra) return;

    var n = Object.keys(E.progSelecionadas).length;

    barra.classList.toggle('hidden', !E.modoSelecaoProg);
    if (!E.modoSelecaoProg) return;

    $('contagemSelecaoProg').textContent = n
      ? n + (n === 1 ? ' programação marcada' : ' programações marcadas')
      : 'Clique nas programações para marcar';

    $('btnApagarSelecaoProg').disabled = !n;
    $('btnApagarSelecaoProg').textContent = n ? 'Apagar ' + n : 'Apagar';
    $('btnLimparSelecaoProg').classList.toggle('hidden', !n);
  }

  /** A lixeira do chip. Uma só, com a pergunta dizendo exatamente qual é. */
  function apagarUmaProgramacao(id) {
    var p = E.programacoes.find(function (x) { return x.id === id; });
    if (!p) return;

    var descricao = (p.atividade ? p.atividade.nome : 'programação') +
      ' da torre ' + (p.torre ? p.torre.identificador : '?') +
      ' em ' + ui.dataCurta(p.data) +
      (p.encarregado ? ', com ' + p.encarregado.nome : '');

    ui.confirmar('Apagar programação',
      'Apaga ' + descricao + '. Não tem desfazer — o histórico guarda quem ' +
      'apagou, mas a programação some da grade.', 'Apagar')
      .then(function (sim) {
        if (!sim) return;

        ui.processando('Apagando…');
        return db.removerProgramacao(id)
          .then(recarregarProgramacoes)
          .then(function () {
            ui.pronto();
            delete E.progSelecionadas[id];
            renderBarraSelecaoProg();
            ui.avisar('Programação apagada.', 'sucesso');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /** As marcadas nos painéis, com a lista inteira à vista antes de confirmar. */
  /** As marcadas nos painéis, com a lista inteira à vista antes de confirmar. */
  function apagarProgramacoesMarcadas() {
    var ids = Object.keys(E.progSelecionadas);
    if (!ids.length) { ui.avisar('Marque pelo menos uma programação.', 'alerta'); return; }

    var alvo = ordenarParaApagar(E.programacoes.filter(function (p) {
      return E.progSelecionadas[p.id];
    }));

    if (!alvo.length) {
      // Marcada e depois some do período por um filtro: nada a fazer
      E.progSelecionadas = {};
      renderBarraSelecaoProg();
      ui.avisar('As programações marcadas não estão mais no período exibido.', 'alerta', 6000);
      return;
    }

    abrirJanelaApagar(alvo, 'Apagar ' + alvo.length + ' programação(ões)');
  }

  /* ------------------------------------ Apagar das torres marcadas -------- */

  /**
   * Apaga a programação das torres marcadas na grade.
   *
   * Existia escondido dentro do "Editar em lote", como "remover marcadas". Quem
   * quer apagar não abre uma janela chamada Editar para procurar — então virou
   * botão próprio, ao lado dos outros.
   */
  function apagarProgramacoesSelecionadas() {
    var ids = Object.keys(E.selecionadas);
    if (!ids.length) { ui.avisar('Marque as torres na grade primeiro.', 'alerta'); return; }

    var marcadas = {};
    ids.forEach(function (id) { marcadas[id] = true; });

    var alvo = ordenarParaApagar(E.programacoes.filter(function (p) {
      return p.torre && marcadas[p.torre.id];
    }));

    if (!alvo.length) {
      ui.avisar('As torres marcadas não têm programação no período exibido.', 'alerta', 6000);
      return;
    }

    var torres = {};
    alvo.forEach(function (p) { if (p.torre) torres[p.torre.id] = true; });

    abrirJanelaApagar(alvo,
      'Apagar programação de ' + Object.keys(torres).length + ' torre(s)',
      function () { if (E.modoSelecao) limparSelecao(); });
  }

  /** Por data, e no mesmo dia por torre: é a ordem em que eu leio a semana. */
  function ordenarParaApagar(lista) {
    return lista.slice().sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      var ia = a.torre ? a.torre.identificador : '';
      var ib = b.torre ? b.torre.identificador : '';
      return ia.localeCompare(ib, 'pt-BR');
    });
  }

  /* ------------------------------------------- Janela de apagar ----------- */

  /**
   * A janela de apagar, uma só para os dois caminhos: as torres marcadas na
   * grade e as programações marcadas nos painéis.
   *
   * Cada linha tem caixinha e vem marcada. Dá para desmarcar a que não era para
   * ir junto sem sair, refazer a seleção e voltar — que era o único jeito antes.
   */
  var apagarPendente = [];

  function abrirJanelaApagar(lista, titulo, aoTerminar) {
    apagarPendente = lista.map(function (p) { return { p: p, marcado: true }; });
    apagarDepois = aoTerminar || null;

    ui.modalGenerico({
      titulo: titulo,
      corpoHtml:
        '<div class="space-y-3">' +
          '<div class="rounded-lg border border-rose-300 bg-rose-50 p-3">' +
            '<p class="text-xs text-rose-800">' +
              'Apagar não tem desfazer. O histórico guarda o registro de quem apagou ' +
              'o quê, mas a programação some da grade. Desmarque o que não é para ir.' +
            '</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                    'onclick="SIPAV.app.marcarTodasApagar(true)">Marcar todas</button>' +
            '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                    'onclick="SIPAV.app.marcarTodasApagar(false)">Desmarcar</button>' +
            '<span id="apagarContagem" class="text-xs font-semibold" ' +
                  'style="color:var(--acento)"></span>' +
          '</div>' +
          '<div id="apagarLista" class="space-y-1 max-h-72 overflow-y-auto barra-fina"></div>' +
        '</div>',
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Apagar', classe: 'btn-perigo', acao: function () {
          var marcadas = apagarPendente.filter(function (x) { return x.marcado; })
                                       .map(function (x) { return x.p; });
          if (!marcadas.length) {
            ui.avisar('Nenhuma marcada. Marque o que vai apagar ou cancele.', 'alerta');
            return;
          }
          executarApagar(marcadas);
        } }
      ]
    });

    renderListaApagar();
  }

  var apagarDepois = null;

  function renderListaApagar() {
    var caixa = $('apagarLista');
    if (!caixa) return;

    var n = apagarPendente.filter(function (x) { return x.marcado; }).length;

    $('apagarContagem').textContent = n + ' de ' + apagarPendente.length + ' marcada(s)';

    var botao = Array.prototype.slice.call(
      document.querySelectorAll('#genericoRodape button')
    ).filter(function (b) { return /^Apagar/.test(b.textContent); })[0];
    if (botao) {
      botao.textContent = n ? 'Apagar ' + n : 'Apagar';
      botao.disabled = !n;
    }

    caixa.innerHTML = apagarPendente.map(function (x, i) {
      var p = x.p;
      var cor = p.atividade ? p.atividade.cor_fundo : '#94A3B8';
      return '<label class="lote-linha" style="cursor:pointer">' +
        '<input type="checkbox" class="rounded" ' + (x.marcado ? 'checked ' : '') +
               'onchange="SIPAV.app.alternarApagarLinha(' + i + ', this.checked)">' +
        '<span class="lote-id">' + esc(p.torre ? p.torre.identificador : '?') + '</span>' +
        '<span class="lote-ativ" style="background:' + cor + ';color:' +
          ui.corDoTexto(cor) + '">' + esc(p.atividade ? p.atividade.nome : '—') + '</span>' +
        '<span class="lote-dia">' + esc(ui.dataCurta(p.data)) + '</span>' +
        '<span class="text-xs" style="color:var(--texto-suave)">' +
          esc(p.encarregado ? p.encarregado.nome : 'sem encarregado') +
          ' · ' + formatarPercentual(p.percentual) +
        '</span>' +
      '</label>';
    }).join('');
  }

  function alternarApagarLinha(i, marcado) {
    if (apagarPendente[i]) apagarPendente[i].marcado = !!marcado;
    renderListaApagar();
  }

  function marcarTodasApagar(valor) {
    apagarPendente.forEach(function (x) { x.marcado = !!valor; });
    renderListaApagar();
  }

  function executarApagar(alvo) {
    ui.processando('Apagando ' + alvo.length + ' programação(ões)…');

    // Apagar não entra no desfazer: a linha deixa de existir.
    edicaoDesfazer = [];

    var ok = [], falhou = [];

    alvo.reduce(function (antes, p) {
      return antes.then(function () {
        var rotulo = (p.torre ? p.torre.identificador : '?') + ' · ' +
                     (p.atividade ? p.atividade.nome : '');
        return db.removerProgramacao(p.id)
          .then(function () { ok.push(rotulo); delete E.progSelecionadas[p.id]; })
          .catch(function (e) { falhou.push({ alvo: rotulo, motivo: e.message }); });
      });
    }, Promise.resolve())
      .then(recarregarProgramacoes)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        apagarPendente = [];
        if (apagarDepois) apagarDepois();
        renderBarraSelecaoProg();
        relatarEdicao(ok, falhou, 'apagada', 'Apagar programação');
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }


  /* ======================================================================== */
  /* EDITAR EM LOTE                                                           */
  /* ======================================================================== */

  /**
   * Alterar de uma vez a programação que já existe nas torres marcadas.
   *
   * O caso que mandou fazer isto é chuva: empurrar a semana inteira dois dias
   * sem reabrir vinte torres. Por isso a data tem o modo relativo, não só o
   * absoluto — "adiar 2 dias" preserva a distribuição que já estava montada,
   * enquanto "mudar para" achata tudo no mesmo dia.
   *
   * Campo em branco quer dizer NÃO MEXER. Nunca apagar por omissão: esvaziar o
   * encarregado sem querer é exatamente o tipo de estrago silencioso que some
   * até a fiscalização perguntar.
   */
  var edicaoLote = [];        // [{id, torreNome, atividadeNome, data, encarregadoId, percentual, marcado}]
  var edicaoDesfazer = [];    // [{id, antes:{...}}] para voltar atrás

  function abrirEdicaoEmLote() {
    var ids = Object.keys(E.selecionadas);
    if (!ids.length) { ui.avisar('Marque as torres na grade primeiro.', 'alerta'); return; }

    var marcadas = {};
    ids.forEach(function (id) { marcadas[id] = true; });

    edicaoLote = E.programacoes
      .filter(function (p) { return p.torre && marcadas[p.torre.id]; })
      .map(function (p) {
        return {
          id: p.id,
          torreId: p.torre.id,
          torreNome: p.torre.identificador,
          atividadeId: p.atividade ? p.atividade.id : null,
          atividadeNome: p.atividade ? p.atividade.nome : '—',
          cor: p.atividade ? p.atividade.cor_fundo : '#94A3B8',
          data: p.data,
          encarregadoId: p.encarregado ? p.encarregado.id : '',
          encarregadoNome: p.encarregado ? p.encarregado.nome : '',
          percentual: Number(p.percentual) || 100,
          marcado: true
        };
      })
      .sort(function (a, b) {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1;
        return a.torreNome.localeCompare(b.torreNome, 'pt-BR');
      });

    if (!edicaoLote.length) {
      ui.avisar('As torres marcadas não têm programação no período exibido.', 'alerta', 6000);
      return;
    }

    var atividadesPresentes = [];
    edicaoLote.forEach(function (x) {
      if (x.atividadeId && !atividadesPresentes.some(function (a) { return a.id === x.atividadeId; })) {
        atividadesPresentes.push({ id: x.atividadeId, nome: x.atividadeNome });
      }
    });

    var opcoesEnc = E.encarregados.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.nome) + '</option>';
    }).join('');

    var corpo =
      '<div class="space-y-4">' +

        '<p class="text-xs" style="color:var(--texto-fraco)">' +
          'Alterando a programação de <strong>' + ids.length + '</strong> torre(s) marcada(s). ' +
          'Campo em branco não é alterado.' +
        '</p>' +

        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="caixa-filtro">' +
            '<i data-lucide="filter" class="w-3.5 h-3.5" style="color:var(--texto-fraco)"></i>' +
            '<select id="edFiltroAtividade" class="select-filtro" onchange="SIPAV.app.filtrarEdicao()">' +
              '<option value="">Todas as atividades</option>' +
              atividadesPresentes.map(function (a) {
                return '<option value="' + a.id + '">' + esc(a.nome) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                  'onclick="SIPAV.app.marcarTodasEdicao(true)">Marcar todas</button>' +
          '<button class="btn-secundario" style="font-size:.6875rem;padding:.25rem .5rem" ' +
                  'onclick="SIPAV.app.marcarTodasEdicao(false)">Desmarcar</button>' +
          '<span id="edContagem" class="resumo"></span>' +
        '</div>' +

        '<div id="edLista" class="space-y-1 max-h-56 overflow-y-auto barra-fina"></div>' +

        '<div class="pt-3 space-y-3" style="border-top:1px solid var(--borda)">' +
          '<label class="rotulo" style="margin-bottom:0">O que mudar nas marcadas</label>' +

          '<div>' +
            '<label class="rotulo" style="font-size:.625rem">Data</label>' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<select id="edModoData" class="campo" style="width:150px" ' +
                      'onchange="SIPAV.app.mudarModoDataEdicao()">' +
                '<option value="">Não alterar</option>' +
                '<option value="deslocar">Adiar / adiantar</option>' +
                '<option value="fixa">Mudar para</option>' +
              '</select>' +
              '<div id="edCaixaDeslocar" class="hidden flex items-center gap-1">' +
                '<input id="edDias" type="number" step="1" value="1" class="campo" style="width:70px">' +
                '<span class="text-sm" style="color:var(--texto-suave)">dia(s)' +
                  '<span class="text-xs" style="color:var(--texto-fraco)"> · negativo adianta</span>' +
                '</span>' +
                '<label class="flex items-center gap-1.5 text-xs cursor-pointer ml-2" ' +
                       'style="color:var(--texto-suave)">' +
                  '<input type="checkbox" id="edPularDomingo" class="rounded" checked> pular domingo' +
                '</label>' +
              '</div>' +
              '<input id="edDataFixa" type="date" class="campo hidden" style="width:150px">' +
            '</div>' +
            // Só aparece quando a nova data cai no passado. O banco recusa sem
            // justificativa, e adiar uma semana que já começou é justamente o
            // caso em que isso acontece.
            '<div id="edBlocoJustificativa" class="hidden mt-2">' +
              '<input id="edJustificativa" class="campo" autocomplete="off" ' +
                     'placeholder="Por que a nova data já passou? (fica registrado)">' +
            '</div>' +
          '</div>' +

          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            '<div><label class="rotulo" style="font-size:.625rem">Encarregado</label>' +
              '<select id="edEncarregado" class="campo">' +
                '<option value="">Não alterar</option>' +
                '<option value="__SEM__">— tirar o encarregado —</option>' + opcoesEnc +
              '</select></div>' +
            '<div><label class="rotulo" style="font-size:.625rem">Percentual</label>' +
              '<input id="edPercentual" type="number" min="1" max="100" step="1" class="campo" ' +
                     'placeholder="Não alterar"></div>' +
          '</div>' +

          // Trocar a atividade das marcadas. O caso é lançar a atividade errada
          // em vinte torres: sem isto, só apagando as vinte e refazendo.
          '<div>' +
            '<label class="rotulo" style="font-size:.625rem">Atividade</label>' +
            '<select id="edAtividade" class="campo">' +
              '<option value="">Não alterar</option>' +
              E.atividades.slice().sort(function (a, b) {
                return (a.ordem_execucao || 0) - (b.ordem_execucao || 0);
              }).map(function (a) {
                return '<option value="' + a.id + '">' + esc(a.nome) + '</option>';
              }).join('') +
            '</select>' +
            '<p class="text-xs mt-1" style="color:var(--texto-fraco)">' +
              'A sequência é conferida uma a uma na hora de gravar: a torre que ' +
              'não puder receber a atividade nova fica como está, e o relato diz ' +
              'qual e por quê.' +
            '</p>' +
          '</div>' +
        '</div>' +

        '<div id="edPrevia" class="hidden rounded-lg border border-sky-300 bg-sky-50 p-3">' +
          '<p class="text-sm font-semibold text-sky-900">Prévia</p>' +
          '<div id="edPreviaTexto" class="text-xs text-sky-800 mt-1 space-y-0.5"></div>' +
        '</div>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Editar programação em lote',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Remover marcadas', classe: 'btn-perigo', acao: removerEdicaoLote },
        { rotulo: 'Aplicar', classe: 'btn-primario', acao: aplicarEdicaoLote }
      ]
    });

    // A prévia acompanha qualquer campo: é ela que responde "o que isso vai
    // fazer" antes de eu clicar em Aplicar.
    ['edEncarregado', 'edPercentual', 'edAtividade', 'edDias', 'edDataFixa',
     'edPularDomingo'].forEach(function (id) {
      var campo = $(id);
      if (!campo) return;
      campo.addEventListener('change', atualizarPreviaEdicao);
      campo.addEventListener('input', atualizarPreviaEdicao);
    });

    filtrarEdicao();
  }

  function edicaoVisiveis() {
    var f = $('edFiltroAtividade') ? $('edFiltroAtividade').value : '';
    return edicaoLote.filter(function (x) { return !f || x.atividadeId === f; });
  }

  function edicaoMarcadas() {
    return edicaoVisiveis().filter(function (x) { return x.marcado; });
  }

  function filtrarEdicao() {
    var lista = edicaoVisiveis();
    var marcadas = edicaoMarcadas().length;

    $('edContagem').textContent = marcadas + ' de ' + lista.length + ' marcada(s)';

    $('edLista').innerHTML = lista.map(function (x) {
      // A caixinha marca para a edição em massa; o resto da linha abre aquela
      // programação sozinha, na mesma janela de sempre. Uma fora da régua no
      // meio de vinte não vale abrir um fluxo separado para ajustar.
      return '<div class="ed-linha">' +
        '<input type="checkbox" class="rounded" ' + (x.marcado ? 'checked ' : '') +
               'title="Marcar para a edição em lote" ' +
               'onchange="SIPAV.app.marcarEdicao(\'' + x.id + '\', this.checked)">' +
        '<button type="button" class="ed-abrir" title="Abrir esta programação" ' +
                'onclick="SIPAV.app.editarDaEdicaoEmLote(\'' + x.id + '\')">' +
          '<span class="lote-id">' + esc(x.torreNome) + '</span>' +
          '<span class="chip-atividade" style="background:' + x.cor + ';color:' +
            ui.corDoTexto(x.cor) + '">' + esc(x.atividadeNome) + '</span>' +
          '<span class="ed-data">' + esc(ui.dataCurta(x.data)) + '</span>' +
          '<span class="ed-enc">' + esc(x.encarregadoNome || '—') + '</span>' +
          '<span class="chip-parcial' + (x.percentual >= 100 ? ' cheio' : '') + '">' +
            formatarPercentual(x.percentual) + '</span>' +
          '<i data-lucide="pencil" class="ed-lapis"></i>' +
        '</button>' +
      '</div>';
    }).join('');

    ui.icones();

    atualizarPreviaEdicao();
  }

  function marcarEdicao(id, marcado) {
    var x = edicaoLote.find(function (y) { return y.id === id; });
    if (x) x.marcado = marcado;
    $('edContagem').textContent =
      edicaoMarcadas().length + ' de ' + edicaoVisiveis().length + ' marcada(s)';
    atualizarPreviaEdicao();
  }

  function marcarTodasEdicao(valor) {
    edicaoVisiveis().forEach(function (x) { x.marcado = valor; });
    filtrarEdicao();
  }

  function mudarModoDataEdicao() {
    var modo = $('edModoData').value;
    $('edCaixaDeslocar').classList.toggle('hidden', modo !== 'deslocar');
    $('edDataFixa').classList.toggle('hidden', modo !== 'fixa');
    atualizarPreviaEdicao();
  }

  /** A data que a linha vai ter, conforme o modo escolhido. Null = não mexe. */
  function novaDataEdicao(x) {
    var modo = $('edModoData') ? $('edModoData').value : '';
    if (!modo) return null;

    if (modo === 'fixa') return $('edDataFixa').value || null;

    var n = Number($('edDias').value) || 0;
    if (!n) return null;

    var d = ui.paraData(x.data);
    if ($('edPularDomingo').checked) {
      // Anda dia útil por dia útil, senão adiar 2 dias numa sexta cai no domingo
      var passo = n > 0 ? 1 : -1;
      for (var i = 0; i < Math.abs(n); i++) {
        d = ui.somarDias(d, passo);
        while (d.getDay() === 0) d = ui.somarDias(d, passo);
      }
    } else {
      d = ui.somarDias(d, n);
    }
    return ui.iso(d);
  }

  /** Mostra antes → depois antes de gravar qualquer coisa. */
  /**
   * As linhas cuja NOVA data cai no passado. Só conta quando a data muda: trocar
   * o encarregado de uma programação que já era da semana passada não é escolher
   * uma data no passado, e o banco também não pede.
   */
  function linhasQueViramPassado(marcadas) {
    var hoje = ui.hoje();
    return marcadas.filter(function (x) {
      var nova = novaDataEdicao(x);
      return nova && nova !== x.data && nova < hoje;
    });
  }

  function atualizarJustificativaEdicao(marcadas) {
    var bloco = $('edBlocoJustificativa');
    if (!bloco) return;

    var n = linhasQueViramPassado(marcadas).length;
    bloco.classList.toggle('hidden', !n);
    if (!n) $('edJustificativa').value = '';
  }

  function atualizarPreviaEdicao() {
    var caixa = $('edPrevia');
    if (!caixa) return;

    var marcadas = edicaoMarcadas();
    atualizarJustificativaEdicao(marcadas);

    var encNovo = $('edEncarregado').value;
    var pctNovo = $('edPercentual').value;
    var ativNova = $('edAtividade') ? $('edAtividade').value : '';
    var mudaData = !!$('edModoData').value;

    if (!marcadas.length || (!encNovo && !pctNovo && !ativNova && !mudaData)) {
      caixa.classList.add('hidden');
      return;
    }

    var linhas = [];

    if (mudaData) {
      var exemplos = marcadas.slice(0, 3).map(function (x) {
        var nova = novaDataEdicao(x);
        return x.torreNome + ' ' + ui.dataCurta(x.data) + ' → ' +
               (nova ? ui.dataCurta(nova) : '—');
      });
      linhas.push('<p><strong>Data:</strong> ' + esc(exemplos.join(' · ')) +
        (marcadas.length > 3 ? ' e mais ' + (marcadas.length - 3) : '') + '</p>');
    }

    if (encNovo) {
      var nome = encNovo === '__SEM__' ? 'sem encarregado'
        : (E.encarregados.find(function (e) { return e.id === encNovo; }) || {}).nome;
      linhas.push('<p><strong>Encarregado:</strong> todas passam para ' + esc(nome) + '</p>');
    }

    if (pctNovo) {
      linhas.push('<p><strong>Percentual:</strong> todas passam para ' +
        esc(formatarPercentual(pctNovo)) + '</p>');
    }

    if (ativNova) {
      var a = E.atividades.find(function (x) { return x.id === ativNova; });
      // Diz de onde sai, não só para onde vai: trocar a atividade de uma linha
      // que já era ela mesma é o engano fácil aqui.
      var origens = [], quantasMudam = 0;
      marcadas.forEach(function (x) {
        if (x.atividadeId === ativNova) return;
        quantasMudam++;
        if (origens.indexOf(x.atividadeNome) === -1) origens.push(x.atividadeNome);
      });
      var jaEram = marcadas.length - quantasMudam;

      linhas.push('<p><strong>Atividade:</strong> ' +
        (origens.length ? esc(origens.join(', ')) + ' → ' : 'passa para ') +
        esc(a ? a.nome : '') +
        (jaEram
          ? ' <em>(' + jaEram + ' já ' + (jaEram === 1 ? 'era' : 'eram') + ', não mud' +
            (jaEram === 1 ? 'a' : 'am') + ')</em>'
          : '') +
        '</p>');
    }

    linhas.push('<p class="mt-1">Afeta <strong>' + marcadas.length +
      '</strong> programação(ões).</p>');

    $('edPreviaTexto').innerHTML = linhas.join('');
    caixa.classList.remove('hidden');
  }

  function aplicarEdicaoLote() {
    var marcadas = edicaoMarcadas();
    if (!marcadas.length) { ui.avisar('Marque pelo menos uma programação.', 'alerta'); return; }

    var encNovo = $('edEncarregado').value;
    var pctTexto = $('edPercentual').value;
    var modoData = $('edModoData').value;
    var ativNova = $('edAtividade') ? $('edAtividade').value : '';

    if (!encNovo && !pctTexto && !modoData && !ativNova) {
      ui.avisar('Escolha o que mudar: data, encarregado, percentual ou atividade.', 'alerta');
      return;
    }

    var pctNovo = null;
    if (pctTexto) {
      pctNovo = Number(pctTexto);
      if (!(pctNovo > 0 && pctNovo <= 100)) {
        ui.avisar('O percentual tem que ficar entre 1 e 100.', 'alerta');
        $('edPercentual').focus();
        return;
      }
    }

    if (modoData === 'fixa' && !$('edDataFixa').value) {
      ui.avisar('Informe a data.', 'alerta');
      return;
    }

    var justRetro = $('edJustificativa').value.trim();
    var viramPassado = linhasQueViramPassado(marcadas).length;

    if (viramPassado && !justRetro) {
      ui.avisar(viramPassado + ' programação(ões) iriam para uma data que já passou. ' +
                'Diga o motivo antes de aplicar.', 'alerta', 6000);
      $('edJustificativa').focus();
      return;
    }

    ui.processando('Alterando ' + marcadas.length + ' programação(ões)…');

    var ok = [], falhou = [];
    edicaoDesfazer = [];

    // Adiar anda de trás para frente: adiantar, da frente para trás. Assim a
    // linha que se move não esbarra na que ainda não se moveu.
    var fila = marcadas.slice().sort(function (a, b) {
      var dias = Number($('edDias').value) || 0;
      var atrasando = modoData === 'deslocar' ? dias > 0 : true;
      return atrasando ? (a.data < b.data ? 1 : -1) : (a.data < b.data ? -1 : 1);
    });

    fila.reduce(function (antes, x) {
      return antes.then(function () {
        var campos = {};
        var nova = novaDataEdicao(x);
        if (nova) campos.data = nova;
        if (encNovo) campos.encarregado_id = encNovo === '__SEM__' ? null : encNovo;
        if (pctNovo) campos.percentual = pctNovo;
        // A que já era a atividade nova fica de fora: mandar ao banco um update
        // que não muda nada só gera linha de histórico à toa.
        if (ativNova && x.atividadeId !== ativNova) campos.atividade_id = ativNova;
        // Só nas linhas cuja data realmente vai para o passado
        if (nova && nova !== x.data && nova < ui.hoje()) campos.justificativa_retroativa = justRetro;
        if (!Object.keys(campos).length) return;

        return db.atualizarProgramacao(x.id, campos)
          .then(function () {
            ok.push(x.torreNome + ' · ' + x.atividadeNome);
            edicaoDesfazer.push({
              id: x.id,
              mudouData: !!campos.data,
              antes: {
                data: x.data,
                encarregado_id: x.encarregadoId || null,
                percentual: x.percentual,
                atividade_id: x.atividadeId
              }
            });
          })
          .catch(function (e) {
            falhou.push({ alvo: x.torreNome + ' · ' + x.atividadeNome, motivo: e.message });
          });
      });
    }, Promise.resolve())
      .then(recarregarProgramacoes)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        if (E.modoSelecao) limparSelecao();
        relatarEdicao(ok, falhou, 'alterada');
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function removerEdicaoLote() {
    var marcadas = edicaoMarcadas();
    if (!marcadas.length) { ui.avisar('Marque pelo menos uma programação.', 'alerta'); return; }

    ui.confirmar('Remover programações',
      'Apaga ' + marcadas.length + ' programação(ões) das torres marcadas. ' +
      'O histórico guarda o registro de cada remoção.', 'Remover')
      .then(function (sim) {
        if (!sim) return;

        ui.processando('Removendo…');
        var ok = [], falhou = [];
        edicaoDesfazer = [];   // remoção não tem desfazer: a linha deixa de existir

        return marcadas.reduce(function (antes, x) {
          return antes.then(function () {
            return db.removerProgramacao(x.id)
              .then(function () { ok.push(x.torreNome + ' · ' + x.atividadeNome); })
              .catch(function (e) {
                falhou.push({ alvo: x.torreNome + ' · ' + x.atividadeNome, motivo: e.message });
              });
          });
        }, Promise.resolve())
          .then(recarregarProgramacoes)
          .then(function () {
            ui.pronto();
            ui.fecharModal('modalGenerico');
            if (E.modoSelecao) limparSelecao();
            relatarEdicao(ok, falhou, 'removida');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /** Volta cada linha ao valor que tinha antes da alteração. */
  function desfazerEdicaoLote() {
    if (!edicaoDesfazer.length) return;
    var quantas = edicaoDesfazer.length;

    ui.confirmar('Desfazer a alteração',
      'Devolve ' + quantas + ' programação(ões) ao valor anterior.', 'Desfazer')
      .then(function (sim) {
        if (!sim) return;
        ui.processando('Desfazendo…');

        var voltaram = 0, naoVoltaram = [];

        return edicaoDesfazer.reduce(function (antes, x) {
          return antes.then(function () {
            var volta = {};
            Object.keys(x.antes).forEach(function (k) { volta[k] = x.antes[k]; });

            // Voltar para uma data que já passou também é escolher uma data no
            // passado, e o banco pede o motivo. O motivo aqui é o próprio
            // desfazer — fica escrito assim no histórico, sem inventar outro.
            if (x.mudouData && x.antes.data < ui.hoje()) {
              volta.justificativa_retroativa = 'Desfazer alteração em lote';
            }

            return db.atualizarProgramacao(x.id, volta)
              .then(function () { voltaram++; })
              .catch(function (e) { naoVoltaram.push(e.message); });
          });
        }, Promise.resolve())
          .then(recarregarProgramacoes)
          .then(function () {
            edicaoDesfazer = [];
            ui.pronto();
            ui.fecharModal('modalGenerico');

            // Antes tudo era engolido e a mensagem dizia "devolvida(s)" mesmo
            // quando nenhuma tinha voltado. Um desfazer que mente é pior que um
            // que falha.
            if (naoVoltaram.length) {
              ui.avisar(voltaram + ' de ' + quantas + ' voltaram. ' + naoVoltaram.length +
                        (naoVoltaram.length === 1 ? ' não pôde: ' : ' não puderam: ') +
                        naoVoltaram[0], 'alerta', 9000);
            } else {
              ui.avisar(quantas + ' programação(ões) devolvida(s).', 'sucesso');
            }
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function relatarEdicao(ok, falhou, verbo, titulo) {
    titulo = titulo || 'Edição em lote';
    var botoes = [{ rotulo: 'Fechar', classe: 'btn-secundario' }];
    if (edicaoDesfazer.length) {
      botoes.push({ rotulo: 'Desfazer', classe: 'btn-perigo', acao: desfazerEdicaoLote });
    }

    if (!falhou.length) {
      ui.modalGenerico({
        titulo: titulo,
        corpoHtml:
          '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3">' +
            '<p class="text-sm font-semibold text-emerald-800">' +
              ok.length + ' programação(ões) ' + esc(verbo) + '(s)</p>' +
            '<p class="text-xs text-emerald-800 mt-1">' + esc(ok.join(' · ')) + '</p>' +
          '</div>',
        botoes: botoes
      });
      return;
    }

    ui.modalGenerico({
      titulo: titulo,
      corpoHtml:
        '<div class="space-y-2">' +
          (ok.length
            ? '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3">' +
                '<p class="text-sm font-semibold text-emerald-800">' + ok.length + ' ' +
                  esc(verbo) + '(s)</p>' +
                '<p class="text-xs text-emerald-800 mt-1">' + esc(ok.join(' · ')) + '</p>' +
              '</div>'
            : '') +
          '<div class="rounded-lg border border-rose-200 bg-rose-50 p-3">' +
            '<p class="text-sm font-semibold text-rose-800">' + falhou.length + ' não deu</p>' +
            '<div class="text-xs text-rose-800 mt-1 space-y-1">' +
              falhou.map(function (f) {
                return '<p><strong>' + esc(f.alvo) + '</strong> — ' + esc(f.motivo) + '</p>';
              }).join('') +
            '</div>' +
            '<p class="text-xs text-rose-700 mt-2">' +
              'Mudar a data pode quebrar a sequência: se a escavação for para antes ' +
              'da supressão, o banco recusa. Ajuste as duas juntas ou uma a uma.' +
            '</p>' +
          '</div>' +
        '</div>',
      botoes: botoes
    });
  }
  /* ======================================================================== */
  /* RESTRIÇÕES                                                               */
  /* ======================================================================== */

  /**
   * Há quanto tempo a torre está travada.
   *
   * É o número que interessa numa reunião: "fundiária desde 12/08" não diz nada,
   * "travada há 1 mês e 13 dias" diz. Restrição já liberada mostra quanto tempo
   * ficou parada, não quanto tempo faz.
   */
  function tempoRestrita(r) {
    var fim = r.data_liberacao || ui.hoje();
    var dias = Math.round((ui.paraData(fim) - ui.paraData(r.data_inicio)) / 86400000);
    if (dias < 0) dias = 0;

    var texto;
    if (dias === 0)      texto = 'menos de um dia';
    else if (dias === 1) texto = '1 dia';
    else if (dias < 30)  texto = dias + ' dias';
    else {
      var meses = Math.floor(dias / 30);
      var resto = dias % 30;
      texto = meses + (meses === 1 ? ' mês' : ' meses') +
              (resto ? ' e ' + resto + (resto === 1 ? ' dia' : ' dias') : '');
    }
    return r.data_liberacao ? 'ficou ' + texto : 'há ' + texto;
  }

  /** Sem previsão desabilita a data em vez de só ignorá-la. */
  function alternarSemPrevisao() {
    var sem = $('restricaoSemPrevisao').checked;
    var campo = $('restricaoPrevisao');
    campo.disabled = sem;
    if (sem) campo.value = '';
  }

  function abrirRestricao() {
    if (!torreAberta) return;
    var torre = torreAberta;

    db.restricoes(torre.torre_id).then(function (lista) {
      var abertas = lista.filter(function (r) { return !r.data_liberacao; });

      var corpo =
        '<div class="space-y-4">' +
          (lista.length
            ? '<div class="space-y-2">' + lista.map(function (r) {
                var liberada = !!r.data_liberacao;
                return '<div class="flex items-start gap-3 rounded-lg border px-3 py-2 ' +
                       (liberada ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50') + '">' +
                  '<div class="flex-1">' +
                    '<p class="text-sm font-semibold ' + (liberada ? 'text-slate-500' : 'text-rose-800') + '">' +
                      esc(r.tipo) + (liberada ? ' (liberada)' : '') + '</p>' +
                    '<p class="text-xs text-slate-500">' +
                      'Desde ' + ui.dataCurta(r.data_inicio) +
                      ' · <strong>' + esc(tempoRestrita(r)) + '</strong>' +
                      ' · ' + (r.previsao_liberacao
                        ? 'previsão ' + ui.dataCurta(r.previsao_liberacao) +
                          (!liberada && r.previsao_liberacao < ui.hoje()
                            ? ' <span class="text-rose-700 font-semibold">(vencida)</span>' : '')
                        : '<span class="font-semibold">sem previsão</span>') +
                      (r.descricao ? ' · ' + esc(r.descricao) : '') +
                    '</p>' +
                  '</div>' +
                  (liberada ? '' :
                    '<button onclick="SIPAV.app.liberarRestricao(\'' + r.id + '\')" ' +
                    'class="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">' +
                    'Liberar</button>') +
                '</div>';
              }).join('') + '</div>'
            : '<p class="text-sm text-slate-400 italic text-center py-2">Nenhuma restrição registrada</p>') +

          '<div class="border-t border-slate-200 pt-4">' +
            '<h4 class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Nova restrição</h4>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              '<div><label class="rotulo">Tipo</label>' +
                '<select id="restricaoTipo" class="campo">' +
                  '<option value="AMBIENTAL">Ambiental</option>' +
                  '<option value="FUNDIARIA">Fundiária</option>' +
                  '<option value="OUTRA">Outra</option>' +
                '</select></div>' +
              // A restrição quase nunca é registrada no dia em que começou:
              // alguém descobre depois. Sem poder recuar a data, o tempo de
              // travamento sai menor do que é.
              '<div><label class="rotulo">Restrita desde</label>' +
                '<input id="restricaoInicio" type="date" class="campo" max="' + ui.hoje() + '" ' +
                       'value="' + ui.hoje() + '"></div>' +
              '<div class="sm:col-span-2">' +
                '<label class="rotulo">Previsão de liberação</label>' +
                '<div class="flex items-center gap-3">' +
                  '<input id="restricaoPrevisao" type="date" class="campo">' +
                  '<label class="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer" ' +
                         'style="color:var(--texto-suave)">' +
                    '<input type="checkbox" id="restricaoSemPrevisao" class="rounded" ' +
                           'onchange="SIPAV.app.alternarSemPrevisao()"> Sem previsão' +
                  '</label>' +
                '</div>' +
              '</div>' +
              '<div class="sm:col-span-2"><label class="rotulo">Descrição</label>' +
                '<input id="restricaoDescricao" class="campo" placeholder="Ex.: aguardando ASV"></div>' +
            '</div>' +
          '</div>' +
        '</div>';

      ui.modalGenerico({
        titulo: 'Restrições da torre ' + torre.identificador,
        corpoHtml: corpo,
        botoes: [
          { rotulo: 'Fechar', classe: 'btn-secundario' },
          { rotulo: 'Registrar restrição', classe: 'btn-perigo', acao: function () {
              var inicio = $('restricaoInicio').value;
              if (!inicio) { ui.avisar('Informe desde quando a torre está restrita.', 'alerta'); return; }
              if (inicio > ui.hoje()) { ui.avisar('A restrição não pode começar no futuro.', 'alerta'); return; }

              var semPrevisao = $('restricaoSemPrevisao').checked;
              var previsao = semPrevisao ? null : ($('restricaoPrevisao').value || null);

              if (previsao && previsao < inicio) {
                ui.avisar('A previsão de liberação é anterior ao início da restrição.', 'alerta');
                return;
              }

              ui.processando('Registrando…');
              db.criarRestricao({
                torreId: torre.torre_id,
                tipo: $('restricaoTipo').value,
                descricao: $('restricaoDescricao').value.trim() || null,
                dataInicio: inicio,
                previsaoLiberacao: previsao
              })
                .then(recarregarProgramacoes)
                .then(function () {
                  ui.pronto();
                  ui.fecharModal('modalGenerico');
                  ui.avisar('Restrição registrada. A torre fica travada para programação.', 'sucesso', 5000);
                  torreAberta = E.torres.find(function (t) { return t.torre_id === torre.torre_id; });
                  if (torreAberta) abrirTorre(torreAberta.torre_id);
                })
                .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
            } }
        ]
      });
    }).catch(function (e) { ui.avisar(e.message, 'erro'); });
  }

  function liberarRestricao(id) {
    ui.processando('Liberando…');
    db.liberarRestricao(id)
      .then(recarregarProgramacoes)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        ui.avisar('Restrição liberada.', 'sucesso');
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /* ======================================================================== */
  /* CADASTROS                                                                */
  /* ======================================================================== */

  /**
   * Cada pessoa troca a própria senha depois do primeiro acesso, sem depender
   * do administrador. Recuperação por e-mail ("esqueci minha senha") exigiria
   * um servidor de envio configurado — fica para depois.
   */
  function abrirAlterarSenha() {
    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-sm text-slate-600">' +
          'A senha vale para o seu acesso ao SIPAV. Mínimo de 6 caracteres.' +
        '</p>' +
        '<div><label class="rotulo">Nova senha</label>' +
          '<input id="senhaNova" type="password" class="campo" autocomplete="new-password"></div>' +
        '<div><label class="rotulo">Repita a nova senha</label>' +
          '<input id="senhaConfirma" type="password" class="campo" autocomplete="new-password"></div>' +
        '<p class="text-xs text-slate-400">' +
          'Se esquecer a senha, só o administrador consegue redefinir — ainda não ' +
          'existe recuperação por e-mail.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Alterar minha senha',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Salvar senha', classe: 'btn-primario', acao: salvarSenha }
      ]
    });

    setTimeout(function () { $('senhaNova').focus(); }, 60);
  }

  function salvarSenha() {
    var nova = $('senhaNova').value;
    var conf = $('senhaConfirma').value;

    if (nova.length < 6) {
      ui.avisar('A senha precisa ter pelo menos 6 caracteres.', 'alerta');
      $('senhaNova').focus();
      return;
    }
    if (nova !== conf) {
      ui.avisar('As duas senhas não são iguais.', 'alerta');
      $('senhaConfirma').focus();
      return;
    }

    ui.processando('Alterando senha…');
    db.auth.alterarSenha(nova)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        ui.avisar('Senha alterada. Use a nova no próximo login.', 'sucesso', 5000);
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  // id do encarregado com o nome aberto para edição
  var encarregadoEmEdicao = null;

  function abrirEncarregados() {
    var corpo =
      '<div class="space-y-4">' +
        '<div class="flex gap-2">' +
          '<input id="novoEncarregado" class="campo" placeholder="Nome do encarregado">' +
          '<button onclick="SIPAV.app.adicionarEncarregado()" class="btn-primario whitespace-nowrap">Adicionar</button>' +
        '</div>' +
        '<div class="space-y-1.5">' +
          E.encarregados.map(linhaEncarregado).join('') +
        '</div>' +
        '<p class="text-xs text-slate-400">' +
          'Corrigir o nome vale para tudo, inclusive o que já foi programado — é a ' +
          'mesma pessoa. Remover não altera o histórico: ela só deixa de aparecer em ' +
          'novas programações.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({ titulo: 'Encarregados', corpoHtml: corpo });
  }

  function linhaEncarregado(e) {
    if (encarregadoEmEdicao === e.id) {
      return '' +
        '<div class="flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-2">' +
          '<i data-lucide="user" class="w-4 h-4 text-slate-400 shrink-0"></i>' +
          '<input id="nomeEncarregado" class="campo py-1" value="' + esc(e.nome) + '">' +
          '<button onclick="SIPAV.app.salvarNomeEncarregado(\'' + e.id + '\')" ' +
                  'class="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 shrink-0" title="Salvar">' +
            '<i data-lucide="check" class="w-4 h-4"></i></button>' +
          '<button onclick="SIPAV.app.editarEncarregado(null)" ' +
                  'class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0" title="Cancelar">' +
            '<i data-lucide="x" class="w-4 h-4"></i></button>' +
        '</div>';
    }

    return '' +
      '<div class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">' +
        '<i data-lucide="user" class="w-4 h-4 text-slate-400 shrink-0"></i>' +
        '<span class="flex-1 text-sm font-medium text-slate-700 truncate">' + esc(e.nome) + '</span>' +
        '<button onclick="SIPAV.app.editarEncarregado(\'' + e.id + '\')" ' +
                'class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0" title="Corrigir nome">' +
          '<i data-lucide="pencil" class="w-4 h-4"></i></button>' +
        '<button onclick="SIPAV.app.removerEncarregado(\'' + e.id + '\',\'' + esc(e.nome) + '\')" ' +
                'class="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 shrink-0" title="Remover">' +
          '<i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
      '</div>';
  }

  function editarEncarregado(id) {
    encarregadoEmEdicao = id;
    ui.fecharModal('modalGenerico');
    abrirEncarregados();
    if (id) setTimeout(function () {
      var campo = $('nomeEncarregado');
      if (campo) { campo.focus(); campo.select(); }
    }, 60);
  }

  function salvarNomeEncarregado(id) {
    var nome = $('nomeEncarregado').value.trim();
    if (!nome) { ui.avisar('O nome não pode ficar vazio.', 'alerta'); return; }

    ui.processando('Salvando…');
    db.salvarEncarregado(nome, id)
      .then(function () { return db.encarregados(); })
      .then(function (lista) {
        E.encarregados = lista;
        encarregadoEmEdicao = null;
        ui.pronto();
        ui.fecharModal('modalGenerico');
        abrirEncarregados();
        return recarregarProgramacoes();
      })
      .then(function () { ui.avisar('Nome corrigido.', 'sucesso'); })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function adicionarEncarregado() {
    var nome = $('novoEncarregado').value.trim();
    if (!nome) return;
    ui.processando('Salvando…');
    db.salvarEncarregado(nome)
      .then(function () { return db.encarregados(); })
      .then(function (lista) {
        E.encarregados = lista;
        ui.pronto();
        ui.fecharModal('modalGenerico');
        abrirEncarregados();
        ui.avisar('Encarregado adicionado.', 'sucesso');
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  function removerEncarregado(id, nome) {
    ui.confirmar('Remover ' + nome,
      'Ele deixa de aparecer em novas programações. O histórico é preservado.', 'Remover')
      .then(function (sim) {
        if (!sim) return;
        ui.processando('Removendo…');
        return db.desativarEncarregado(id)
          .then(function () { return db.encarregados(); })
          .then(function (lista) {
            E.encarregados = lista;
            ui.pronto();
            ui.fecharModal('modalGenerico');
            abrirEncarregados();
            ui.avisar('Encarregado removido.', 'sucesso');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /* ======================================================================== */
  /* ATIVIDADES — cadastro, ordem, cor, ícone e dependências                  */
  /* ======================================================================== */

  // Ícones do Lucide que fazem sentido em obra. O campo aceita qualquer nome
  // do catálogo, esta lista é só o atalho.
  var ICONES = [
    'route', 'scissors', 'trees', 'hard-hat', 'mountain', 'mountain-snow',
    'circle-dot', 'box', 'droplets', 'ruler', 'layers', 'layers-3',
    'wrench', 'hammer', 'construction', 'shield-check', 'zap', 'gauge',
    'activity', 'wifi', 'anchor', 'link', 'package', 'cable',
    'radio-tower', 'tower-control', 'truck', 'flag', 'map-pin', 'clock',
    'rotate-ccw', 'git-commit-horizontal', 'arrow-right', 'move-vertical',
    'check', 'triangle', 'square', 'circle', 'circle-dashed', 'pickaxe'
  ];

  function requeridasDe(atividadeId) {
    return E.dependencias
      .filter(function (d) { return d.atividade_id === atividadeId; })
      .map(function (d) { return d.requer_atividade_id; });
  }

  function nomeAtividade(id) {
    var a = E.atividades.find(function (x) { return x.id === id; });
    return a ? a.nome : '—';
  }

  function abrirAtividades() {
    var podeEditar = E.perfil && (E.perfil.papel === 'ADMIN' || E.perfil.papel === 'PLANEJAMENTO');

    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-xs text-slate-500">' +
          'A ordem abaixo é a ordem de execução da obra. É ela que alimenta as regras ' +
          'de bloqueio, a cor das torres na grade e a ordenação dos campos.' +
          (podeEditar
            ? ' <strong>Arraste pela alça</strong> para mudar a posição de uma atividade.'
            : '') +
        '</p>' +
        '<div id="listaAtividadesOrdem" class="space-y-1.5"></div>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Atividades e ordem de execução',
      corpoHtml: corpo,
      botoes: podeEditar
        ? [ { rotulo: 'Fechar', classe: 'btn-secundario' },
            { rotulo: 'Nova atividade', classe: 'btn-primario',
              acao: function () { editarAtividade(null); } } ]
        : [ { rotulo: 'Fechar', classe: 'btn-secundario' } ]
    });

    renderListaAtividades();
    if (podeEditar) ligarArrastoAtividades();
  }

  /**
   * Só a lista, sem refazer a janela: arrastar várias vezes seguidas não pode
   * jogar a rolagem de volta para o topo a cada soltada.
   */
  function renderListaAtividades() {
    var lista = $('listaAtividadesOrdem');
    if (!lista) return;

    var podeEditar = E.perfil && (E.perfil.papel === 'ADMIN' || E.perfil.papel === 'PLANEJAMENTO');

    lista.innerHTML = E.atividades.map(function (a, i) {
      var deps = requeridasDe(a.id);
      return '' +
        '<div class="atv-linha flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2" ' +
             'data-id="' + a.id + '">' +
          (podeEditar
            ? '<span class="atv-grip" draggable="true" title="Arraste para mudar a posição">' +
                '<i data-lucide="grip-vertical" class="w-4 h-4"></i></span>'
            : '') +
          '<span class="text-xs font-bold text-slate-400 w-6 shrink-0 text-right">' + (i + 1) + '</span>' +
          '<span class="w-6 h-6 rounded shrink-0 flex items-center justify-center" ' +
                'style="background:' + a.cor_fundo + '">' +
            '<i data-lucide="' + esc(a.icone) + '" class="w-3.5 h-3.5" ' +
               'style="color:' + ui.corDoTexto(a.cor_fundo) + '"></i>' +
          '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-slate-700 truncate">' + esc(a.nome) + '</p>' +
            '<p class="text-[11px] text-slate-400 truncate">' +
              (deps.length
                ? 'depende de ' + deps.map(nomeAtividade).join(', ')
                : 'sem pré-requisito') +
            '</p>' +
          '</div>' +
          (a.obrigatoria ? ''
            : '<span class="text-[10px] font-semibold text-slate-400 uppercase shrink-0">condicional</span>') +
          (podeEditar
            ? '<button onclick="SIPAV.app.editarAtividade(\'' + a.id + '\')" ' +
                'class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0" title="Editar">' +
                '<i data-lucide="pencil" class="w-4 h-4"></i></button>'
            : '') +
        '</div>';
    }).join('');

    ui.icones();
  }

  /* ------------------------------------------ Arrastar para reordenar ----- */

  var atividadeArrastada = null;

  /**
   * Só a alça arrasta. A linha inteira arrastável fazia qualquer clique torto
   * no nome virar um arrasto, e o botão de editar disputava o gesto com ele.
   *
   * Os ouvintes ficam na lista, não em cada linha: a lista é refeita a cada
   * soltada, e ligar linha por linha perderia tudo a cada refazer.
   */
  function ligarArrastoAtividades() {
    var lista = $('listaAtividadesOrdem');
    if (!lista) return;

    function limparMarcas() {
      Array.prototype.forEach.call(lista.querySelectorAll('.atv-alvo-cima, .atv-alvo-baixo'),
        function (l) { l.classList.remove('atv-alvo-cima', 'atv-alvo-baixo'); });
    }

    lista.addEventListener('dragstart', function (ev) {
      var alca = ev.target.closest && ev.target.closest('.atv-grip');
      if (!alca) return;

      var linha = alca.closest('.atv-linha');
      atividadeArrastada = linha.getAttribute('data-id');
      linha.classList.add('atv-arrastando');

      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', atividadeArrastada);   // o Firefox só arrasta se houver dado
      ev.dataTransfer.setDragImage(linha, 16, 16);
    });

    lista.addEventListener('dragover', function (ev) {
      if (!atividadeArrastada) return;
      ev.preventDefault();

      limparMarcas();
      var linha = ev.target.closest && ev.target.closest('.atv-linha');
      if (!linha || linha.getAttribute('data-id') === atividadeArrastada) return;

      var r = linha.getBoundingClientRect();
      linha.classList.add(ev.clientY < r.top + r.height / 2 ? 'atv-alvo-cima' : 'atv-alvo-baixo');
    });

    lista.addEventListener('drop', function (ev) {
      if (!atividadeArrastada) return;
      ev.preventDefault();

      var alvo = ev.target.closest && ev.target.closest('.atv-linha');
      var movida = atividadeArrastada;
      var acima = alvo ? ev.clientY < alvo.getBoundingClientRect().top +
                                       alvo.getBoundingClientRect().height / 2 : false;
      var alvoId = alvo ? alvo.getAttribute('data-id') : null;

      encerrarArrasto(lista);
      if (!alvoId || alvoId === movida) return;

      var antes = E.atividades.map(function (a) { return a.id; });
      var ids = antes.slice();
      ids.splice(ids.indexOf(movida), 1);

      var pos = ids.indexOf(alvoId);
      ids.splice(acima ? pos : pos + 1, 0, movida);

      if (ids.join() === antes.join()) return;   // soltou onde já estava
      moverAtividade(ids, movida);
    });

    lista.addEventListener('dragend', function () { encerrarArrasto(lista); });
  }

  function encerrarArrasto(lista) {
    atividadeArrastada = null;
    Array.prototype.forEach.call(
      lista.querySelectorAll('.atv-arrastando, .atv-alvo-cima, .atv-alvo-baixo'),
      function (l) { l.classList.remove('atv-arrastando', 'atv-alvo-cima', 'atv-alvo-baixo'); });
  }

  /**
   * A conferência é do banco: ele sabe se a lista está completa e se alguma
   * dependência virou de cabeça para baixo. Se recusar, a lista volta como estava
   * e a mensagem diz qual par estragaria.
   */
  function moverAtividade(ids, movidaId) {
    ui.processando('Mudando a posição…');

    db.reordenarAtividades(ids)
      .then(recarregarCatalogoAtividades)
      .then(function () {
        ui.pronto();
        renderListaAtividades();

        var pos = ids.indexOf(movidaId);
        var nome = nomeAtividade(movidaId);
        ui.avisar(pos === 0
          ? nome + ' agora é a primeira.'
          : nome + ' agora vem depois de ' + nomeAtividade(ids[pos - 1]) + '.', 'sucesso', 4500);
      })
      .catch(function (e) {
        ui.pronto();
        renderListaAtividades();   // desfaz o que a tela sugeria
        ui.avisar(e.message, 'erro', 9000);
      });
  }

  /** Formulário de uma atividade. id nulo = nova. */
  function editarAtividade(id) {
    var a = id ? E.atividades.find(function (x) { return x.id === id; }) : null;
    var deps = id ? requeridasDe(id) : [];

    var cor   = a ? a.cor_fundo : '#94A3B8';
    var icone = a ? a.icone : 'circle-dashed';

    // Só atividades anteriores podem ser pré-requisito: impede ciclo por
    // construção, e é como a obra funciona de verdade. Nova entra no fim, então
    // todas são anteriores; ao arrastar, o banco confere que isso se mantém.
    var ordemDesta = a ? a.ordem_execucao : Infinity;
    var candidatas = E.atividades.filter(function (x) {
      return x.id !== id && x.ordem_execucao < ordemDesta;
    });

    // As cores que a obra já usa, para escolher com um clique. Uma atividade
    // nova costuma ficar na família de quem ela acompanha, e acertar o tom
    // parecido no seletor, no olho, nunca dá o mesmo.
    var usadas = [];
    E.atividades.forEach(function (x) {
      var c = String(x.cor_fundo || '').toLowerCase();
      var item = usadas.find(function (u) { return u.cor === c; });
      if (item) item.nomes.push(x.nome); else usadas.push({ cor: c, nomes: [x.nome] });
    });

    var corpo =
      '<div class="space-y-4">' +
        '<div>' +
          '<label class="rotulo">Nome</label>' +
          '<input id="atvNome" class="campo" value="' + esc(a ? a.nome : '') + '" ' +
                 'placeholder="Ex.: CONCRETAGEM / TUBULÃO">' +
          '<p class="text-xs text-slate-400 mt-1">' +
            (a
              ? 'A posição na lista muda arrastando, na lista de atividades.'
              : 'Entra no fim da lista. Depois arraste para o lugar certo.') +
          '</p>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="rotulo">Cor na grade</label>' +
            '<div class="flex items-center gap-2">' +
              // Maior que antes: era um quadradinho de 34px que parecia enfeite
              '<input id="atvCor" type="color" value="' + cor + '" ' +
                     'title="Clique para escolher a cor" ' +
                     'onchange="SIPAV.app.sincronizarCor(this.value)" ' +
                     'class="atv-seletor-cor">' +
              '<input id="atvCorTexto" class="campo font-mono text-xs" value="' + cor + '" ' +
                     'onchange="SIPAV.app.sincronizarCor(this.value, true)">' +
            '</div>' +
            '<p class="text-xs text-slate-400 mt-1">Clique no quadrado para escolher, ou digite o código.</p>' +
          '</div>' +
          '<div><label class="rotulo">Ícone</label>' +
            '<div class="flex items-center gap-2">' +
              '<span id="atvIconePreview" class="w-9 h-9 rounded flex items-center justify-center shrink-0" ' +
                    'style="background:' + cor + '">' +
                '<i data-lucide="' + esc(icone) + '" class="w-4 h-4"></i></span>' +
              '<input id="atvIcone" class="campo font-mono text-xs" value="' + esc(icone) + '" ' +
                     'onchange="SIPAV.app.sincronizarIcone(this.value)">' +
            '</div></div>' +
        '</div>' +

        '<div>' +
          '<label class="rotulo">Cores que a obra já usa</label>' +
          '<div class="flex flex-wrap gap-1.5">' +
            usadas.map(function (u) {
              return '<button type="button" class="atv-cor-usada" ' +
                       'style="background:' + esc(u.cor) + '" ' +
                       'title="' + esc(u.nomes.join(', ')) + '" ' +
                       'onclick="SIPAV.app.sincronizarCor(\'' + esc(u.cor) + '\')"></button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="rounded-lg border border-slate-200 p-2 max-h-28 overflow-y-auto barra-fina ' +
             'grid gap-1" style="grid-template-columns:repeat(auto-fill,minmax(34px,1fr))">' +
          ICONES.map(function (n) {
            return '<button onclick="SIPAV.app.sincronizarIcone(\'' + n + '\')" title="' + n + '" ' +
                     'class="h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500">' +
                     '<i data-lucide="' + n + '" class="w-4 h-4"></i></button>';
          }).join('') +
        '</div>' +

        '<label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">' +
          '<input type="checkbox" id="atvObrigatoria" ' + (!a || a.obrigatoria ? 'checked' : '') + ' ' +
                 'class="rounded border-slate-400">' +
          'Obrigatória em toda torre' +
        '</label>' +
        '<p class="text-xs text-slate-400 -mt-2">' +
          'Desmarque para atividade condicional — que só acontece em algumas torres, ' +
          'como perfuração em rocha ou tubulão. A importação do estágio só marca como ' +
          'executadas as obrigatórias anteriores, e a posição na lista decide o que é "anterior".' +
        '</p>' +

        '<div>' +
          '<label class="rotulo">Depende de</label>' +
          (candidatas.length
            ? '<div class="rounded-lg border border-slate-200 p-2 max-h-40 overflow-y-auto barra-fina space-y-1">' +
                candidatas.map(function (c) {
                  return '<label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer ' +
                           'px-1 py-0.5 rounded hover:bg-slate-100">' +
                    '<input type="checkbox" class="atvDep rounded border-slate-400" value="' + c.id + '" ' +
                           (deps.indexOf(c.id) !== -1 ? 'checked' : '') + '>' +
                    '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:' + c.cor_fundo + '"></span>' +
                    esc(c.nome) +
                  '</label>';
                }).join('') +
              '</div>'
            : '<p class="text-sm text-slate-400 italic">Nenhuma atividade anterior — esta fica livre.</p>') +
          '<p class="text-xs text-slate-400 mt-1">' +
            'Só aparecem atividades que vêm antes na lista, para não criar dependência circular.' +
          '</p>' +
        '</div>' +
      '</div>';

    var botoes = [
      { rotulo: 'Voltar', classe: 'btn-secundario', acao: function () {
          ui.fecharModal('modalGenerico'); abrirAtividades();
        } },
      { rotulo: a ? 'Salvar' : 'Criar', classe: 'btn-primario', acao: function () {
          salvarFormAtividade(id);
        } }
    ];

    if (a) {
      botoes.splice(1, 0, { rotulo: 'Remover', classe: 'btn-perigo', acao: function () {
        removerAtividade(a);
      } });
    }

    ui.modalGenerico({
      titulo: a ? 'Editar ' + a.nome : 'Nova atividade',
      corpoHtml: corpo,
      botoes: botoes
    });
  }

  function sincronizarCor(valor, doTexto) {
    if (!/^#[0-9a-fA-F]{6}$/.test(valor)) return;
    $('atvCor').value = valor;
    $('atvCorTexto').value = valor;
    $('atvIconePreview').style.background = valor;
    $('atvIconePreview').style.color = ui.corDoTexto(valor);
    if (doTexto) { /* nada extra, o color input já foi ajustado acima */ }
  }

  function sincronizarIcone(nome) {
    $('atvIcone').value = nome;
    $('atvIconePreview').innerHTML = '<i data-lucide="' + esc(nome) + '" class="w-4 h-4"></i>';
    ui.icones();
  }

  function salvarFormAtividade(id) {
    var nome = $('atvNome').value.trim();
    var cor  = $('atvCorTexto').value.trim();

    if (!nome) { ui.avisar('Dê um nome à atividade.', 'alerta'); $('atvNome').focus(); return; }
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) { ui.avisar('Cor inválida. Use o formato #RRGGBB.', 'alerta'); return; }

    // Nome repetido entre as que aparecem: dizer qual, em vez de esperar o erro
    // de chave duplicada do banco, que não diz nada.
    var repetida = E.atividades.find(function (x) {
      return x.id !== id && normalizar(x.nome) === normalizar(nome);
    });
    if (repetida) {
      ui.avisar('Já existe uma atividade chamada ' + repetida.nome + '.', 'alerta', 6000);
      $('atvNome').focus();
      return;
    }

    var deps = Array.prototype.slice.call(document.querySelectorAll('.atvDep:checked'))
      .map(function (c) { return c.value; });

    var dados = {
      id: id,
      nome: nome,
      corFundo: cor,
      icone: $('atvIcone').value.trim() || 'circle-dashed',
      obrigatoria: $('atvObrigatoria').checked
    };

    // Remover só desativa, e o nome continua ocupado no banco. Criar de novo com
    // o mesmo nome aparecia como "já existe" sem nenhuma atividade à vista, e a
    // saída era inventar um nome parecido. Agora pergunto se quero a de volta.
    //
    // Renomear para o nome de uma removida cai no mesmo buraco, do outro lado:
    // a pessoa que inventou o nome parecido quer, depois, o nome certo de volta.
    var atual = id ? E.atividades.find(function (x) { return x.id === id; }) : null;
    var renomeando = !!atual && atual.nome !== nome;
    var procura = (!id || renomeando) ? db.atividadeRemovidaPorNome(nome) : Promise.resolve(null);

    procura
      .then(function (removida) {
        if (!removida) return dados;

        // Renomeando uma ativa: não há o que recuperar, o nome só precisa ser
        // liberado. A removida vira "NOME (removida data)" e segue existindo.
        if (id) {
          return ui.confirmar('Uma atividade removida está com esse nome',
            '“' + removida.nome + '” foi removida, mas o nome continua ocupado por ela. ' +
            'Posso renomeá-la para “' + removida.nome + ' (removida …)” e deixar o nome ' +
            'para esta? Nada se perde: a programação antiga continua apontando para ela.',
            'Liberar o nome')
            .then(function (sim) {
              if (!sim) {
                ui.avisar('Escolha outro nome para esta atividade.', 'alerta', 6000);
                return null;
              }
              return db.liberarNomeDeRemovida(removida.id, removida.nome).then(function () {
                return dados;
              });
            });
        }

        return ui.confirmar('Já existe uma atividade removida com esse nome',
          '“' + removida.nome + '” foi removida antes e o nome continua dela. ' +
          'Recuperar essa, com o histórico, em vez de criar outra? Ela volta para o fim ' +
          'da lista, com a cor, o ícone e os pré-requisitos que você preencheu aqui. ' +
          'Quem dependia dela volta a depender.', 'Recuperar')
          .then(function (sim) {
            if (!sim) {
              ui.avisar('Escolha outro nome, ou recupere a removida.', 'alerta', 6000);
              return null;
            }
            dados.id = removida.id;
            dados.recuperar = true;
            // O nome dela, não o que eu digitei: o catálogo inteiro é em
            // maiúsculas e com acento, e recuperar não pode rebaixar o nome
            // para "restauracao de acesso" só porque eu digitei com pressa.
            dados.nome = removida.nome;
            return dados;
          });
      })
      .then(function (d) {
        if (!d) return null;

        ui.processando('Salvando atividade…');
        return db.salvarAtividade(d)
          .then(function (salva) { return db.salvarDependencias(salva.id, deps); })
          .then(recarregarCatalogoAtividades)
          .then(function () {
            ui.pronto();
            ui.fecharModal('modalGenerico');
            abrirAtividades();
            ui.avisar(d.recuperar ? 'Atividade recuperada.'
              : id ? 'Atividade atualizada.' : 'Atividade criada.', 'sucesso');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }

  function removerAtividade(a) {
    var dependentes = E.dependencias
      .filter(function (d) { return d.requer_atividade_id === a.id; })
      .map(function (d) { return nomeAtividade(d.atividade_id); });

    var aviso = 'Ela some das listas e para de ser oferecida. O histórico é preservado.';
    if (dependentes.length) {
      aviso += ' Atenção: ' + dependentes.join(', ') +
               ' depende' + (dependentes.length > 1 ? 'm' : '') +
               ' dela e deixará de exigi-la.';
    }

    ui.confirmar('Remover ' + a.nome, aviso, 'Remover').then(function (sim) {
      if (!sim) return;
      ui.processando('Removendo…');
      return db.desativarAtividade(a.id)
        .then(recarregarCatalogoAtividades)
        .then(function () {
          ui.pronto();
          ui.fecharModal('modalGenerico');
          abrirAtividades();
          ui.avisar('Atividade removida.', 'sucesso');
        });
    }).catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /** Recarrega catálogo e dependências, e atualiza tudo que depende deles. */
  function recarregarCatalogoAtividades() {
    return Promise.all([db.atividades(), db.dependencias()])
      .then(function (r) {
        E.atividades = r[0];
        E.dependencias = r[1];
        preencherFiltroAtividade();
        return recarregarProgramacoes();
      });
  }

  /* ======================================================================== */
  /* IMPORTAÇÃO DE TORRES                                                     */
  /* ======================================================================== */

  function abrirImportacao() {
    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-sm text-slate-600">' +
          'Cole direto da planilha de controle: uma torre por linha, com ' +
          '<strong>identificador</strong>, <strong>km</strong>, <strong>canteiro</strong> e ' +
          '<strong>estágio atual</strong> — separados por <strong>tab ou ponto e vírgula</strong>. ' +
          'As duas últimas colunas são opcionais, e o km pode usar vírgula decimal.' +
        '</p>' +
        '<pre class="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600">69/1 ; 0,617 ; WANDERLEY ; MONTAGEM\n70/1 ; 0,587 ; WANDERLEY ; PRÉ-MONTAGEM\n70/2 ; 0,533 ; WANDERLEY</pre>' +
        '<p class="text-xs text-slate-500">' +
          'Canteiro novo é criado na hora. O estágio marca como executadas a atividade ' +
          'informada e todas as obrigatórias anteriores da cadeia — é o que libera a ' +
          'programação e colore a grade.' +
        '</p>' +
        '<textarea id="areaImportacao" rows="12" ' +
          'class="campo font-mono text-xs barra-fina" placeholder="Cole aqui…">' +
          esc(textoImportacao) + '</textarea>' +
        '<p class="text-xs text-slate-400">' +
          'Torres já existentes no trecho têm o km atualizado. As novas são criadas na ordem colada.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Importar torres — ' + (E.trechoAtual ? E.trechoAtual.nome : ''),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Conferir', classe: 'btn-primario', acao: conferirImportacao }
      ]
    });
  }

  /**
   * Separador: tab ou ponto e vírgula. Vírgula NÃO entra — ela é o separador
   * decimal do km ("0,617"), e usá-la como separador de coluna quebrava o
   * número no meio, fazendo toda torre entrar com km zero.
   */
  function interpretarLinhas(texto) {
    var linhas = [];
    texto.split(/\r?\n/).forEach(function (bruta, i) {
      var linha = bruta.trim();
      if (!linha) return;

      var partes = linha.split(/\t|;/).map(function (p) { return p.trim(); });
      var identificador = partes[0];
      if (!identificador) return;

      var km = 0.400;
      if (partes[1]) {
        var n = parseFloat(partes[1].replace(',', '.'));
        if (!isNaN(n)) km = n;
      }
      linhas.push({
        identificador: identificador,
        km: km,
        canteiroNome: canonicoCanteiro(partes[2]),
        estagio: estagioValido(partes[3]),
        estrutura: interpretarEstrutura(partes[4]),
        modelo: partes[5] ? partes[5].toUpperCase() : null,
        ordem: i
      });
    });
    return linhas;
  }

  /**
   * "Não iniciada" não é atividade, é a ausência dela: a torre não tem nada
   * executado. Some, em vez de virar erro de estágio desconhecido.
   */
  var ESTAGIO_VAZIO = [
    'nao iniciada', 'nao iniciado', 'nao iniciadas', 'nao iniciados',
    'sem estagio', 'n/a', 'na', '-', '--'
  ];

  function estagioValido(valor) {
    if (!valor) return null;
    return ESTAGIO_VAZIO.indexOf(normalizar(valor)) === -1 ? valor : null;
  }

  /** Abreviações de canteiro usadas na planilha. */
  var ALIAS_CANTEIRO = {
    'laje dn':  'Laje dos Negros',
    'laje d n': 'Laje dos Negros',
    'ldn':      'Laje dos Negros',
    'laje':     'Laje dos Negros'
  };

  function canonicoCanteiro(nome) {
    if (!nome) return null;
    return ALIAS_CANTEIRO[normalizar(nome)] || nome;
  }

  /** "a" → AUTOPORTANTE, "e" → ESTAIADA. Aceita a palavra inteira também. */
  function interpretarEstrutura(valor) {
    var v = normalizar(valor);
    if (!v) return null;
    if (v === 'a' || v.indexOf('autoport') === 0) return 'AUTOPORTANTE';
    if (v === 'e' || v.indexOf('estaiad') === 0) return 'ESTAIADA';
    return null;
  }

  /* ------------------------------------------------- Estágio atual da torre -- */

  /**
   * De-para entre o nome que a planilha de controle usa e o nome cadastrado.
   * Chave normalizada (minúscula, sem acento). Quando aparecer um estágio novo,
   * a importação recusa e mostra o nome — basta acrescentar a linha aqui.
   */
  var ALIAS_ATIVIDADE = {
    // Montagem — a cadeia mudou em 24/09 (Alessandro, ver docs/04-relatorio-isa.md):
    // a flambagem faz parte da revisão, a revisão em solo faz parte da
    // pré-montagem, e o giro e prumo é etapa própria, depois das duas. Quando a
    // planilha traz as duas juntas, vale a mais adiantada — é o estágio da torre.
    'revisao':                 'REVISÃO',
    'revisao final':           'REVISÃO',
    'flambagem':               'REVISÃO',
    'revisao em solo':         'PRÉ-MONTAGEM',
    'giro e prumo':            'GIRO E PRUMO',
    'revisao giro e prumo':    'GIRO E PRUMO',
    'revisao / giro e prumo':  'GIRO E PRUMO',

    // Escavação também se abre em três, conforme o que a equipe cava
    'escavacao de estai':          'ESCAVAÇÃO - ESTAI',
    'escavacao estai':             'ESCAVAÇÃO - ESTAI',
    'escavacao de mc':             'ESCAVAÇÃO - MC',
    'escavacao mc':                'ESCAVAÇÃO - MC',
    'escavacao mastro central':    'ESCAVAÇÃO - MC',

    // Fundação — preparação e instalação de pré-moldados viraram a mesma etapa,
    // e ela se abre em três conforme o que a equipe instala
    'preparacao':                  'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L',
    'pre-moldados':                'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L',
    'pre moldados':                'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L',
    'instalacao de pre-moldados':  'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L',
    'viga l':                      'INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L',
    'mastro central':              'INSTALAÇÃO DE PRÉ-MOLDADOS - MC',
    'mc':                          'INSTALAÇÃO DE PRÉ-MOLDADOS - MC',

    // Lançamento — grampeação e ancoragem se separaram. A etapa antiga queria
    // dizer as duas feitas, então vale a de ordem maior.
    'grampeacao e ancoragem opgw / para-raio': 'ANCORAGEM OPGW / PARA-RAIO',
    'grampeacao e ancoragem opgw':             'ANCORAGEM OPGW / PARA-RAIO',
    'grampeacao e ancoragem dos condutores':   'ANCORAGEM DOS CONDUTORES',
    'grampeacao opgw':                         'GRAMPEAÇÃO OPGW / PARA-RAIO',
    'ancoragem opgw':                          'ANCORAGEM OPGW / PARA-RAIO',
    'grampeacao condutor':                     'GRAMPEAÇÃO DOS CONDUTORES',
    'ancoragem condutor':                      'ANCORAGEM DOS CONDUTORES',

    // Acessórios abriram em três
    'acessorios':                'INSTALAÇÃO DE ESPAÇADORES',
    'instalacao de acessorios':  'INSTALAÇÃO DE ESPAÇADORES',
    'espacador':                 'INSTALAÇÃO DE ESPAÇADORES',
    'espacadores':               'INSTALAÇÃO DE ESPAÇADORES',
    'jumper':                    'INSTALAÇÃO DE JUMPER',
    'sinalizacao':               'INSTALAÇÃO DE SINALIZAÇÃO',

    // Bandola do para-raio/OPGW e bandola do condutor são etapas diferentes: a do
    // condutor vem depois do para-raio/OPGW lançado, e leva isolador junto
    'bandolas':                    'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO',
    'bandola':                     'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO',
    'instalacao de bandolas':      'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO',
    'bandolas e isoladores':       'INSTALAÇÃO DE BANDOLAS E ISOLADORES',
    'bandola de condutor':         'INSTALAÇÃO DE BANDOLAS E ISOLADORES',
    'bandolas do condutor':        'INSTALAÇÃO DE BANDOLAS E ISOLADORES',

    // Pilotinho é o cabo-guia do para-raio/OPGW; piloto é o do condutor
    'pilotinho':                   'LANÇAMENTO DO PILOTINHO',
    'lancamento do pilotinho':     'LANÇAMENTO DO PILOTINHO',
    'lancam. pilotinho':           'LANÇAMENTO DO PILOTINHO',
    'piloto':                      'LANÇAMENTO DO PILOTO DO CONDUTOR',
    'lancamento do piloto':        'LANÇAMENTO DO PILOTO DO CONDUTOR',
    'piloto do condutor':          'LANÇAMENTO DO PILOTO DO CONDUTOR',

    'lancam. condutor':        'LANÇAMENTO CONDUTOR 100%',
    'lancam condutor':         'LANÇAMENTO CONDUTOR 100%',
    'lanc. condutor':          'LANÇAMENTO CONDUTOR 100%',
    'lancamento condutor':     'LANÇAMENTO CONDUTOR 100%',
    'lancamento do condutor':  'LANÇAMENTO CONDUTOR 100%',
    'condutor':                'LANÇAMENTO CONDUTOR 100%',

    'lancam. opgw':            'LANÇAMENTO DO CABO OPGW/PR',
    'lancam opgw':             'LANÇAMENTO DO CABO OPGW/PR',
    'lanc. opgw':              'LANÇAMENTO DO CABO OPGW/PR',
    'lancamento opgw':         'LANÇAMENTO DO CABO OPGW/PR',
    'lancamento do opgw':      'LANÇAMENTO DO CABO OPGW/PR',
    'opgw':                    'LANÇAMENTO DO CABO OPGW/PR',
    'opgw/pr':                 'LANÇAMENTO DO CABO OPGW/PR',

    'aterramento':             'ATERRAMENTO / CONTRAPESO',
    'contrapeso':              'ATERRAMENTO / CONTRAPESO',
    'reaterro':                'REATERRO 100%',
    'medicao de resistencia':  'MEDIÇÃO DE RESISTÊNCIA',
    'teste de fundacao':       'TESTE DE ARRANCAMENTO',
    'pre montagem':            'PRÉ-MONTAGEM',
    'premontagem':             'PRÉ-MONTAGEM'
  };

  function acharAtividade(nome) {
    var alvo = normalizar(nome);
    if (ALIAS_ATIVIDADE[alvo]) alvo = normalizar(ALIAS_ATIVIDADE[alvo]);
    return E.atividades.find(function (a) { return normalizar(a.nome) === alvo; }) || null;
  }

  /**
   * Do estágio atual deduz tudo que já aconteceu: a própria atividade mais
   * todas as OBRIGATÓRIAS anteriores na ordem de execução.
   *
   * As condicionais anteriores ficam de fora de propósito — não dá para saber
   * se aquela torre levou perfuração em rocha, tubulão ou pré-moldado. Marcar
   * as três seria inventar dado.
   */
  function expandirEstagio(atividade) {
    var ids = E.atividades
      .filter(function (a) {
        return a.obrigatoria && a.ordem_execucao <= atividade.ordem_execucao;
      })
      .map(function (a) { return a.id; });

    if (ids.indexOf(atividade.id) === -1) ids.push(atividade.id);
    return ids;
  }

  function gravarEstagios(torres, linhas) {
    var idPor = {};
    torres.forEach(function (t) { idPor[t.identificador] = t.id; });

    var registros = [];
    var jaTem = {};

    linhas.forEach(function (l) {
      if (!l.estagio) return;                    // "Não iniciada" cai aqui
      var torreId = idPor[l.identificador];
      if (!torreId) return;
      expandirEstagio(acharAtividade(l.estagio)).forEach(function (aid) {
        // A mesma torre repetida na colagem, ou dois estágios que expandem para
        // a mesma atividade, gerariam duas execuções iguais — e execução
        // contada em dobro vira avanço em dobro no relatório da ISA.
        var chave = torreId + '|' + aid;
        if (jaTem[chave]) return;
        jaTem[chave] = true;
        registros.push({ torreId: torreId, atividadeId: aid });
      });
    });

    // Limpa TODAS as torres da importação, não só as que têm estágio: se uma
    // torre voltou para "Não iniciada", a carga inicial antiga precisa sumir.
    return db.limparCargaInicial(torres.map(function (t) { return t.id; }))
      .then(function () { return db.registrarCargaInicial(registros); });
  }

  /* ======================================================================== */
  /* MOVIMENTAÇÃO — o dia sem atividade na torre                              */
  /* ======================================================================== */

  /**
   * Encarregado que muda de canteiro, deslocamento de máquina, ou um dia sem
   * atividade por outro motivo.
   *
   * Existe para o dia vazio não ser um mistério. Nos painéis, um dia sem nada
   * pode ser mudança, chuva, falta de material ou programação que ninguém lançou,
   * e vazio não diz qual.
   *
   * Vale para um dia só: o registro fica naquele dia. Se se repete no dia
   * seguinte, registra-se de novo.
   *
   * O deslocamento de máquina é só isso, um registro no dia. Na planilha de
   * programação escrevia-se "mudança de máquina" e mais nada, e é esse o nível de
   * detalhe: sem qual máquina, sem de onde nem para onde. Pode ter o encarregado,
   * para o registro ficar ligado a ele naquela semana.
   *
   * Não é programação: não tem torre nem atividade de execução, e não passa por
   * precedência, aderência nem relatório da ISA.
   */
  function podeRegistrarMovimentacao() {
    return !!E.perfil && (E.perfil.papel === 'ADMIN' || E.perfil.papel === 'PLANEJAMENTO');
  }

  function abrirMovimentacao(id) {
    if (!E.trechoAtual) return;

    if (!podeRegistrarMovimentacao()) {
      ui.avisar('Só administração e planejamento registram movimentação.', 'alerta');
      return;
    }

    var m = id ? (E.movimentacoes || []).find(function (x) { return x.id === id; }) : null;
    if (id && !m) return;

    var atual = E.trechoAtual.id;

    // Os canteiros que atendem o trecho da tela vêm primeiro: é de onde a maioria
    // das mudanças sai ou para onde vai
    var canteiros = (E.canteiros || []).filter(function (c) {
      return c.ativo !== false || (m && (m.canteiro_origem_id === c.id || m.canteiro_destino_id === c.id));
    }).sort(function (a, b) {
      var sa = (a.trechos || []).indexOf(atual) !== -1 ? 0 : 1;
      var sb = (b.trechos || []).indexOf(atual) !== -1 ? 0 : 1;
      return sa - sb || a.nome.localeCompare(b.nome, 'pt-BR');
    });

    var opcoesCanteiro = function (selecionado) {
      return '<option value="">— escolha o canteiro —</option>' +
        canteiros.map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === selecionado ? ' selected' : '') + '>' +
                 esc(c.nome) + '</option>';
        }).join('');
    };

    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-xs" style="color:var(--texto-fraco)">' +
          'Um dia sem atividade na torre, e o motivo. Vale só para o dia escolhido. ' +
          'Não é programação: aparece nos painéis Por Encarregado e Por Data, ' +
          'para o dia não ficar vazio sem explicação.' +
        '</p>' +

        '<div><label class="rotulo">O que aconteceu</label>' +
          '<select id="movTipo" class="campo" onchange="SIPAV.app.mudarTipoMovimentacao()">' +
            '<option value="MUDANCA_TRECHO">Mudança de trecho (encarregado)</option>' +
            '<option value="MUDANCA_MAQUINA">Deslocamento de máquina</option>' +
            '<option value="OUTRO">Outro motivo (dia sem atividade)</option>' +
          '</select></div>' +

        '<div><label class="rotulo">Dia</label>' +
          '<input id="movData" type="date" class="campo" ' +
                 'onchange="SIPAV.app.mostrarDiasDaMovimentacao()">' +
          // A obra se guia pelo dia da semana, e uma data crua manda olhar o calendário
          '<p id="movDias" class="dia-semana"></p></div>' +

        '<div id="movBlocoEnc"><label class="rotulo" id="movRotuloEnc">Encarregado</label>' +
          '<input id="movEncarregado" class="campo" list="movListaEnc" autocomplete="off" ' +
                 'placeholder="Digite para buscar…">' +
          '<datalist id="movListaEnc">' +
            E.encarregados.map(function (e) { return '<option value="' + esc(e.nome) + '">'; }).join('') +
          '</datalist></div>' +

        '<div id="movBlocoCanteiros" class="grid grid-cols-2 gap-3">' +
          '<div><label class="rotulo">Do canteiro</label>' +
            '<select id="movCanteiroOrigem" class="campo">' +
              opcoesCanteiro(m ? m.canteiro_origem_id : '') + '</select></div>' +
          '<div><label class="rotulo">Para o canteiro</label>' +
            '<select id="movCanteiroDestino" class="campo">' +
              opcoesCanteiro(m ? m.canteiro_destino_id : '') + '</select></div>' +
        '</div>' +

        '<div><label class="rotulo" id="movRotuloObs">Observação ' +
            '<span style="font-weight:400">(opcional)</span></label>' +
          '<input id="movObs" class="campo" autocomplete="off" ' +
                 'placeholder="Ex.: sai depois do almoço"></div>' +
      '</div>';

    var botoes = [{ rotulo: 'Cancelar', classe: 'btn-secundario' }];
    if (m) {
      botoes.push({ rotulo: 'Remover', classe: 'btn-perigo', acao: function () {
        removerMovimentacao(m);
      } });
    }
    botoes.push({ rotulo: m ? 'Salvar' : 'Registrar', classe: 'btn-primario', acao: function () {
      salvarMovimentacao(id);
    } });

    ui.modalGenerico({
      titulo: m ? 'Alterar movimentação' : 'Registrar movimentação',
      corpoHtml: corpo,
      botoes: botoes
    });

    // Preenche depois de montar: valores com aspas ou acento passam pelo DOM, não
    // pela string do HTML
    $('movTipo').value = m ? m.tipo : 'MUDANCA_TRECHO';
    $('movData').value = m ? m.data : (E.periodo && E.periodo.de && E.periodo.de > ui.hoje() ? E.periodo.de : ui.hoje());
    $('movEncarregado').value = m && m.encarregado ? m.encarregado.nome : '';
    $('movObs').value = m ? (m.observacao || '') : '';

    mudarTipoMovimentacao();
    mostrarDiasDaMovimentacao();
  }

  /**
   * O que a janela pede muda com o tipo. Mudança de trecho pede encarregado e os
   * dois canteiros; "outro" pede o motivo; o deslocamento de máquina pede só o dia,
   * e o encarregado se quiserem ligar o registro a ele.
   */
  function mudarTipoMovimentacao() {
    var tipo = $('movTipo').value;

    $('movBlocoCanteiros').classList.toggle('hidden', tipo !== 'MUDANCA_TRECHO');

    $('movRotuloEnc').textContent = tipo === 'MUDANCA_TRECHO'
      ? 'Encarregado' : 'Encarregado (opcional)';
    $('movRotuloObs').innerHTML = tipo === 'OUTRO'
      ? 'Motivo'
      : 'Observação <span style="font-weight:400">(opcional)</span>';

    $('movObs').placeholder = tipo === 'OUTRO'
      ? 'Ex.: chuva, falta de material, feriado local'
      : tipo === 'MUDANCA_MAQUINA' ? 'Ex.: escavadeira PC200' : 'Ex.: sai depois do almoço';
  }

  function mostrarDiasDaMovimentacao() {
    var dia = $('movData').value;
    var campo = $('movDias');
    if (!dia) { campo.textContent = ''; return; }

    campo.textContent = ui.diaDaSemana(dia);
    campo.className = 'dia-semana' + (ui.fimDeSemana(dia) ? ' fim-de-semana' : '');
  }

  function salvarMovimentacao(id) {
    var tipo = $('movTipo').value;
    var data = $('movData').value;
    var obs = $('movObs').value.trim();
    var nomeEnc = $('movEncarregado').value.trim();

    function recusar(texto, campo) {
      ui.avisar(texto, 'alerta', 6000);
      if (campo && $(campo)) $(campo).focus();
    }

    if (!data) return recusar('Informe o dia.', 'movData');

    // O encarregado vem de uma lista com busca. Nome digitado que não bate com
    // ninguém não pode virar movimentação "sem encarregado" calada.
    var enc = null;
    if (nomeEnc) {
      enc = E.encarregados.find(function (e) { return normalizar(e.nome) === normalizar(nomeEnc); });
      if (!enc) return recusar('Não achei o encarregado "' + nomeEnc + '". Escolha um da lista.', 'movEncarregado');
    }

    if (tipo === 'MUDANCA_TRECHO' && !enc) return recusar('Escolha o encarregado que muda de canteiro.', 'movEncarregado');
    if (tipo === 'OUTRO' && !obs) return recusar('Diga o motivo: é ele que explica o dia vazio.', 'movObs');

    var canteiroOrigem = '', canteiroDestino = '';

    if (tipo === 'MUDANCA_TRECHO') {
      canteiroOrigem = $('movCanteiroOrigem').value;
      canteiroDestino = $('movCanteiroDestino').value;
      if (!canteiroOrigem) return recusar('Escolha de qual canteiro.', 'movCanteiroOrigem');
      if (!canteiroDestino) return recusar('Escolha para qual canteiro.', 'movCanteiroDestino');
      if (canteiroOrigem === canteiroDestino) return recusar('O destino é o mesmo canteiro de origem.', 'movCanteiroDestino');
    }

    // Choque com a programação: quem muda de canteiro (ou está sem atividade) num
    // dia em que tem torre programada. Pode ser legítimo — sai depois do serviço —
    // mas tem que ser deliberado, e não descoberto na sexta.
    // Deslocamento de máquina não entra: ele só liga o registro ao encarregado, e
    // a máquina mudar de lugar não impede ninguém de trabalhar.
    var choque = (enc && tipo !== 'MUDANCA_MAQUINA')
      ? E.programacoes.filter(function (p) {
          return p.encarregado && p.encarregado.id === enc.id && p.data === data;
        })
      : [];

    var dados = {
      id: id,
      tipo: tipo,
      data: data,
      encarregadoId: enc ? enc.id : null,
      trechoId: E.trechoAtual.id,
      canteiroOrigemId: canteiroOrigem,
      canteiroDestinoId: canteiroDestino,
      observacao: obs
    };

    function gravar() {
      ui.processando('Registrando…');
      return db.salvarMovimentacao(dados)
        .then(recarregarProgramacoes)
        .then(function () {
          ui.pronto();
          ui.fecharModal('modalGenerico');
          ui.avisar(id ? 'Movimentação atualizada.' : 'Movimentação registrada.', 'sucesso');
        });
    }

    var seguir = choque.length
      ? ui.confirmar('Já tem atividade nesse dia',
          enc.nome + ' tem ' + choque.length + ' atividade(s) programada(s) em ' +
          ui.dataCurta(data) + ' (' + choque.slice(0, 3).map(function (p) {
            return p.torre ? p.torre.identificador : '?';
          }).join(', ') + (choque.length > 3 ? '…' : '') + '). ' +
          'Registrar a movimentação mesmo assim?', 'Registrar mesmo assim')
      : Promise.resolve(true);

    seguir
      .then(function (sim) { return sim ? gravar() : null; })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 7000); });
  }
  function removerMovimentacao(m) {
    ui.confirmar('Remover a movimentação',
      'Apaga este registro. O dia volta a aparecer sem explicação nos painéis.', 'Remover')
      .then(function (sim) {
        if (!sim) return;
        ui.processando('Removendo…');
        return db.removerMovimentacao(m.id)
          .then(recarregarProgramacoes)
          .then(function () {
            ui.pronto();
            ui.fecharModal('modalGenerico');
            ui.avisar('Movimentação removida.', 'sucesso');
          });
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro'); });
  }

  /**
   * Compara nomes ignorando caixa E acento: na planilha vem "IGARITE", no
   * cadastro está "Igarité". Sem isso o sistema criaria um canteiro duplicado.
   */
  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  /** Acha o id de cada canteiro citado na planilha, criando os que não existem. */
  function resolverCanteiros(linhas) {
    function acharId(nome) {
      var alvo = normalizar(nome);
      var c = E.canteiros.find(function (x) { return normalizar(x.nome) === alvo; });
      return c ? c.id : null;
    }

    var citados = {};
    linhas.forEach(function (l) { if (l.canteiroNome) citados[l.canteiroNome] = true; });
    var nomes = Object.keys(citados);
    if (!nomes.length) return Promise.resolve();

    // Rede de proteção: canteiro com nome só de número é sintoma de separador
    // errado, não canteiro de verdade. Melhor recusar do que sujar o cadastro.
    var suspeitos = nomes.filter(function (n) { return /^[0-9]+$/.test(n); });
    if (suspeitos.length) {
      return Promise.reject(new db.SipavErro(
        'A terceira coluna veio com números (' + suspeitos.slice(0, 3).join(', ') +
        '…) em vez de nome de canteiro. Verifique o separador: use tab ou ' +
        'ponto e vírgula, nunca vírgula — ela é o decimal do km.'
      ));
    }

    var novos = nomes.filter(function (n) { return !acharId(n); });

    return Promise.all(novos.map(function (n) { return db.criarCanteiro(n); }))
      .then(function () { return db.canteiros(); })
      .then(function (lista) {
        E.canteiros = lista;
        // Se a planilha põe uma torre deste trecho num canteiro, então esse
        // canteiro atua neste trecho — garante o vínculo, inclusive dos que
        // já existiam.
        return Promise.all(nomes.map(function (n) {
          var id = acharId(n);
          return id ? db.vincularCanteiroTrecho(id, E.trechoAtual.id) : Promise.resolve();
        }));
      })
      .then(function () { return db.canteiros(); })
      .then(function (lista) {
        E.canteiros = lista;
        preencherFiltroCanteiro();
        linhas.forEach(function (l) {
          l.canteiroId = l.canteiroNome ? acharId(l.canteiroNome) : null;
        });
      });
  }

  /**
   * Km com as mesmas casas dos dois lados da seta.
   *
   * ui.km encolhe o 0,617 e o 0,500 de formas diferentes, e ler "0,50 → 0,617"
   * dá a impressão de que mudou mais do que mudou.
   */
  function kmIgual(n) {
    var v = Number(n);
    if (isNaN(v)) v = 0;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  /**
   * Confere o que a colagem vai fazer ANTES de escrever no banco.
   *
   * É o ponto do sistema onde um erro entra mais fundo e mais calado: a
   * importação mexe em torre, km, canteiro e estágio de uma vez, e o estágio
   * reescreve a carga inicial inteira da torre. Já mordeu — foi assim que
   * entraram dezenas de canteiros com nome de número, por causa de um separador
   * errado, e só se percebeu depois.
   *
   * Nada é gravado aqui. Só leitura e comparação com o que já existe.
   */
  function analisarImportacao(linhas) {
    var porIdent = {};
    E.torres.forEach(function (t) { porIdent[normalizar(t.identificador)] = t; });

    var canteirosConhecidos = {};
    E.canteiros.forEach(function (c) { canteirosConhecidos[normalizar(c.nome)] = c; });

    var r = {
      novas: [], atualizadas: [], semMudanca: [],
      canteirosNovos: [], estagios: {}, duplicadas: [],
      estagiosDesconhecidos: [], canteirosSuspeitos: [], total: linhas.length
    };

    var vistas = {};

    linhas.forEach(function (l) {
      var chave = normalizar(l.identificador);

      if (vistas[chave]) { r.duplicadas.push(l.identificador); return; }
      vistas[chave] = true;

      if (l.estagio && !acharAtividade(l.estagio)) {
        if (r.estagiosDesconhecidos.indexOf(l.estagio) === -1) {
          r.estagiosDesconhecidos.push(l.estagio);
        }
      } else if (l.estagio) {
        r.estagios[l.estagio] = (r.estagios[l.estagio] || 0) + 1;
      }

      if (l.canteiroNome) {
        var ck = normalizar(l.canteiroNome);
        if (/^[0-9]+$/.test(l.canteiroNome)) {
          if (r.canteirosSuspeitos.indexOf(l.canteiroNome) === -1) {
            r.canteirosSuspeitos.push(l.canteiroNome);
          }
        } else if (!canteirosConhecidos[ck] && r.canteirosNovos.indexOf(l.canteiroNome) === -1) {
          r.canteirosNovos.push(l.canteiroNome);
        }
      }

      var atual = porIdent[chave];
      if (!atual) { r.novas.push(l); return; }

      // Compara campo a campo para dizer o que muda, não só "vai mexer"
      var mudancas = [];
      var kmAtual = Number(atual.km);
      if (Math.abs(kmAtual - l.km) > 0.0001) {
        mudancas.push('km ' + kmIgual(kmAtual) + ' → ' + kmIgual(l.km));
      }
      if (l.canteiroNome) {
        var cAtual = E.canteiros.find(function (c) { return c.id === atual.canteiro_id; });
        var nomeAtual = cAtual ? cAtual.nome : null;
        if (normalizar(nomeAtual || '') !== normalizar(l.canteiroNome)) {
          mudancas.push('canteiro ' + (nomeAtual || '—') + ' → ' + l.canteiroNome);
        }
      }
      if (l.estrutura && l.estrutura !== atual.estrutura) {
        mudancas.push('tipo ' + (atual.estrutura || '—') + ' → ' + l.estrutura);
      }
      if (l.modelo && normalizar(l.modelo) !== normalizar(atual.modelo || '')) {
        mudancas.push('modelo ' + (atual.modelo || '—') + ' → ' + l.modelo);
      }
      if (l.estagio) {
        var nova = acharAtividade(l.estagio);
        if (nova && normalizar(nova.nome) !== normalizar(atual.ultima_atividade || '')) {
          mudancas.push('estágio ' + (atual.ultima_atividade || 'não iniciada') + ' → ' + nova.nome);
        }
      }

      if (mudancas.length) r.atualizadas.push({ linha: l, mudancas: mudancas });
      else r.semMudanca.push(l);
    });

    return r;
  }

  /** Bloco de contagem, um por tipo de efeito. */
  function cartaoPrevia(cor, numero, titulo, detalhe) {
    return '<div class="previa-cartao ' + cor + '">' +
             '<p class="previa-numero">' + numero + '</p>' +
             '<p class="previa-titulo">' + esc(titulo) + '</p>' +
             (detalhe ? '<p class="previa-detalhe">' + detalhe + '</p>' : '') +
           '</div>';
  }

  function conferirImportacao() {
    // Guarda aqui, e não em quem chama: o "Voltar e corrigir" devolve a colagem
    // inteira. Quem colou noventa linhas e viu um estágio errado não vai
    // recolar tudo.
    textoImportacao = $('areaImportacao').value;
    var linhas = interpretarLinhas(textoImportacao);
    if (!linhas.length) { ui.avisar('Nada para importar.', 'alerta'); return; }

    importacaoPendente = linhas;
    var r = analisarImportacao(linhas);

    var impede = r.estagiosDesconhecidos.length || r.canteirosSuspeitos.length;

    var corpo = '<div class="space-y-3">';

    if (r.canteirosSuspeitos.length) {
      corpo +=
        '<div class="rounded-lg border border-rose-300 bg-rose-50 p-3">' +
          '<p class="text-sm font-semibold text-rose-800">Separador errado</p>' +
          '<p class="text-xs text-rose-800 mt-1">' +
            'A terceira coluna veio com número (' +
            esc(r.canteirosSuspeitos.slice(0, 4).join(', ')) + '…) onde deveria vir nome ' +
            'de canteiro. Quase sempre é vírgula usada como separador — ela é o decimal ' +
            'do km. Use <strong>tab</strong> ou <strong>ponto e vírgula</strong>.' +
          '</p>' +
        '</div>';
    }

    if (r.estagiosDesconhecidos.length) {
      corpo +=
        '<div class="rounded-lg border border-rose-300 bg-rose-50 p-3">' +
          '<p class="text-sm font-semibold text-rose-800">' +
            r.estagiosDesconhecidos.length + ' estágio(s) que o SIPAV não conhece</p>' +
          '<p class="text-xs text-rose-800 mt-1"><strong>' +
            esc(r.estagiosDesconhecidos.join(' · ')) + '</strong></p>' +
          '<p class="text-xs text-rose-700 mt-1">' +
            'Cadastre a atividade ou corrija o nome na planilha. Nada é importado ' +
            'enquanto isso: metade importada e metade sem estágio é pior que nada.' +
          '</p>' +
        '</div>';
    }

    if (r.duplicadas.length) {
      corpo +=
        '<div class="rounded-lg border border-amber-300 bg-amber-50 p-3">' +
          '<p class="text-sm font-semibold text-amber-900">' +
            r.duplicadas.length + ' torre(s) repetida(s) na colagem</p>' +
          '<p class="text-xs text-amber-800 mt-1">' +
            esc(r.duplicadas.slice(0, 10).join(', ')) +
            (r.duplicadas.length > 10 ? ' e mais ' + (r.duplicadas.length - 10) : '') +
            '. Só a primeira aparição de cada uma vale.' +
          '</p>' +
        '</div>';
    }

    corpo +=
      '<div class="previa-grade">' +
        cartaoPrevia('previa-nova', r.novas.length, 'torres novas',
          r.novas.length
            ? esc(r.novas.slice(0, 6).map(function (l) { return l.identificador; }).join(', ')) +
              (r.novas.length > 6 ? '…' : '')
            : '') +
        cartaoPrevia('previa-muda', r.atualizadas.length, 'torres alteradas', '') +
        cartaoPrevia('previa-igual', r.semMudanca.length, 'sem mudança', '') +
        cartaoPrevia('previa-canteiro', r.canteirosNovos.length, 'canteiros criados',
          esc(r.canteirosNovos.join(', '))) +
      '</div>';

    if (r.atualizadas.length) {
      corpo +=
        '<div>' +
          '<p class="rotulo">O que muda nas torres que já existem</p>' +
          '<div class="space-y-1 max-h-48 overflow-y-auto barra-fina">' +
            r.atualizadas.map(function (a) {
              return '<div class="previa-linha">' +
                '<span class="lote-id">' + esc(a.linha.identificador) + '</span>' +
                '<span class="previa-mudancas">' + esc(a.mudancas.join(' · ')) + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    var estagios = Object.keys(r.estagios);
    if (estagios.length) {
      corpo +=
        '<div>' +
          '<p class="rotulo">Estágios que vão ser marcados como executados</p>' +
          '<p class="text-xs" style="color:var(--texto-suave)">' +
            estagios.sort().map(function (nome) {
              return esc(nome) + ' <strong>(' + r.estagios[nome] + ')</strong>';
            }).join(' · ') +
          '</p>' +
          '<p class="text-xs mt-1" style="color:var(--texto-fraco)">' +
            'Cada estágio marca a atividade informada e todas as obrigatórias ' +
            'anteriores da cadeia, e <strong>substitui</strong> a carga anterior da torre. ' +
            'Apontamento feito em campo não é tocado.' +
          '</p>' +
        '</div>';
    }

    corpo += '</div>';

    var botoes = [{ rotulo: 'Voltar e corrigir', classe: 'btn-secundario',
                    acao: function () { ui.fecharModal('modalGenerico'); abrirImportacao(); } }];

    if (!impede) {
      botoes.push({ rotulo: 'Importar ' + (r.novas.length + r.atualizadas.length) + ' torres',
                    classe: 'btn-primario', acao: executarImportacao });
    }

    ui.modalGenerico({
      titulo: 'Conferir antes de importar — ' + (E.trechoAtual ? E.trechoAtual.nome : ''),
      corpoHtml: corpo,
      botoes: botoes
    });
  }

  var importacaoPendente = null;
  var textoImportacao = '';

  function executarImportacao() {
    var linhas = importacaoPendente;
    if (!linhas || !linhas.length) { ui.avisar('Nada para importar.', 'alerta'); return; }

    ui.processando('Importando ' + linhas.length + ' torres…');
    resolverCanteiros(linhas)
      .then(function () { return db.importarTorres(E.trechoAtual.id, linhas); })
      .then(function (torres) { return gravarEstagios(torres, linhas); })
      .then(carregarTrecho)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        importacaoPendente = null;
        textoImportacao = '';
        ui.avisar(linhas.length + ' torres importadas.', 'sucesso');
      })
      .catch(function (e) { ui.pronto(); ui.avisar(e.message, 'erro', 6000); });
  }

  /* ======================================================================== */
  /* SAÍDAS                                                                   */
  /* ======================================================================== */

  function tituloRelatorio() {
    var nomes = { grade: 'Grade Geral', datas: 'Programação por Data',
                  encarregados: 'Programação por Encarregado', atividades: 'Programação por Atividade' };
    return nomes[E.aba] + ' — ' + (E.trechoAtual ? E.trechoAtual.nome : '');
  }

  function abrirExportarPdf() {
    var corpo =
      '<div class="space-y-3">' +
        '<div><label class="rotulo">Título do relatório</label>' +
          '<input id="pdfTitulo" class="campo" value="' + esc(tituloRelatorio()) + '"></div>' +
        '<div><label class="rotulo">Nome do arquivo</label>' +
          '<input id="pdfArquivo" class="campo" value="SIPAV_' +
            (E.trechoAtual ? E.trechoAtual.nome.replace(/[^\w]+/g, '_') : 'relatorio') +
            '_' + ui.hoje() + '"></div>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Exportar PDF',
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Gerar PDF', classe: 'btn-primario', acao: gerarPdf }
      ]
    });
  }

  /* --------------------------------------------- Relatório da ISA -------- */

  function abrirRelatorioIsa() {
    var segunda = ui.iso(ui.segundaDaSemana(ui.somarDias(new Date(), 7)));

    var corpo =
      '<div class="space-y-4">' +
        '<p class="text-sm text-slate-600">' +
          'Sobe a planilha <strong>RPSQ</strong> deste trecho e o SIPAV preenche as linhas ' +
          '<strong>PROG. 1</strong> e <strong>PROG. 2</strong> com a programação da quinzena. ' +
          'Nada mais é tocado: a linha EXEC., os totais, o cabeçalho e o rodapé ficam como estão.' +
        '</p>' +

        '<div><label class="rotulo">Segunda-feira da semana 1</label>' +
          '<input id="isaSegunda" type="date" class="campo" value="' + segunda + '">' +
          '<p class="text-xs text-slate-500 mt-1">' +
            'A semana 2 é a seguinte. É a mesma data que vai no cabeçalho da planilha.' +
          '</p></div>' +

        '<div><label class="rotulo">Planilha do trecho</label>' +
          '<input id="isaArquivo" type="file" accept=".xlsx" class="campo text-sm"></div>' +

        '<p class="text-xs text-slate-400">' +
          'O arquivo original não é alterado — você baixa uma cópia preenchida. ' +
          'Confira antes de enviar: é a primeira versão.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Relatório da ISA — ' + (E.trechoAtual ? E.trechoAtual.nome : ''),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Preencher', classe: 'btn-primario', acao: gerarRelatorioIsa }
      ]
    });
  }

  function gerarRelatorioIsa() {
    var entrada = $('isaArquivo');
    var arquivo = entrada.files && entrada.files[0];
    var segunda = $('isaSegunda').value;

    if (!arquivo) { ui.avisar('Escolha a planilha do trecho.', 'alerta'); return; }
    if (!segunda) { ui.avisar('Informe a segunda-feira da semana 1.', 'alerta'); return; }

    ui.fecharModal('modalGenerico');
    ui.processando('Preenchendo a planilha…');

    // Busca do banco em vez de usar E.programacoes: aquela lista vem recortada
    // pelo filtro de período da tela, e exportar a quinzena que vem com o filtro
    // em "esta semana" deixaria programação de fora sem avisar ninguém.
    var inicio = ui.paraData(segunda);

    db.programacoes({
      trechoId: E.trechoAtual.id,
      de:  ui.iso(inicio),
      ate: ui.iso(ui.somarDias(inicio, 13))
    })
      .then(function (progs) {
        return SIPAV.isa.gerar(arquivo, inicio, progs, E.torres);
      })
      .then(function (r) {
        ui.pronto();
        baixarBlob(r.blob, arquivo.name.replace(/\.xlsx$/i, '') + ' - SIPAV.xlsx');
        mostrarRelatoIsa(r.relato);
      })
      .catch(function (e) {
        ui.pronto();
        ui.avisar(e.message || 'Falha ao preencher a planilha', 'erro', 7000);
      });
  }

  function baixarBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** O que foi escrito e, principalmente, o que não foi. */
  function mostrarRelatoIsa(r) {
    function bloco(cor, titulo, corpo) {
      return '<div class="rounded-lg border p-3 ' + cor + '">' +
               '<p class="text-sm font-semibold">' + titulo + '</p>' +
               '<p class="text-xs mt-1">' + corpo + '</p>' +
             '</div>';
    }

    var partes = [];

    partes.push(bloco('border-emerald-300 bg-emerald-50 text-emerald-800',
      r.linhasEscritas + (r.linhasEscritas === 1 ? ' linha preenchida' : ' linhas preenchidas'),
      r.torresEscritas + ' apontamento(s) de torre distribuídos nos dias. Os itens que o SIPAV ' +
      'não programa — topografia, sondagem, armação, canteiro, comissionamento — não foram tocados, ' +
      'nem a linha EXEC., nem os totais.'));

    // Apagar a quinzena anterior é o procedimento normal, então isto não é
    // alarme — é conferência. A lista serve para bater o olho e perceber se
    // alguma coisa deixou de ser programada no SIPAV por esquecimento.
    if (r.apagados && r.apagados.length) {
      partes.push(bloco('border-slate-200 bg-slate-50 text-slate-700',
        r.apagados.length + ' item(ns) da quinzena anterior foram limpos',
        'Tinham programação no arquivo que você subiu e não têm nesta quinzena. ' +
        'Vale bater o olho para ver se algum ficou de fora do SIPAV sem querer.<br><br>' +
        esc(r.apagados.map(function (a) { return a.nome; }).join(' · ')) + '.'));
    }

    var d = r.datas;
    if (d.s1 && d.s1 !== d.esperadoS1) {
      partes.push(bloco('border-sky-300 bg-sky-50 text-sky-800',
        'Datas do relatório atualizadas',
        'O arquivo que você subiu era da quinzena de <strong>' + ui.dataCurta(d.s1) + '</strong>. ' +
        'Mudei a data do cabeçalho para <strong>' + ui.dataCurta(d.esperadoS1) + '</strong> e o Excel ' +
        'recalcula as três faixas de dias ao abrir — inclusive a da linha EXEC., que passa a ser a ' +
        'semana anterior à nova.'));
    }

    if (r.semCabo.length) {
      partes.push(bloco('border-rose-200 bg-rose-50 text-rose-800',
        r.semCabo.length + ' programação(ões) de lançamento sem o cabo certo',
        'Não dá para saber em que seção do cabo elas vão, então ficaram de fora: ' +
        '<strong>' + esc(r.semCabo.slice(0, 8).join(' · ')) + '</strong>' +
        (r.semCabo.length > 8 ? ' e mais ' + (r.semCabo.length - 8) : '') + '.'));
    }

    if (r.naoExistem && r.naoExistem.length) {
      // Agrupa pela atividade do SIPAV: "PERFURAÇÃO DE TUBULÃO (2.1.20, 2.1.21)"
      // diz mais do que uma lista de códigos soltos
      var porAtividade = {}, ordemAtividades = [];
      r.naoExistem.forEach(function (x) {
        var nomes = x.atividades.length ? x.atividades : ['—'];
        nomes.forEach(function (n) {
          if (!porAtividade[n]) { porAtividade[n] = []; ordemAtividades.push(n); }
          porAtividade[n].push(x.rotulo);
        });
      });

      partes.push(bloco('border-rose-200 bg-rose-50 text-rose-800',
        r.naoExistem.length + ' item(ns) que não existem nesta planilha',
        'Tem programação no SIPAV, mas a planilha não tem a linha desse item, então não escrevi: ' +
        '<strong>' + esc(ordemAtividades.map(function (n) {
          return n + ' (' + porAtividade[n].join(', ') + ')';
        }).join(' · ')) + '</strong>.'));
    }

    var semDePara = Object.keys(r.semDePara);
    if (semDePara.length) {
      partes.push(bloco('border-slate-200 bg-slate-50 text-slate-700',
        semDePara.length + ' atividade(s) que não vão para o relatório',
        esc(semDePara.map(function (n) { return n + ' (' + r.semDePara[n] + ')'; }).join(' · ')) +
        '. Topografia, sondagem, armação, canteiro e comissionamento não são programados ' +
        'no SIPAV e continuam manuais.'));
    }

    if (r.tortos && r.tortos.length) {
      partes.push(bloco('border-rose-200 bg-rose-50 text-rose-800',
        r.tortos.length + ' item(ns) com o bloco de três linhas quebrado',
        'O item existe mas abaixo dele não vêm PROG. 1 e PROG. 2 na ordem, então não ' +
        'escrevi para não acertar a linha errada: ' +
        esc(r.tortos.map(function (x) { return x.item + '@' + x.linha; }).join(', ')) + '.'));
    }

    if (r.duplicados.length) {
      partes.push(bloco('border-amber-300 bg-amber-50 text-amber-800',
        r.duplicados.length + ' item(ns) repetido(s) na planilha',
        'Escrevi só na primeira ocorrência. Linhas: ' +
        esc(r.duplicados.map(function (x) { return x.item + '@' + x.linha; }).join(', ')) + '.'));
    }

    if (r.foraDoPeriodo) {
      partes.push(bloco('border-slate-200 bg-slate-50 text-slate-700',
        r.foraDoPeriodo + ' programação(ões) fora da quinzena',
        'Existem no trecho mas caem em outra semana, então não entraram.'));
    }

    ui.modalGenerico({
      titulo: 'Planilha preenchida',
      corpoHtml: '<div class="space-y-2">' + partes.join('') + '</div>',
      botoes: [{ rotulo: 'Fechar', classe: 'btn-primario' }]
    });
  }

  function gerarPdf() {
    var titulo = $('pdfTitulo').value;
    var arquivo = $('pdfArquivo').value || 'sipav';

    ui.fecharModal('modalGenerico');
    ui.processando('Gerando PDF…');

    // Papel é branco: o relatório sai sempre no tema claro, seja qual for o
    // tema da tela. Restaurado no fim.
    var eraEscuro = document.documentElement.classList.contains('dark');
    if (eraEscuro) document.documentElement.classList.remove('dark');

    function restaurarTema() {
      if (eraEscuro) document.documentElement.classList.add('dark');
    }

    $('tituloPdf').textContent = titulo;
    $('subtituloPdf').textContent =
      (E.obra ? E.obra.nome : '') +
      ' · período ' + ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) +
      ' · emitido em ' + ui.dataCurta(ui.hoje());
    ui.mostrar('cabecalhoPdf');
    document.body.classList.add('modo-pdf');

    var area = $('areaRelatorio');
    html2pdf()
      .set({
        margin: 8,
        filename: arquivo + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      })
      .from(area)
      .save()
      .then(function () {
        document.body.classList.remove('modo-pdf');
        ui.esconder('cabecalhoPdf');
        restaurarTema();
        ui.pronto();
        ui.avisar('PDF gerado.', 'sucesso');
      })
      .catch(function () {
        document.body.classList.remove('modo-pdf');
        ui.esconder('cabecalhoPdf');
        restaurarTema();
        ui.pronto();
        ui.avisar('Não foi possível gerar o PDF.', 'erro');
      });
  }

  function compartilharWhatsApp() {
    var lista = E.programacoes.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!lista.length) { ui.avisar('Nenhuma programação para compartilhar.', 'alerta'); return; }

    var texto = '*SIPAV LT — ' + (E.trechoAtual ? E.trechoAtual.nome : '') + '*\n' +
                '_' + ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) + '_\n';
    var dataAtual = null;

    lista.forEach(function (p) {
      if (p.data !== dataAtual) {
        dataAtual = p.data;
        texto += '\n*' + ui.dataLonga(p.data) + '*\n';
      }
      texto += '• ' + (p.torre ? p.torre.identificador : '?') + ' — ' +
               (p.atividade ? p.atividade.nome : '') +
               (p.encarregado ? ' (' + p.encarregado.nome + ')' : '') + '\n';
    });

    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  }

  /* ======================================================================== */

  window.SIPAV.app = {
    iniciar: iniciar, sair: sair, alternarTema: alternarTema,
    alternarMenu: alternarMenu, fecharMenus: fecharMenus,
    abrirAlterarSenha: abrirAlterarSenha,
    trocarAba: trocarAba, mudarColunas: mudarColunas, renderizar: renderizar,
    mudarPeriodo: mudarPeriodo, limparFiltros: limparFiltros,
    fecharModal: ui.fecharModal,

    abrirTorre: abrirTorre,
    verificarBloqueio: verificarBloqueio,
    verificarConflito: verificarConflito,
    verificarMesmoServico: verificarMesmoServico,
    alternarOverride: alternarOverride,
    adicionarProgramacao: adicionarProgramacao,
    mudarAtividade: mudarAtividade,
    filtrarAtividades: filtrarAtividades,
    escolherAtividade: escolherAtividade,
    tirarAtividade: tirarAtividade,
    mudarDataAtividade: mudarDataAtividade,
    teclaAtividade: teclaAtividade,
    mostrarSomaPercentual: mostrarSomaPercentual,
    mostrarDiaDaSemana: mostrarDiaDaSemana,
    mudarData: mudarData,
    filtrarEncarregados: filtrarEncarregados,
    escolherEncarregado: escolherEncarregado,
    teclaEncarregado: teclaEncarregado,
    editarProgramacao: editarProgramacao,
    cancelarEdicao: cancelarEdicao,
    alternarExecucao: alternarExecucao,
    removerProgramacao: removerProgramacao,
    limparProgramacoesDaTorre: limparProgramacoesDaTorre,
    limparProgramacoesDoPeriodo: limparProgramacoesDoPeriodo,

    abrirRestricao: abrirRestricao,
    alternarSemPrevisao: alternarSemPrevisao,

    abrirProgramacaoEmLote: abrirProgramacaoEmLote,
    copiarParaOutrasTorres: copiarParaOutrasTorres,
    filtrarAtividadesLote: filtrarAtividadesLote,
    escolherAtividadeLote: escolherAtividadeLote,
    tirarAtividadeLote: tirarAtividadeLote,
    teclaAtividadeLote: teclaAtividadeLote,
    removerLinhaLote: removerLinhaLote,
    distribuirLote: distribuirLote,
    mudarDataLote: mudarDataLote,
    mudarDataBaseLote: mudarDataBaseLote,
    conferirLote: conferirLote,
    desfazerUltimoLote: desfazerUltimoLote,

    abrirEdicaoEmLote: abrirEdicaoEmLote,
    mostrarConflitosDoEstagio: mostrarConflitosDoEstagio,
    filtrarEdicao: filtrarEdicao,
    marcarEdicao: marcarEdicao,
    marcarTodasEdicao: marcarTodasEdicao,
    mudarModoDataEdicao: mudarModoDataEdicao,
    desfazerEdicaoLote: desfazerEdicaoLote,
    mudarEncarregadoLote: mudarEncarregadoLote,
    aplicarEncarregadoLote: aplicarEncarregadoLote,
    mudarPercentualLote: mudarPercentualLote,
    aplicarPercentualLote: aplicarPercentualLote,
    alternarModoSelecao: alternarModoSelecao,
    fecharCombos: fecharCombos,
    editarDaEdicaoEmLote: editarDaEdicaoEmLote,
    apagarProgramacoesSelecionadas: apagarProgramacoesSelecionadas,
    repetirUltimoLancamento: repetirUltimoLancamento,
    alternarSelecaoProgramacoes: alternarSelecaoProgramacoes,
    alternarProgramacaoMarcada: alternarProgramacaoMarcada,
    limparSelecaoProgramacoes: limparSelecaoProgramacoes,
    marcarTodasProgramacoesVisiveis: marcarTodasProgramacoesVisiveis,
    apagarProgramacoesMarcadas: apagarProgramacoesMarcadas,
    apagarUmaProgramacao: apagarUmaProgramacao,
    alternarApagarLinha: alternarApagarLinha,
    marcarTodasApagar: marcarTodasApagar,
    atualizarPreviaEdicao: atualizarPreviaEdicao,
    abrirCopiarDatas: abrirCopiarDatas,
    copiarDatasDe: copiarDatasDe,
    atualizarAtalhosPercentual: atualizarAtalhosPercentual,
    alternarParteEscavacao: alternarParteEscavacao,
    limparSelecao: limparSelecao,
    selecionarTodasVisiveis: selecionarTodasVisiveis,
    programarSelecionadas: programarSelecionadas,
    liberarRestricao: liberarRestricao,
    abrirCorrigirEstagio: abrirCorrigirEstagio,
    abrirMovimentacao: abrirMovimentacao,
    mudarTipoMovimentacao: mudarTipoMovimentacao,
    mostrarDiasDaMovimentacao: mostrarDiasDaMovimentacao,
    abrirHistoricoDaTorre: abrirHistoricoDaTorre,
    abrirHistoricoDoTrecho: abrirHistoricoDoTrecho,
    filtrarHistorico: filtrarHistorico,

    abrirEncarregados: abrirEncarregados,
    adicionarEncarregado: adicionarEncarregado,
    editarEncarregado: editarEncarregado,
    salvarNomeEncarregado: salvarNomeEncarregado,
    removerEncarregado: removerEncarregado,
    abrirAtividades: abrirAtividades,
    editarAtividade: editarAtividade,
    sincronizarCor: sincronizarCor,
    sincronizarIcone: sincronizarIcone,

    abrirImportacao: abrirImportacao,
    conferirImportacao: conferirImportacao,
    abrirExportarPdf: abrirExportarPdf,
    abrirRelatorioIsa: abrirRelatorioIsa,
    compartilharWhatsApp: compartilharWhatsApp
  };

  document.addEventListener('DOMContentLoaded', iniciar);
})();
