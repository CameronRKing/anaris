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
function customRequire(currFile, requiredFile) {
    let newPath = normalize(requiredFile);
    // resolve relative paths
    if (newPath.startsWith('.')) {
        const resolvedPath = path.posix.join(path.dirname(normalize(currFile)), newPath);
        newPath = resolvedPath.replace(/^src\//, '@/');
    }
    // @ is an alias referring to the src directory
    if (newPath.startsWith('@')) {
        if (dis[newPath]) return dis[newPath];
        // building the import tree might be necessary,
        // much as I don't want to do it
        // either that or I need to integrate a tool (what tool?) to handle it for me

        // a quick hack is to wait until the requested file is in the store
        return new Promise(resolve => {
            const unsub = dis.subscribe(store => {
                if (store[newPath]) {
                    unsub();
                    resolve(store[newPath]);
                }
            });
            setTimeout(5000, () => reject(`${newPath} not loaded within 5 seconds.`));
        })
    }
    try {
        // let node take care of libraries
        return require(newPath);
    } catch(e) {
        console.warn('Error in ' + currFile);
        throw e;
    }
}
window.customRequire = customRequire;

const hydrateMethods = [
    { test: endsWith('.svelte'), method: svelteHydrate },
    { test: endsWith('.js'), method: jsHydrate },
    { test: endsWith('.json'), method: jsonHydrate },
];

function hydrate(path, code) {
    try {
        return (new AsyncFunction('require', code))(customRequire.bind(null, path));
    } catch(e) {
        console.warn(path, 'Error-throwing code:\n\n', code);
        throw e;
    }
}

// Function() is in the global scope, but AsyncFunction is hidden
const AsyncFunction = (async function() {}).constructor;

const recast = require('recast');
const acorn = require('acorn');
const parse = (src) => recast.parse(src, {
    // the default parser wasn't parsing rest arguments in object destructures
    parser: {
        parse(source) {
            return require('recast/parsers/acorn').parse(source, {
                ecmaVersion: 'latest',
                sourceType: 'module'
            });
        }
    }
});

function convertImportToRequire(src) {
    return astReplace(src, node => node.type === 'ImportDeclaration', node => {
        const name = node.source.raw;
        let specObj = {}, specNamespace;
        node.specifiers.forEach(spec => {
            switch (spec.type) {
                case 'ImportDefaultSpecifier':
                    specObj.default = spec.local.name;
                    return;
                case 'ImportNamespaceSpecifier':
                    specNamespace = spec.local.name;
                    return;
                case 'ImportSpecifier':
                    specObj[spec.imported.name] = spec.local.name;
            }
        });
        let specStr = JSON.stringify(specObj).replace(/"/g, '');
        if (specNamespace) {
            if (specStr == '{}') specStr = specNamespace;
            else specStr = specStr.split('}')[0] + ` ...${specNamespace}}`;
        }
        const requireNode = parse(`const ${specStr} = require(${name});`).program.body[0];
        return [node, requireNode];
    });
}

// utility function, factor out in future
function mapWithKeys(obj, cb) {
    Object.entries(obj).map(cb).reduce((acc, [key, val]) => ({...acc, [key]: val }), {});
}

function astReplace(src, ffilter, mmap) {
    const ast = parse(src);

    const body = ast.program.body;
    body.filter(ffilter)
        .map(mmap)
        .reverse()
        .forEach(([toReplace, ...nodes]) => body.splice(body.indexOf(toReplace), 1, ...nodes));

    return recast.print(ast).code;
}

// really I should implement this, but for now I'll just avoid the syntax
function convertExportFrom(src) {
    return astReplace(src, node => node.type.startsWith('Export') && node.source, node => {
        const src = node.source.raw;
        switch (node.type) {
            case 'ExportNamedDeclaration':
                const specs = mapWithKeys(node.specifiers, spec => [spec.local.name, spec.exported.name]);
                break;
            case 'ExportAllDeclaration':
        }
        // todo: map export <...> from 'stuff'
        // to const <...> = require('stuff'); export <...>;
        const [requireNode, exportNode] = parse(`const ${specs} = require(${src}); export ${specs};`);
        return [];
    });
}

async function jsHydrate(path, src) {
    try {
        if (src.match(/^export /m)) {
            try {
                // I do need to replace all imports
                // the browser context CAN access node libraries, but only through require()
                src = convertImportToRequire(src);
                // there is one problem remaining: customRequire() sometimes returns a promise
                // I can't use async at the top level in modules
                // I may need to convert exports too and go through the AsyncFunction() hydrator
                src = `const require = customRequire.bind(null, '${normalize(path)}');\n` + src;
                // see index.html for source and the reason why this strange pattern exists
                return window.hydrateScript(path, src);
            } catch(e) {
                console.warn('Error hydrating ES6 code');
                console.warn(src);
                throw e;
            }
        }
        src = [
            'const module = { exports: {} };',
            'const exports = module.exports;',
            src.replace(/ require\(/g, ' await require('),
            'return module.exports;'
        ].join('\n');

        return hydrate(path, src);
    } catch(e) {
        console.warn('Error in', path);
        throw e;
    }
}

async function svelteHydrate(path, src) {
    const code = [
        'const exports = {};',
        src.replace(/ require\(/g, ' await require('),
        'return exports.default;'
    ].join('\n');

    return hydrate(path, code);
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