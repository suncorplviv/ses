BEGIN;

-- =========================================================
-- СЕРІЙНІ НОМЕРИ ОБЛАДНАННЯ ПО УГОДІ
-- Кілька серійників на угоду: інвертор, дата-логер, АКБ, BMS.
-- Всі необов'язкові — фіксуються за наявності.
-- Перегляд: картка угоди та вікно клієнта (кнопка "Обладнання").
-- =========================================================

CREATE TABLE IF NOT EXISTS public.deal_equipment_serials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  equipment_type text NOT NULL
                CHECK (equipment_type IN ('inverter', 'logger', 'battery', 'bms')),
  serial_number text NOT NULL,
  notes         text,
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_equipment_serials_deal
  ON public.deal_equipment_serials (deal_id);

COMMIT;
