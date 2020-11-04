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
    { test: endsWith('.json'), method: (path, src) => src },
];



function svelteBuild(path, src) {
    try {
        const replace = (...args) => src = src.replace(...args);

        // replace imports
        // I should probably do this through recast so I can get a source map
        let match;
        while (match = src.match(/import (\w+) from ['"]([^'"]*\.svelte)['"]/)) {
            let [str, cmpName, importPath] = match;
            replace(str, `$: ${cmpName} = $dis['${importPath}']`);
        }

        // replace custom components with dynamic components
        // recast won't help me here, but this transformation has never given me grief while debugging
        replace(/<([A-Z]\w+)/g, '<svelte:component this={$1}');
        replace(/<\/[A-Z]\w+>/g, '</svelte:component>');

        // for future reference, how I handled adding preprocessors in the past
        // I'm not sure what `plugin` was,
        // but I suspect a required library rather than a string name
        /*
            if (opts.preprocess) {
                for (let plugin of opts.preprocess) {
                    src = (await svelte.preprocess(src, plugin, { filename })).code;
                }
            }
        */

        const { js } = compile(src, {
            filename: path,
            format: 'cjs',
            dev: true,
            accessors: true,
        });

        // Should I transform the require() calls in here?
        // no, since that logic is tied to the specific hydration method
        return js.code;
    } catch(e) {
        console.warn(path, 'Error-throwing code:\n\n', src);
        throw e;
    }
   
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
        // building the import tree might be necessary,
        // much as I don't want to do it
        // either that or I need to integrate rollup somehow to handle it for me

        // a quick hack is to wait until the requested file is in the store
        return new Promise(resolve => {
            dis.subscribe(store => {
                if (store[newPath]) resolve(store[newPath]);
            });
            setTimeout(5000, () => reject(`${newPath} not loaded within 5 seconds.`));
        })
        newPath = path.resolve(path.resolve(__dirname, '..'), newPath.replace('@', '.'));
    }
    return require(newPath);
}

const hydrateMethods = [
    { test: endsWith('.svelte'), method: svelteHydrate },
    { test: endsWith('.js'), method: jsHydrate },
    { test: endsWith('.json'), method: jsonHydrate },
];

function hydrate(code) {
    try {
        return (new AsyncFunction('require', code))(customRequire);
    } catch(e) {
        console.warn(path, 'Error-throwing code:\n\n', code);
        throw e;
    }
}

// Function() is in the global scope, but AsyncFunction is hidden
const AsyncFunction = (async function() {}).constructor;

const recast = require('recast');

function convertES6ToCJS(src) {
    const ast = recast.parse(src);
    ast.program.body
        .filter(node => node.type === 'ExportNamedDeclaration')
        .map(node => {
            const decl = node.declaration;
            // the name of the declaration is in a different place for functions and varibles
            let declName;
            if (decl.type == 'FunctionDeclaration') {
                declName = decl.id.name;
            } else { // assume VariableDeclaration with a single variable
                declName = decl.declarations[0].id.name;
            }

            const cjsExport = recast.parse(`exports.${declName} = ${declName};`).program.body[0];
            return [ast.program.body.indexOf(node), decl, cjsExport];
        })
        .reverse()
        .forEach(([idx, decl, exp]) => ast.program.body.splice(idx, 1, decl, exp));
    return recast.print(ast).code;
}

async function jsHydrate(path, src) {
    // can't easily handle ES6 modules
    // a Stackoverflow answer suggested setting script src to a blob URL and using that for dynamic imports
    // and it works--if I run the import in the console
    // if I run the import directly in an Electron context, it causes the app to crash WITH NO MESSAGE ANYWHERE
    // my best option is to write an AST transform from ES6 to CJS.
    if (src.match(/^export /)) {
        src = convertES6ToCJS(src);
    }
    const code = [
        'const module = { exports: {} };',
        'const exports = module.exports;',
        src.replace(/ require\(/g, ' await require('),
        'return module.exports;'
    ].join('\n');

    return hydrate(code);
}

async function svelteHydrate(path, src) {
    const code = [
        'const exports = {};',
        src.replace(/ require\(/g, ' await require('),
        'return exports.default;'
    ].join('\n');

    return hydrate(code);
}

async function jsonHydrate(path, src) {
    return JSON.parse(src);
}

function getHydrateMethod(path) {
    const hydrate = hydrateMethods.find(({ test }) => test(path));
    if (!hydrate) throw new Error(`No hydrate method found for ${path}.`);
    return hydrate.method;
}

exports.getHydrateMethod = getHydrateMethod;