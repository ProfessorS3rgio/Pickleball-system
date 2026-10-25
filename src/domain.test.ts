import { describe, expect, it } from "vitest";
import {
  bookingError,
  createDemoData,
  isCurrentMember,
  priceFor,
} from "./domain";
import { validateBackup } from "./repository";

const demo = createDemoData(new Date("2026-10-25T12:00:00"));
const existing = demo.bookings[0]!;
const candidate = {
  id: "new",
  courtId: existing.courtId,
  start: existing.start,
  end: existing.end,
};
describe("court reservation rules", () => {
  it("rejects an overlapping reservation", () =>
    expect(bookingError(candidate, demo.bookings)).toContain("already has"));
  it("permits back-to-back reservations", () =>
    expect(
      bookingError(
        {
          ...candidate,
          start: existing.end,
          end: new Date(Date.parse(existing.end) + 3600000).toISOString(),
        },
        [existing],
      ),
    ).toBe(""));
  it("permits the same time on another court", () =>
    expect(bookingError({ ...candidate, courtId: "court-3" }, [existing])).toBe(
      "",
    ));
  it("ignores cancelled reservations", () =>
    expect(
      bookingError(candidate, [{ ...existing, status: "cancelled" }]),
    ).toBe(""));
  it("rejects invalid and reversed intervals", () => {
    expect(bookingError({ ...candidate, start: "invalid" }, [])).not.toBe("");
    expect(bookingError({ ...candidate, end: candidate.start }, [])).not.toBe(
      "",
    );
  });
  it("rejects reservations outside opening hours", () =>
    expect(
      bookingError(
        { ...candidate, start: new Date("2026-10-25T06:00:00").toISOString() },
        [],
      ),
    ).toContain("Court hours"));
  it("blocks an extension that reaches the next booking", () => {
    const next = {
      ...existing,
      id: "next",
      start: existing.end,
      end: new Date(Date.parse(existing.end) + 3600000).toISOString(),
    };
    expect(
      bookingError({ ...existing, end: next.end }, [existing, next]),
    ).toContain("already has");
  });
});
describe("membership pricing", () => {
  it("includes the expiry day and falls back to regular prices after expiry", () => {
    const member = { ...demo.members[0]!, expires: "2026-10-25" };
    const plan = demo.plans[0]!;
    expect(isCurrentMember(member, "2026-10-25T23:59:00")).toBe(true);
    expect(priceFor(plan, member, "2026-10-25T12:00:00")).toBe(
      plan.memberPrice,
    );
    expect(priceFor(plan, member, "2026-10-26T12:00:00")).toBe(plan.price);
    expect(priceFor(plan, undefined, "2026-10-25T12:00:00")).toBe(plan.price);
  });
});
describe("backup validation", () => {
  it("accepts a complete backup", () =>
    expect(validateBackup(JSON.parse(JSON.stringify(demo)))).toEqual(demo));
  it("rejects incomplete backups and broken court references", () => {
    expect(() => validateBackup({ version: 1 })).toThrow();
    expect(() =>
      validateBackup({
        ...demo,
        bookings: [{ ...existing, courtId: "missing" }],
      }),
    ).toThrow();
  });
  it("rejects duplicate identifiers and negative prices", () => {
    expect(() =>
      validateBackup({ ...demo, members: [demo.members[0], demo.members[0]] }),
    ).toThrow();
    expect(() =>
      validateBackup({ ...demo, plans: [{ ...demo.plans[0], price: -1 }] }),
    ).toThrow();
  });
});
