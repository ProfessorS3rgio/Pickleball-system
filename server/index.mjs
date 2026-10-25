import http from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import { WebSocketServer, WebSocket } from 'ws';
import { Devices } from './devices.mjs';

const directory = process.env.DEVICE_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(directory, { recursive: true });
const filename = `${directory}/devices.json`;
let records = [];
try { records = JSON.parse(readFileSync(filename, 'utf8')); if (!Array.isArray(records)) throw Error('Invalid device data'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const devices = new Devices(records, data => {
  writeFileSync(`${filename}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${filename}.tmp`, filename);
});
let brokerOnline = false;
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://127.0.0.1:1883', {
  clientId: 'courtline-backend', clean: true, reconnectPeriod: 2000,
  username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD,
  queueQoSZero: false,
});
const snapshot = () => JSON.stringify({ brokerOnline, devices: devices.snapshot(brokerOnline) });
const broadcast = () => { for (const socket of sockets.clients) if (socket.readyState === WebSocket.OPEN) socket.send(snapshot()); };
function publish(d) {
  client.publish(`courtline/devices/${d.id}/set`, JSON.stringify(devices.payload(d)), { qos: 1, retain: false }, error => {
    if (error && d.command) { d.command.status = 'failed'; broadcast(); }
  });
}
client.on('connect', () => {
  client.subscribe(['courtline/devices/+/heartbeat', 'courtline/devices/+/status', 'courtline/devices/+/ack'], { qos: 1 }, error => {
    brokerOnline = !error; broadcast();
  });
});
for (const event of ['offline', 'close']) client.on(event, () => {
  brokerOnline = false;
  for (const d of devices.records) { d.connected = false; d.lastSeen = null; }
  broadcast();
});
client.on('error', error => console.error('MQTT:', error.message));
client.on('message', (topic, bytes, packet) => {
  if (bytes.length > 4096) return;
  const match = /^courtline\/devices\/([^/]+)\/(heartbeat|status|ack)$/.exec(topic);
  if (!match || !brokerOnline) return;
  try {
    if (devices.receive(match[1], match[2], JSON.parse(bytes.toString()), packet.retain)) publish(devices.records.find(d => d.id === match[1]));
    broadcast();
  } catch { /* Ignore malformed device messages. */ }
});
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  // Browser access is same-origin through Vite; reject cross-origin mutations.
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
    res.writeHead(403); res.end(JSON.stringify({ error: 'Origin not allowed.' })); return;
  }
  try {
    if (req.method === 'GET' && req.url === '/api/devices') { res.end(snapshot()); return; }
    if (req.method !== 'POST') { res.writeHead(404); res.end('{}'); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) throw Error('JSON content type required.');
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4096) throw Error('Request too large.'); }
    const input = JSON.parse(body);
    if (req.url === '/api/devices') devices.register(input);
    else {
      const match = /^\/api\/devices\/([a-z0-9-]+)\/state$/.exec(req.url || '');
      if (!match) { res.writeHead(404); res.end('{}'); return; }
      devices.update(match[1], input, brokerOnline);
      publish(devices.records.find(d => d.id === match[1]));
    }
    broadcast(); res.end(snapshot());
  } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: error.message })); }
});
const sockets = new WebSocketServer({ server, path: '/device-events', maxPayload: 4096, verifyClient: ({ req }) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}` });
sockets.on('connection', socket => socket.send(snapshot()));
const timer = setInterval(broadcast, 1000);
server.listen(Number(process.env.DEVICE_PORT || 3001), '127.0.0.1', () => console.log('Device service ready on http://127.0.0.1:3001'));
function stop() { clearInterval(timer); for (const socket of sockets.clients) socket.terminate(); sockets.close(); client.end(true); server.close(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
