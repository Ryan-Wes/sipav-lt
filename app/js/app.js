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
  var VERSAO = 'v57 · 2026-09-25';

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

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        fecharMenus();
        var aberto = document.querySelector('.modal:not(.hidden)');
        if (aberto) ui.fecharModal(aberto.id);
      }
    });

    // Clique no fundo escuro fecha o modal. A confirmação tem tratamento
    // próprio em ui.confirmar, porque precisa resolver a promessa como "não".
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
      if (m.id === 'modalConfirmacao') return;
      m.addEventListener('click', function (ev) {
        if (ev.target === m) ui.fecharModal(m.id);
      });
    });

    // Clique fora fecha os menus suspensos
    document.addEventListener('click', function (ev) {
      var alvo = ev.target;

      // Alvo que já saiu do DOM não tem mais ancestrais, e passaria por
      // "clique fora" mesmo tendo sido dentro. Acontece quando algo redesenha
      // o elemento durante o próprio clique.
      if (!alvo || !document.contains(alvo)) return;

      if (!alvo.closest || !alvo.closest('.menu-wrap')) fecharMenus();
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
      db.execucoes(filtroExecucao())
    ]).then(function (r) {
      E.torres = r[0];
      E.programacoes = r[1];
      E.execucoes = r[2];
      preencherFiltroCanteiro();
      render.tudo();
    });
  }

  function recarregarProgramacoes() {
    return Promise.all([
      db.torres(E.trechoAtual.id),
      db.programacoes(filtroProgramacao()),
      db.execucoes(filtroExecucao())
    ]).then(function (r) {
      E.torres = r[0];
      E.programacoes = r[1];
      E.execucoes = r[2];
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
    render.tudo();
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

  function abrirTorre(torreId) {
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

    $('campoAtividade').innerHTML = E.atividades.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.nome) + '</option>';
    }).join('');

    $('campoEncarregado').innerHTML =
      '<option value="">— sem encarregado —</option>' +
      E.encarregados.map(function (e) {
        return '<option value="' + e.id + '">' + esc(e.nome) + '</option>';
      }).join('');

    $('campoData').value = ui.hoje();
    $('campoObservacao').value = '';
    $('campoCabo').value = '';
    $('campoPercentual').value = 100;
    programacaoEmEdicao = null;
    atualizarModoFormulario();
    limparAvisos();
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

  /** 'PARA_RAIO' é o valor do enum; na tela ele aparece como o campo fala. */
  function rotuloCabo(cabo) {
    return cabo === 'PARA_RAIO' ? 'PARA-RAIO' : cabo;
  }

  function pedeCabo(atividadeId) {
    var a = E.atividades.find(function (x) { return x.id === atividadeId; });
    return !!a && ATIVIDADES_COM_CABO.indexOf(a.nome) !== -1;
  }

  /** Mostra ou esconde o seletor de cabo conforme a atividade escolhida. */
  function atualizarCampoCabo() {
    var precisa = pedeCabo($('campoAtividade').value);
    $('blocoCabo').classList.toggle('hidden', !precisa);
    if (!precisa) $('campoCabo').value = '';
  }

  /** Trocar a atividade mexe no seletor de cabo e na checagem de precedência. */
  function mudarAtividade() {
    atualizarCampoCabo();
    mostrarSomaPercentual();
    verificarBloqueio();
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
              (Number(p.percentual) < 100
                ? ' <span class="selo-parcial">' + formatarPercentual(p.percentual) + '</span>'
                : '') +
            '</p>' +
            '<p class="text-xs text-slate-500">' +
              ui.dataLonga(p.data) +
              (p.encarregado ? ' · ' + esc(p.encarregado.nome) : '') +
              (p.observacao ? ' · ' + esc(p.observacao) : '') +
            '</p>' +
            (ex
              ? '<p class="text-xs text-emerald-700 font-medium mt-0.5 flex items-center gap-1">' +
                  '<i data-lucide="check-circle" class="w-3 h-3"></i> ' +
                  'Executado em ' + ui.dataCurta(ex.data_execucao) +
                  (ex.data_execucao !== p.data ? ' (programado para ' + ui.dataCurta(p.data) + ')' : '') +
                '</p>'
              : '') +
            (p.override_motivo
              ? '<p class="text-xs text-amber-600 mt-0.5 flex items-center gap-1">' +
                  '<i data-lucide="alert-triangle" class="w-3 h-3"></i> ' +
                  'Fora da sequência: ' + esc(p.override_motivo) + '</p>'
              : '') +
          '</div>' +
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

  function limparAvisos() {
    ui.esconder('avisoBloqueio');
    ui.esconder('avisoConflito');
    $('campoOverride').checked = false;
    $('campoOverrideMotivo').value = '';
    $('campoOverrideMotivo').classList.add('hidden');
    $('btnAdicionar').disabled = false;
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
        var nome = $('campoEncarregado').selectedOptions[0].text;
        $('textoConflito').textContent =
          nome + ' já está programado em ' + ui.dataCurta(data) + ' na(s) torre(s) ' +
          torres.join(', ') + '. Confira se a equipe dá conta.';
        ui.mostrar('avisoConflito');
        ui.icones();
      })
      .catch(function () { /* aviso, não bloqueio */ });
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

    // Sem o cabo o relatório da ISA não sabe se a linha é da seção 4.1 ou da
    // 4.2. Melhor cobrar agora do que descobrir na hora de exportar.
    var atividadeId = $('campoAtividade').value;
    var cabo = pedeCabo(atividadeId) ? ($('campoCabo').value || null) : null;
    var percentual = Number($('campoPercentual').value) || 100;

    if (percentual <= 0 || percentual > 100) {
      ui.avisar('O percentual tem que ficar entre 1 e 100.', 'alerta');
      $('campoPercentual').focus();
      return;
    }

    if (pedeCabo(atividadeId) && !cabo) {
      ui.avisar('Escolha o cabo: OPGW ou para-raio.', 'alerta');
      $('campoCabo').focus();
      return;
    }

    var editando = programacaoEmEdicao;
    ui.processando(editando ? 'Salvando alteração…' : 'Gravando programação…');

    var gravar = editando
      ? db.atualizarProgramacao(editando, {
          atividade_id:    atividadeId,
          encarregado_id:  $('campoEncarregado').value || null,
          data:            $('campoData').value,
          observacao:      $('campoObservacao').value.trim() || null,
          override_motivo: override ? motivo : null,
          cabo:            cabo,
          percentual:      percentual
        })
      : db.criarProgramacao({
          torreId: torreAberta.torre_id,
          atividadeId: atividadeId,
          encarregadoId: $('campoEncarregado').value || null,
          data: $('campoData').value,
          observacao: $('campoObservacao').value.trim() || null,
          situacao: E.perfil.papel === 'SUPERVISOR' ? 'SOLICITADA' : 'APROVADA',
          overrideMotivo: override ? motivo : null,
          cabo: cabo,
          percentual: percentual
        });

    gravar
      .then(function () {
        $('campoObservacao').value = '';
        $('campoCabo').value = '';
        $('campoPercentual').value = 100;
        atualizarCampoCabo();
        programacaoEmEdicao = null;
        atualizarModoFormulario();
        limparAvisos();
        return recarregarProgramacoes();
      })
      .then(function () {
        ui.pronto();

        // Gravou fora do recorte de datas: a linha existe, mas não aparece.
        // Sem este aviso, parece que o lançamento se perdeu.
        var data = $('campoData').value;
        var fora = (E.periodo.de && data < E.periodo.de) ||
                   (E.periodo.ate && data > E.periodo.ate);

        if (fora) {
          ui.avisar('Gravada para ' + ui.dataCurta(data) + ', fora do período exibido (' +
                    ui.rotuloPeriodo(E.periodo.de, E.periodo.ate) +
                    '). Troque o período para vê-la.', 'alerta', 7000);
        } else {
          ui.avisar(editando ? 'Programação alterada.' : 'Programação adicionada.', 'sucesso');
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
        '<div><label class="rotulo">Executado em</label>' +
          '<input id="dataExecucao" type="date" class="campo" value="' + p.data + '"></div>' +
        '<div><label class="rotulo">Observação <span class="text-slate-400 font-normal">(opcional)</span></label>' +
          '<input id="obsExecucao" class="campo" placeholder="Ex.: concluído com equipe reduzida"></div>' +
        '<p class="text-xs text-slate-400">' +
          'Programado para ' + ui.dataLonga(p.data) + '. Se saiu em outro dia, corrija a ' +
          'data — é dela que sai a aderência da programação.' +
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
            if (!data) { ui.avisar('Informe a data de execução.', 'alerta'); return; }

            ui.processando('Apontando…');
            db.apontarExecucao(p, data, obs)
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

  /** Traz a programação para o formulário, que passa a alterar em vez de criar. */
  function editarProgramacao(id) {
    var p = E.programacoes.find(function (x) { return x.id === id; });
    if (!p) return;

    programacaoEmEdicao = id;

    $('campoAtividade').value   = p.atividade ? p.atividade.id : '';
    $('campoData').value        = p.data;
    $('campoEncarregado').value = p.encarregado ? p.encarregado.id : '';
    $('campoObservacao').value  = p.observacao || '';

    atualizarCampoCabo();
    $('campoCabo').value = p.cabo || '';
    $('campoPercentual').value = p.percentual == null ? 100 : p.percentual;

    atualizarModoFormulario();
    verificarBloqueio();

    // verificarBloqueio limpa a justificativa; devolve a original depois dela,
    // para quem estava editando não ter que redigitar o motivo.
    if (p.override_motivo) $('campoOverrideMotivo').value = p.override_motivo;

    $('campoData').focus();
  }

  function cancelarEdicao() {
    programacaoEmEdicao = null;
    $('campoObservacao').value = '';
    $('campoCabo').value = '';
    $('campoPercentual').value = 100;
    atualizarModoFormulario();
    atualizarCampoCabo();
    verificarBloqueio();
  }

  function atualizarModoFormulario() {
    var editando = !!programacaoEmEdicao;
    $('tituloFormulario').textContent   = editando ? 'Alterando programação' : 'Nova atividade';
    $('rotuloBtnAdicionar').textContent = editando ? 'Salvar alteração' : 'Adicionar programação';
    $('btnCancelarEdicao').classList.toggle('hidden', !editando);
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
   * planilha. Apontamento feito de verdade em campo nunca é tocado aqui.
   */
  function abrirCorrigirEstagio() {
    if (!torreAberta) return;
    var torre = torreAberta;

    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-sm text-slate-600">' +
          'A torre <strong>' + esc(torre.identificador) + '</strong> consta hoje em ' +
          '<strong>' + esc(torre.ultima_atividade || 'nada executado') + '</strong>.' +
        '</p>' +
        '<div><label class="rotulo">Última atividade executada</label>' +
          '<select id="estagioNovo" class="campo">' +
            '<option value="">— nada executado —</option>' +
            E.atividades.map(function (a) {
              return '<option value="' + a.id + '"' +
                     (a.id === torre.ultima_atividade_id ? ' selected' : '') + '>' +
                     esc(a.nome) + '</option>';
            }).join('') +
          '</select></div>' +
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

    var anterior = torre.ultima_atividade || null;

    ui.processando('Atualizando estágio…');

    db.limparCargaInicial([torre.torre_id])
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

        ui.avisar('Estágio atualizado.', 'sucesso');
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
  /* RESTRIÇÕES                                                               */
  /* ======================================================================== */

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
                      (r.previsao_liberacao ? ' · previsão ' + ui.dataCurta(r.previsao_liberacao) : '') +
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
              '<div><label class="rotulo">Previsão de liberação</label>' +
                '<input id="restricaoPrevisao" type="date" class="campo"></div>' +
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
              ui.processando('Registrando…');
              db.criarRestricao({
                torreId: torre.torre_id,
                tipo: $('restricaoTipo').value,
                descricao: $('restricaoDescricao').value.trim() || null,
                previsaoLiberacao: $('restricaoPrevisao').value || null
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

    var linhas = E.atividades.map(function (a) {
      var deps = requeridasDe(a.id);
      return '' +
        '<div class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">' +
          '<span class="text-xs font-bold text-slate-400 w-8 shrink-0">' + a.ordem_execucao + '</span>' +
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

    var corpo =
      '<div class="space-y-3">' +
        '<p class="text-xs text-slate-500">' +
          'A ordem abaixo é a ordem de execução da obra. É ela que alimenta as regras ' +
          'de bloqueio, a cor das torres na grade e a ordenação dos campos.' +
        '</p>' +
        '<div class="space-y-1.5">' + linhas + '</div>' +
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
  }

  /** Formulário de uma atividade. id nulo = nova. */
  function editarAtividade(id) {
    var a = id ? E.atividades.find(function (x) { return x.id === id; }) : null;
    var deps = id ? requeridasDe(id) : [];

    var proximaOrdem = E.atividades.length
      ? Math.max.apply(null, E.atividades.map(function (x) { return x.ordem_execucao; })) + 10
      : 10;

    var cor   = a ? a.cor_fundo : '#94A3B8';
    var icone = a ? a.icone : 'circle-dashed';

    // Só atividades anteriores podem ser pré-requisito: impede ciclo por
    // construção, e é como a obra funciona de verdade.
    var ordemDesta = a ? a.ordem_execucao : proximaOrdem;
    var candidatas = E.atividades.filter(function (x) {
      return x.id !== id && x.ordem_execucao < ordemDesta;
    });

    var corpo =
      '<div class="space-y-4">' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
          '<div class="sm:col-span-2">' +
            '<label class="rotulo">Nome</label>' +
            '<input id="atvNome" class="campo" value="' + esc(a ? a.nome : '') + '" ' +
                   'placeholder="Ex.: CONCRETAGEM / TUBULÃO"></div>' +
          '<div><label class="rotulo">Ordem de execução</label>' +
            '<input id="atvOrdem" type="number" step="5" class="campo" ' +
                   'value="' + (a ? a.ordem_execucao : proximaOrdem) + '"></div>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="rotulo">Cor na grade</label>' +
            '<div class="flex items-center gap-2">' +
              '<input id="atvCor" type="color" value="' + cor + '" ' +
                     'onchange="SIPAV.app.sincronizarCor(this.value)" ' +
                     'class="w-10 h-9 rounded border border-slate-300 bg-transparent cursor-pointer">' +
              '<input id="atvCorTexto" class="campo font-mono text-xs" value="' + cor + '" ' +
                     'onchange="SIPAV.app.sincronizarCor(this.value, true)">' +
            '</div></div>' +
          '<div><label class="rotulo">Ícone</label>' +
            '<div class="flex items-center gap-2">' +
              '<span id="atvIconePreview" class="w-9 h-9 rounded flex items-center justify-center shrink-0" ' +
                    'style="background:' + cor + '">' +
                '<i data-lucide="' + esc(icone) + '" class="w-4 h-4"></i></span>' +
              '<input id="atvIcone" class="campo font-mono text-xs" value="' + esc(icone) + '" ' +
                     'onchange="SIPAV.app.sincronizarIcone(this.value)">' +
            '</div></div>' +
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
          'executadas as obrigatórias anteriores.' +
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
            'Só aparecem atividades de ordem anterior, para não criar dependência circular.' +
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
    var nome  = $('atvNome').value.trim();
    var ordem = parseInt($('atvOrdem').value, 10);
    var cor   = $('atvCorTexto').value.trim();

    if (!nome) { ui.avisar('Dê um nome à atividade.', 'alerta'); $('atvNome').focus(); return; }
    if (isNaN(ordem)) { ui.avisar('A ordem de execução precisa ser um número.', 'alerta'); return; }
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) { ui.avisar('Cor inválida. Use o formato #RRGGBB.', 'alerta'); return; }

    var conflito = E.atividades.find(function (x) {
      return x.id !== id && x.ordem_execucao === ordem;
    });
    if (conflito) {
      ui.avisar('A ordem ' + ordem + ' já é da atividade ' + conflito.nome +
                '. Use outro número.', 'alerta', 6000);
      return;
    }

    var deps = Array.prototype.slice.call(document.querySelectorAll('.atvDep:checked'))
      .map(function (c) { return c.value; });

    ui.processando('Salvando atividade…');

    db.salvarAtividade({
      id: id,
      nome: nome,
      ordemExecucao: ordem,
      corFundo: cor,
      icone: $('atvIcone').value.trim() || 'circle-dashed',
      obrigatoria: $('atvObrigatoria').checked
    })
      .then(function (salva) { return db.salvarDependencias(salva.id, deps); })
      .then(recarregarCatalogoAtividades)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
        abrirAtividades();
        ui.avisar(id ? 'Atividade atualizada.' : 'Atividade criada.', 'sucesso');
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
          'class="campo font-mono text-xs barra-fina" placeholder="Cole aqui…"></textarea>' +
        '<p class="text-xs text-slate-400">' +
          'Torres já existentes no trecho têm o km atualizado. As novas são criadas na ordem colada.' +
        '</p>' +
      '</div>';

    ui.modalGenerico({
      titulo: 'Importar torres — ' + (E.trechoAtual ? E.trechoAtual.nome : ''),
      corpoHtml: corpo,
      botoes: [
        { rotulo: 'Cancelar', classe: 'btn-secundario' },
        { rotulo: 'Importar', classe: 'btn-primario', acao: executarImportacao }
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
    linhas.forEach(function (l) {
      if (!l.estagio) return;                    // "Não iniciada" cai aqui
      var torreId = idPor[l.identificador];
      if (!torreId) return;
      expandirEstagio(acharAtividade(l.estagio)).forEach(function (aid) {
        registros.push({ torreId: torreId, atividadeId: aid });
      });
    });

    // Limpa TODAS as torres da importação, não só as que têm estágio: se uma
    // torre voltou para "Não iniciada", a carga inicial antiga precisa sumir.
    return db.limparCargaInicial(torres.map(function (t) { return t.id; }))
      .then(function () { return db.registrarCargaInicial(registros); });
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

  function executarImportacao() {
    var linhas = interpretarLinhas($('areaImportacao').value);
    if (!linhas.length) { ui.avisar('Nada para importar.', 'alerta'); return; }

    // Valida os estágios ANTES de gravar: melhor recusar tudo do que importar
    // metade e deixar a outra metade sem estágio, silenciosamente.
    var desconhecidos = {};
    linhas.forEach(function (l) {
      if (l.estagio && !acharAtividade(l.estagio)) desconhecidos[l.estagio] = true;
    });
    var ruins = Object.keys(desconhecidos);
    if (ruins.length) {
      ui.avisar('Estágio não reconhecido: ' + ruins.join(' · ') +
                '. Cadastre a atividade ou corrija o nome na planilha.', 'erro', 10000);
      return;
    }

    ui.processando('Importando ' + linhas.length + ' torres…');
    resolverCanteiros(linhas)
      .then(function () { return db.importarTorres(E.trechoAtual.id, linhas); })
      .then(function (torres) { return gravarEstagios(torres, linhas); })
      .then(carregarTrecho)
      .then(function () {
        ui.pronto();
        ui.fecharModal('modalGenerico');
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
        r.semCabo.length + ' programação(ões) de lançamento sem cabo escolhido',
        'Não dá para saber se vão na seção do para-raio ou do OPGW, então ficaram de fora: ' +
        '<strong>' + esc(r.semCabo.slice(0, 8).join(' · ')) + '</strong>' +
        (r.semCabo.length > 8 ? ' e mais ' + (r.semCabo.length - 8) : '') + '.'));
    }

    if (r.itensNaoAchados.length) {
      partes.push(bloco('border-rose-200 bg-rose-50 text-rose-800',
        r.itensNaoAchados.length + ' item(ns) sem linha nesta planilha',
        'Tem programação no SIPAV para eles mas esta planilha não tem a linha correspondente: ' +
        '<strong>' + esc(r.itensNaoAchados.join(', ')) + '</strong>. ' +
        'Acontece quando o trecho ainda não chegou naquela fase — a planilha de Barra–Correntina, ' +
        'por exemplo, para na seção 4.2 e não tem a 4.3 do condutor. Também é o caso da perfuração ' +
        'de tubulão, que ainda vai ser criada com a fiscalização.'));
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
    alternarOverride: alternarOverride,
    adicionarProgramacao: adicionarProgramacao,
    mudarAtividade: mudarAtividade,
    mostrarSomaPercentual: mostrarSomaPercentual,
    editarProgramacao: editarProgramacao,
    cancelarEdicao: cancelarEdicao,
    alternarExecucao: alternarExecucao,
    removerProgramacao: removerProgramacao,
    limparProgramacoesDaTorre: limparProgramacoesDaTorre,
    limparProgramacoesDoPeriodo: limparProgramacoesDoPeriodo,

    abrirRestricao: abrirRestricao,
    liberarRestricao: liberarRestricao,
    abrirCorrigirEstagio: abrirCorrigirEstagio,
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
    abrirExportarPdf: abrirExportarPdf,
    abrirRelatorioIsa: abrirRelatorioIsa,
    compartilharWhatsApp: compartilharWhatsApp
  };

  document.addEventListener('DOMContentLoaded', iniciar);
})();
