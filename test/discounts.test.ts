import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("daily-totals: скидки", () => {
  it("gross / discount / net по дням, total = gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 10, amountPaid: 900 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1500, discountPercent: 20.75, amountPaid: 1188.75 }));
    await postWebhook(ctx.app, apiOrder({ amount: 300, discountPercent: 0, amountPaid: 300 }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2800, gross: 2800, discount: 411.25, net: 2388.75 }]);
  });

  it("пример из задания: 2500 → discount 412.5, net 2087.5", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, discountPercent: 16.5, amountPaid: 2087.5 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2500, gross: 2500, discount: 412.5, net: 2087.5 }]);
  });

  it("заказы старого формата (без discountPercent/amountPaid) — без скидки", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 700 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 700, gross: 700, discount: 0, net: 700 }]);
  });

  it("есть скидка, но нет amountPaid — net считается из процента", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 999, discountPercent: "33" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    // 999 * 0.67 = 669.33
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 999, gross: 999, discount: 329.67, net: 669.33 }]);
  });

  it("строковые discountPercent и amountPaid", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: "2609.00", discountPercent: "7", amountPaid: "2426.37" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2609, gross: 2609, discount: 182.63, net: 2426.37 }]);
  });

  it("точность до копейки: суммы, которые в double не представимы точно", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1309, discountPercent: 7, amountPaid: 1217.61 }));
    await postWebhook(ctx.app, apiOrder({ amount: 5079, discountPercent: 7, amountPaid: 4723.9 }));
    for (let i = 0; i < 10; i++) await postWebhook(ctx.app, apiOrder({ amount: 0.1, amountPaid: 0.1 }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 6389, gross: 6389, discount: 446.49, net: 5942.51 }]);
  });

  it("изменение скидки вебхуком пересчитывает net", async () => {
    const o = apiOrder({ amount: 1000, discountPercent: 0, amountPaid: 1000 });
    await postWebhook(ctx.app, o);
    await postWebhook(ctx.app, { ...o, discountPercent: 33, amountPaid: 670, updatedAt: "2026-02-10T13:00:00Z" });
    await postWebhook(ctx.app, { ...o, discountPercent: 10, amountPaid: 900, updatedAt: "2026-02-10T12:30:00Z" });

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 1000, gross: 1000, discount: 330, net: 670 }]);
  });

  it("невалидные скидки — 400", async () => {
    expect((await postWebhook(ctx.app, apiOrder({ discountPercent: 150 }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ discountPercent: "abc" }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ amount: 100, amountPaid: 101 }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ amountPaid: -1 }))).statusCode).toBe(400);
  });

  it("синк сохраняет скидки", async () => {
    const o = apiOrder({ amount: 852, discountPercent: 10, amountPaid: 766.8 });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    await ctx.app.inject({ method: "POST", url: "/sync" });
    const { rows } = await ctx.db.query(`SELECT amount_kop, discount_percent, amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0]).toEqual({ amount_kop: "85200", discount_percent: "10.00", amount_paid_kop: "76680" });
  });
});
