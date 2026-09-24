/* =============================================================================
   SIPAV LT — Camada de dados
   =============================================================================
   Tudo que fala com o Supabase mora aqui. O resto da aplicação nunca chama o
   cliente direto — assim, migrar pra Next.js depois é trocar este arquivo.

   Scripts clássicos (sem ES modules) de propósito: a máquina de trabalho não tem
   Node, e módulos ES não carregam por file:// por causa de CORS. Assim o app
   abre com duplo clique e também funciona publicado.
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  var cfg = window.SIPAV_CONFIG || {};
  var sb = null;
  var obraCache = null;

  /** Erro com mensagem já pronta pra mostrar ao usuário. */
  function SipavErro(mensagem, original) {
    this.name = 'SipavErro';
    this.message = mensagem;
    this.original = original || null;
  }
  SipavErro.prototype = Object.create(Error.prototype);

  /* --------------------------------------------------------------------------
     Tradução de erro do Postgres para linguagem de obra
     --------------------------------------------------------------------------
     Os bloqueios de precedência e restrição são disparados por trigger no banco
     com errcode check_violation. A mensagem já vem redigida pra humano — só
     repassamos. O resto ganha tradução.
     ----------------------------------------------------------------------- */
  function traduzErro(erro, contexto) {
    if (!erro) return null;
    var msg = erro.message || '';
    var code = erro.code || '';

    if (code === '23505') {
      if (msg.indexOf('programacao') !== -1) {
        return new SipavErro('Essa atividade já está programada para esta torre nesta data.', erro);
      }
      if (/ordem_execucao/.test(msg)) {
        // Pode ser de uma atividade desativada, que não aparece nas listas
        return new SipavErro(
          'Já existe uma atividade nessa ordem de execução — possivelmente uma que foi ' +
          'removida e continua ocupando o número. Escolha outro.', erro);
      }
      if (msg.indexOf('atividade') !== -1) {
        return new SipavErro('Já existe uma atividade com esse nome.', erro);
      }
      if (msg.indexOf('canteiro') !== -1) {
        return new SipavErro('Já existe um canteiro com esse nome.', erro);
      }
    }
    // Regras de negócio do trigger (precedência, restrição, data retroativa)
    if (code === '23514' || code === 'P0001') {
      return new SipavErro(msg, erro);
    }
    if (code === '42501' || /row-level security/i.test(msg)) {
      return new SipavErro('Seu usuário não tem permissão para esta ação.', erro);
    }
    // Desvio de relógio entre a máquina e o servidor invalida o token
    if (/issued at future|JWT expired|invalid JWT|JWSError/i.test(msg)) {
      return new SipavErro(
        'Sessão recusada por diferença de horário entre o seu computador e o servidor. ' +
        'Sincronize o relógio do Windows, saia e entre de novo.', erro);
    }
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      return new SipavErro('Sem conexão com o servidor. Verifique a internet e tente de novo.', erro);
    }
    return new SipavErro((contexto ? contexto + ': ' : '') + msg, erro);
  }

  /** Desembrulha a resposta do PostgREST, lançando erro traduzido. */
  function ok(resposta, contexto) {
    if (resposta.error) throw traduzErro(resposta.error, contexto);
    return resposta.data;
  }

  /* ======================================================================== */
  /* INICIALIZAÇÃO                                                            */
  /* ======================================================================== */

  function iniciar() {
    if (!cfg.supabaseUrl || cfg.supabaseUrl.indexOf('COLE_') === 0) {
      throw new SipavErro(
        'Configuração pendente: preencha supabaseUrl e supabaseAnonKey em app/js/config.js'
      );
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new SipavErro('Biblioteca do Supabase não carregou. Verifique a conexão com a internet.');
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return sb;
  }

  function cliente() {
    if (!sb) iniciar();
    return sb;
  }

  /* ======================================================================== */
  /* AUTENTICAÇÃO                                                             */
  /* ======================================================================== */

  var auth = {
    entrar: function (email, senha) {
      return cliente().auth.signInWithPassword({ email: email, password: senha })
        .then(function (r) {
          if (r.error) {
            if (/Invalid login credentials/i.test(r.error.message)) {
              throw new SipavErro('E-mail ou senha incorretos.', r.error);
            }
            if (/Email not confirmed/i.test(r.error.message)) {
              throw new SipavErro('E-mail ainda não confirmado. Verifique sua caixa de entrada.', r.error);
            }
            throw traduzErro(r.error, 'Falha ao entrar');
          }
          return r.data.user;
        });
    },

    sair: function () {
      obraCache = null;
      return cliente().auth.signOut();
    },

    /** Troca a senha do usuário logado. Não exige e-mail nem administrador. */
    alterarSenha: function (nova) {
      return cliente().auth.updateUser({ password: nova }).then(function (r) {
        if (r.error) {
          var m = r.error.message || '';
          if (/at least|should be at least|weak/i.test(m)) {
            throw new SipavErro('A senha precisa ter pelo menos 6 caracteres.', r.error);
          }
          if (/different from the old/i.test(m)) {
            throw new SipavErro('A nova senha precisa ser diferente da atual.', r.error);
          }
          throw traduzErro(r.error, 'Falha ao alterar a senha');
        }
        return true;
      });
    },

    sessao: function () {
      return cliente().auth.getSession().then(function (r) {
        return r.data && r.data.session ? r.data.session : null;
      });
    },

    usuario: function () {
      return cliente().auth.getUser().then(function (r) {
        return r.data && r.data.user ? r.data.user : null;
      });
    },

    /** cb(sessao|null) sempre que o login mudar. */
    aoMudar: function (cb) {
      return cliente().auth.onAuthStateChange(function (_evento, sessao) {
        cb(sessao || null);
      });
    },

    /**
     * Perfil da aplicação (nome + papel). null se o usuário ainda não tem perfil.
     *
     * O filtro por id é obrigatório e não é redundante: as políticas de RLS se
     * somam, e a política de ADMIN permite enxergar todos os perfis. Sem o
     * filtro, um administrador recebia a lista inteira onde se esperava uma
     * linha só — e quebrava assim que existisse mais de um usuário.
     */
    perfil: function () {
      return auth.usuario().then(function (u) {
        if (!u) return null;
        return cliente()
          .from('perfil')
          .select('id, nome, papel, obra_id, ativo')
          .eq('id', u.id)
          .maybeSingle()
          .then(function (r) { return ok(r, 'Falha ao carregar perfil'); });
      });
    }
  };

  /* ======================================================================== */
  /* CADASTROS                                                                */
  /* ======================================================================== */

  function obra() {
    if (obraCache) return Promise.resolve(obraCache);
    return cliente()
      .from('obra')
      .select('id, nome, codigo')
      .eq('codigo', cfg.obraCodigo)
      .single()
      .then(function (r) {
        obraCache = ok(r, 'Falha ao carregar a obra');
        return obraCache;
      });
  }

  function trechos() {
    return obra().then(function (o) {
      return cliente()
        .from('trecho')
        .select('id, nome, ordem')
        .eq('obra_id', o.id)
        .order('ordem')
        .then(function (r) { return ok(r, 'Falha ao carregar trechos'); });
    });
  }

  /** Torres do trecho já com a situação derivada (última atividade + restrição). */
  function torres(trechoId) {
    return cliente()
      .from('torre_situacao')
      .select('*')
      .eq('trecho_id', trechoId)
      .order('ordem')
      .then(function (r) { return ok(r, 'Falha ao carregar torres'); });
  }

  function atividades() {
    return obra().then(function (o) {
      return cliente()
        .from('atividade')
        .select('id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria, ativa')
        .eq('obra_id', o.id)
        .eq('ativa', true)
        .order('ordem_execucao')   // ordem de execução, não alfabética (post-it 2)
        .then(function (r) { return ok(r, 'Falha ao carregar atividades'); });
    });
  }

  function dependencias() {
    return cliente()
      .from('atividade_dependencia')
      .select('atividade_id, requer_atividade_id')
      .then(function (r) { return ok(r, 'Falha ao carregar dependências'); });
  }

  /** Canteiros com a lista de trechos em que atuam (um canteiro serve vários). */
  function canteiros() {
    return obra().then(function (o) {
      return cliente()
        .from('canteiro')
        .select('id, nome, ativo, canteiro_trecho ( trecho_id )')
        .eq('obra_id', o.id)
        .eq('ativo', true)
        .order('nome')
        .then(function (r) {
          return ok(r, 'Falha ao carregar canteiros').map(function (c) {
            return {
              id: c.id,
              nome: c.nome,
              ativo: c.ativo,
              trechos: (c.canteiro_trecho || []).map(function (x) { return x.trecho_id; })
            };
          });
        });
    });
  }

  function vincularCanteiroTrecho(canteiroId, trechoId) {
    return cliente()
      .from('canteiro_trecho')
      .upsert({ canteiro_id: canteiroId, trecho_id: trechoId },
              { onConflict: 'canteiro_id,trecho_id', ignoreDuplicates: true })
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao vincular canteiro ao trecho');
        return true;
      });
  }

  function criarCanteiro(nome) {
    return obra().then(function (o) {
      return cliente()
        .from('canteiro')
        .insert({ obra_id: o.id, nome: nome })
        .select('id, nome, ativo')
        .single()
        .then(function (r) { return ok(r, 'Falha ao criar canteiro'); });
    });
  }

  function encarregados() {
    return obra().then(function (o) {
      return cliente()
        .from('encarregado')
        .select('id, nome, ativo')
        .eq('obra_id', o.id)
        .eq('ativo', true)
        .order('nome')
        .then(function (r) { return ok(r, 'Falha ao carregar encarregados'); });
    });
  }

  /* ======================================================================== */
  /* PROGRAMAÇÃO                                                              */
  /* ======================================================================== */

  var SELECT_PROGRAMACAO =
    'id, data, situacao, observacao, override_motivo, cabo, criado_em,' +
    'torre:torre_id!inner ( id, identificador, ordem, km, trecho_id, canteiro_id ),' +
    'atividade:atividade_id ( id, nome, ordem_execucao, cor_fundo, cor_texto, icone ),' +
    'encarregado:encarregado_id ( id, nome )';

  /** Programações de um trecho, opcionalmente num intervalo de datas. */
  function programacoes(filtro) {
    filtro = filtro || {};
    var q = cliente()
      .from('programacao')
      .select(SELECT_PROGRAMACAO)
      .eq('torre.trecho_id', filtro.trechoId);

    if (filtro.de)  q = q.gte('data', filtro.de);
    if (filtro.ate) q = q.lte('data', filtro.ate);

    return q.order('data').then(function (r) {
      return ok(r, 'Falha ao carregar programações');
    });
  }

  /**
   * Consulta o bloqueio ANTES de gravar, pra avisar o usuário com antecedência.
   * Retorna null (livre) ou o motivo em texto.
   * A regra definitiva roda no trigger — isto aqui é só UX.
   */
  function motivoBloqueio(torreId, atividadeId, data) {
    return cliente()
      .rpc('motivo_bloqueio_programacao', {
        p_torre_id: torreId,
        p_atividade_id: atividadeId,
        p_data: data
      })
      .then(function (r) { return ok(r, 'Falha ao verificar bloqueio'); });
  }

  /**
   * @param {object} dados {torreId, atividadeId, encarregadoId, data, observacao,
   *                        situacao, overrideMotivo, cabo}
   */
  function criarProgramacao(dados) {
    return auth.usuario().then(function (u) {
      return cliente()
        .from('programacao')
        .insert({
          torre_id:        dados.torreId,
          atividade_id:    dados.atividadeId,
          encarregado_id:  dados.encarregadoId || null,
          data:            dados.data,
          observacao:      dados.observacao || null,
          situacao:        dados.situacao || 'APROVADA',
          override_motivo: dados.overrideMotivo || null,
          cabo:            dados.cabo || null,
          criado_por:      u ? u.id : null
        })
        .select(SELECT_PROGRAMACAO)
        .single()
        .then(function (r) { return ok(r, 'Falha ao programar'); });
    });
  }

  function atualizarProgramacao(id, campos) {
    return cliente()
      .from('programacao')
      .update(campos)
      .eq('id', id)
      .select(SELECT_PROGRAMACAO)
      .single()
      .then(function (r) { return ok(r, 'Falha ao atualizar programação'); });
  }

  function removerProgramacao(id) {
    return cliente()
      .from('programacao')
      .delete()
      .eq('id', id)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao remover programação');
        return true;
      });
  }

  /**
   * Remove as programações de uma torre dentro do período.
   * O recorte de datas é obrigatório por coerência: a tela mostra e conta
   * apenas o período, então apagar além dele seria apagar o que não se vê.
   */
  function limparProgramacoesDaTorre(torreId, de, ate) {
    var q = cliente().from('programacao').delete().eq('torre_id', torreId);
    if (de)  q = q.gte('data', de);
    if (ate) q = q.lte('data', ate);

    return q.then(function (r) {
      if (r.error) throw traduzErro(r.error, 'Falha ao limpar programações da torre');
      return true;
    });
  }

  /**
   * Remove as programações de um trecho dentro de um período.
   * Roda como função no banco: pelo navegador seria preciso mandar a lista de
   * todas as torres do trecho na URL, o que estoura o limite de tamanho.
   * Retorna quantas linhas saíram.
   */
  function limparProgramacoesDoPeriodo(trechoId, de, ate) {
    return cliente()
      .rpc('limpar_programacoes', {
        p_trecho_id: trechoId,
        p_de: de || null,
        p_ate: ate || null
      })
      .then(function (r) { return ok(r, 'Falha ao limpar programações'); });
  }

  /** Conflito de encarregado: mesma pessoa, mesmo dia, em torres diferentes. */
  function conflitosDoEncarregado(encarregadoId, data, ignorarTorreId) {
    if (!encarregadoId) return Promise.resolve([]);
    var q = cliente()
      .from('programacao')
      .select('id, torre:torre_id ( identificador ), atividade:atividade_id ( nome )')
      .eq('encarregado_id', encarregadoId)
      .eq('data', data);
    if (ignorarTorreId) q = q.neq('torre_id', ignorarTorreId);
    return q.then(function (r) { return ok(r, 'Falha ao verificar conflitos'); });
  }

  /* ======================================================================== */
  /* HISTÓRICO                                                                */
  /* ======================================================================== */

  var CAMPOS_HISTORICO =
    'id, quando, acao, quem_nome, torre_identificador, atividade_nome, ' +
    'encarregado_nome, data, situacao, observacao, override_motivo, mudancas';

  /** Histórico de uma torre, do mais recente para o mais antigo. */
  function historicoDaTorre(torreId) {
    return cliente()
      .from('programacao_historico')
      .select(CAMPOS_HISTORICO)
      .eq('torre_id', torreId)
      .order('quando', { ascending: false })
      .limit(100)
      .then(function (r) { return ok(r, 'Falha ao carregar histórico'); });
  }

  /**
   * Registra a correção de estágio no histórico — uma linha por ação, não uma
   * por execução reescrita.
   */
  function registrarCorrecaoEstagio(torreId, estagio, anterior) {
    return cliente()
      .rpc('registrar_correcao_estagio', {
        p_torre_id: torreId,
        p_estagio: estagio || 'nada executado',
        p_anterior: anterior || null
      })
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao registrar no histórico');
        return true;
      });
  }

  /** Últimas alterações do trecho inteiro. */
  function historicoDoTrecho(trechoId, limite) {
    return cliente()
      .from('programacao_historico')
      .select(CAMPOS_HISTORICO)
      .eq('trecho_id', trechoId)
      .order('quando', { ascending: false })
      .limit(limite || 60)
      .then(function (r) { return ok(r, 'Falha ao carregar histórico'); });
  }

  /* ======================================================================== */
  /* RESTRIÇÕES                                                               */
  /* ======================================================================== */

  function restricoes(torreId) {
    return cliente()
      .from('restricao')
      .select('id, tipo, descricao, data_inicio, previsao_liberacao, data_liberacao')
      .eq('torre_id', torreId)
      .order('data_inicio', { ascending: false })
      .then(function (r) { return ok(r, 'Falha ao carregar restrições'); });
  }

  function criarRestricao(dados) {
    return auth.usuario().then(function (u) {
      return cliente()
        .from('restricao')
        .insert({
          torre_id:           dados.torreId,
          tipo:               dados.tipo,
          descricao:          dados.descricao || null,
          data_inicio:        dados.dataInicio || new Date().toISOString().slice(0, 10),
          previsao_liberacao: dados.previsaoLiberacao || null,
          criado_por:         u ? u.id : null
        })
        .select()
        .single()
        .then(function (r) { return ok(r, 'Falha ao registrar restrição'); });
    });
  }

  function liberarRestricao(id, dataLiberacao) {
    return cliente()
      .from('restricao')
      .update({ data_liberacao: dataLiberacao || new Date().toISOString().slice(0, 10) })
      .eq('id', id)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao liberar restrição');
        return true;
      });
  }

  /* ======================================================================== */
  /* CADASTROS — ESCRITA                                                      */
  /* ======================================================================== */

  function salvarEncarregado(nome, id) {
    return obra().then(function (o) {
      if (id) {
        return cliente().from('encarregado').update({ nome: nome }).eq('id', id).select().single()
          .then(function (r) { return ok(r, 'Falha ao salvar encarregado'); });
      }
      return cliente().from('encarregado').insert({ obra_id: o.id, nome: nome }).select().single()
        .then(function (r) { return ok(r, 'Falha ao adicionar encarregado'); });
    });
  }

  /**
   * Desativa em vez de apagar: encarregado removido não pode sumir do
   * histórico de quem executou o quê. (Dúvida do Rominick na reunião.)
   */
  function desativarEncarregado(id) {
    return cliente().from('encarregado').update({ ativo: false }).eq('id', id)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao remover encarregado');
        return true;
      });
  }

  function salvarAtividade(dados) {
    return obra().then(function (o) {
      var campos = {
        nome: dados.nome,
        ordem_execucao: dados.ordemExecucao,
        cor_fundo: dados.corFundo,
        icone: dados.icone,
        obrigatoria: !!dados.obrigatoria
      };
      if (dados.id) {
        return cliente().from('atividade').update(campos).eq('id', dados.id).select().single()
          .then(function (r) { return ok(r, 'Falha ao salvar atividade'); });
      }
      campos.obra_id = o.id;
      return cliente().from('atividade').insert(campos).select().single()
        .then(function (r) { return ok(r, 'Falha ao adicionar atividade'); });
    });
  }

  /**
   * Desativa em vez de apagar: atividade já usada em programação ou execução
   * não pode sumir sem levar o histórico junto. Ela some das listas e para de
   * ser oferecida, mas o passado continua legível.
   */
  function desativarAtividade(id) {
    return cliente().from('atividade').update({ ativa: false }).eq('id', id)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao remover atividade');
        return true;
      });
  }

  /** Reescreve de quais atividades esta depende. */
  function salvarDependencias(atividadeId, requerIds) {
    return cliente()
      .from('atividade_dependencia')
      .delete()
      .eq('atividade_id', atividadeId)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao limpar dependências');
        if (!requerIds.length) return true;

        return cliente()
          .from('atividade_dependencia')
          .insert(requerIds.map(function (id) {
            return { atividade_id: atividadeId, requer_atividade_id: id };
          }))
          .then(function (r2) {
            if (r2.error) throw traduzErro(r2.error, 'Falha ao salvar dependências');
            return true;
          });
      });
  }

  function reordenarAtividades(pares) {
    // pares: [{id, ordem_execucao}] — a unique é deferrable, então o lote passa
    return Promise.all(pares.map(function (p) {
      return cliente().from('atividade')
        .update({ ordem_execucao: p.ordem_execucao }).eq('id', p.id);
    })).then(function (rs) {
      var erro = rs.find(function (r) { return r.error; });
      if (erro) throw traduzErro(erro.error, 'Falha ao reordenar atividades');
      return true;
    });
  }

  /**
   * Importa torres coladas da planilha de controle.
   * @param {Array} linhas [{identificador, km, ordem, canteiroId?}]
   * Regrava as existentes (km) e insere as novas.
   *
   * A coluna canteiro_id só entra no upsert se ALGUMA linha trouxer canteiro.
   * Do contrário, reimportar uma planilha sem essa coluna apagaria o canteiro
   * já atribuído às torres.
   */
  function importarTorres(trechoId, linhas) {
    var algumCanteiro  = linhas.some(function (l) { return !!l.canteiroId; });
    var algumaEstrutura = linhas.some(function (l) { return !!l.estrutura; });
    var algumModelo    = linhas.some(function (l) { return !!l.modelo; });

    var registros = linhas.map(function (l, i) {
      var r = {
        trecho_id: trechoId,
        identificador: l.identificador,
        km: l.km,
        ordem: typeof l.ordem === 'number' ? l.ordem : i
      };
      if (algumCanteiro)   r.canteiro_id = l.canteiroId || null;
      if (algumaEstrutura) r.estrutura   = l.estrutura  || null;
      if (algumModelo)     r.modelo      = l.modelo     || null;
      return r;
    });
    return cliente()
      .from('torre')
      .upsert(registros, { onConflict: 'trecho_id,identificador' })
      .select('id, identificador')
      .then(function (r) { return ok(r, 'Falha ao importar torres'); });
  }

  /* ======================================================================== */
  /* APONTAMENTO DO EXECUTADO                                                 */
  /* ======================================================================== */

  /** Execuções apontadas em campo no trecho e período. Sem a carga da planilha. */
  function execucoes(filtro) {
    filtro = filtro || {};
    var q = cliente()
      .from('execucao')
      .select('id, programacao_id, torre_id, atividade_id, encarregado_id, ' +
              'data_execucao, percentual, observacao, ' +
              'torre:torre_id!inner ( trecho_id )')
      .eq('carga_inicial', false)
      .eq('torre.trecho_id', filtro.trechoId);

    if (filtro.de)  q = q.gte('data_execucao', filtro.de);
    if (filtro.ate) q = q.lte('data_execucao', filtro.ate);

    return q.then(function (r) { return ok(r, 'Falha ao carregar apontamentos'); });
  }

  /**
   * Aponta uma programação como executada.
   * @param {object} p a programação, já com torre, atividade e encarregado
   * @param {string} dataExecucao dia em que aconteceu; por padrão o programado
   */
  function apontarExecucao(p, dataExecucao, observacao) {
    return auth.usuario().then(function (u) {
      return cliente()
        .from('execucao')
        .insert({
          torre_id:       p.torre.id,
          atividade_id:   p.atividade.id,
          encarregado_id: p.encarregado ? p.encarregado.id : null,
          programacao_id: p.id,
          data_execucao:  dataExecucao || p.data,
          percentual:     100,
          carga_inicial:  false,
          observacao:     observacao || null,
          registrado_por: u ? u.id : null
        })
        .select('id')
        .single()
        .then(function (r) {
          if (r.error && r.error.code === '23505') {
            throw new SipavErro('Esta programação já foi apontada como executada.', r.error);
          }
          return ok(r, 'Falha ao apontar execução');
        });
    });
  }

  /** Desfaz o apontamento de uma programação. */
  function desfazerApontamento(programacaoId) {
    return cliente()
      .from('execucao')
      .delete()
      .eq('programacao_id', programacaoId)
      .eq('carga_inicial', false)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao desfazer apontamento');
        return true;
      });
  }

  /* --------------------------------------------------------- Carga inicial -- */

  /**
   * Apaga a carga inicial das torres indicadas. Chamado antes de regravar, para
   * a reimportação não empilhar execuções inferidas.
   * Não toca em execução apontada de verdade (carga_inicial = false).
   */
  function limparCargaInicial(torreIds) {
    if (!torreIds || !torreIds.length) return Promise.resolve(true);
    return cliente()
      .from('execucao')
      .delete()
      .eq('carga_inicial', true)
      .in('torre_id', torreIds)
      .then(function (r) {
        if (r.error) throw traduzErro(r.error, 'Falha ao limpar carga inicial');
        return true;
      });
  }

  /**
   * Grava as execuções inferidas do estágio.
   * @param {Array}  registros  [{torreId, atividadeId}]
   * @param {string} origem     de onde veio a inferência — fica na observação,
   *                            distinguindo importação de correção manual
   */
  function registrarCargaInicial(registros, origem) {
    if (!registros.length) return Promise.resolve([]);

    var hoje = new Date().toISOString().slice(0, 10);
    var obs = origem || 'Carga inicial da planilha de controle';

    return auth.usuario().then(function (u) {
      var linhas = registros.map(function (r) {
        return {
          torre_id: r.torreId,
          atividade_id: r.atividadeId,
          encarregado_id: null,
          data_execucao: hoje,
          percentual: 100,
          carga_inicial: true,
          observacao: obs,
          registrado_por: u ? u.id : null
        };
      });

      // Em lotes: 145 torres × ~8 atividades passa de mil linhas
      var lotes = [];
      for (var i = 0; i < linhas.length; i += 500) lotes.push(linhas.slice(i, i + 500));

      return lotes.reduce(function (anterior, lote) {
        return anterior.then(function () {
          return cliente().from('execucao').insert(lote).then(function (r) {
            if (r.error) throw traduzErro(r.error, 'Falha ao gravar estágio das torres');
            return true;
          });
        });
      }, Promise.resolve());
    });
  }

  function criarTrecho(nome, ordem) {
    return obra().then(function (o) {
      return cliente().from('trecho')
        .insert({ obra_id: o.id, nome: nome, ordem: ordem || 0 })
        .select().single()
        .then(function (r) { return ok(r, 'Falha ao criar trecho'); });
    });
  }

  /* ======================================================================== */
  /* TEMPO REAL — é o que entrega o trabalho simultâneo                       */
  /* ======================================================================== */

  var canalProgramacao = null;

  /**
   * Escuta mudanças na programação feitas por qualquer usuário.
   * cb({evento, registro}) — evento: 'INSERT' | 'UPDATE' | 'DELETE'
   * Retorna função para cancelar.
   */
  function escutarProgramacoes(cb) {
    pararDeEscutar();
    canalProgramacao = cliente()
      .channel('sipav-programacao')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'programacao' },
          function (payload) {
            cb({
              evento: payload.eventType,
              registro: payload.new && Object.keys(payload.new).length ? payload.new : payload.old
            });
          })
      .subscribe();
    return pararDeEscutar;
  }

  function pararDeEscutar() {
    if (canalProgramacao) {
      cliente().removeChannel(canalProgramacao);
      canalProgramacao = null;
    }
  }

  /* ======================================================================== */
  /* EXPORTAÇÃO DA API                                                        */
  /* ======================================================================== */

  window.SIPAV.db = {
    SipavErro: SipavErro,
    iniciar: iniciar,
    cliente: cliente,
    auth: auth,

    obra: obra,
    trechos: trechos,
    torres: torres,
    atividades: atividades,
    dependencias: dependencias,
    encarregados: encarregados,
    canteiros: canteiros,
    criarCanteiro: criarCanteiro,
    vincularCanteiroTrecho: vincularCanteiroTrecho,

    programacoes: programacoes,
    motivoBloqueio: motivoBloqueio,
    criarProgramacao: criarProgramacao,
    atualizarProgramacao: atualizarProgramacao,
    removerProgramacao: removerProgramacao,
    limparProgramacoesDaTorre: limparProgramacoesDaTorre,
    limparProgramacoesDoPeriodo: limparProgramacoesDoPeriodo,

    execucoes: execucoes,
    apontarExecucao: apontarExecucao,
    desfazerApontamento: desfazerApontamento,
    conflitosDoEncarregado: conflitosDoEncarregado,

    historicoDaTorre: historicoDaTorre,
    historicoDoTrecho: historicoDoTrecho,
    registrarCorrecaoEstagio: registrarCorrecaoEstagio,

    restricoes: restricoes,
    criarRestricao: criarRestricao,
    liberarRestricao: liberarRestricao,

    salvarEncarregado: salvarEncarregado,
    desativarEncarregado: desativarEncarregado,
    salvarAtividade: salvarAtividade,
    desativarAtividade: desativarAtividade,
    salvarDependencias: salvarDependencias,
    reordenarAtividades: reordenarAtividades,
    importarTorres: importarTorres,
    limparCargaInicial: limparCargaInicial,
    registrarCargaInicial: registrarCargaInicial,
    criarTrecho: criarTrecho,

    escutarProgramacoes: escutarProgramacoes,
    pararDeEscutar: pararDeEscutar
  };
})();
