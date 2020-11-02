const chokidar = require('chokidar');
const fs = require('fs');
const { shouldIgnore, getBuildMethod, getHydrateMethod } = require('./build-chain.js');

// optional chokidar logging
const watcherLog = [];
window.shouldLogChokidarEvents = true;
function log(event, path) {
    if (!window.shouldLogChokidarEvents) return;
    console.log(event, path);
    watcherLog.push([event, path, Date.now()]);
}

const watcher = chokidar.watch('./src');
watcher.on('add', (path) => {
    log('add', path);
    buildChain(path);
});
watcher.on('change', (path) => {
    log('change', path);
    buildChain(path);
});

const dis = require('./source-code-live-image.js');
const path = require('path');
const normalize = (str) => str.split(path.sep).join(path.posix.sep);

function buildChain(path) {
    const internalPath = normalize(path).replace(/^src\//, '@/');
    
    if (shouldIgnore(internalPath)) return;

    const build = (src) => getBuildMethod(path)(path, src);
    const hydrate = (src) => getHydrateMethod(path)(path, src);

    fs.promises.readFile(path, 'utf8')
        .then(build)
        .then(hydrate)
        .then(obj => dis[internalPath] = obj);
}
