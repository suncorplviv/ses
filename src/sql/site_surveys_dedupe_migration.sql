BEGIN;

-- =========================================================
-- ФІКС ДУБЛІКАТІВ site_surveys
-- Причина: SiteSurveyModal робив upsert без ключа конфлікту,
-- тож кожне збереження створювало НОВИЙ рядок. Через це
-- запити .single() падали, і форми відкривались пустими.
--
-- 1. Зливаємо дані дублікатів у головний рядок (заповнений акт
--    пріоритетніший, з нього ж і фото; відсутні поля добираємо
--    з новіших дублікатів).
-- 2. Видаляємо зайві рядки.
-- 3. Ставимо унікальність deal_id, щоб дублікати не повертались.
-- =========================================================

-- Головний рядок: спершу заповнений акт (is_complete), далі найновіший
WITH keep AS (
  SELECT DISTINCT ON (deal_id) id, deal_id
  FROM public.site_surveys
  ORDER BY deal_id, is_complete DESC NULLS LAST, created_at DESC
),
merged AS (
  SELECT
    s.deal_id,
    (array_remove(array_agg(s.region       ORDER BY s.created_at DESC), NULL))[1] AS region,
    (array_remove(array_agg(s.city         ORDER BY s.created_at DESC), NULL))[1] AS city,
    (array_remove(array_agg(s.geolocation  ORDER BY s.created_at DESC), NULL))[1] AS geolocation,
    (array_remove(array_agg(s.system_type  ORDER BY s.created_at DESC), NULL))[1] AS system_type,
    (array_remove(array_agg(s.comment      ORDER BY s.created_at DESC), NULL))[1] AS comment
  FROM public.site_surveys s
  GROUP BY s.deal_id
)
UPDATE public.site_surveys t
SET
  region      = COALESCE(t.region, m.region),
  city        = COALESCE(t.city, m.city),
  geolocation = COALESCE(t.geolocation, m.geolocation),
  system_type = COALESCE(t.system_type, m.system_type),
  comment     = COALESCE(t.comment, m.comment)
FROM merged m
JOIN keep k ON k.deal_id = m.deal_id
WHERE t.id = k.id;

DELETE FROM public.site_surveys
WHERE id NOT IN (
  SELECT DISTINCT ON (deal_id) id
  FROM public.site_surveys
  ORDER BY deal_id, is_complete DESC NULLS LAST, created_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_surveys_deal_id
  ON public.site_surveys (deal_id);

COMMIT;
