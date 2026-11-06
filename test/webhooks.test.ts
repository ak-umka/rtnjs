import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /webhooks/order: конкурентная доставка", () => {
  it("одновременные дубли и устаревшие версии не перетирают более новую", async () => {
    const o = apiOrder({ status: "pending", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, o);
    const paid = { ...o, status: "paid", updatedAt: "2026-02-10T13:00:00Z" };
    const refunded = { ...o, status: "refunded", updatedAt: "2026-02-10T14:00:00Z" };
    const batch = [refunded, paid, paid, refunded, paid, o, refunded, paid];
    for (let round = 0; round < 5; round++) {
      const results = (await Promise.all(batch.map((b) => postWebhook(ctx.app, b)))).map((r) => r.json().result);
      expect(results.every((r) => r === "updated" || r === "stale")).toBe(true);
      const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
      expect(rows[0].status).toBe("refunded");
    }
  });

  it("одновременное создание нового заказа: ровно один created", async () => {
    const o = apiOrder();
    const results = (await Promise.all(Array.from({ length: 8 }, () => postWebhook(ctx.app, o)))).map((r) => r.json().result);
    expect(results.filter((r) => r === "created")).toHaveLength(1);
    expect(results.filter((r) => r === "stale")).toHaveLength(7);
  });
});
