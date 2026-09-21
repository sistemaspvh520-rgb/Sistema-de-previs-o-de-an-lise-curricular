-- Supabase: o app acessa o banco via Prisma com a role "postgres" (ignora RLS).
-- Ativar RLS sem políticas bloqueia qualquer acesso pela Data API (anon/authenticated) às tabelas do schema public.
-- Executar após cada nova migração que crie tabelas:  supabase db query -f prisma/supabase-rls.sql --linked
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
