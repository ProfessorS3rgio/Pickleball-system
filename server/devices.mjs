import { randomUUID } from 'node:crypto';

export const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
export class Devices {
  constructor(records = [], save = () => {}, now = Date.now) {
    this.records = records.map(d => ({ ...d, lastSeen: null, connected: false, appliedRevision: null, command: null }));
    this.save = save;
    this.now = now;
  }
  persist() { this.save(this.records.map(({ id, name, courtId, revision, desired }) => ({ id, name, courtId, revision, desired }))); }
  register(input) {
    if (!validId(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || !validId(input.courtId)) throw Error('Enter a device ID, name, and court assignment. IDs use lowercase letters, numbers, and hyphens.');
    if (this.records.some(d => d.id === input.id)) throw Error('That device ID is already registered.');
    const d = { id: input.id, name: input.name.trim(), courtId: input.courtId, revision: 0, desired: null, lastSeen: null, connected: false, appliedRevision: null, command: null };
    this.records.push(d);
    try { this.persist(); } catch (error) { this.records.pop(); throw error; }
    return d;
  }
  status(d, brokerOnline) {
    if (!brokerOnline) return 'unknown';
    if (!d.connected || d.lastSeen === null || this.now() - d.lastSeen >= 30000) return 'offline';
    return this.now() - d.lastSeen >= 15000 ? 'unresponsive' : 'online';
  }
  snapshot(brokerOnline) {
    return this.records.map(d => ({ ...d, status: this.status(d, brokerOnline), command: d.command && { ...d.command, status: d.command.status === 'pending' && this.now() - d.command.sentAt > 10000 ? 'timeout' : d.command.status } }));
  }
  update(id, state, brokerOnline) {
    const d = this.records.find(d => d.id === id);
    if (!d) throw Error('Device not found.');
    if (this.status(d, brokerOnline) !== 'online') throw Error('Device must be online before sending an update.');
    if (!state || !Number.isInteger(state.teamA) || !Number.isInteger(state.teamB) || state.teamA < 0 || state.teamA > 99 || state.teamB < 0 || state.teamB > 99 || !['A', 'B'].includes(state.serving)) throw Error('Scores must be whole numbers from 0 to 99; serving must be A or B.');
    const previous = { revision: d.revision, desired: d.desired, command: d.command };
    d.revision++;
    d.desired = { teamA: state.teamA, teamB: state.teamB, serving: state.serving };
    d.command = { commandId: randomUUID(), revision: d.revision, sentAt: this.now(), status: 'pending' };
    try { this.persist(); } catch (error) { Object.assign(d, previous); throw error; }
    return this.payload(d);
  }
  payload(d) { return { ...d.desired, type: 'set_scoreboard', courtId: d.courtId, commandId: d.command.commandId, revision: d.revision }; }
  receive(id, kind, message, retained = false) {
    const d = this.records.find(d => d.id === id);
    if (!d || retained || !message || typeof message !== 'object') return false;
    if (kind === 'status' && message.online === false) { d.connected = false; return false; }
    if (kind !== 'heartbeat' && !(kind === 'status' && message.online === true) && kind !== 'ack') return false;
    if (kind === 'ack') {
      if (d.command && message.commandId === d.command.commandId && message.appliedRevision === d.revision && message.status === 'applied') {
        d.command.status = 'applied'; d.appliedRevision = d.revision;
      }
      return false;
    }
    const reconnect = !d.connected || d.lastSeen === null || this.now() - d.lastSeen >= 30000;
    d.lastSeen = this.now(); d.connected = true;
    if (typeof message.firmware === 'string') d.firmware = message.firmware.slice(0, 80);
    if (Number.isInteger(message.appliedRevision) && message.appliedRevision >= 0 && message.appliedRevision <= d.revision) d.appliedRevision = message.appliedRevision;
    if (reconnect && d.desired) {
      d.command = { commandId: randomUUID(), revision: d.revision, sentAt: this.now(), status: 'pending' };
      return true;
    }
    return false;
  }
}
