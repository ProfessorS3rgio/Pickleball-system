# Offline device connection

The broker routes messages on the local network; it does not require internet.
For a software-only test, start the included loopback broker:

```powershell
npm run mqtt:dev
```

Alternatively, install Mosquitto separately and use the supplied config (run only
one broker at a time):

```powershell
mosquitto -c mqtt/mosquitto.conf -v
```

In two other terminals:

```powershell
npm run devices
npm run dev
```

Open Courtline and select **Devices**. Register `court-01-display`, give it a name,
and select a court. In another terminal, run:

```powershell
npm run device:simulate -- court-01-display
```

The simulator becomes online. Send a score update and watch its status change
from pending to applied. Stop the simulator with Ctrl+C to report offline;
abrupt loss is detected through MQTT Last Will / heartbeat expiration.
Close the simulator terminal to test unexpected loss. Start it again to test
restoring the latest desired score. No physical LED hardware is exercised.

## Physical Ethernet controllers

1. Connect the PC and controllers to the same Ethernet switch/router.
2. Reserve the broker PC's IP through the router's DHCP settings.
3. The supplied config accepts only local PC connections. For physical devices,
   configure a Mosquitto listener on the PC's LAN interface, disable anonymous
   access, and create credentials with `mosquitto_passwd`. Use topic ACLs so each
   device can subscribe only to its own `set` topic and publish only its own
   heartbeat, status, and acknowledgment topics. Give the backend access to all
   device topics. Allow the MQTT port through Windows Firewall on your private
   network. Do not expose the broker through internet port forwarding.
4. Configure firmware with the broker's LAN IP, its credentials, and the exact
   registered device ID. `127.0.0.1` on a controller refers to that controller,
   not the PC. Use TLS when the network is not trusted.
5. Set backend credentials in `MQTT_USERNAME` and `MQTT_PASSWORD`. Set `MQTT_URL`
   if the broker is not at `mqtt://127.0.0.1:1883`. Simulator uses the same variables.

The device HTTP service listens only on 127.0.0.1:3001. Vite proxies its HTTP and
WebSocket routes. Start Vite with `npm run dev -- --host 0.0.0.0` only when local
network browser access is needed. The reception app currently has no staff
authentication, so everyone with access to that address can use the interface.
`vite preview` does not configure this service proxy; this milestone runs through
the development server. Deployment needs an equivalent same-origin reverse proxy.

## Firmware contract (version 1)

Prefix: `courtline/devices/<deviceId>`.

| Topic | Direction | Payload |
| --- | --- | --- |
| `/heartbeat` | Device → backend, every 5s | `{"firmware":"1.0.0","appliedRevision":3}` |
| `/status` | Device → backend | `{"online":true}` on connect; `{"online":false}` as Last Will and before graceful disconnect |
| `/set` | Backend → device | `{"type":"set_scoreboard","courtId":"court-1","commandId":"UUID","revision":3,"teamA":10,"teamB":8,"serving":"A"}` |
| `/ack` | Device → backend, after applying | `{"commandId":"UUID","appliedRevision":3,"status":"applied"}` |

Use QoS 1 for set, ack, and status; QoS 0 is sufficient for heartbeat. Keepalive
10s; clean sessions; subscribe to `/set` before announcing online. Do not retain
these messages. Firmware must tolerate duplicates, reject older revisions, and
acknowledge a duplicate of an already-applied revision. It must apply the entire
state rather than increment scores. After reboot it should reset its in-memory
revision and request current state by announcing online. Render locally; do not
stream LED refresh frames across MQTT. Network handling must not block panel refresh.

After reconnection, only the latest persisted desired state is sent with a fresh
command ID. Old actions are not queued for replay. A command times out after 10s
without confirmation; its latest desired state remains available for resync.
QoS delivery confirmation alone does not count as application confirmation.

## Data and limits

Device registrations and latest desired states are saved atomically to
`data/devices.json`. Back up this file separately: the existing browser backup
does not include devices. Missing broker/service is shown explicitly; it does not
make every device appear healthy. A broker outage makes status unknown until a
fresh device heartbeat arrives after reconnection.

This is the device-control foundation. Scores are manually entered on Devices;
they are not a match-management or officiating workflow and do not alter bookings.
Booking data remains in browser localStorage. Physical ESP firmware, HUB12 pin
mapping, display rendering, and hardware validation remain to be implemented once
the exact controller board is confirmed.
