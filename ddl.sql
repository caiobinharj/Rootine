-- ENUM usado em user_missions.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_status_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_status_enum AS ENUM ('pending','active','completed','expired','refused','failed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_type_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_type_enum AS ENUM ('daily','specialized');
  END IF;
END $$;

-- 1) profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  nome text NOT NULL,
  xp int NOT NULL,
  socioeconomic_context jsonb,
  learned_preferences jsonb,
  affinities jsonb,
  impact_totals jsonb NOT NULL DEFAULT '{"co2_kg":0,"water_l":0,"waste_g":0}'::jsonb,
  created_at timestamptz,
  avatar_url text,
  onboarding_completed boolean,
  daily_flashcards_completed boolean
);

-- FK: profiles.id -> auth.users.id
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fk_auth_users
  FOREIGN KEY (id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- 2) user_missions
CREATE TABLE public.user_missions (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  ai_justification jsonb,
  feedback_notes jsonb,
  status public.mission_status_enum NOT NULL,
  mission_type public.mission_type_enum NOT NULL DEFAULT 'daily',
  created_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

-- FK: user_missions.user_id -> profiles.id
ALTER TABLE public.user_missions
  ADD CONSTRAINT user_missions_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 3) flashcards
CREATE TABLE public.flashcards (
  id uuid NOT NULL PRIMARY KEY,
  question text
);

-- 4) user_daily_flashcards
CREATE TABLE public.user_daily_flashcards (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  completed_at timestamptz,
  active boolean,
  created_at timestamptz,
  amount int
);

-- FK: user_daily_flashcards.user_id -> profiles.id
ALTER TABLE public.user_daily_flashcards
  ADD CONSTRAINT user_daily_flashcards_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 5) user_flashcards_answers
CREATE TABLE public.user_flashcards_answers (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  flashcard_id uuid NOT NULL,
  daily_batch uuid NOT NULL,
  answer boolean
);

-- FK: user_flashcards_answers.flashcard_id -> flashcards.id
ALTER TABLE public.user_flashcards_answers
  ADD CONSTRAINT user_flashcards_answers_flashcard_id_fk_flashcards
  FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id)
  ON DELETE CASCADE;

-- FK: user_flashcards_answers.daily_batch -> user_daily_flashcards.id
ALTER TABLE public.user_flashcards_answers
  ADD CONSTRAINT user_flashcards_answers_daily_batch_fk_user_daily_flashcards
  FOREIGN KEY (daily_batch) REFERENCES public.user_daily_flashcards(id)
  ON DELETE CASCADE;

-- 6) agent_interactions
CREATE TABLE public.agent_interactions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent text NOT NULL,
  event_type text NOT NULL,
  input_summary jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_interactions
  ADD CONSTRAINT agent_interactions_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 7) habitat_leaves
CREATE TABLE public.habitat_leaves (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  position int NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  source_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.habitat_leaves
  ADD CONSTRAINT habitat_leaves_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 8) quizzes
CREATE TABLE public.quizzes (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_option text NOT NULL,
  explanation text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 9) user_quiz_answers
CREATE TABLE public.user_quiz_answers (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  selected_option text NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_quiz_answers
  ADD CONSTRAINT user_quiz_answers_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.user_quiz_answers
  ADD CONSTRAINT user_quiz_answers_quiz_id_fk_quizzes
  FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
  ON DELETE CASCADE;