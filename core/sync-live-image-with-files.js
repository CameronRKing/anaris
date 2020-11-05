const chokidar = require('chokidar');
const fs = require('fs');
const { shouldIgnore, getBuildMethod, getHydrateMethod } = require('./build-chain.js');

// optional chokidar logging
const watcherLog = [];
// there should be a config file somewhere for this
window.shouldLogChokidarEvents = false;
function log(event, path) {
    if (!window.shouldLogChokidarEvents) return;
    console.log(event, path);
    watcherLog.push([event, path, Date.now()]);
}

// chokidar seems to run relative to the place the process it started,
// not relative to the filepath where the function is called
//
// this method loads and hydrates ALL files, regardless of whether they are used,
// which means the initial load time is less than desirable,
// and will only get worse as the apps folder grows
// a more elegant method would be to load files when they are requested,
// then add them to the watcher
// even better would be unwatching them and deleting them from the image when they are no longer required
// but that bit will be harder, I think
const watcher = chokidar.watch(['./apps', './workspaces']);
watcher.on('add', (path) => {
    log('add', path);
    buildChain(path);
});
watcher.on('change', (path) => {
    log('change', path);
    buildChain(path);
});

const dis = require('./source-code-live-image.js');
const { normalizePath, hydratePathAliases } = require('./utils.js');

function buildChain(path) {
    const internalPath = hydratePathAliases(normalizePath(path));
    
    console.log(internalPath);
    if (shouldIgnore(internalPath)) return;

    const build = (src) => getBuildMethod(path)(path, src);
    const hydrate = (src) => getHydrateMethod(path)(path, src);

    fs.promises.readFile(path, 'utf8')
        .then(build)
        .then(hydrate)
        .then(obj => dis[internalPath] = obj);
}
