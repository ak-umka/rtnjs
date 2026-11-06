import { z } from "zod";
import { ValidationError } from "../errors.js";
import type { Order, OrdersRepository, SaveResult } from "../repositories/orders.js";
import { applyDiscount, parsePercent, parseRub, toKop } from "../utils/money.js";
import { parseUtc } from "../utils/time.js";

const NumberLike = z.union([z.number(), z.string()]);

/** Заказ в формате внешнего API (поля, которые нам нужны; остальные игнорируем). */
const ExternalOrder = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: NumberLike,
  discountPercent: NumberLike.nullish(),
  amountPaid: NumberLike.nullish(),
  status: z.enum(["pending", "paid", "refunded"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplyResult = SaveResult;

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  normalize(raw: unknown): Order {
    const parsed = ExternalOrder.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`invalid order: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    const o = parsed.data;
    try {
      const amountKop = toKop(parseRub(o.amount));
      const discountPercent = o.discountPercent == null ? 0 : parsePercent(o.discountPercent);
      // amountPaid — фактическая оплата, берём как есть; у старых заказов поля нет
      const amountPaidKop = o.amountPaid == null ? applyDiscount(amountKop, discountPercent) : toKop(parseRub(o.amountPaid));
      if (amountPaidKop > amountKop) throw new Error(`amountPaid ${o.amountPaid} > amount ${o.amount}`);
      return {
        id: o.id,
        customerId: o.customerId,
        amountKop,
        discountPercent,
        amountPaidKop,
        status: o.status,
        createdAt: parseUtc(o.createdAt),
        updatedAt: parseUtc(o.updatedAt),
      };
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
  }

  /**
   * Применяет версию заказа (из синка или вебхука).
   * Вебхуки приходят с повторами и не по порядку, поэтому версию сохраняем,
   * только если она новее уже сохранённой (по updatedAt).
   */
  async apply(raw: unknown): Promise<ApplyResult> {
    return this.orders.saveIfNewer(this.normalize(raw));
  }
}
