import CloudEvent from '../models/cloudevents.js';
import { randomUUID } from 'crypto';

/** Application config of all available layers we provide */
let layers;
let wss;
let pgRepo;

function sendWsUpdate(ws, f) {
    // Create a unique event id as we don't support catch up on reconnect
    const evt = CloudEvent.newReplaceFromFeature(f, randomUUID(), 'NAME');
    console.log('Sending initial update', evt);
    ws.send(JSON.stringify(evt));
}

export function sendUpdateToAll(layer, f) {
    if (layer.idField) {
        f.id = f.properties[layer.idField];
    }
    // Create a unique event id as we don't support catch up on reconnect
    const evt = CloudEvent.newReplaceFromFeature(f, randomUUID(), layer.name);
    console.log('Sending Update to all', evt);
    layer.ws.broadcast(JSON.stringify(evt));
}

export function sendDeleteToAll(layer, fid) {
    // Create a unique event id as we don't support catch up on reconnect
    const evt = CloudEvent.newDeleteFromFeature(fid, randomUUID(), layer.name);
    console.log('Sending Delete to all', evt);
    layer.ws.broadcast(JSON.stringify(evt));
}

async function websocketConnectionHandler(ws, request) {
    const clientIP = request.socket.remoteAddress;
    console.log(`New client connected from ${clientIP}`);

    // TODO: Should check sub-protocol for cloud-events


    // Parse query params or path to get layer
    // It is easiest to get layer from query param, as ws only listens to one static path.
    // Another solution is to listen to server 'upgrade' event and switch the call to different WSS:es,
    // but I'd avoid that if I can.  We could also override shouldHandle to use several paths, but that seems
    // a bit shady, albeit documented.
    const params = new URL(request.url, 'http://fake').searchParams;
    const layerName = params.get('layer');
    const layer = layers.find(l => l.name === layerName);
    if (!layer) {
        ws.close(1008, 'Layer not found');
        // Equivalent of Bad request. Don't bother anymore
        return;
    }

    // Add client to correct channel
    layer.ws.addClient(ws);

    // Send initial state as events
    if (layer.table && layer.initialAsEvents) {
        const features = await pgRepo.executeSql(`SELECT ST_AsGeoJson(t.*) as feature FROM ${layer.table} t`);
        for (const row of features.rows) {
            const f = JSON.parse(row.feature);
            if(layer.idField) {
                f.id = f.properties[layer.idField];
            }
            if (f.geometry.type) {
                sendWsUpdate(ws, f);
            }
        }
    }

    ws.on('close', function close(code, reason) {
        layer.ws.removeClient(ws);
        console.log(`Client disconnected - Code: ${code}, Reason: ${reason}`);
    });

    ws.on('error', function error(err) {
        console.error('WebSocket error:', err);
    });

    // Handle connection ping/pong for keep-alive
    ws.on('pong', function heartbeat() {
        ws.isAlive = true;
    });



    ws.isAlive = true;
}





export function wssStream(opts) {
    ({
        layers,
        wss,
        pgRepo
    } = opts);

    // Ping clients periodically to detect broken connections
    const interval = setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            if (ws.isAlive === false) {
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', function close() {
        clearInterval(interval);
    });

    return websocketConnectionHandler;
}







