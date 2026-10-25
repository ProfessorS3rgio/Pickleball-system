import { it, expect } from 'vitest';
import { Aedes } from 'aedes';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import mqtt from 'mqtt';
import { WebSocket } from 'ws';

async function until(check) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch { /* Service starting. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Timed out waiting for device service state');
}
it('connects through real MQTT, acknowledges commands, detects loss, and restores state after restart', async () => {
  const broker = await Aedes.createBroker();
  const tcp = createServer(broker.handle);
  tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
  const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
  const servicePort = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  const url = `http://127.0.0.1:${servicePort}`;
  const mqttUrl = `mqtt://127.0.0.1:${tcp.address().port}`;
  const directory = mkdtempSync(join(tmpdir(), 'courtline-devices-test-'));
  let service, device, ws;
  const start = async () => {
    service = spawn(process.execPath, ['server/index.mjs'], { cwd: process.cwd(), env: { ...process.env, MQTT_URL: mqttUrl, DEVICE_PORT: String(servicePort), DEVICE_DATA_DIR: directory }, windowsHide: true, stdio: 'pipe' });
    await until(async () => (await (await fetch(`${url}/api/devices`)).json()).brokerOnline);
  };
  const state = async () => (await (await fetch(`${url}/api/devices`)).json()).devices[0];
  const post = async (path, body) => {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.ok).toBe(true); return response.json();
  };
  try {
    await start();
    await post('/api/devices', { id: 'test-display', name: 'Test display', courtId: 'court-1' });
    ws = new WebSocket(`ws://127.0.0.1:${servicePort}/device-events`);
    const initialEvent = await once(ws, 'message');
    expect(JSON.parse(initialEvent[0].toString()).devices[0].status).toBe('offline');
    const topic = 'courtline/devices/test-display';
    device = mqtt.connect(mqttUrl, { will: { topic: `${topic}/status`, payload: '{"online":false}', qos: 1, retain: false } });
    await once(device, 'connect');
    await device.subscribeAsync(`${topic}/set`, { qos: 1 });
    await device.publishAsync(`${topic}/heartbeat`, '{"firmware":"integration-test","appliedRevision":0}');
    await until(async () => (await state()).status === 'online');
    const received = once(device, 'message');
    await post('/api/devices/test-display/state', { teamA: 10, teamB: 8, serving: 'A' });
    const command = JSON.parse((await received)[1].toString());
    expect(command).toMatchObject({ teamA: 10, revision: 1 });
    await device.publishAsync(`${topic}/ack`, JSON.stringify({ commandId: command.commandId, appliedRevision: command.revision, status: 'applied' }), { qos: 1 });
    await until(async () => (await state()).command.status === 'applied');
    await device.publishAsync(`${topic}/status`, '{"online":false}', { qos: 1 });
    await until(async () => (await state()).status === 'offline');
    const resync = once(device, 'message');
    await device.publishAsync(`${topic}/heartbeat`, '{"appliedRevision":0}');
    const restored = JSON.parse((await resync)[1].toString());
    expect(restored.teamA).toBe(10); expect(restored.commandId).not.toBe(command.commandId);
    ws.terminate();
    service.kill(); await once(service, 'exit');
    await start();
    expect((await state()).status).toBe('offline');
    const afterRestart = once(device, 'message');
    await device.publishAsync(`${topic}/heartbeat`, '{}');
    expect(JSON.parse((await afterRestart)[1].toString())).toMatchObject({ teamA: 10, teamB: 8, revision: 1 });
    // Force a broken TCP connection to exercise broker Last Will.
    device.end(true);
    await until(async () => (await state()).status === 'offline');
  } finally {
    ws?.terminate(); device?.end(true);
    if (service && service.exitCode === null) { service.kill(); await once(service, 'exit'); }
    await new Promise(resolve => broker.close(resolve));
    await new Promise(resolve => tcp.close(resolve));
  }
}, 25000);
