<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  LayoutDashboard,
  ListFilter,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  Upload,
  Users,
  X,
} from "@lucide/vue";
import {
  bookingError,
  createDemoData,
  hoursBetween,
  isCurrentMember,
  localDay,
  money,
  priceFor,
  time,
} from "./domain";
import type { Booking, ClubData, Member, Plan } from "./domain";
import { loadData, saveData, validateBackup } from "./repository";
import DevicesPanel from './DevicesPanel.vue';

const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Bookings", icon: CalendarDays },
  { name: "Members", icon: Users },
  { name: "Packages", icon: Ticket },
  { name: "Reports", icon: TrendingUp },
  { name: "Devices", icon: ShieldCheck },
  { name: "Settings", icon: Settings2 },
];
const page = ref("Overview"),
  selectedDate = ref(localDay()),
  query = ref(""),
  filter = ref("All bookings");
const now = ref(new Date()),
  toast = ref(""),
  storageError = ref(""),
  storageBlocked = ref(false);
let initial: ClubData;
try {
  initial = loadData();
} catch {
  initial = createDemoData();
  storageBlocked.value = true;
  storageError.value =
    "Saved data could not be loaded. Showing a temporary demo. Export your existing browser data before replacing it, or restore a valid backup in Settings.";
}
const data = reactive(initial);
watch(
  data,
  () => {
    if (!storageBlocked.value) {
      try {
        saveData(data);
        storageError.value = "";
      } catch {
        storageError.value =
          "Changes are only in memory: browser storage is unavailable or full. Export a backup before closing.";
      }
    }
  },
  { deep: true },
);
let clock: ReturnType<typeof setInterval>,
  toastTimeout: ReturnType<typeof setTimeout>;
