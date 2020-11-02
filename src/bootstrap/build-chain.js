// some higher-order functions to make code more readable
const equals = (match) => (str) => str === match;
const startsWith = (match) => (str) => str.startsWith(match);
const endsWith = (ext) => (str) => str.endsWith(ext);

// choosing which code to build
const ignore = [
    equals('@/index.js'),
    startsWith('@/bootstrap/'),
];
exports.shouldIgnore = (str) => {
    return ignore.some(test => test(str));
}


// build methods
const { compile, preprocess } = require('svelte/compiler');
const buildMethods = [
    { test: endsWith('.svelte'), method: svelteBuild },
    { test: endsWith('.js'), method: (path, src) => src },
];

function svelteBuild(path, src) {
    // todo: transform imports and components to dynamic syntax
    const { js } = compile(src, {
        filename: path,
        format: 'cjs',
        dev: true,
        accessors: true,
    });

    // Should I transform the require() calls in here?
    // no, since that logic is tied to the specific hydration method
    return js.code;
}
function getBuildMethod(path) {
    const build = buildMethods.find(({ test }) => test(path));
    if (!build) throw new Error(`No build method found for ${path}`);
    return build.method;
}

exports.getBuildMethod = getBuildMethod;



// hydration methods
const path = require('path');
const normalize = (str) => str.split(path.sep).join(path.posix.sep);
const dis = require('./source-code-live-image.js');
const customRequire = (str) => {
    let newPath = normalize(str);
    // @ is an alias referring to the src directory
    if (newPath.startsWith('@')) {
        if (dis[newPath]) return dis[newPath];
        throw new Error('Aliased path not loaded: ' + str);
    }
    return require(newPath);
}

const hydrateMethods = [
    { test: endsWith('.svelte'), method: svelteHydrate },
    { test: endsWith('.js'), method: jsHydrate },
];

function catchHydrateError(path, src, cb) {
    try {
        return cb();
    } catch(e) {
        console.warn(path, 'Error-throwing code:\n\n', src);
        throw e;
    }
}

async function jsHydrate(path, src) {
    const code = [
        'const module = { exports: {} };',
        'const exports = module.exports;',
        src,
        'return module.exports;'
    ].join('\n');

    return catchHydrateError(path, src, () => (new Function('require', code))(customRequire))
}
// Function() is in the global scope, but AsyncFunction is hidden
const AsyncFunction = (async function() {}).constructor;

// doesn't use await, but I want to signal that it returns a promise
async function svelteHydrate(path, src) {
    const code = [
        'const exports = {};',
        src.replace(/ require\(/g, ' await require('),
        'return exports.default;'
    ].join('\n');

    return catchHydrateError(path, src, () => (new AsyncFunction('require', code))(customRequire));
}

function getHydrateMethod(path) {
    const hydrate = hydrateMethods.find(({ test }) => test(path));
    if (!hydrate) throw new Error(`No hydrate method found for ${path}.`);
    return hydrate.method;
}

exports.getHydrateMethod = getHydrateMethod;