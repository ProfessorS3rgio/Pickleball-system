import { createDemoData } from "./domain";
import type { ClubData } from "./domain";

// The UI depends on this adapter. A Tauri/SQLite adapter can replace it later.
const KEY = "courtline.v1";
export function loadData(): ClubData {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createDemoData();
  return validateBackup(JSON.parse(raw));
}
export function saveData(data: ClubData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function validateBackup(value: unknown): ClubData {
  if (!value || typeof value !== "object") throw new Error("Invalid backup.");
  const d = value as ClubData;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const str = (v: unknown) => typeof v === "string";
  const date = (v: unknown) =>
    str(v) && Number.isFinite(Date.parse(v as string));
  if (
    d.version !== 1 ||
    !str(d.clubName) ||
    !Array.isArray(d.courts) ||
    !d.courts.length ||
    !Array.isArray(d.plans) ||
    !d.plans.length ||
    !Array.isArray(d.members) ||
    !Array.isArray(d.bookings)
  )
    throw new Error("This is not a Courtline v1 backup.");
  if (
    !d.courts.every((c) => c && str(c.id) && str(c.name) && str(c.type)) ||
    !d.plans.every(
      (p) =>
        p &&
        str(p.id) &&
        str(p.name) &&
        str(p.description) &&
        finite(p.hours) &&
        p.hours > 0 &&
        finite(p.price) &&
        p.price >= 0 &&
        finite(p.memberPrice) &&
        p.memberPrice >= 0,
    ) ||
    !d.members.every(
      (m) =>
        m &&
        str(m.id) &&
        str(m.name) &&
        str(m.email) &&
        str(m.phone) &&
        ["Club", "Standard"].includes(m.tier) &&
        /^\d{4}-\d{2}-\d{2}$/.test(m.expires) &&
        date(m.expires),
    ) ||
    !d.bookings.every(
      (b) =>
        b &&
        str(b.id) &&
        str(b.name) &&
        str(b.memberId) &&
        d.courts.some((c) => c.id === b.courtId) &&
        d.plans.some((p) => p.id === b.planId) &&
        date(b.start) &&
        date(b.end) &&
        Date.parse(b.end) > Date.parse(b.start) &&
        finite(b.amount) &&
        b.amount >= 0 &&
        Number.isInteger(b.players) &&
        b.players >= 1 &&
        b.players <= 8 &&
        typeof b.paid === "boolean" &&
        ["reserved", "active", "completed", "cancelled"].includes(b.status) &&
        date(b.createdAt) &&
        (!b.paidAt || date(b.paidAt)),
    )
  )
    throw new Error("The backup contains invalid records.");
  for (const records of [d.courts, d.plans, d.members, d.bookings])
    if (new Set(records.map((r) => r.id)).size !== records.length)
      throw new Error("The backup contains duplicate IDs.");
  return d;
}
