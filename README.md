# origo-realtime-reference-api
This is a reference implementation of the format that Origo REALTIME layer type uses. It is not production ready code.

## Description
The server implements the protocol used by origo real-time layers. For a Description of the format see documentation for Origo, but in short it is based on Server Side Events (SSE) as implemented in the javascript EventSource api. As source it uses database tables, not
actual real-time api:s or streams. But listening to database event channels and act on them makes it demonstrate the real-time behaviour.

The server supports many layers and many subscribers for each layer.

This implementation relies on PostGIS tables that have triggers for insert/update/delete. The update/insert trigger should emit an event with the complete feature as payload formatted as GeoJson. For PostGIS 3.5 and newer ST_AsGeoJson
can set a specific field as feature id (most likely the private key). Older PostGIS can not set id, so it is done in the api by copying the configured property. The delete trigger should emit the `id`of the row. The api does not care about
which coordinate system the feature has. According to GeoJson it should be 4326, but api sends it as is. PostGIS will set the CRS as a property in GeoJson from the SRID in database, but that is ignored by Origo but can be configured on the layer.

At connection the entire table will be sent as a series of updates if a table name is specified.

The last-id mechanism from the EventSource specification is not utlized, so if a client is disconnected for a while and then succesfully reconnects using the automatic reconnect mechanism in EventSource it will never receive events that were sent during the disconnected time.
To support that the server would have to buffer events as the database has no knowledge of events sent. A real production implementation would probably do that, or have a real world source that actually is a real-time stream itself.

The server only supports Http/1.1, which by design is not good for SSE. A real server would implement HTTP/2 or use a HTTP/2 reverse proxy.

### Example trigger for insert and update (same function)
Create a trigger function:
```
CREATE OR REPLACE FUNCTION sf.insert_feature()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
    BEGIN
        PERFORM pg_notify('update_' || TG_TABLE_NAME , ST_AsGeoJSON(NEW));
        RETURN new;
    END;
$BODY$;
```
This function will emit an `update`event on an event channel for each table. To hook it up to a table add a trigger to the tables in question:
```
CREATE TRIGGER insert_or_update
    AFTER INSERT OR UPDATE 
    ON sf.punktlager
    FOR EACH ROW
    EXECUTE FUNCTION sf.insert_feature();
```
### Example trigger for delete
Create a trigger function:
```
CREATE OR REPLACE FUNCTION sf.delete_feature()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
    BEGIN
        PERFORM pg_notify('delete_' || TG_TABLE_NAME , OLD.fid::text);
        RETURN OLD;
    END;
$BODY$;
```
You need to adjust the name of the private key field. The example uses `fid`

Then create triggers on each table: 
```
CREATE TRIGGER delete
    BEFORE DELETE
    ON sf.punktlager
    FOR EACH ROW
    EXECUTE FUNCTION sf.delete_feature();
```
The names of the channels are used in the api configuration.

## Getting started
- Clone and run `npm ci`
- Set up some triggers in PostGIS
- Configure layer names etc and connection parameters to database in app.js. See comments in app.js
- Edit cors settings in app.js or remove them if not needed
- Start using `node app.js`. Probably requires at least node 22.
- Configure an Origo map using your real-time layers. See Origo documentation.
- Edit some rows in the database in any application and watch the magic.
- For extra fun do an automatic update to have a dog running around randomly

## Running in IIS
Also provided is a web.config for running in IIS using IISNode. The key take in that file is that `flushResponse="true"` must be set. Otherwise IIS will buffer respones up to 4 MB has been received, which makes it pretty much non-real-time. Also it uses a modified interceptor that can start modules.
The only modification that has to be done is changing the last row to `import('file://'+process.argv[1]);` instead of `require`. The file must be saved in `c:\Program Files\iisnode` where the original file is.

Unfortunately when running in IIS and using Windows Integrated Authentication, HTTP/2 will not work. It is by design in IIS and sucks as the main reason to run behind IIS is to use Windows auth.

