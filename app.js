import express from 'express';
import SSE from 'express-sse';
import * as pgRepo from './dal/pgrepo.js';
import cors from 'cors';

const app = express();
const bindport = process.env.PORT || 3003;
const virtualPath = process.env.virtualPath || '';
const host = process.env.pgConnectString || 'localhost';
const port = process.env.pgPort || '5432';
const db = process.env.pgDatabase || 'gis';
const user = process.env.pgUser || 'postgres';
const password = process.env.pgPassword || 'postgres';

/**
 * Application name
 */
const APP_NAME = 'sse-server';

/**
 * Configuration for different layers
 * name: name as used in the query string to identify layer
 * table: database table to get initial state from. If not specified no initial state is sent
 * updateEventName: name of the Postgres notification event for updates
 * idField: field in the table to use as feature id. If not specified GeoJson id is
 * used if present (older Postgis versions < 3.5 do not include id in GeoJSON)
 * deleteEventName: name of the Postgres notification event for deletes
 * 
 * TODO: Move to config file
 */
const layers = [
  {
    name: 'linjelager',
    table: 'sf.linjelager',
    updateEventName: 'update_linjelager',
    idField: 'fid',
    deleteEventName: 'delete_linjelager'
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
 * SSE instances for each layer
 */
const sses = {}

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
 * Helper to send updates
 * @param {*} featureStr 
 * @param {*} layer 
 */
function sendUpdate(featureStr, layer) {
  const feature = JSON.parse(featureStr);
  if(layer.idField) {
    // Add id (or override) as older Postgis does not add id
    feature.id = feature.properties[layer.idField];
  }
  sses[layer.name].send(feature, 'update');
}

/**
 * Callback for db notifications
 * @param {*} layer 
 * @param {*} msg 
 */
function updateCallback(layer, msg) {
  console.log(msg);
  sendUpdate(msg.payload, layer);
}

function deleteCallback(layer, msg) {
  console.log(msg);
  const featureId = msg.payload;
  sses[layer.name].send({ id: featureId}, 'delete');
}

// Setup subscriptions to db notifications
for(const layer of layers) {
  const sse = new SSE();
  sses[layer.name] = sse;
  pgRepo.subscribe(layer.updateEventName, msg => updateCallback(layer, msg));
  pgRepo.subscribe(layer.deleteEventName, msg => deleteCallback(layer, msg));
}

// Enable CORS whitelist. SSE does not accept wildcard origins
// TODO: Move url:s to config file
var whitelist = ['http://localhost:9966', 'http://localhost:9967']
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}
app.use(cors(corsOptions));




// Simple endpoint to check if server is running. Is tried before all other routes
app.get(virtualPath + '/', function (req, res) {
  res.send(APP_NAME + ' is alive!');
});

/**
 * This is where the magic happen. Each request will open an SSE connection to
 * the layer specified in the query string
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */
async function handleSubscribe(req, res, next) {
  const layerName = req.query.layer;
  const sse = sses[layerName];
  const layer = layers.find(l => l.name === layerName);
  if (!sse) {
    // EventSource can't handle repsonse codes, but we sent it anyway for easier debugging
    res.status(400).send('Invalid layer name');
    return;
  }
  sse.init(req, res);

  // Send initial state. It is actually done asynchronously as 
  // express-sse emits an event to itself.
  if (layer.table) {
    const features = await pgRepo.executeSql(`SELECT ST_AsGeoJson(t.*) as feature FROM ${layer.table} t`);
    for (const row of features.rows) {
      sendUpdate(row.feature, layer);
    }
  } else {
    // Sends a comment to make connection not pending until data arrives
    // Doesn't really matter but it looks better in the client
    sse.send(':Imopen');
  }
  
}


app.get(virtualPath + '/subscribe', handleSubscribe);

// The error handler.
app.use((err, req, res, next) => {
  const errObj = {
    error_type: 'internal_error',
    error_message: err.message
  }
  console.error(err);
  res.status(500).json(errObj);
})

app.listen(bindport, () => {
  console.log(`${APP_NAME} running on port ${bindport} on virtual path: ${virtualPath}`);
})