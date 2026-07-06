-- ============================================================================
-- QUIZ ADAPTATIVO (GEMINI) + BIOSFERA REAL (EVENTOS E NOTÍCIAS)
-- Data: 2026-07-05
--
-- Script incremental no mesmo estilo do ddl.sql: seguro para rodar mais de
-- uma vez no SQL Editor do Supabase. Não recria tabelas existentes.
--
-- Blocos:
--   A) Extensão de public.quizzes para geração adaptativa via Gemini
--   B) View de contexto do usuário para o motor de quiz (Python worker)
--   C) Tabela public.biosphere_events (eventos reais com link de inscrição)
--   D) Tabela public.biosphere_news (feed filtrado de notícias)
--   E) Tabela public.biosphere_sync_runs (observabilidade do worker 12h)
--   F) Tabela public.user_event_bookmarks (interesse/inscrição do usuário)
--   G) RLS: leitura pública autenticada, escrita apenas service_role
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- A) quizzes: metadados de geração adaptativa.
--    Colunas aditivas; funções existentes (generate-quiz, answer-adventure-quiz)
--    continuam funcionando sem alteração.
-- ---------------------------------------------------------------------------
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS difficulty int,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS focus_mode text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS generation_context jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quizzes_origin_check'
      AND conrelid = 'public.quizzes'::regclass
  ) THEN
    ALTER TABLE public.quizzes
      ADD CONSTRAINT quizzes_origin_check
      CHECK (origin IN ('legacy','quiz_questions','gemini_adaptive')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quizzes_difficulty_check'
      AND conrelid = 'public.quizzes'::regclass
  ) THEN
    ALTER TABLE public.quizzes
      ADD CONSTRAINT quizzes_difficulty_check
      CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quizzes_focus_mode_check'
      AND conrelid = 'public.quizzes'::regclass
  ) THEN
    ALTER TABLE public.quizzes
      ADD CONSTRAINT quizzes_focus_mode_check
      CHECK (focus_mode IS NULL OR focus_mode IN ('reinforce_weak','challenge_strong','explore')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quizzes_user_origin_created_idx
  ON public.quizzes (user_id, origin, created_at DESC);

-- ---------------------------------------------------------------------------
-- B) Contexto consolidado por usuário para o gerador adaptativo.
--    Janela de 30 dias para desempenho e 45 dias para interesses.
--    security_invoker: a view respeita o RLS das tabelas base; o worker
--    Python usa service_role e enxerga tudo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_user_quiz_context
WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  COALESCE(p.xp, 0) AS xp,
  p.affinities,
  p.learned_preferences,
  (
    SELECT jsonb_object_agg(
             m.category,
             jsonb_build_object('completed', m.completed, 'failed', m.failed)
           )
    FROM (
      SELECT
        um.category,
        count(*) FILTER (WHERE um.status = 'completed') AS completed,
        count(*) FILTER (WHERE um.status IN ('failed','expired','refused')) AS failed
      FROM public.user_missions um
      WHERE um.user_id = p.id
        AND um.category IS NOT NULL
        AND um.created_at >= now() - interval '30 days'
      GROUP BY um.category
    ) m
  ) AS mission_stats,
  (
    SELECT jsonb_object_agg(
             s.category,
             jsonb_build_object('answered', s.answered, 'correct', s.correct)
           )
    FROM (
      SELECT
        q.category,
        count(*) AS answered,
        count(*) FILTER (WHERE a.correct) AS correct
      FROM public.user_quiz_answers a
      JOIN public.quizzes q ON q.id = a.quiz_id
      WHERE a.user_id = p.id
        AND q.category IS NOT NULL
        AND a.answered_at >= now() - interval '30 days'
      GROUP BY q.category
    ) s
  ) AS quiz_stats,
  (
    SELECT array_agg(DISTINCT f.category)
    FROM public.user_profile_facts f
    WHERE f.user_id = p.id
      AND f.active
      AND f.category IS NOT NULL
      AND f.last_seen_at >= now() - interval '45 days'
  ) AS recent_interest_categories,
  (
    SELECT jsonb_agg(t.question)
    FROM (
      SELECT q2.question
      FROM public.quizzes q2
      WHERE q2.user_id = p.id
      ORDER BY q2.created_at DESC
      LIMIT 12
    ) t
  ) AS recent_questions
FROM public.profiles p;

-- ---------------------------------------------------------------------------
-- C) Eventos reais da Biosfera.
--    Regra de escopo do produto: presencial/híbrido somente no RJ; online de
--    qualquer lugar do Brasil. registration_url é obrigatório: todo evento
--    exibido precisa ter inscrição real.
--    Upsert do worker usa (source, external_id); quando a fonte não fornece
--    id estável, o worker preenche external_id com o content_hash.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biosphere_events (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  content_hash text NOT NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'outro',
  modality text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  city text,
  state text,
  venue_name text,
  address text,
  registration_url text NOT NULL,
  is_free boolean,
  price_min numeric(10,2),
  organizer_name text,
  image_url text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active',
  relevance_score numeric(4,3),
  relevance_source text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biosphere_events_source_check
    CHECK (source IN ('sympla','inea','eventbrite','transforma_brasil','manual')),
  CONSTRAINT biosphere_events_event_type_check
    CHECK (event_type IN ('mutirao','plantio','limpeza','trilha','oficina','palestra','webinar','congresso','feira','outro')),
  CONSTRAINT biosphere_events_modality_check
    CHECK (modality IN ('presencial','online','hibrido')),
  CONSTRAINT biosphere_events_status_check
    CHECK (status IN ('active','expired','cancelled','pending_review','rejected')),
  CONSTRAINT biosphere_events_relevance_check
    CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 1)),
  CONSTRAINT biosphere_events_scope_check
    CHECK (modality = 'online' OR state = 'RJ'),
  CONSTRAINT biosphere_events_registration_url_check
    CHECK (btrim(registration_url) <> ''),
  CONSTRAINT biosphere_events_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS biosphere_events_status_starts_idx
  ON public.biosphere_events (status, starts_at);

