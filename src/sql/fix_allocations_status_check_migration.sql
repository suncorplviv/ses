BEGIN;

-- =========================================================
-- ТЕРМІНОВИЙ ФІКС: check constraint статусів deal_bom_allocations
--
-- Попередня міграція (planner_and_order_fixes_migration.sql)
-- переписала deal_bom_allocations_status_check і ПОМИЛКОВО
-- не включила статуси 'reserved' та 'issued', які використовують
-- erp_reserve_bom_item / erp_issue_reserved_stock.
-- Через це БУДЬ-ЯКЕ резервування падало з помилкою:
-- "violates check constraint deal_bom_allocations_status_check".
--
-- Тут — повний білий список усіх статусів життєвого циклу алокації.
-- =========================================================

ALTER TABLE public.deal_bom_allocations
  DROP CONSTRAINT IF EXISTS deal_bom_allocations_status_check;

ALTER TABLE public.deal_bom_allocations
  ADD CONSTRAINT deal_bom_allocations_status_check
  CHECK (status IN (
    'planned',     -- запланована алокація
    'reserved',    -- зарезервовано зі складу
    'issued',      -- видано на об'єкт
    'mounted',     -- змонтовано
    'ordered',     -- замовлено у постачальника
    'in_transit',  -- в дорозі
    'received',    -- отримано (пряма поставка)
    'cancelled'    -- скасовано
  ));

COMMIT;
