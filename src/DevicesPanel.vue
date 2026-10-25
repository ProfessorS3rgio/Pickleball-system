<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Court } from './domain';
defineProps<{ courts: Court[] }>();
interface Device {
  id: string; name: string; courtId: string; status: string; lastSeen: number | null;
  firmware?: string; revision: number; appliedRevision: number | null;
  desired: { teamA: number; teamB: number; serving: string } | null;
  command: { status: string } | null;
}
const devices = ref<Device[]>([]), brokerOnline = ref(false), connected = ref(false), error = ref(''), message = ref('');
const registration = ref({ id: '', name: '', courtId: '' });
const drafts = ref<Record<string, { teamA: number; teamB: number; serving: string }>>({});
const busy = ref(false);
let socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout>, stopped = false;
function accept(state: { devices: Device[]; brokerOnline: boolean }) {
  devices.value = state.devices; brokerOnline.value = state.brokerOnline;
  for (const d of state.devices) if (!drafts.value[d.id]) drafts.value[d.id] = { ...(d.desired || { teamA: 0, teamB: 0, serving: 'A' }) };
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/device-events`);
  socket.onmessage = event => { try { accept(JSON.parse(event.data)); connected.value = true; } catch { error.value = 'Invalid device service response.'; } };
  socket.onclose = () => { connected.value = false; if (!stopped) retry = setTimeout(connect, 2000); };
  socket.onerror = () => socket?.close();
}
async function post(path: string, body: unknown) {
  busy.value = true; error.value = ''; message.value = '';
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not save device changes.');
    accept(result); return true;
  } catch (e) { error.value = e instanceof Error ? e.message : 'Device service unavailable.'; return false; }
  finally { busy.value = false; }
}
async function register() {
  if (await post('/api/devices', registration.value)) { registration.value = { id: '', name: '', courtId: '' }; message.value = 'Device registered. Configure its firmware with this device ID to connect.'; }
}
async function send(d: Device) {
  if (await post(`/api/devices/${d.id}/state`, drafts.value[d.id])) message.value = 'Update sent. Waiting for controller confirmation.';
}
onMounted(connect);
onUnmounted(() => { stopped = true; clearTimeout(retry); socket?.close(); });
</script>

<template>
  <section class="device-management">
    <div class="panel device-summary" role="status">
      <strong>Device service: {{ connected ? 'Connected' : 'Unavailable — start npm run devices' }}</strong>
      <span>Local MQTT broker: {{ !connected ? 'Unknown' : brokerOnline ? 'Connected' : 'Disconnected' }}</span>
      <p>Controllers send a heartbeat every 5 seconds. Status becomes unresponsive after 15 seconds and offline after 30 seconds. Controller confirmation does not verify that the LEDs physically light up.</p>
    </div>
    <p v-if="error" class="storage-alert" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form class="panel device-registration" @submit.prevent="register">
      <h2>Register a controller</h2>
      <label>Device ID<input v-model="registration.id" required pattern="[a-z0-9][a-z0-9-]{0,63}" maxlength="64" placeholder="court-01-display" /></label>
      <label>Display name<input v-model="registration.name" required maxlength="80" placeholder="Court 1 display" /></label>
      <label>Court<select v-model="registration.courtId" required><option disabled value="">Choose a court</option><option v-for="court in courts" :key="court.id" :value="court.id">{{ court.name }}</option></select></label>
      <button class="button primary" :disabled="busy || !connected">Register device</button>
    </form>
    <div v-if="!devices.length" class="panel device-summary">No controllers registered. Add your first device above; it will remain offline until it connects.</div>
    <div class="device-grid">
      <article v-for="d in devices" :key="d.id" class="panel device-card">
        <div class="device-title"><h2>{{ d.name }}</h2><span class="badge">{{ !connected ? 'Unknown' : d.status }}</span></div>
        <p>{{ courts.find(c => c.id === d.courtId)?.name || d.courtId }} · {{ d.id }}</p>
        <p>Last seen: {{ d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : 'Not yet seen' }}<br />Firmware: {{ d.firmware || 'Unknown' }}</p>
        <p>Display update: {{ d.command?.status || (d.desired ? 'Awaiting reconnect' : 'No update sent') }}<br />Confirmed revision: {{ d.appliedRevision ?? '—' }} / {{ d.revision }}</p>
        <form v-if="drafts[d.id]" class="device-controls" @submit.prevent="send(d)">
          <label>Team A score<input v-model.number="drafts[d.id]!.teamA" type="number" min="0" max="99" step="1" required /></label>
          <label>Team B score<input v-model.number="drafts[d.id]!.teamB" type="number" min="0" max="99" step="1" required /></label>
          <label>Serving<select v-model="drafts[d.id]!.serving"><option>A</option><option>B</option></select></label>
          <button class="button primary" :disabled="busy || !connected || !brokerOnline || d.status !== 'online'">Send display update</button>
        </form>
      </article>
    </div>
  </section>
</template>
