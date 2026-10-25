import mqtt from 'mqtt';
const id = process.argv[2] || 'court-01-display';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error('Invalid device ID');
const topic = `courtline/devices/${id}`;
let appliedRevision = 0;
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://127.0.0.1:1883', {
  clientId: `sim-${id}`, username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD,
  will: { topic: `${topic}/status`, payload: JSON.stringify({ online: false }), qos: 1, retain: false }, keepalive: 10,
});
const heartbeat = () => { if (client.connected) client.publish(`${topic}/heartbeat`, JSON.stringify({ firmware: 'simulator-1', appliedRevision })); };
client.on('connect', () => { client.subscribe(`${topic}/set`, { qos: 1 }); heartbeat(); });
client.on('error', error => console.error(error.message));
client.on('message', (_, bytes) => {
  const state = JSON.parse(bytes.toString());
  if (state.revision < appliedRevision) return;
  appliedRevision = state.revision;
  console.log('Applied display state:', state);
  client.publish(`${topic}/ack`, JSON.stringify({ commandId: state.commandId, appliedRevision, status: 'applied' }), { qos: 1 });
});
const timer = setInterval(heartbeat, 5000);
process.on('SIGINT', () => { clearInterval(timer); client.publish(`${topic}/status`, JSON.stringify({ online: false }), { qos: 1 }, () => client.end()); });
