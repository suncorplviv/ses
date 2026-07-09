BEGIN;

-- =========================================================
-- TELEGRAM-БОТ: ПОЛЯ ДЕДУПЛІКАЦІЇ СПОВІЩЕНЬ
--
-- Проблема: у tasks було одне поле reminder_sent_at на ВСІ типи
-- сповіщень — після повідомлення "нове завдання" нагадування про
-- дедлайн і прострочення вже ніколи не надсилались.
-- Тепер кожен тип сповіщення має власну позначку.
-- =========================================================

-- Завдання: окремі позначки для "дедлайн скоро" та "прострочено"
-- (reminder_sent_at лишається для сповіщення "нове завдання")
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deadline_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_reminder_sent_at timestamptz;

-- Події планера: нагадування за 30 та 10 хвилин,
-- підтвердження кнопкою "Пам'ятаю", сповіщення про доручення
-- та про зміну статусу доручення
ALTER TABLE public.planner_events
  ADD COLUMN IF NOT EXISTS reminder_30_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_10_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS delegator_status_notified_at timestamptz;

-- Шеринг календаря: сповіщення "з вами поділилися"
ALTER TABLE public.planner_shares
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Індекс для швидкої вибірки найближчих запланованих подій ботом
CREATE INDEX IF NOT EXISTS idx_planner_events_upcoming
  ON public.planner_events (start_at)
  WHERE status = 'planned';

COMMIT;
