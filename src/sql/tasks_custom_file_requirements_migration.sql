BEGIN;

-- =========================================================
-- КОНСТРУКТОР ВЛАСНИХ ЗАВДАНЬ: ВИМОГА ФАЙЛУ
-- requires_file — завдання закривається лише після прикріплення файлу
-- file_label    — власна назва типу документа (напр. "Технічні умови").
--                 Використовується як категорія в deal_documents та
--                 в шаблоні імені файлу: {Тип}_{Угода}_{Дата}_{№}
-- =========================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS requires_file boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_label text;

COMMIT;
