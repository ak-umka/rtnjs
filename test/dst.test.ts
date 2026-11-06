import { afterEach, describe, expect, it, vi } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

// Жалоба по c_7: смещение бралось на «сейчас», а 29.03 Берлин переходит с +1 на +2
describe("daily-totals: переход на летнее/зимнее время", () => {
  afterEach(() => vi.useRealTimers());

  const totalsByDate = async (customerId: string, from: string, to: string) => {
    const res = await dailyTotals(ctx.app, customerId, from, to);
    expect(res.statusCode).toBe(200);
    return Object.fromEntries((res.json() as { date: string; net: number }[]).map((d) => [d.date, d.net]));
  };

  for (const now of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z", "2026-11-06T12:00:00Z"]) {
    it(`весенний переход, Europe/Berlin (сейчас ${now.slice(0, 10)})`, async () => {
      vi.useFakeTimers({ now: new Date(now), toFake: ["Date"] });
      ctx.api.customers.set("c_7", "Europe/Berlin");
      // до перехода (CET, +1): 22:30Z = 23:30 того же дня
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 100, createdAt: "2026-03-27T22:30:00Z" }));
      // после перехода (CEST, +2): 22:30Z = 00:30 следующего дня
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 200, createdAt: "2026-03-30T22:30:00Z" }));
      // в ночь перехода: 00:59:59Z = 01:59:59 CET, 01:00Z = 03:00 CEST — оба 29-го
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 1, createdAt: "2026-03-29T00:59:59Z" }));
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 2, createdAt: "2026-03-29T01:00:00Z" }));
      // 29.03 длится 23 часа: 22:00Z — уже 30-е
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 4, createdAt: "2026-03-29T22:00:00Z" }));
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 8, createdAt: "2026-03-28T23:00:00Z" }));

      expect(await totalsByDate("c_7", "2026-03-27", "2026-03-31")).toEqual({
        "2026-03-27": 100,
        "2026-03-28": 0,
        "2026-03-29": 11,
        "2026-03-30": 4,
        "2026-03-31": 200,
      });
    });
  }

  it("осенний переход, Europe/Berlin (25.10.2026, день длится 25 часов)", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-15T12:00:00Z"), toFake: ["Date"] });
    ctx.api.customers.set("c_7", "Europe/Berlin");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 1, createdAt: "2026-10-24T22:30:00Z" })); // 00:30 CEST 25-го
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 2, createdAt: "2026-10-25T22:30:00Z" })); // 23:30 CET 25-го
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 4, createdAt: "2026-10-25T23:00:00Z" })); // 00:00 CET 26-го
    expect(await totalsByDate("c_7", "2026-10-24", "2026-10-26")).toEqual({ "2026-10-24": 0, "2026-10-25": 3, "2026-10-26": 4 });
  });

  it("America/New_York (переход 08.03.2026)", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-15T12:00:00Z"), toFake: ["Date"] });
    ctx.api.customers.set("c_ny", "America/New_York");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_ny", amount: 1, createdAt: "2026-03-07T04:30:00Z" })); // EST -5: 23:30 6-го
    await postWebhook(ctx.app, apiOrder({ customerId: "c_ny", amount: 2, createdAt: "2026-03-10T04:30:00Z" })); // EDT -4: 00:30 10-го
    expect(await totalsByDate("c_ny", "2026-03-06", "2026-03-10")).toEqual({
      "2026-03-06": 1,
      "2026-03-07": 0,
      "2026-03-08": 0,
      "2026-03-09": 0,
      "2026-03-10": 2,
    });
  });
});
