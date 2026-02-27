import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import * as pgRepo from './dal/pgrepo.js';
import * as wsHandler from './routers/wsstream.js';
import featureApiRouter from './routers/featureapi.js';
import ConnectionManager from './utils/wsconnectionmanager.js';


const bindport = process.env.PORT || 3004;
const wsBase = process.env.WSBASE || `ws://localhost:${bindport}`;
const virtualPath = process.env.virtualPath || '';
const host = process.env.pgConnectString || 'localhost';
const port = process.env.pgPort || '5432';
const db = process.env.pgDatabase || 'gis';
const user = process.env.pgUser || 'postgres';
const password = process.env.pgPassword || 'postgres';

/**
 * Application name
 */
const APP_NAME = 'origo-realtimereference-api';

const app = express();
const server = createServer(app);
app.use((req,res,next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store"
    });
    next();
});
app.set('etag', false);

/**
 * Configuration for different layers
 * name: name as used in the query string to identify layer
 * table: database table to get initial state from. If not specified no initial state is sent
 * initialAsEvents: if tru initial state is sent as events. Otherwise in the features API items endpoint. Requires 'table' setting.
 * updateEventName: name of the Postgres notification event for updates. The event should emit a GeoJson feature for the updated/created feature
 * deleteEventName: name of the Postgres notification event for deletes. The event should emit a feature id for the deleted feature
 * idField: field in the table to use as feature id. If not specified GeoJson id is
 *          used if present (older Postgis versions < 3.5 do not include id in GeoJSON)
 * 
 * TODO: Move to config file
 */
const layers = [
  {
    name: 'linjelager',
    table: 'sf.linjelager',
    updateEventName: 'update_linjelager',
    idField: 'fid',
    deleteEventName: 'delete_linjelager',
    initialAsEvents: false
  },
  {
    name: 'punktlager',
    table: 'sf.punktlager',
    updateEventName: 'update_punktlager',
    idField: 'fid',
    deleteEventName: 'delete_punktlager'
  }
];

/**
 * Options sent to feature api router
 */
const featuresApiOpts = {
  /** Features api must know where to point links to stream*/
  streamBaseUrl: `${wsBase}${virtualPath}/streams`,
  layers,
  pgRepo
}

// Init repo
try {
  const params = {
    host: host,
    port: port,
    db: db,
    user: user,
    password: password
  };
  pgRepo.init(params);
} catch (ex) {
  console.log(ex);
}

/**
 * The one and only websocket listener.
 */
const wss = new WebSocketServer({ 
    clientTracking: true,
    server,
    path: virtualPath + '/streams'
});



// Setup subscriptions to db notifications and initialize a ws
for(const layer of layers) {
  layer.ws = new ConnectionManager();
  pgRepo.subscribe(layer.updateEventName, (f) => wsHandler.sendUpdateToAll(layer, JSON.parse(f)));
  pgRepo.subscribe(layer.deleteEventName, (fid) => wsHandler.sendDeleteToAll(layer, fid));
}

// Allow pretty much anyting CORS-wise. Some functions don't accept wildcard in CORS header so this returns actual origin.
var corsOptions = {
  origin: function (origin, callback) {
      callback(null, true)
  },
  credentials: true
}
app.use(cors(corsOptions));




// Simple endpoint to check if server is running. Is tried before all other routes
app.get(virtualPath + '/', function (req, res) {
  res.send(APP_NAME + ' is alive!');
});

// "Route" for websocket connections. Express does not support routes for websockets
// so we listen to WebSocketServer events. There is a package, express-ws, that makes
// it possible to write routing style websockets routes, but I prefer to keep it raw
// for control.
wss.on('connection', wsHandler.wssStream({
  layers,
  wss,
  pgRepo

}));

// The (now defunct) SEE subscribe endpoint. Dead code in ./routers/ssestream.js
// app.get(virtualPath + '/subscribe', handleSubscribe);

app.use(virtualPath + '/featuresapi', featureApiRouter(featuresApiOpts));


// The error handler.
app.use((err, req, res, next) => {
  const errObj = {
    error_type: 'internal_error',
    error_message: err.message
  }
  console.error(err);
  res.status(500).json(errObj);
})

server.listen(bindport, () => {
  console.log(`${APP_NAME} running on port ${bindport} on virtual path: ${virtualPath}`);
})