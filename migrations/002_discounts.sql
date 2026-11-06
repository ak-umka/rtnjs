-- У уже сохранённых заказов скидка неизвестна: net = gross до ближайшего синка
ALTER TABLE orders
  ADD COLUMN discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN amount_paid_kop  BIGINT;

UPDATE orders SET amount_paid_kop = amount_kop;

ALTER TABLE orders ALTER COLUMN amount_paid_kop SET NOT NULL;
