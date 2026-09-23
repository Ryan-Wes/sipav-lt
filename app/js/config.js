/* =============================================================================
   SIPAV LT — Configuração
   =============================================================================
   Projeto Supabase: sipav-lt (South America / São Paulo).

   A chave abaixo é a "publishable" — sucessora da anon key, feita pra ficar
   exposta no navegador. Quem protege os dados é a RLS do banco.
   NUNCA coloque aqui a secret / service_role.
   ========================================================================== */

window.SIPAV_CONFIG = {
  supabaseUrl:     'https://skswfdaharuxgftwtgyx.supabase.co',
  supabaseAnonKey: 'sb_publishable_ZzboftMKtqb_0Xq9zdGdug_9BRsevH2',

  // Código da obra usada por esta instalação (ver db/02-seed.sql)
  obraCodigo: 'SD'
};
