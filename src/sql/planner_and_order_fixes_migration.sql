BEGIN;

-- =========================================================
-- 1. ФІКС СКАСУВАННЯ ЗАМОВЛЕНЬ
-- Дозволяємо алокаціям специфікації мати статус 'cancelled'.
-- Фронтенд (PurchaseOrderModal) при скасуванні PO переводить
-- відкриті алокації ('ordered'/'in_transit') у 'cancelled',
-- після чого дефіцит у специфікації знову стає видимим.
-- =========================================================

ALTER TABLE public.deal_bom_allocations
  DROP CONSTRAINT IF EXISTS deal_bom_allocations_status_check;

ALTER TABLE public.deal_bom_allocations
  ADD CONSTRAINT deal_bom_allocations_status_check
  CHECK (status IN ('planned', 'ordered', 'in_transit', 'received', 'cancelled'));

-- Атомарне скасування замовлення разом з алокаціями (опційно використовується фронтендом)
CREATE OR REPLACE FUNCTION public.erp_cancel_purchase_order(
  p_po_id uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bom_id uuid;
BEGIN
  UPDATE public.purchase_orders
  SET status = 'cancelled'
  WHERE id = p_po_id;

  -- Скасовуємо відкриті алокації і перераховуємо статуси BOM
  FOR v_bom_id IN
    UPDATE public.deal_bom_allocations
    SET status = 'cancelled'
    WHERE purchase_order_id = p_po_id
      AND status IN ('ordered', 'in_transit')
    RETURNING bom_id
  LOOP
    PERFORM public.erp_refresh_bom_status(v_bom_id);
  END LOOP;
END;
$$;

-- =========================================================
-- 2. ПЛАНЕР / ОСОБИСТИЙ КАЛЕНДАР
-- Події користувача: завдання, зустрічі, дзвінки, нагадування.
-- Можуть бути прив'язані до угоди або конкретного завдання CRM.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.planner_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title        varchar NOT NULL,
  description  text,
  event_type   text NOT NULL DEFAULT 'task'
               CHECK (event_type IN ('task', 'meeting', 'call', 'reminder', 'personal')),
  start_at     timestamptz NOT NULL,
  end_at       timestamptz,
  all_day      boolean NOT NULL DEFAULT false,
  priority     text NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  can_disturb  boolean NOT NULL DEFAULT true,   -- чи можна турбувати під час події
  status       text NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned', 'done', 'cancelled')),
  deal_id      uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  task_id      uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  location     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planner_events_time_check CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_planner_events_user_start
  ON public.planner_events (user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_planner_events_task
  ON public.planner_events (task_id)
  WHERE task_id IS NOT NULL;

COMMIT;
