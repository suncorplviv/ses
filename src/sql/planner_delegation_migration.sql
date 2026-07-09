BEGIN;

-- =========================================================
-- ДЕЛЕГУВАННЯ ПОДІЙ ПЛАНЕРА
-- Подію (зустріч, дзвінок, завдання) можна доручити колезі:
-- вона з'являється в ЙОГО календарі (user_id = виконавець),
-- а delegated_by зберігає, хто доручив. Той, хто доручив,
-- бачить статуси своїх доручень у панелі "Доручені".
-- =========================================================

ALTER TABLE public.planner_events
  ADD COLUMN IF NOT EXISTS delegated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planner_events_delegated_by
  ON public.planner_events (delegated_by)
  WHERE delegated_by IS NOT NULL;

COMMIT;
