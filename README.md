# Courtline

A local-first pickleball reception app. This first milestone builds the Vue interface in a browser before packaging the same frontend in Tauri.

## Run locally

Requires Node.js 22.12+ (or a supported newer release).

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173.

```powershell
npm test
npm run build
```

## Included in this milestone

- Live court cards and daily reservation timeline.
- Court bookings with overlap prevention, fixed scheduled slots, group size, and member pricing.
- Check-in within the scheduled time, checkout after payment, unpaid session extensions, and cancellation of unpaid reservations.
- Member records with expiry dates; both tiers currently receive the configured member price.
- Whole-court hourly and multi-hour packages. Player-based open-play passes are not implemented.
- Full-payment recording and daily collection / utilization summaries.
- Club name editing, local persistence, validated JSON backup export and restore.
- Responsive layouts, keyboard-operable dialogs, and demo data.

## Storage and prototype limits

This is a single-browser prototype, not a production point-of-sale system. Data lives in localStorage under `courtline.v1`. The first launch seeds sample records. Sample names, prices and memberships are illustrative. The PC's local clock controls booking dates and timers. A session uses persisted start/end timestamps, so its remaining time is recalculated after reload.

Keep backups using Settings → Export a backup. Data is specific to the browser and origin; using localhost instead of 127.0.0.1 creates a separate workspace. Never clear browser data without a backup. No authentication, authorization, license enforcement, online synchronization, refund/partial-payment handling, membership billing, official receipts, or installer is included yet. Paid reservations cannot be cancelled or extended until a payment ledger/refund workflow exists.

## Local device control

The **Devices** screen adds controller registration, court assignment, live
presence, and manual scoreboard updates with application acknowledgments.
Run `npm run devices` alongside the frontend and a local MQTT broker.
See [MQTT setup and firmware contract](mqtt/README.md) for offline setup,
the hardware-free simulator, network configuration, and remaining hardware work.
Device data lives in `data/devices.json`, separately from browser booking data
and its backup export. This feature currently runs through `npm run dev`.

## Planned milestones

1. Validate reception workflows and real pricing rules with the club owner.
2. Add a Tauri desktop shell and replace `src/repository.ts` with a SQLite adapter. Move all booking, membership and financial mutations behind validated Rust commands with database transactions; avoid treating frontend checks as security.
3. Add real staff accounts, payment ledger, receipts, automatic backups, and recovery tests.
4. Build and test signed Windows installers, migrations, updates, and licensing.

Laravel is not needed for the initial single-computer edition. It can later serve a hosted customer portal or central API if those requirements arise.

## Structure

- `src/App.vue` — reception screens and workflows.
- `src/style.css` — responsive visual system.
- `src/domain.ts` — record types, booking rules, pricing, demo fixtures.
- `src/repository.ts` — browser persistence and backup validation adapter.
- `src/domain.test.ts` — booking conflicts, expiry pricing, and malformed backup checks.

The interface uses DM Sans and Manrope when Google Fonts is reachable; system fonts are the offline fallback. For the packaged edition, bundle font files locally.
