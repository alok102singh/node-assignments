'use strict';
const sqlite3 = require('sqlite3').verbose();
const namespace = 'data';
const SINGLETON_KEY = Symbol.for(namespace);
const globalSpace = global;
const log = (require('./src/Logger')).getInstance();
const ApiServer = require('./src/ApiServer');
const globalSymbols = Object.getOwnPropertySymbols(globalSpace);


/*************************************************************************************/
/* START PROCESS UNHANDLED METHODS */
/*************************************************************************************/
process.on('unhandledRejection', (reason, p) => {
    log.error(`data exiting due to unhandledRejection at:`,p, 'reason', reason);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
    log.error(`data exiting due to uncaughtException wit error`);
    process.exit(1);
});
// The signals we want to handle
// NOTE: although it is tempting, the SIGKILL signal (9) cannot be intercepted and handled
var signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15,
    'SIGSEGV': 11,
    'SIGBUS': 10,
    'SIGFPE': 8,
    'SIGILL': 4
};
// Do any necessary shutdown logic for our application here
const shutdown = (signal, value) => {
    globalSpace[SINGLETON_KEY].shutdown(signal, signals[signal]);
};
// Create a listener for each of the signals that we want to handle
Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
        log.fatal(`data received a ${signal} signal`);
        shutdown(signal, signals[signal]);
    });
});
process.on('exit', (code) => {
    log.fatal(`data exiting with code: ${code}...`);
});

/*************************************************************************************/
/* END PROCESS UNHANDLED METHODS */
/* START SERVER AS SINGLETON */
/*************************************************************************************/
//If this is the first time go ahead and create the symbol.
if (globalSymbols.indexOf(SINGLETON_KEY) === -1) {
    // Initialise Database Connection
    const db = new sqlite3.Database('./jsondb.db');
    db.run('CREATE TABLE IF NOT EXISTS sampleData(id INTEGER, postId INTEGER, name TEXT, email TEXT, body TEXT)');
    // Start API Server
    globalSpace[SINGLETON_KEY] = new ApiServer({
        serviceLocations: [
            'src/**/*.service.js'
        ],
        cors: true
    });
    globalSpace[SINGLETON_KEY].on('ShutdownComplete', (exitCode) => {
        log.error(`data exiting shutting down with exitCode (${exitCode})...`);
        process.exit(exitCode);
    });
    globalSpace[SINGLETON_KEY].start();
}
module.exports = globalSpace[SINGLETON_KEY];