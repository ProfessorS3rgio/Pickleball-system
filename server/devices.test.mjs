import { describe, it, expect } from 'vitest';
import { Devices } from './devices.mjs';

function fixture() {
  let now = 1000;
  const devices = new Devices([], () => {}, () => now);
  const d = devices.register({ id: 'court-01-display', name: 'Court 1', courtId: 'court-1' });
  return { devices, d, advance: ms => { now += ms; } };
}
describe('device presence and reliable updates', () => {
  it('requires a live heartbeat and distinguishes stale, offline, and broker unavailable', () => {
    const { devices, d, advance } = fixture();
    expect(devices.status(d, true)).toBe('offline');
    devices.receive(d.id, 'heartbeat', {});
    expect(devices.status(d, true)).toBe('online');
    advance(15000); expect(devices.status(d, true)).toBe('unresponsive');
    advance(15000); expect(devices.status(d, true)).toBe('offline');
    expect(devices.status(d, false)).toBe('unknown');
  });
  it('ignores retained online announcements and malformed or unregistered messages', () => {
    const { devices, d } = fixture();
    devices.receive(d.id, 'status', { online: true }, true);
    devices.receive(d.id, 'status', {});
    devices.receive('stranger', 'heartbeat', {});
    expect(devices.status(d, true)).toBe('offline');
  });
  it('rejects offline commands, invalid scores, and duplicate registrations', () => {
    const { devices, d } = fixture();
    expect(() => devices.update(d.id, { teamA: 1, teamB: 0, serving: 'A' }, true)).toThrow('online');
    devices.receive(d.id, 'heartbeat', {});
    expect(() => devices.update(d.id, { teamA: -1, teamB: 0, serving: 'A' }, true)).toThrow('Scores');
    expect(() => devices.register(d)).toThrow('already');
  });
  it('requires matching application acknowledgment and resynchronizes only latest state', () => {
    const { devices, d, advance } = fixture();
    devices.receive(d.id, 'heartbeat', {});
    const first = devices.update(d.id, { teamA: 1, teamB: 0, serving: 'A' }, true);
    const second = devices.update(d.id, { teamA: 2, teamB: 0, serving: 'B' }, true);
    devices.receive(d.id, 'ack', { commandId: first.commandId, appliedRevision: 1, status: 'applied' });
    expect(d.command.status).toBe('pending');
    advance(11000); expect(devices.snapshot(true)[0].command.status).toBe('timeout');
    devices.receive(d.id, 'ack', { commandId: second.commandId, appliedRevision: 2, status: 'applied' });
    expect(d.command.status).toBe('applied');
    devices.receive(d.id, 'status', { online: false });
    expect(devices.receive(d.id, 'heartbeat', { appliedRevision: 0 })).toBe(true);
    expect(devices.payload(d)).toMatchObject({ teamA: 2, revision: 2 });
    expect(devices.payload(d).commandId).not.toBe(second.commandId);
  });
  it('preserves desired state across service restart without preserving online status', () => {
    const { devices, d } = fixture();
    devices.receive(d.id, 'heartbeat', {});
    devices.update(d.id, { teamA: 9, teamB: 8, serving: 'A' }, true);
    const restored = new Devices(JSON.parse(JSON.stringify(devices.records)));
    expect(restored.status(restored.records[0], true)).toBe('offline');
    expect(restored.receive(d.id, 'heartbeat', {})).toBe(true);
    expect(restored.payload(restored.records[0])).toMatchObject({ teamA: 9, teamB: 8, revision: 1 });
  });
  it('does not accept mutations when saving fails', () => {
    const { devices, d } = fixture();
    devices.receive(d.id, 'heartbeat', {});
    devices.save = () => { throw Error('disk full'); };
    expect(() => devices.update(d.id, { teamA: 9, teamB: 8, serving: 'A' }, true)).toThrow('disk full');
    expect(d.revision).toBe(0);
    expect(d.desired).toBe(null);
  });
});
