const chokidar = require('chokidar');
const fs = require('fs');
const { shouldIgnore, getBuildMethod, getHydrateMethod } = require('./build-chain.js');
const { internalPath } = require('./utils.js');

// optional chokidar logging
const watcherLog = [];
// there should be a config file somewhere for this
window.shouldLogChokidarEvents = false;
function log(event, path) {
    if (!window.shouldLogChokidarEvents) return;
    console.log(event, path);
    watcherLog.push([event, path, Date.now()]);
}

const { buildChain } = require('./build-chain.js');

function buildOn(event, watcher) {
    watcher.on(event, path => {
        log(event, path);
        buildChain(path)
            .then(obj => dis[internalPath(path)] = obj);
    })
}

// chokidar seems to run relative to the place the process it started,
// not relative to the filepath where the function is called
const watcher = chokidar.watch(['./apps', './workspaces']);
buildOn('change', watcher);

const bootstrapper = chokidar.watch('./workspaces/home.js');
buildOn('add', bootstrapper);
buildOn('change', bootstrapper);
