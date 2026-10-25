export interface Court {
  id: string;
  name: string;
  type: string;
}
export interface Plan {
  id: string;
  name: string;
  hours: number;
  price: number;
  memberPrice: number;
  description: string;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: "Standard" | "Club";
  expires: string;
}
export interface Booking {
  id: string;
  courtId: string;
  name: string;
  memberId: string;
  players: number;
  planId: string;
  start: string;
  end: string;
  amount: number;
  status: "reserved" | "active" | "completed" | "cancelled";
  paid: boolean;
  createdAt: string;
  paidAt?: string;
}
export interface ClubData {
  version: 1;
  clubName: string;
  courts: Court[];
  plans: Plan[];
  members: Member[];
  bookings: Booking[];
}

export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const money = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
export const time = (value: string | Date) =>
  new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
export const hoursBetween = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / 3_600_000;
export const isCurrentMember = (member: Member | undefined, at: string) =>
  !!member && member.expires >= localDay(new Date(at));
export const priceFor = (plan: Plan, member: Member | undefined, at: string) =>
  isCurrentMember(member, at) ? plan.memberPrice : plan.price;

export function bookingError(
  candidate: Pick<Booking, "id" | "courtId" | "start" | "end">,
  bookings: Booking[],
): string {
  const start = Date.parse(candidate.start),
    end = Date.parse(candidate.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return "Choose a valid start time and duration.";
  if (localDay(new Date(start)) !== localDay(new Date(end)))
    return "Sessions must start and finish on the same day.";
  if (
    new Date(start).getHours() < 7 ||
    new Date(end).getHours() > 22 ||
    (new Date(end).getHours() === 22 && new Date(end).getMinutes() > 0)
  )
    return "Court hours are 7:00 AM–10:00 PM.";
  if (
    bookings.some(
      (b) =>
        b.id !== candidate.id &&
        b.courtId === candidate.courtId &&
        b.status !== "cancelled" &&
        start < Date.parse(b.end) &&
        end > Date.parse(b.start),
    )
  )
    return "This court already has a session in that time slot. Choose another time or court.";
  return "";
}

export function createDemoData(now = new Date()): ClubData {
  const day = localDay(now);
  const at = (h: number, m = 0) =>
    new Date(
      `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
    ).toISOString();
  const anchor = Math.min(19, Math.max(9, now.getHours()));
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + 3);
  return {
    version: 1,
    clubName: "The Pickle Club",
    courts: [1, 2, 3, 4].map((n) => ({
      id: `court-${n}`,
      name: `Court 0${n}`,
      type: n < 4 ? "Covered · Standard" : "Covered · Premium",
    })),
    plans: [
      {
        id: "hourly",
        name: "Hourly court rental",
        hours: 1,
        price: 400,
        memberPrice: 350,
        description: "A whole court, all to your group. Up to 8 players.",
      },
      {
        id: "three-hour",
        name: "The three-hour rally",
        hours: 3,
        price: 1000,
        memberPrice: 850,
        description: "More rallies. Better value. A 3-hour court reservation.",
      },
      {
        id: "two-hour",
        name: "Double session",
        hours: 2,
        price: 750,
        memberPrice: 650,
        description:
          "Two hours to find your rhythm. Court rental for your group.",
      },
    ],
    members: [
      {
        id: "m1",
        name: "Alex Santos",
        email: "alex@example.com",
        phone: "0917 000 0101",
        tier: "Club",
        expires: localDay(expires),
      },
      {
        id: "m2",
        name: "Bea Reyes",
        email: "bea@example.com",
        phone: "0917 000 0102",
        tier: "Club",
        expires: localDay(expires),
      },
      {
        id: "m3",
        name: "Miguel Cruz",
        email: "miguel@example.com",
        phone: "0917 000 0103",
        tier: "Standard",
        expires: localDay(expires),
      },
      {
        id: "m4",
        name: "Sofia Garcia",
        email: "sofia@example.com",
        phone: "0917 000 0104",
        tier: "Club",
        expires: localDay(expires),
      },
    ],
    bookings: [
      {
        id: "b1",
        courtId: "court-1",
        name: "Alex Santos",
        memberId: "m1",
        players: 4,
        planId: "two-hour",
        start: at(anchor - 1),
        end: at(anchor + 1),
        amount: 650,
        status: "active",
        paid: true,
        paidAt: at(anchor - 1),
        createdAt: at(7),
      },
      {
        id: "b2",
        courtId: "court-2",
        name: "Bea Reyes",
        memberId: "m2",
        players: 6,
        planId: "three-hour",
        start: at(anchor - 1),
        end: at(anchor + 2),
        amount: 850,
        status: "active",
        paid: false,
        createdAt: at(7),
      },
      {
        id: "b3",
        courtId: "court-4",
        name: "Daniel Lim",
        memberId: "",
        players: 4,
        planId: "hourly",
        start: at(anchor + 1),
        end: at(anchor + 2),
        amount: 400,
        status: "reserved",
        paid: false,
        createdAt: at(8),
      },
      {
        id: "b4",
        courtId: "court-3",
        name: "Miguel Cruz",
        memberId: "m3",
        players: 4,
        planId: "two-hour",
        start: at(7),
        end: at(9),
        amount: 650,
        status: "completed",
        paid: true,
        paidAt: at(9),
        createdAt: at(7),
      },
      {
        id: "b5",
        courtId: "court-1",
        name: "Sofia Garcia",
        memberId: "m4",
        players: 4,
        planId: "hourly",
        start: at(anchor + 2),
        end: at(anchor + 3),
        amount: 350,
        status: "reserved",
        paid: true,
        paidAt: at(8),
        createdAt: at(8),
      },
    ],
  };
}
