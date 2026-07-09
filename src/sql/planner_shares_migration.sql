BEGIN;

-- =========================================================
-- ШЕРИНГ КАЛЕНДАРЯ ПЛАНЕРА
-- owner ділиться своїм календарем з viewer (тільки перегляд).
-- Переглядач бачить ЛИШЕ тип події, час та "не турбувати" —
-- без назви, опису, нотаток (маскування на рівні фронтенду).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.planner_shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planner_shares_unique UNIQUE (owner_id, viewer_id),
  CONSTRAINT planner_shares_not_self CHECK (owner_id <> viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_shares_viewer
  ON public.planner_shares (viewer_id);

COMMIT;
