/*
 * Repository against postgres. Intended to be used as a singelton (thus not an object). Import it and run init before calling specific functions.
 */


import pg from "pg";



let pool;
let connectionParams;

/**
 * 
 * @param {object} dbparams Connection parameters to db
 * @returns Nothing
 */
function init(dbparams) {
  connectionParams = dbparams;
  pool = new pg.Pool({
    host: dbparams.host,
    port: dbparams.port,
    user: dbparams.user,
    password: dbparams.password,
    database: dbparams.db,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
}

/**
 * Returns the parameters the this instance was created with
 * @returns {object}
 */
function getConnectionParameters() {
  return connectionParams;
}

// let subClient;

// TODO: probably need to handle reconnects etc
// and also release the client when not needed anymore
// and use same client for multiple subscriptions
async function subscribe(eventName, callback) {
    const subClient = await pool.connect();
    try {
        const res = await subClient.query(`LISTEN "${eventName}"`);
        subClient.on('notification', (msg) => callback(msg));

    }
    finally {
// subClient.release();
    }
}
/**
 * Helper to call database 
 * @param {string} sql sql string. May inlucde parameter placeholders
 * @param {any} params parameters array if sql contains parameter placeholders
 * @returns 
 */
async function executeSql(sql, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  }
  finally {
    client.release();
  }
}

/**
 * Exectues a sequence of statements as a transaction
 * @param {*} statements array of {sql, params} pairs
 * @returns result of last statement.
 */
async function executeAsTransaction(statements = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let result;
    for (const currStatement of statements) {
      result = await client.query(currStatement.sql, currStatement.params);
    }
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw (e);
  }
  finally {
    client.release();
  }
}

/**
 * Gets a distinctive set of values from a table
 * @param {string} table Table of repo
 * @param {string} valueColumn Column in table
 * @param {string} labelColumn Column in table to use as label (opt)
 * @returns 
 */
async function getDistinctValues(table, valueColumn, labelColumn) {
  let sql = `SELECT DISTINCT "${valueColumn}"`;
  if(labelColumn) {
      sql += `, "${labelColumn}"`;
  }
  sql += ` from ${table}`;
  if(labelColumn) {  
      sql += ` where ${labelColumn} is not null`;
  }
  const result = await executeSql(sql);
  return result.rows.map(row => {
    return {
      'value': row[valueColumn],
      'label': labelColumn? row[labelColumn].toString(): row[valueColumn].toString()
    }
  });
}

// Intentionally no default export to make caller perceive it more like a class
export  {
  init,
  getDistinctValues,
  executeSql,
  getConnectionParameters,
  executeAsTransaction,
  subscribe
}
