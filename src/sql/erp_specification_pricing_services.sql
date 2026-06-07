BEGIN;

-- =========================================================
-- SPECIFICATION PRICING + SERVICE LINES
-- Required by DealInventory.jsx:
-- - equipment lines still use product_id
-- - service/work lines use custom_name and do not touch stock
-- - unit_sale_price stores the client-facing sell price
-- =========================================================

ALTER TABLE public.deal_bom
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'equipment',
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS unit_sale_price numeric NOT NULL DEFAULT 0 CHECK (unit_sale_price >= 0);

ALTER TABLE public.deal_bom
  DROP CONSTRAINT IF EXISTS deal_bom_line_type_check,
  DROP CONSTRAINT IF EXISTS deal_bom_line_payload_check;

ALTER TABLE public.deal_bom
  ADD CONSTRAINT deal_bom_line_type_check
  CHECK (line_type IN ('equipment', 'service'));

-- Service rows do not have a product from the catalog.
ALTER TABLE public.deal_bom
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.deal_bom
  ADD CONSTRAINT deal_bom_line_payload_check
  CHECK (
    (line_type = 'equipment' AND product_id IS NOT NULL)
    OR
    (line_type = 'service' AND product_id IS NULL AND NULLIF(BTRIM(custom_name), '') IS NOT NULL)
  );

ALTER TABLE public.deal_bom
  DROP COLUMN IF EXISTS line_total;

ALTER TABLE public.deal_bom
  ADD COLUMN line_total numeric GENERATED ALWAYS AS (quantity_planned * unit_sale_price) STORED;

-- Rebuild dependent ERP views so UI can read service rows and prices.
DROP VIEW IF EXISTS public.v_deal_bom_stock CASCADE;
DROP VIEW IF EXISTS public.v_deal_bom_fulfillment CASCADE;

CREATE VIEW public.v_deal_bom_fulfillment AS
WITH reservation_summary AS (
  SELECT
    bom_id,
    SUM(quantity) FILTER (
      WHERE status IN ('pending', 'confirmed', 'partially_issued', 'issued')
    ) AS quantity_reserved_total,
    SUM(GREATEST(quantity - quantity_issued, 0)) FILTER (
      WHERE status IN ('pending', 'confirmed', 'partially_issued')
    ) AS quantity_reserved_open,
    SUM(quantity_issued) FILTER (
      WHERE status IN ('partially_issued', 'issued')
    ) AS quantity_issued
  FROM public.deal_reservations
  GROUP BY bom_id
),
allocation_summary AS (
  SELECT
    bom_id,
    SUM(quantity) FILTER (
      WHERE status IN ('ordered', 'in_transit')
    ) AS quantity_ordered,
    SUM(quantity) FILTER (
      WHERE status = 'received'
    ) AS quantity_received
  FROM public.deal_bom_allocations
  GROUP BY bom_id
)
SELECT
  db.id AS bom_id,
  db.deal_id,
  db.product_id,
  db.line_type,
  db.custom_name,
  COALESCE(NULLIF(db.custom_name, ''), p.name) AS product_name,
  p.sku,
  COALESCE(p.unit, CASE WHEN db.line_type = 'service' THEN 'посл.' ELSE NULL END) AS unit,
  p.product_type,
  db.quantity_planned,
  db.quantity_mounted,
  db.unit_sale_price,
  db.line_total,
  COALESCE(rs.quantity_reserved_total, 0) AS quantity_reserved_total,
  COALESCE(rs.quantity_reserved_open, 0) AS quantity_reserved,
  COALESCE(rs.quantity_issued, 0) AS quantity_issued,
  COALESCE(a.quantity_ordered, 0) AS quantity_ordered,
  COALESCE(a.quantity_received, 0) AS quantity_received,
  CASE
    WHEN db.line_type = 'service' THEN 0
    ELSE GREATEST(
      db.quantity_planned
      - COALESCE(rs.quantity_reserved_open, 0)
      - COALESCE(rs.quantity_issued, 0)
      - COALESCE(a.quantity_ordered, 0)
      - COALESCE(a.quantity_received, 0),
      0
    )
  END AS quantity_shortage,
  db.status
FROM public.deal_bom db
LEFT JOIN public.products p ON p.id = db.product_id
LEFT JOIN reservation_summary rs ON rs.bom_id = db.id
LEFT JOIN allocation_summary a ON a.bom_id = db.id;

-- Compatibility view for current React code.
CREATE VIEW public.v_deal_bom_stock AS
SELECT
  f.deal_id,
  f.bom_id,
  f.product_id,
  f.line_type,
  f.custom_name,
  f.product_name,
  f.sku,
  f.unit,
  f.product_type,
  f.quantity_planned,
  f.quantity_mounted AS quantity_actual,
  f.unit_sale_price,
  f.line_total,
  f.quantity_reserved > 0 AS is_reserved,
  CASE
    WHEN f.line_type = 'service' THEN 0
    ELSE COALESCE(SUM(sb.quantity - sb.reserved_quantity), 0)
  END AS available_qty
FROM public.v_deal_bom_fulfillment f
LEFT JOIN public.stock_balances sb ON sb.product_id = f.product_id
GROUP BY
  f.deal_id,
  f.bom_id,
  f.product_id,
  f.line_type,
  f.custom_name,
  f.product_name,
  f.sku,
  f.unit,
  f.product_type,
  f.quantity_planned,
  f.quantity_mounted,
  f.unit_sale_price,
  f.line_total,
  f.quantity_reserved;

CREATE OR REPLACE FUNCTION public.erp_refresh_bom_status(p_bom_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_type text;
  v_plan numeric;
  v_mounted numeric;
  v_reserved numeric;
  v_issued numeric;
  v_ordered numeric;
  v_received numeric;
  v_new_status text;
BEGIN
  SELECT
    line_type,
    quantity_planned,
    quantity_mounted,
    quantity_reserved,
    quantity_issued,
    quantity_ordered,
    quantity_received
  INTO
    v_line_type,
    v_plan,
    v_mounted,
    v_reserved,
    v_issued,
    v_ordered,
    v_received
  FROM public.v_deal_bom_fulfillment
  WHERE bom_id = p_bom_id;

  IF v_plan IS NULL THEN
    RETURN;
  END IF;

  -- Service/work rows are commercial specification lines, not warehouse items.
  IF v_line_type = 'service' THEN
    UPDATE public.deal_bom
    SET status = 'planned'
    WHERE id = p_bom_id;

    RETURN;
  END IF;

  IF v_mounted >= v_plan THEN
    v_new_status := 'mounted';
  ELSIF v_mounted > 0 THEN
    v_new_status := 'partially_mounted';
  ELSIF v_issued >= v_plan THEN
    v_new_status := 'issued';
  ELSIF v_issued > 0 THEN
    v_new_status := 'partially_issued';
  ELSIF (v_reserved + v_ordered + v_received) >= v_plan THEN
    v_new_status := 'allocated';
  ELSIF (v_reserved + v_ordered + v_received) > 0 THEN
    v_new_status := 'partially_allocated';
  ELSE
    v_new_status := 'planned';
  END IF;

  UPDATE public.deal_bom
  SET status = v_new_status
  WHERE id = p_bom_id;
END;
$$;

COMMIT;
