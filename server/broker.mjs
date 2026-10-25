// Loopback-only broker for development and simulator testing.
import { Aedes } from 'aedes';
import { createServer } from 'node:net';
const broker = await Aedes.createBroker();
const server = createServer(broker.handle);
server.on('error', error => { console.error(`Local test broker: ${error.message}`); broker.close(); process.exitCode = 1; });
server.listen(1883, '127.0.0.1', () => console.log('Local test MQTT broker ready at mqtt://127.0.0.1:1883 (this PC only)'));
function stop() { broker.close(() => server.close()); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