onMounted(() => {
  clock = setInterval(() => {
    now.value = new Date();
  }, 1000);
});
onUnmounted(() => {
  clearInterval(clock);
  clearTimeout(toastTimeout);
});
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.value = "";
  }, 4000);
}
watch(page, () => {
  query.value = "";
  filter.value = "All bookings";
});
const todayBookings = computed(() =>
  data.bookings
    .filter(
      (b) =>
        localDay(new Date(b.start)) === selectedDate.value &&
        b.status !== "cancelled",
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
);
const collected = computed(() =>
  data.bookings
    .filter(
      (b) =>
        b.paid &&
        b.paidAt &&
        localDay(new Date(b.paidAt)) === selectedDate.value &&
        b.status !== "cancelled",
    )
    .reduce((total, b) => total + b.amount, 0),
);
const active = computed(() =>
  data.bookings.filter((b) => b.status === "active"),
);
const currentMembers = computed(() =>
  data.members.filter((m) => isCurrentMember(m, now.value.toISOString())),
);
const upcoming = computed(() =>
  todayBookings.value.filter((b) => b.status === "reserved").slice(0, 4),
);
const visibleBookings = computed(() =>
  todayBookings.value.filter((b) => {
    const matches = `${b.name} ${courtName(b.courtId)}`
      .toLowerCase()
      .includes(query.value.toLowerCase());
    return (
      matches &&
      (filter.value === "All bookings" ||
        (filter.value === "In play"
          ? b.status === "active"
          : filter.value === "Upcoming"
            ? b.status === "reserved"
            : b.status === "completed"))
    );
  }),
);
const visibleMembers = computed(() =>
  data.members.filter((m) =>
    `${m.name} ${m.email} ${m.phone}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const unpaid = computed(() =>
  todayBookings.value
    .filter((b) => !b.paid)
    .reduce((sum, b) => sum + b.amount, 0),
);
const courtName = (id: string) =>
  data.courts.find((c) => c.id === id)?.name || "Court";
const planName = (id: string) =>
  data.plans.find((p) => p.id === id)?.name || "Court rental";
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const dateLabel = computed(() =>
  new Date(`${selectedDate.value}T12:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
);
function shiftDate(days: number) {
  const d = new Date(`${selectedDate.value}T12:00:00`);
  d.setDate(d.getDate() + days);
  selectedDate.value = localDay(d);
}
function currentSession(id: string) {
  return active.value.find((b) => b.courtId === id);
}
function remaining(b: Booking) {
  const min = Math.ceil((Date.parse(b.end) - now.value.getTime()) / 60000);
  return min <= 0
    ? `${Math.abs(min)}m overtime`
    : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m left`;
}
function progress(b: Booking) {
  return Math.max(
    0,
    Math.min(
      100,
      ((now.value.getTime() - Date.parse(b.start)) /
        (Date.parse(b.end) - Date.parse(b.start))) *
        100,
    ),
  );
}
function blockStyle(b: Booking) {
  const start = new Date(b.start);
  return {
    left: `${((start.getHours() + start.getMinutes() / 60 - 7) / 15) * 100}%`,
    width: `${(hoursBetween(b.start, b.end) / 15) * 100}%`,
  };
}
const nowLine = computed(
  () => ((now.value.getHours() + now.value.getMinutes() / 60 - 7) / 15) * 100,
);

const dialog = ref(""),
  dialogError = ref(""),
  dialogEl = ref<HTMLElement | null>(null),
  opener = ref<HTMLElement | null>(null);
const selectedBookingId = ref(""),
  selectedBooking = computed(() =>
    data.bookings.find((b) => b.id === selectedBookingId.value),
  );
const editId = ref("");
const bookingForm = reactive({
  name: "",
  memberId: "",
  courtId: "court-1",
  planId: "hourly",
  date: localDay(),
  start: "09:00",
  players: 4,
  paid: false,
});
const memberForm = reactive({
  name: "",
  email: "",
  phone: "",
  tier: "Club" as Member["tier"],
  expires: "",
});
const planForm = reactive({
  name: "",
  hours: 1,
  price: 400,
  memberPrice: 350,
  description: "",
});
const clubName = ref(data.clubName),
  restoreInput = ref<HTMLInputElement | null>(null);
watch(dialog, async (kind) => {
  if (kind) {
    await nextTick();
    dialogEl.value?.querySelector<HTMLElement>("input,select,button")?.focus();
  }
});
const bookingStart = computed(
  () => `${bookingForm.date}T${bookingForm.start}:00`,
);
const chosenPlan = computed(() =>
  data.plans.find((p) => p.id === bookingForm.planId),
);
const bookingAmount = computed(() =>
  chosenPlan.value
    ? priceFor(
        chosenPlan.value,
        data.members.find((m) => m.id === bookingForm.memberId),
        bookingStart.value,
      )
    : 0,
);
watch(
  () => bookingForm.memberId,
  (id) => {
    if (id)
      bookingForm.name = data.members.find((m) => m.id === id)?.name || "";
  },
);
async function openDialog(kind: string) {
  opener.value = document.activeElement as HTMLElement;
  dialog.value = kind;
  dialogError.value = "";
  await nextTick();
  dialogEl.value?.querySelector<HTMLElement>("input,select,button")?.focus();
}
function closeDialog() {
  dialog.value = "";
  opener.value?.focus();
}
function trapFocus(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeDialog();
    return;
  }
  if (event.key !== "Tab") return;
  const nodes = dialogEl.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,[tabindex="0"]',
  );
  if (!nodes?.length) return;
  const first = nodes[0],
    last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function newBooking(courtId = data.courts[0]!.id) {
  const hour =
    selectedDate.value === localDay()
      ? Math.min(21, Math.max(7, now.value.getHours() + 1))
      : 9;
  Object.assign(bookingForm, {
    name: "",
    memberId: "",
    courtId,
    planId: data.plans[0]!.id,
    date: selectedDate.value,
    start: `${String(hour).padStart(2, "0")}:00`,
    players: 4,
    paid: false,
  });
  openDialog("booking");
}
function submitBooking() {
  const plan = chosenPlan.value;
  if (!plan || !data.courts.some((c) => c.id === bookingForm.courtId)) {
    dialogError.value = "Choose a court and package.";
    return;
  }
  if (
    !bookingForm.name.trim() ||
    !Number.isInteger(bookingForm.players) ||
    bookingForm.players < 1 ||
    bookingForm.players > 8
  ) {
    dialogError.value = "Add a player name and a group size of 1–8.";
    return;
  }
  const start = new Date(bookingStart.value);
  if (!Number.isFinite(start.getTime())) {
    dialogError.value = "Choose a valid date and start time.";
    return;
  }
  const b: Booking = {
    id: crypto.randomUUID(),
    courtId: bookingForm.courtId,
    name: bookingForm.name.trim(),
    memberId: bookingForm.memberId,
    players: bookingForm.players,
    planId: plan.id,
    start: start.toISOString(),
    end: new Date(start.getTime() + plan.hours * 3600000).toISOString(),
    amount: bookingAmount.value,
    status: "reserved",
    paid: bookingForm.paid,
    createdAt: new Date().toISOString(),
    ...(bookingForm.paid ? { paidAt: new Date().toISOString() } : {}),
  };
  dialogError.value = bookingError(b, data.bookings);
  if (dialogError.value) return;
  data.bookings.push(b);
  selectedDate.value = bookingForm.date;
  closeDialog();
  notify("Booking added. Ready for the next rally.");
}
function showBooking(b: Booking) {
  selectedBookingId.value = b.id;
  openDialog("session");
}
function checkIn(b: Booking) {
  if (localDay(new Date(b.start)) !== localDay()) {
    dialogError.value = "Check-in is available on the booking date.";
    return;
  }
  if (Date.now() < Date.parse(b.start)) {
    dialogError.value =
      "This reservation has not started yet. Check in at the scheduled start time.";
    return;
  }
  if (Date.now() >= Date.parse(b.end)) {
    dialogError.value =
      "This reservation has ended. Cancel it and create a new booking.";
    return;
  }
  if (active.value.some((other) => other.courtId === b.courtId)) {
    dialogError.value = "Finish the current session on this court first.";
    return;
  }
  b.status = "active";
  closeDialog();
  notify("Players checked in. Let’s play!");
}
function pay(b: Booking) {
  b.paid = true;
  b.paidAt = new Date().toISOString();
  notify("Payment recorded as paid in full.");
}
function extend(b: Booking) {
  const end = new Date(Date.parse(b.end) + 3600000).toISOString();
  dialogError.value = bookingError({ ...b, end }, data.bookings);
  if (dialogError.value) return;
  const plan =
    data.plans.find((p) => p.id === "hourly") ||
    data.plans.find((p) => p.hours === 1);
  if (!plan) {
    dialogError.value = "Create a one-hour package before extending a session.";
    return;
  }
  if (b.paid) {
    dialogError.value =
      "Paid sessions cannot be extended in this prototype. Create a separate booking for the extra hour.";
    return;
  }
  b.end = end;
  b.amount += priceFor(
    plan,
    data.members.find((m) => m.id === b.memberId),
    b.start,
  );
  notify("Session extended by one hour.");
}
function finish(b: Booking) {
  if (!b.paid) {
    dialogError.value = "Record full payment before checking out.";
    return;
  }
  b.status = "completed";
  closeDialog();
  notify("Session completed. Court is ready for the next group.");
}
function cancel(b: Booking) {
  if (b.paid) {
    dialogError.value =
      "Paid bookings cannot be cancelled until a refund workflow is added.";
    return;
  }
  b.status = "cancelled";
  closeDialog();
  notify("Reservation cancelled.");
}
function editMember(m?: Member) {
  editId.value = m?.id || "";
  Object.assign(
    memberForm,
    m || {
      name: "",
      email: "",
      phone: "",
      tier: "Club",
      expires: localDay(
        new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      ),
    },
  );
  openDialog("member");
}
function submitMember() {
  if (!memberForm.name.trim() || !memberForm.expires) return;
  const m = {
    ...memberForm,
    name: memberForm.name.trim(),
    id: editId.value || crypto.randomUUID(),
  };
  const index = data.members.findIndex((m) => m.id === editId.value);
  if (index >= 0) data.members[index] = m;
  else data.members.push(m);
  closeDialog();
  notify("Member details saved.");
}
function editPlan(p?: Plan) {
  editId.value = p?.id || "";
  Object.assign(
    planForm,
    p || { name: "", hours: 1, price: 400, memberPrice: 350, description: "" },
  );
  openDialog("plan");
}
function submitPlan() {
  if (
    !planForm.name.trim() ||
    !Number.isFinite(planForm.hours) ||
    planForm.hours < 0.5 ||
    planForm.hours > 15 ||
    !Number.isFinite(planForm.price) ||
    planForm.price < 0 ||
    !Number.isFinite(planForm.memberPrice) ||
    planForm.memberPrice < 0
  ) {
    dialogError.value =
      "Enter a name, valid duration, and non-negative prices.";
    return;
  }
  const p = {
    ...planForm,
    name: planForm.name.trim(),
    id: editId.value || crypto.randomUUID(),
  };
  const index = data.plans.findIndex((p) => p.id === editId.value);
  if (index >= 0) data.plans[index] = p;
  else data.plans.push(p);
  closeDialog();
  notify("Package saved. Existing bookings keep their original price.");
}
function exportBackup() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `courtline-backup-${localDay()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  notify("Backup exported.");
}
const pendingRestore = ref<ClubData | null>(null);
async function readBackup(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    pendingRestore.value = validateBackup(JSON.parse(await file.text()));
    openDialog("restore");
  } catch (error) {
    notify(
      error instanceof Error ? error.message : "Could not read this backup.",
    );
  } finally {
    input.value = "";
  }
}
function restoreBackup() {
  if (!pendingRestore.value) return;
  try {
    saveData(pendingRestore.value);
  } catch {
    dialogError.value = "Storage is unavailable. Backup could not be restored.";
    return;
  }
  Object.assign(data, pendingRestore.value);
  clubName.value = data.clubName;
  storageBlocked.value = false;
  storageError.value = "";
  closeDialog();
  notify("Backup restored.");
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="page = 'Overview'"
        ><span class="brand-mark"><span></span></span>courtline<span
          class="brand-dot"
          >®</span
        ></a
      >
      <div class="club-switch">
        <span class="club-avatar">PC</span>
        <div>
          <strong>{{ data.clubName }}</strong
          ><small>Club workspace</small>
        </div>
        <ShieldCheck :size="16" />
      </div>
      <p class="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <button
          v-for="item in nav"
          :key="item.name"
          :class="['nav-item', { selected: page === item.name }]"
          @click="page = item.name"
        >
          <component :is="item.icon" :size="19" /><span>{{ item.name }}</span
          ><span v-if="item.name === 'Bookings'" class="nav-count">{{
            todayBookings.length
          }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-status">
          <span class="status-dot"></span> Local workspace <span>V 0.1</span>
        </div>
        <div class="profile">
          <span class="profile-avatar">AD</span>
          <div>
            <strong>Club administrator</strong
            ><small>Reception workspace</small>
          </div>
        </div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          Workspace <ChevronRight :size="14" /><strong>{{ page }}</strong>
        </div>
        <div class="topbar-right">
          <span class="demo-pill">DEMO WORKSPACE</span
          ><span class="topbar-date"
            ><CalendarDays :size="15" />{{
              now.toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }}</span
          ><span class="small-avatar">AD</span>
        </div>
      </header>
      <main>
        <div v-if="storageError" class="storage-alert" role="alert">
          {{ storageError }}
        </div>
        <section class="page-heading">
          <div>
            <p class="eyebrow">YOUR CLUB, IN PLAY</p>
            <h1>
              {{
                page === "Overview"
                  ? "A good day for a rally."
                  : page === "Bookings"
                    ? "Make room for more play."
                    : page === "Members"
                      ? "The people behind the play."
                      : page === "Packages"
                        ? "A little more court time."
                        : page === "Reports"
                          ? "See how your club is doing."
                          : page === "Devices" ? "Keep your displays connected." : "Make yourself at home."
              }}
            </h1>
            <p class="subtitle">
              {{
                page === "Overview"
                  ? "Here’s what’s happening on your courts today."
                  : page === "Bookings"
                    ? "Every reservation, from first serve to final point."
                    : page === "Members"
                      ? "Manage your community and keep the perks flowing."
                      : page === "Packages"
                        ? "Flexible court rentals. Clear prices. Better rallies."
                        : page === "Reports"
                          ? "A clear look at bookings, payments, and court activity."
                          : page === "Devices" ? "Manage court controllers and confirm live display updates." : "Your club details, local data, and backups."
              }}
            </p>
          </div>
          <button
            v-if="page !== 'Settings' && page !== 'Reports' && page !== 'Devices'"
            class="button primary"
            @click="
              page === 'Members'
                ? editMember()
                : page === 'Packages'
                  ? editPlan()
                  : newBooking()
            "
          >
            <Plus :size="18" />{{
              page === "Members"
                ? "Add member"
                : page === "Packages"
                  ? "Add package"
                  : "New booking"
            }}
          </button>
        </section>

        <template v-if="page === 'Overview' || page === 'Reports'">
          <div class="stats-grid">
            <article class="stat-card">
              <div class="stat-top">
                <span>Payments collected</span><CreditCard :size="18" />
              </div>
              <strong
                >{{ money(collected)
                }}<span class="stat-unit"> PHP</span></strong
              >
              <p>
                <span class="soft-icon"><ArrowDownLeft :size="13" /></span
                >Recorded on
                {{ selectedDate === localDay() ? "this day" : selectedDate }}
              </p>
            </article>
            <article class="stat-card">
              <div class="stat-top">
                <span>Courts in play</span><LayoutDashboard :size="18" />
              </div>
              <strong
                >{{ active.length
                }}<span class="stat-denominator">
                  / {{ data.courts.length }}</span
                ></strong
              >
              <p>
                <span class="green-dot"></span
                >{{ data.courts.length - active.length }} courts ready for a
                rally
              </p>
            </article>
            <article class="stat-card">
              <div class="stat-top">
                <span>Bookings</span><CalendarDays :size="18" />
              </div>
              <strong>{{
                todayBookings.length.toString().padStart(2, "0")
              }}</strong>
              <p>
                {{
                  todayBookings.filter((b) => b.status === "reserved").length
                }}
                upcoming ·
                {{
                  todayBookings.filter((b) => b.status === "completed").length
                }}
                completed
              </p>
            </article>
            <article class="stat-card">
              <div class="stat-top">
                <span>Active members</span><Users :size="18" />
              </div>
              <strong>{{
                currentMembers.length.toString().padStart(2, "0")
              }}</strong>
              <p>
                <span class="soft-icon"><Users :size="13" /></span>A community
                built on play
              </p>
            </article>
          </div>
        </template>

        <template v-if="page === 'Overview'">
          <div class="dashboard-columns">
            <div class="dashboard-main">
              <section class="section-block">
                <div class="section-heading">
                  <div>
                    <h2>
                      On the courts
                      <span class="live-label"><span></span> LIVE</span>
                    </h2>
                    <p>A little space. A lot of possibilities.</p>
                  </div>
                  <span class="muted small">{{ time(now) }}</span>
                </div>
                <div class="courts-grid">
                  <article
                    v-for="court in data.courts"
                    :key="court.id"
                    :class="[
                      'court-card',
                      { 'court-busy': currentSession(court.id) },
                    ]"
                  >
                    <div class="court-top">
                      <div>
                        <h3>{{ court.name }}</h3>
                        <span>{{ court.type }}</span>
                      </div>
                      <span
                        :class="[
                          'badge',
                          currentSession(court.id) ? 'green' : 'neutral',
                        ]"
                        ><span class="badge-dot"></span
                        >{{
                          currentSession(court.id) ? "In play" : "Available"
                        }}</span
                      >
                    </div>
                    <div class="court-visual" aria-hidden="true">
                      <div class="court-lines">
                        <div class="kitchen"></div>
                        <div class="net"></div>
                        <div class="center-line"></div>
                      </div>
                      <span class="court-number">{{
                        court.name.slice(-2)
                      }}</span
                      ><span v-if="currentSession(court.id)" class="ball"></span
                      ><span class="court-caption">{{
                        currentSession(court.id)
                          ? "GAME ON"
                          : "NEXT RALLY STARTS HERE"
                      }}</span>
                    </div>
                    <template v-if="currentSession(court.id)"
                      ><div class="session-player">
                        <span class="player-avatar">{{
                          initials(currentSession(court.id)!.name)
                        }}</span>
                        <div>
                          <strong>{{ currentSession(court.id)!.name }}</strong
                          ><small
                            >{{ currentSession(court.id)!.players }} players ·
                            {{ time(currentSession(court.id)!.start) }}–{{
                              time(currentSession(court.id)!.end)
                            }}</small
                          >
                        </div>
                      </div>
                      <div class="progress-track">
                        <span
                          :style="{
                            width: `${progress(currentSession(court.id)!)}%`,
                          }"
                        ></span>
                      </div>
                      <button
                        class="court-footer"
                        @click="showBooking(currentSession(court.id)!)"
                      >
                        <span
                          ><Clock3 :size="14" />{{
                            remaining(currentSession(court.id)!)
                          }}</span
                        ><span>Manage <ArrowUpRight :size="14" /></span></button
                    ></template>
                    <template v-else
                      ><div class="empty-court">
                        <strong>Ready when you are.</strong
                        ><small>Welcome the next group to the court.</small>
                      </div>
                      <button class="book-court" @click="newBooking(court.id)">
                        <Plus :size="15" /> Book this court
                      </button></template
                    >
                  </article>
                </div>
              </section>
            </div>
            <aside class="dashboard-aside">
              <section class="up-next panel">
                <div class="section-heading">
                  <h2>Up next</h2>
                  <button
                    class="icon-button"
                    aria-label="View all bookings"
                    @click="page = 'Bookings'"
                  >
                    <ArrowUpRight :size="18" />
                  </button>
                </div>
                <p class="small muted">The next groups taking the court.</p>
                <div v-if="!upcoming.length" class="empty-state compact">
                  <CalendarDays :size="25" /><strong
                    >A clear court ahead.</strong
                  >
                  <p>No upcoming reservations for this date.</p>
                </div>
                <button
                  v-for="b in upcoming"
                  :key="b.id"
                  class="upcoming-item"
                  @click="showBooking(b)"
                >
                  <div class="upcoming-time">
                    {{ time(b.start).split(" ")[0]
                    }}<small>{{ time(b.start).split(" ")[1] }}</small>
                  </div>
                  <div class="upcoming-detail">
                    <strong>{{ b.name }}</strong
                    ><span
                      >{{ courtName(b.courtId) }} ·
                      {{ b.players }} players</span
                    >
                  </div>
                  <span class="upcoming-dot"></span></button
                ><button
                  class="text-link all-bookings"
                  @click="page = 'Bookings'"
                >
                  View all bookings <ArrowRight :size="15" />
                </button>
              </section>
              <section class="club-promo">
                <div class="promo-top">
                  <span><Sparkles :size="14" /> BETTER TOGETHER</span
                  ><span class="promo-ball" aria-hidden="true">✳</span>
                </div>
                <h2>More than a court.<br />A community.</h2>
                <p>Keep your regulars coming back with member-only rates.</p>
                <button @click="page = 'Members'">
                  Meet your members <ArrowUpRight :size="16" />
                </button>
                <div class="promo-lines" aria-hidden="true"></div>
              </section>
              <div class="local-note">
                <ShieldCheck :size="19" />
                <p>
                  <strong>Your club, your data.</strong
                  ><span
                    >This prototype saves on this browser.<br />Export a backup
                    in Settings.</span
                  >
                </p>
              </div>
            </aside>
          </div>
          <section class="panel schedule-panel">
            <div class="section-heading">
              <div>
                <h2>The day at a glance</h2>
                <p>Every court. Every rally. All in one place.</p>
              </div>
              <div class="schedule-toolbar">
                <span class="legend"
                  ><i></i>Reserved <i class="in-play"></i>In play
                  <i class="done"></i>Completed</span
                >
                <div class="date-controls">
                  <button
                    class="icon-button"
                    aria-label="Previous day"
                    @click="shiftDate(-1)"
                  >
                    <ChevronLeft :size="16" /></button
                  ><input
                    aria-label="Schedule date"
                    type="date"
                    v-model="selectedDate"
                  /><button
                    class="icon-button"
                    aria-label="Next day"
                    @click="shiftDate(1)"
                  >
                    <ChevronRight :size="16" />
                  </button>
                </div>
              </div>
            </div>
            <div class="schedule-scroll">
              <div class="schedule">
                <div class="time-axis">
                  <span>COURT</span>
                  <div>
                    <span
                      v-for="h in [7, 10, 13, 16, 19, 22]"
                      :key="h"
                      :style="{ left: `${((h - 7) / 15) * 100}%` }"
                      >{{ h > 12 ? h - 12 : h }}
                      {{ h >= 12 ? "PM" : "AM" }}</span
                    >
                  </div>
                </div>
                <div
                  v-for="court in data.courts"
                  :key="court.id"
                  class="schedule-row"
                >
                  <strong>{{ court.name }}</strong>
                  <div class="schedule-lane">
                    <div class="lane-grid"></div>
                    <div
                      v-if="
                        selectedDate === localDay() &&
                        nowLine >= 0 &&
                        nowLine <= 100
                      "
                      class="now-line"
                      :style="{ left: `${nowLine}%` }"
                    ></div>
                    <button
                      v-for="b in todayBookings.filter(
                        (b) => b.courtId === court.id,
                      )"
                      :key="b.id"
                      :style="blockStyle(b)"
                      :class="['booking-block', b.status]"
                      @click="showBooking(b)"
                      :title="`${b.name}: ${time(b.start)}–${time(b.end)}`"
                    >
                      <strong>{{ b.name }}</strong
                      ><small>{{ time(b.start) }}</small>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <section v-if="page === 'Bookings'" class="panel bookings-panel">
          <div class="section-heading">
            <h2>
              Reservations
              <span class="heading-count">{{ todayBookings.length }}</span>
            </h2>
            <div class="date-controls">
              <button
                class="icon-button"
                aria-label="Previous day"
                @click="shiftDate(-1)"
              >
                <ChevronLeft :size="16" /></button
              ><input
                type="date"
                v-model="selectedDate"
                aria-label="Booking date"
              /><button
                class="icon-button"
                aria-label="Next day"
                @click="shiftDate(1)"
              >
                <ChevronRight :size="16" /></button
              ><button class="text-link" @click="selectedDate = localDay()">
                Today
              </button>
            </div>
          </div>
          <div class="table-toolbar">
            <div class="tabs">
              <button
                v-for="label in [
                  'All bookings',
                  'In play',
                  'Upcoming',
                  'Completed',
                ]"
                :class="{ active: filter === label }"
                @click="filter = label"
              >
                {{ label }}
              </button>
            </div>
            <label class="search-field"
              ><Search :size="16" /><input
                v-model="query"
                placeholder="Search bookings…"
                aria-label="Search bookings"
            /></label>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PLAYER / GROUP</th>
                  <th>COURT</th>
                  <th>TIME SLOT</th>
                  <th>STATUS</th>
                  <th>PAYMENT</th>
                  <th>TOTAL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in visibleBookings" :key="b.id">
                  <td>
                    <div class="table-person">
                      <span class="player-avatar">{{ initials(b.name) }}</span>
                      <div>
                        <strong>{{ b.name }}</strong
                        ><small
                          >{{ b.players }} players ·
                          {{ planName(b.planId) }}</small
                        >
                      </div>
                    </div>
                  </td>
                  <td>{{ courtName(b.courtId) }}</td>
                  <td>{{ time(b.start) }}–{{ time(b.end) }}</td>
                  <td>
                    <span
                      :class="[
                        'badge',
                        b.status === 'active'
                          ? 'green'
                          : b.status === 'completed'
                            ? 'neutral'
                            : 'amber',
                      ]"
                      >{{
                        b.status === "active"
                          ? "In play"
                          : b.status === "reserved"
                            ? "Reserved"
                            : "Completed"
                      }}</span
                    >
                  </td>
                  <td>
                    <span :class="['payment-label', { paid: b.paid }]"
                      ><CheckCheck v-if="b.paid" :size="14" />{{
                        b.paid ? "Paid" : "Unpaid"
                      }}</span
                    >
                  </td>
                  <td class="amount">{{ money(b.amount) }}</td>
                  <td>
                    <button
                      class="icon-button"
                      :aria-label="`Manage ${b.name}'s booking`"
                      @click="showBooking(b)"
                    >
                      <MoreHorizontal :size="20" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!visibleBookings.length" class="empty-state">
            <CalendarDays :size="30" /><strong>No bookings found.</strong>
            <p>Try another date or add a new reservation.</p>
            <button class="button secondary" @click="newBooking()">
              <Plus :size="16" />New booking
            </button>
          </div>
          <div class="table-foot">
            {{ visibleBookings.length }} reservations · {{ dateLabel
            }}<span>Open daily, 7:00 AM–10:00 PM</span>
          </div>
        </section>

        <template v-if="page === 'Members'"
          ><div class="member-banner">
            <div class="member-banner-icon"><Users :size="27" /></div>
            <div>
              <h2>Good games start with good company.</h2>
              <p>
                {{ currentMembers.length }} active members enjoy special rates
                on every court rental.
              </p>
            </div>
            <span class="badge green">{{ data.members.length }} MEMBERS</span>
          </div>
          <section class="panel">
            <div class="section-heading">
              <h2>Your community</h2>
              <label class="search-field"
                ><Search :size="16" /><input
                  v-model="query"
                  placeholder="Find a member…"
                  aria-label="Find a member"
              /></label>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>MEMBER</th>
                    <th>CONTACT</th>
                    <th>MEMBERSHIP</th>
                    <th>VALID UNTIL</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in visibleMembers" :key="m.id">
                    <td>
                      <div class="table-person">
                        <span class="player-avatar">{{ initials(m.name) }}</span
                        ><strong>{{ m.name }}</strong>
                      </div>
                    </td>
                    <td>
                      <div class="stack">
                        <span>{{ m.email || "No email" }}</span
                        ><small>{{ m.phone || "No phone" }}</small>
                      </div>
                    </td>
                    <td>{{ m.tier }} member</td>
                    <td>
                      {{
                        new Date(`${m.expires}T12:00:00`).toLocaleDateString(
                          "en-PH",
                          { month: "short", day: "numeric", year: "numeric" },
                        )
                      }}
                    </td>
                    <td>
                      <span
                        :class="[
                          'badge',
                          isCurrentMember(m, now.toISOString())
                            ? 'green'
                            : 'amber',
                        ]"
                        >{{
                          isCurrentMember(m, now.toISOString())
                            ? "Active"
                            : "Expired"
                        }}</span
                      >
                    </td>
                    <td>
                      <button class="text-link" @click="editMember(m)">
                        Edit <ArrowUpRight :size="14" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!visibleMembers.length" class="empty-state">
              <Users :size="30" /><strong>No members found.</strong>
              <p>Start your community with a new member.</p>
            </div>
            <div class="table-foot">
              Both membership tiers currently receive the same member prices.
              Expired members pay regular rates.
            </div>
          </section></template
        >

        <template v-if="page === 'Packages'"
          ><div class="notice">
            <Ticket :size="18" />
            <p>
              These packages reserve a <strong>whole court for a group</strong>.
              Player-based open-play passes will be a separate feature.
            </p>
          </div>
          <div class="packages-grid">
            <article
              v-for="(p, index) in data.plans"
              :key="p.id"
              :class="['package-card', { featured: index === 1 }]"
            >
              <div class="package-top">
                <span class="package-symbol"><Ticket :size="24" /></span
                ><span class="badge" :class="index === 1 ? 'green' : 'neutral'"
                  >{{ p.hours }} {{ p.hours === 1 ? "HOUR" : "HOURS" }}</span
                >
              </div>
              <h2>{{ p.name }}</h2>
              <p>{{ p.description }}</p>
              <div class="package-price">
                {{ money(p.price) }}<small>/ court session</small>
              </div>
              <div class="member-rate">
                <Users :size="16" /><span>Member rate</span
                ><strong>{{ money(p.memberPrice) }}</strong>
              </div>
              <ul>
                <li><Check :size="15" />Exclusive use of one court</li>
                <li><Check :size="15" />Up to 8 players per group</li>
                <li><Check :size="15" />Available 7 AM–10 PM</li>
              </ul>
              <button class="button secondary" @click="editPlan(p)">
                Edit package <ArrowUpRight :size="15" />
              </button>
            </article>
          </div>
          <p class="helper">
            Package edits apply to new reservations. Existing reservations keep
            their agreed price.
          </p></template
        >

        <template v-if="page === 'Reports'"
          ><section class="panel">
            <div class="section-heading">
              <div>
                <h2>Daily activity</h2>
                <p>Payments are counted on their collection date.</p>
              </div>
              <input
                class="date-input"
                type="date"
                v-model="selectedDate"
                aria-label="Report date"
              />
            </div>
            <div class="report-grid">
              <div>
                <span class="eyebrow">COURT UTILIZATION</span>
                <div v-for="c in data.courts" :key="c.id" class="report-court">
                  <div>
                    <strong>{{ c.name }}</strong
                    ><span
                      >{{
                        todayBookings
                          .filter((b) => b.courtId === c.id)
                          .reduce(
                            (sum, b) => sum + hoursBetween(b.start, b.end),
                            0,
                          )
                          .toFixed(1)
                      }}
                      / 15 hrs booked</span
                    >
                  </div>
                  <div class="report-track">
                    <span
                      :style="{
                        width: `${Math.min(100, (todayBookings.filter((b) => b.courtId === c.id).reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0) / 15) * 100)}%`,
                      }"
                    ></span>
                  </div>
                </div>
              </div>
              <div class="report-summary">
                <h3>Booking summary</h3>
                <div>
                  <span>Booked session value</span
                  ><strong>{{
                    money(todayBookings.reduce((sum, b) => sum + b.amount, 0))
                  }}</strong>
                </div>
                <div>
                  <span>Outstanding on these bookings</span
                  ><strong>{{ money(unpaid) }}</strong>
                </div>
                <div>
                  <span>Completed sessions</span
                  ><strong>{{
                    todayBookings.filter((b) => b.status === "completed").length
                  }}</strong>
                </div>
                <div>
                  <span>Players booked</span
                  ><strong>{{
                    todayBookings.reduce((sum, b) => sum + b.players, 0)
                  }}</strong>
                </div>
              </div>
            </div>
          </section>
          <div class="notice">
            <ListFilter :size="18" />
            <p>
              Prototype report: amounts are recorded manually as paid in full.
              Partial payments, refunds, membership fees, and accounting exports
              are not included yet.
            </p>
          </div></template
        >

        <template v-if="page === 'Settings'"
          ><div class="settings-grid">
            <section class="panel">
              <div class="section-heading">
                <div>
                  <h2>Club details</h2>
                  <p>A familiar home for your daily operations.</p>
                </div>
                <MapPin :size="21" />
              </div>
              <form
                class="settings-form"
                @submit.prevent="
                  data.clubName = clubName.trim() || data.clubName;
                  clubName = data.clubName;
                  notify('Club name saved.');
                "
              >
                <label
                  >Club name<input
                    v-model="clubName"
                    required
                    maxlength="60" /></label
                ><label
                  >Operating hours<input
                    value="7:00 AM–10:00 PM daily"
                    disabled /></label
                ><label
                  >Currency<input
                    value="Philippine peso (PHP)"
                    disabled /></label
                ><button class="button primary" type="submit">
                  Save club details
                </button>
              </form>
            </section>
            <section class="panel">
              <div class="section-heading">
                <div>
                  <h2>Your data, in your hands.</h2>
                  <p>Back up before changing devices or browsers.</p>
                </div>
                <ShieldCheck :size="22" />
              </div>
              <div class="backup-content">
                <div class="notice">
                  <ShieldCheck :size="20" />
                  <p>
                    <strong>Browser prototype</strong><br />Records are saved in
                    this browser’s local storage. Clearing browser data removes
                    them. This is not yet the SQLite desktop edition.
                  </p>
                </div>
                <button class="backup-action" @click="exportBackup">
                  <span
                    ><Download :size="20" /><span
                      ><strong>Export a backup</strong
                      ><small>Download all club data as JSON</small></span
                    ></span
                  ><ArrowUpRight :size="18" /></button
                ><button class="backup-action" @click="restoreInput?.click()">
                  <span
                    ><Upload :size="20" /><span
                      ><strong>Restore a backup</strong
                      ><small
                        >Replace this workspace from a Courtline file</small
                      ></span
                    ></span
                  ><ArrowUpRight :size="18" /></button
                ><input
                  class="sr-only"
                  ref="restoreInput"
                  type="file"
                  accept=".json,application/json"
                  aria-label="Restore backup file"
                  @change="readBackup"
                />
              </div>
            </section>
          </div>
          <div class="notice">
            <Sparkles :size="18" />
            <p>
              <strong>Built for the next step.</strong> Vue interface → Tauri
              desktop shell → SQLite storage → Windows installer. No Laravel
              server is required for this local edition.
            </p>
          </div></template
        >

        <footer class="page-footer">
          <span
            ><span class="mini-brand">courtline</span> A better way to run your
            court.</span
          ><span
            >Built for the love of the game.
            <span class="footer-ball">✳</span></span
          >
        </footer>
        <DevicesPanel v-if="page === 'Devices'" :courts="data.courts" />
      </main>
    </div>

    <div v-if="dialog" class="modal-backdrop" @mousedown.self="closeDialog">
      <section
        class="modal"
        ref="dialogEl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        @keydown="trapFocus"
      >
        <header class="modal-heading">
          <div>
            <p class="eyebrow">LET’S MAKE IT HAPPEN</p>
            <h2 id="dialog-title">
              {{
                dialog === "booking"
                  ? "Book the next rally."
                  : dialog === "session"
                    ? "Session details"
                    : dialog === "member"
                      ? editId
                        ? "Edit member"
                        : "Welcome to the club."
                      : dialog === "restore"
                        ? "Restore this workspace?"
                        : dialog === "cancel"
                          ? "Cancel this reservation?"
                          : editId
                            ? "Edit package"
                            : "A new way to play."
              }}
            </h2>
          </div>
          <button
            class="icon-button"
            aria-label="Close dialog"
            @click="closeDialog"
          >
            <X :size="21" />
          </button>
        </header>
        <form
          v-if="dialog === 'booking'"
          @submit.prevent="submitBooking"
          class="modal-form"
        >
          <label
            >Member <span class="optional">optional</span
            ><select v-model="bookingForm.memberId">
              <option value="">Walk-in / non-member</option>
              <option v-for="m in data.members" :key="m.id" :value="m.id">
                {{ m.name
                }}{{ isCurrentMember(m, bookingStart) ? "" : " · Expired" }}
              </option>
            </select></label
          ><label
            >Player / group name<input
              v-model="bookingForm.name"
              required
              maxlength="80"
              placeholder="e.g. Alex Santos"
          /></label>
          <div class="form-row">
            <label
              >Court<select aria-label="Court" v-model="bookingForm.courtId">
                <option v-for="c in data.courts" :value="c.id">
                  {{ c.name }}
                </option>
              </select></label
            ><label
              >Players<input
                type="number"
                v-model.number="bookingForm.players"
                min="1"
                max="8"
                required
            /></label>
          </div>
          <label
            >Court package<select
              aria-label="Court package"
              v-model="bookingForm.planId"
            >
              <option v-for="p in data.plans" :value="p.id">
                {{ p.name }} · {{ p.hours }}h
              </option>
            </select></label
          >
          <div class="form-row">
            <label
              >Date<input
                type="date"
                v-model="bookingForm.date"
                required /></label
            ><label
              >Start time<input
                type="time"
                v-model="bookingForm.start"
                required
                min="07:00"
                max="21:30"
                step="1800"
            /></label>
          </div>
          <label class="checkbox-label"
            ><input type="checkbox" v-model="bookingForm.paid" />Full payment
            received</label
          >
          <div class="booking-total">
            <span
              >Session total<small>{{
                isCurrentMember(
                  data.members.find((m) => m.id === bookingForm.memberId),
                  bookingStart,
                )
                  ? "Member rate applied"
                  : "Regular court rate"
              }}</small></span
            ><strong>{{ money(bookingAmount) }}</strong>
          </div>
          <p v-if="dialogError" role="alert" class="form-error">
            {{ dialogError }}
          </p>
          <button class="button primary full-width" type="submit">
            <Plus :size="17" />Confirm booking
          </button>
        </form>
        <div
          v-if="dialog === 'session' && selectedBooking"
          class="session-details"
        >
          <div class="session-hero">
            <span class="player-avatar large">{{
              initials(selectedBooking.name)
            }}</span>
            <div>
              <h3>{{ selectedBooking.name }}</h3>
              <p>
                {{ courtName(selectedBooking.courtId) }} ·
                {{ selectedBooking.players }} players
              </p>
            </div>
            <span
              :class="[
                'badge',
                selectedBooking.status === 'active' ? 'green' : 'neutral',
              ]"
              >{{
                selectedBooking.status === "active"
                  ? "In play"
                  : selectedBooking.status
              }}</span
            >
          </div>
          <div class="detail-lines">
            <div>
              <span>Date</span
              ><strong>{{ localDay(new Date(selectedBooking.start)) }}</strong>
            </div>
            <div>
              <span>Time</span
              ><strong
                >{{ time(selectedBooking.start) }}–{{
                  time(selectedBooking.end)
                }}</strong
              >
            </div>
            <div>
              <span>Package</span
              ><strong>{{ planName(selectedBooking.planId) }}</strong>
            </div>
            <div>
              <span>Payment</span
              ><strong
                >{{ selectedBooking.paid ? "Paid in full" : "Unpaid" }} ·
                {{ money(selectedBooking.amount) }}</strong
              >
            </div>
            <div v-if="selectedBooking.status === 'active'">
              <span>Time remaining</span
              ><strong>{{ remaining(selectedBooking) }}</strong>
            </div>
          </div>
          <p class="helper" v-if="selectedBooking.status === 'reserved'">
            Check-in is available during the reserved time. The reservation’s
            end time stays fixed.
          </p>
          <p v-if="dialogError" role="alert" class="form-error">
            {{ dialogError }}
          </p>
          <div class="session-actions">
            <button
              v-if="
                !selectedBooking.paid && selectedBooking.status !== 'cancelled'
              "
              class="button secondary"
              @click="pay(selectedBooking)"
            >
              <CreditCard :size="16" />Record full payment</button
            ><button
              v-if="selectedBooking.status === 'reserved'"
              class="button primary"
              @click="checkIn(selectedBooking)"
            >
              Check in <ArrowRight :size="16" /></button
            ><template v-if="selectedBooking.status === 'active'"
              ><button
                class="button secondary"
                @click="extend(selectedBooking)"
              >
                <Plus :size="16" />Extend 1 hour</button
              ><button class="button primary" @click="finish(selectedBooking)">
                <Check :size="16" />Check out
              </button></template
            ><button
              v-if="
                selectedBooking.status === 'reserved' && !selectedBooking.paid
              "
              class="button danger"
              @click="
                dialog = 'cancel';
                dialogError = '';
              "
            >
              Cancel reservation
            </button>
          </div>
        </div>
        <div v-if="dialog === 'cancel' && selectedBooking" class="modal-form">
          <p>
            Cancel {{ selectedBooking.name }}’s reservation on
            {{ courtName(selectedBooking.courtId) }}? This frees the reserved
            time slot.
          </p>
          <div class="form-row">
            <button class="button secondary" @click="dialog = 'session'">
              Keep reservation</button
            ><button class="button danger" @click="cancel(selectedBooking)">
              Cancel reservation
            </button>
          </div>
        </div>
        <form
          v-if="dialog === 'member'"
          class="modal-form"
          @submit.prevent="submitMember"
        >
          <label
            >Full name<input
              v-model="memberForm.name"
              required
              maxlength="80" /></label
          ><label
            >Email<input
              v-model="memberForm.email"
              type="email"
              maxlength="120" /></label
          ><label
            >Phone<input v-model="memberForm.phone" type="tel" maxlength="30"
          /></label>
          <div class="form-row">
            <label
              >Membership<select v-model="memberForm.tier">
                <option>Club</option>
                <option>Standard</option>
              </select></label
            ><label
              >Valid until<input
                type="date"
                v-model="memberForm.expires"
                required
            /></label>
          </div>
          <p class="helper">
            Membership fees and hour credits are not tracked in this first
            version.
          </p>
          <button class="button primary full-width" type="submit">
            Save member <Check :size="16" />
          </button>
        </form>
        <form
          v-if="dialog === 'plan'"
          class="modal-form"
          @submit.prevent="submitPlan"
        >
          <label
            >Package name<input
              v-model="planForm.name"
              required
              maxlength="80" /></label
          ><label
            >Description<textarea
              v-model="planForm.description"
              rows="2"
              maxlength="200"
            ></textarea></label
          ><label
            >Duration in hours<input
              v-model.number="planForm.hours"
              type="number"
              min="0.5"
              max="15"
              step="0.5"
              required
          /></label>
          <div class="form-row">
            <label
              >Regular price (PHP)<input
                v-model.number="planForm.price"
                type="number"
                min="0"
                step="1"
                required /></label
            ><label
              >Member price (PHP)<input
                v-model.number="planForm.memberPrice"
                type="number"
                min="0"
                step="1"
                required
            /></label>
          </div>
          <p v-if="dialogError" role="alert" class="form-error">
            {{ dialogError }}
          </p>
          <button class="button primary full-width" type="submit">
            Save package <Check :size="16" />
          </button>
        </form>
        <div v-if="dialog === 'restore'" class="modal-form">
          <p>
            This replaces all current bookings, members, packages, and club
            details with the selected backup. Export your current workspace
            first if you want to keep it.
          </p>
          <div class="notice">
            <Download :size="20" />
            <p>
              {{ pendingRestore?.bookings.length }} bookings ·
              {{ pendingRestore?.members.length }} members<br />{{
                pendingRestore?.clubName
              }}
            </p>
          </div>
          <p v-if="dialogError" role="alert" class="form-error">
            {{ dialogError }}
          </p>
          <button class="button primary full-width" @click="restoreBackup">
            Replace workspace with backup
          </button>
        </div>
      </section>
    </div>
    <Transition name="toast"
      ><div v-if="toast" class="toast-message" role="status">
        <span><Check :size="16" /></span>{{ toast }}
      </div></Transition
    >
  </div>
</template>
