
/** Implements a CloudEvent that can be seialized and sent to Origo.
 * Does not implement the entire CloudEvents standrad, just what Origo uses.
 */
export default class CloudEvent {
    id; 
    source;
    specversion = "1.0";
    type;
    datacontenttype = "application/json";
    // data; // data is optional but should not be null.

    constructor(){}

    // We don't actually use create. Inserts are sent as replace
    static newCreateFromFeature(feature, id, source) {
        const me = new CloudEvent();
        me.type = "org.ogc.api.collection.item.create";
        me.data = feature;
        me.id = id;
        me.source = source;
        // Origo doesn't use source
        // source= "https://example.org/api/collections/obs"
        // Origo doesn't use subject, but it could be used to not include data in event
        // subject= "https://example.org/api/collections/obs/items/964", // Optional
        return me;
    }

    static newReplaceFromFeature(feature, id, source) {
        const me = new CloudEvent();
        me.type = "org.ogc.api.collection.item.replace";
        me.data = feature;
        me.id = id;
        me.source = source;
        // Origo doesn't use source
        // source= "https://example.org/api/collections/obs"
        // Origo doesn't use subject, but it could be used to not include data in event
        // subject= "https://example.org/api/collections/obs/items/964", // Optional
        return me;
    }

    static newDeleteFromFeature(featureId, id, source) {
        const me = new CloudEvent();
        me.type = "org.ogc.api.collection.item.delete";
        me.datacontenttype = "text/plain";
        me.data = featureId;
        me.id = id;
        me.source = source;
        // Origo doesn't use source
        // source= "https://example.org/api/collections/obs"
        // Origo doesn't use subject, but it could be used to not include data in event
        // subject= "https://example.org/api/collections/obs/items/964", // Optional
        return me;
    }
}