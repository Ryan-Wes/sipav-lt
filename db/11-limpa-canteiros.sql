-- =============================================================================
-- Limpeza dos canteiros criados por engano — 23/09/2026
-- =============================================================================
-- O parser da importação quebrava o km na vírgula decimal ("0,42059" virava
-- "0" e "42059"), e o fragmento numérico ia parar no campo canteiro. Resultado:
-- dezenas de canteiros com nome de número.
--
-- Como canteiro_trecho tem cascade e torre.canteiro_id é "on delete set null",
-- apagar os canteiros falsos limpa os vínculos e desamarra as torres sozinho.
-- O km errado se corrige sozinho na reimportação, que faz upsert.
--
-- Só apaga nome composto apenas por dígitos — nenhum dos 9 canteiros reais
-- (Barra, Buritirama, Central, Igarité, Itajubaquara, Juazeiro, Laje dos
-- Negros, Umburanas, Wanderley) casa com isso.
-- =============================================================================

-- O que vai sair
select nome as sera_apagado
from canteiro
where obra_id = (select id from obra where codigo = 'SD')
  and nome ~ '^[0-9]+$'
order by nome;

delete from canteiro
where obra_id = (select id from obra where codigo = 'SD')
  and nome ~ '^[0-9]+$';

-- O que sobrou — devem ser exatamente os 9 reais
select c.nome,
       coalesce(string_agg(t.nome, ', ' order by t.nome), '— sem trecho —') as trechos
from canteiro c
left join canteiro_trecho ct on ct.canteiro_id = c.id
left join trecho t on t.id = ct.trecho_id
where c.obra_id = (select id from obra where codigo = 'SD')
group by c.nome
order by c.nome;