CREATE INDEX IF NOT EXISTS biosphere_events_modality_starts_idx
  ON public.biosphere_events (modality, starts_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS biosphere_events_content_hash_idx
  ON public.biosphere_events (content_hash);

-- ---------------------------------------------------------------------------
-- D) Notícias da Biosfera (feed filtrado).
--    llm_verdict: 'pending' aguarda o filtro Gemini Flash; 'skipped' passou
--    apenas pelo filtro de palavras-chave (fail-open quando a LLM está
--    indisponível). O app exibe verdict IN ('approved','skipped').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biosphere_news (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_name text NOT NULL,
  external_id text NOT NULL,
  content_hash text NOT NULL,
  title text NOT NULL,
  summary text,
  url text NOT NULL,
  image_url text,
  author text,
  published_at timestamptz NOT NULL,
  region_scope text NOT NULL DEFAULT 'brasil',
  topics text[] NOT NULL DEFAULT '{}'::text[],
  llm_verdict text NOT NULL DEFAULT 'pending',
  llm_score numeric(4,3),
  llm_reason text,
  llm_model text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biosphere_news_source_check
    CHECK (source IN ('oeco','g1_meio_ambiente','g1_rio','agencia_brasil')),
  CONSTRAINT biosphere_news_region_check
    CHECK (region_scope IN ('rio_de_janeiro','brasil')),
  CONSTRAINT biosphere_news_verdict_check
    CHECK (llm_verdict IN ('pending','approved','rejected','skipped')),
  CONSTRAINT biosphere_news_score_check
    CHECK (llm_score IS NULL OR (llm_score >= 0 AND llm_score <= 1)),
  CONSTRAINT biosphere_news_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS biosphere_news_verdict_published_idx
  ON public.biosphere_news (llm_verdict, published_at DESC);

CREATE INDEX IF NOT EXISTS biosphere_news_region_published_idx
  ON public.biosphere_news (region_scope, published_at DESC)
  WHERE llm_verdict IN ('approved','skipped');

-- ---------------------------------------------------------------------------
-- E) Log de execuções do worker (cron 12h). Uma linha por fonte por rodada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biosphere_sync_runs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  items_found int NOT NULL DEFAULT 0,
  items_new int NOT NULL DEFAULT 0,
  items_updated int NOT NULL DEFAULT 0,
  items_rejected int NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT biosphere_sync_runs_job_check CHECK (job IN ('news','events','expire')),
  CONSTRAINT biosphere_sync_runs_status_check CHECK (status IN ('success','partial','error'))
);

CREATE INDEX IF NOT EXISTS biosphere_sync_runs_job_started_idx
  ON public.biosphere_sync_runs (job, started_at DESC);

-- ---------------------------------------------------------------------------
-- F) Interesse/inscrição do usuário em eventos (a inscrição real acontece na
--    plataforma externa via registration_url; aqui rastreamos a jornada para
--    gamificação: XP ao marcar presença, lembretes etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_event_bookmarks (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.biosphere_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'interested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_event_bookmarks_status_check
    CHECK (status IN ('interested','registered','attended','cancelled')),
  CONSTRAINT user_event_bookmarks_user_event_unique UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS user_event_bookmarks_user_idx
  ON public.user_event_bookmarks (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- G) RLS. O worker Python usa a service_role key (bypassa RLS). O app lê
--    eventos ativos e notícias aprovadas com o anon/authenticated key.
-- ---------------------------------------------------------------------------
ALTER TABLE public.biosphere_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biosphere_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biosphere_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'biosphere_events'
      AND policyname = 'biosphere_events_read_active'
  ) THEN
    CREATE POLICY biosphere_events_read_active
      ON public.biosphere_events FOR SELECT
      TO authenticated, anon
      USING (status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'biosphere_news'
      AND policyname = 'biosphere_news_read_visible'
  ) THEN
    CREATE POLICY biosphere_news_read_visible
      ON public.biosphere_news FOR SELECT
      TO authenticated, anon
      USING (llm_verdict IN ('approved','skipped'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_event_bookmarks'
      AND policyname = 'user_event_bookmarks_own_select'
  ) THEN
    CREATE POLICY user_event_bookmarks_own_select
      ON public.user_event_bookmarks FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_event_bookmarks'
      AND policyname = 'user_event_bookmarks_own_insert'
  ) THEN
    CREATE POLICY user_event_bookmarks_own_insert
      ON public.user_event_bookmarks FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_event_bookmarks'
      AND policyname = 'user_event_bookmarks_own_update'
  ) THEN
    CREATE POLICY user_event_bookmarks_own_update
      ON public.user_event_bookmarks FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
