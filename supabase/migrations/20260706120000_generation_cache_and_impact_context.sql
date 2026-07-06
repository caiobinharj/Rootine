ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cache_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_missions
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cache_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS quizzes_one_cached_per_user
  ON public.quizzes (user_id)
  WHERE delivery_status = 'cached';

CREATE UNIQUE INDEX IF NOT EXISTS user_missions_one_cached_per_user_type
  ON public.user_missions (user_id, mission_type)
  WHERE delivery_status = 'cached';

CREATE INDEX IF NOT EXISTS quizzes_delivery_lookup_idx
  ON public.quizzes (user_id, delivery_status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS user_missions_delivery_lookup_idx
  ON public.user_missions (user_id, mission_type, delivery_status, expires_at, created_at);
