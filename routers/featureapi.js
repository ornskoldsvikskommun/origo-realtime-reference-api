
import express from 'express'

const router = express.Router();

let config;

/**
 * Router to handle features api collections/items requests.
 * Fetches an entire collection (layer) from database.
 * No support for filters or bbox or pretty much anything
 * @param {*} req 
 * @param {*} res 
 */
async function getCollection(req, res) {
    const layerName = req.params.layer;
    const layer = config.layers.find(l => l.name === layerName);
    // TODO: We can set a session cookie here that the websocket upgrade request can read

    let responseObj = {
        type: 'FeatureCollection',
        features: []
    };


    try {
        // We can do this in two ways, either the features api endpoint returns initial state or we return nothing
        // and let the stream send the initial state on connection as events.
        // If we retun features here, the wsconnection should not do it on connection and vice versa.
        // If we return features here, we will need a mechanism to ensure that no events are missed between this
        // return and connection to stream. Tha can be accomplished using a session or last-event-id param in link.
        if (layer.table && !layer.initialAsEvents) {
            const dbRes = await config.pgRepo.executeSql(`
            SELECT json_build_object(
  'type', 'FeatureCollection',
  'features', json_agg(
    json_build_object(
      'type',       'Feature',
      'id',         fid,
      'geometry',   ST_AsGeoJSON(the_geom)::json,
      'properties', to_jsonb(${layer.table.split('.')[1]}) - 'fid' - 'the_geom'
    )
  )
) as featurecollection
FROM  ${layer.table}`);
            responseObj = dbRes.rows[0].featurecollection;
        } 
        // Patch object with link to stream
        responseObj.links = [{
            // TODO: add last-event-id as param? WS does not automatically reconnect so it won't be used for that
            // but it can be used if this endpoint return initial state and there is a risk that the client misses
            // events before the websocket is connected. If we depend on ws connect to send initial state it would not
            // be used at all.
            href: `${config.streamBaseUrl}?layer=${layerName}`,
            rel: 'hub'
            // No need to send channel, there is no standard for channels over ws
        }];
        res.json(responseObj);
    } catch (ex) {
        console.log(ex);
        throw ex;
    }
}

function getLanding(req, res) {
    res.send('Feature API landing page. Not implemented according to spec, but we don\'t care');
}

function featureApiRouter(opts) {
    config = opts;

    router.get('/', getLanding);
    router.get('/collections/:layer/items', getCollection);

    return router;
}

  export default featureApiRouter;