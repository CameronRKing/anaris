// some higher-order functions to make code more readable
const equals = (match) => (str) => str === match;
const startsWith = (match) => (str) => str.startsWith(match);
const endsWith = (ext) => (str) => str.endsWith(ext);
const mapWithKeys = (obj, cb) => Object.entries(obj).map(cb).reduce((acc, [key, val]) => ({...acc, [key]: val }), {});


const fs = require('fs');
const path = require('path');
const { normalizePath, aliases, hydratePathAliases, resolvePathAliases } = require('./utils.js');

function buildChain(path) {
    const internalPath = hydratePathAliases(normalizePath(path));
    
    if (shouldIgnore(internalPath)) return;

    const build = (src) => getBuildMethod(path)(path, src);
    const hydrate = (src) => getHydrateMethod(path)(path, src);

    return fs.promises.readFile(path, 'utf8')
        .then(build)
        .then(hydrate)
        .then(obj =>  {
            dis[internalPath] = obj;
            return obj;
        });
}
exports.buildChain = buildChain;



// choosing which code to build
// was relevant before core files were separated from app files
// leaving it because when I get to exposing extensions to core behavior,
// I know that I'll want it
const ignore = [];
const shouldIgnore = (str) => {
    return ignore.some(test => test(str));
}
exports.shouldIgnore = shouldIgnore;


// build methods
const { compile, preprocess } = require('svelte/compiler');
const buildMethods = [
    { test: endsWith('.svelte'), method: svelteBuild },
    { test: endsWith('.js'), method: jsBuild },
    { test: endsWith('.json'), method: (path, src) => src },
];

function svelteBuild(filePath, src) {
    try {
        const replace = (...args) => src = src.replace(...args);

        // replace imports
        // I should probably do this through recast so I can get a source map
        let match;
        while (match = src.match(/import (\w+) from ['"]([^'"]*\.svelte)['"]/)) {
            let [str, cmpName, importPath] = match;
            // resolve relative imports
            if (importPath.startsWith('.')) {
                const joined = path.posix.join(
                    path.dirname(normalizePath(filePath)),
                    importPath
                );
                importPath = hydratePathAliases(joined)
            }
            // I should really clean up these watchers when the component is destroyed
            replace(str, `let ${cmpName}; dis.watch('${importPath}', cmp => ${cmpName} = cmp.default);`);
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
            filename: filePath,
            format: 'cjs',
            dev: true,
            accessors: true,
        });

        // Should I transform the require() calls in here?
        // no, since that logic is tied to the specific hydration method
        return js.code;
    } catch(e) {
        console.warn(filePath, 'Error-throwing code:\n\n', src);
        throw e;
    }
   
}

// I should really set this up to be more pluggable
const odb = require('./semi-omniscient-debugging.js');
function jsBuild(path, src) {
    if (odb.shouldTransform(src)) {
        const ast = recast.parse(src);
        const transformed = odb.transformJSCode(ast, path);
        return recast.print(transformed).code;
    }
    return src;
}

function getBuildMethod(path) {
    const build = buildMethods.find(({ test }) => test(path));
    if (!build) throw new Error(`No build method found for ${path}`);
    return build.method;
}

exports.getBuildMethod = getBuildMethod;



// hydration methods
function customRequire(currFile, requiredFile) {
    let toResolve = normalizePath(requiredFile);

    // resolve relative paths and replace root folders with aliases
    if (toResolve.startsWith('.')) {
        const joined = path.posix.join(
            path.dirname(normalizePath(currFile)),
            toResolve
        );
        toResolve = hydratePathAliases(joined);
    }

    // resolve user dependencies out of the store
    // or build them into the store if they're not found
    if (Object.values(aliases).includes(toResolve[0]) && toResolve[1] == '/') {
        if (dis[toResolve]) return dis[toResolve];

        return dis.waitFor(toResolve);
    }

    // let node take care of libraries
    const mod = require(toResolve);
    // reorganizing the object a little for better integration with ES6 modules
    return { default: mod, ...mod };
}

const hydrateMethods = [
    { test: endsWith('.svelte'), method: svelteHydrate },
    { test: endsWith('.js'), method: jsHydrate },
    { test: endsWith('.json'), method: jsonHydrate },
];


// Function() is in the global scope, but AsyncFunction is hidden
const AsyncFunction = (async function() {}).constructor;

function hydrate(path, code) {
    try {
        return (new AsyncFunction('require', code))(customRequire.bind(null, path));
    } catch(e) {
        console.warn(path, 'Error-throwing code:\n\n', code);
        throw e;
    }
}


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

function astReplace(src, ffilter, mmap) {
    const ast = parse(src);

    const body = ast.program.body;
    body.filter(ffilter)
        .map(mmap)
        .reverse()
        .forEach(([toReplace, ...nodes]) => body.splice(body.indexOf(toReplace), 1, ...nodes));

    return recast.print(ast).code;
}

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

const b = recast.types.builders;
const n = recast.types.namedTypes;
function makeExport(exportName, toExport) {
    if (typeof toExport == 'string') toExport = b.identifier(toExport);
    if (n.ClassDeclaration.check(toExport)) {
        const { id, body, superClass } = toExport;
        toExport = b.classExpression(id, body, superClass);
    }
    return b.expressionStatement(
        b.assignmentExpression(
            '=',
            b.memberExpression(
                b.identifier('exports'),
                b.identifier(exportName)
            ),
            toExport
        )
    );
}
function convertExportToObject(src) {
    return astReplace(
        src,
        node => node.type.startsWith('Export'),
        node => {
            const replacements = [];

            if (node.source) {
                throw new Error('`export <...> from "source"` is not yet supported.');
            }

            const b = recast.types.builders;
            switch (node.type) {
                case 'ExportNamedDeclaration':
                    // export { a as b, c };
                    if (node.specifiers.length) {
                        node.specifiers.forEach(spec => {
                            const replacement = makeExport(spec.exported.name, spec.local.name);
                            replacements.push(replacement);
                        });
                    }
                    // export const a = 'a', b = 'b';
                    // export function () {};
                    // export class K {}
                    if (node.declaration) {
                        const decl = node.declaration;
                        replacements.push(decl);
                        if (decl.type == 'VariableDeclaration') {
                            decl.declarations.forEach(varDecl => {
                                const replacement = makeExport(varDecl.id.name, varDecl.id.name);
                                replacements.push(replacement);
                            });
                        } else {
                            const replacement = makeExport(decl.id.name, decl.id.name); 
                            replacements.push(replacement);
                        }
                    }
                    break;
                case 'ExportDefaultDeclaration':
                    const decl = node.declaration;

                    // values can be exported directly, and don't need to be declared
                    // since they can't be accessed by other code in the module
                    // but functions/classes might be called elsewhere,
                    // so they need to be declared independent of their assignment to the exports object
                    const shouldDeclareIndependently = ['FunctionExpression', 'ClassDeclaration'].includes(node.type);

                    if (shouldDeclareIndependently) {
                        replacements.push(decl);
                    }

                    const exportDecl = shouldDeclareIndependently ? decl.id.name : decl;
                    const replacement = makeExport('default', exportDecl);
                    replacements.push(replacement);
                    break;
                case 'ExportAllDeclaration':
                    // not supported yet--see error about `export <...> from "source"` above

            }
            return [node, ...replacements];
        });
}

function convertES6ToFunction(src) {
    return convertImportToRequire(convertExportToObject(src));
}

async function jsHydrate(path, src) {
    try {
        if (src.match(/^export /m) || src.match(/\bimport\b/)) {
            src = convertES6ToFunction(src);
        }
        src = [
            'const module = { exports: {} };',
            'const exports = module.exports;',
            src.replace(/ require\(/g, ' await require('),
            'return module.exports;'
        ].join('\n');

        return hydrate(path, src);
    } catch(e) {
        console.warn('Error in', path, src);
        throw e;
    }
}

async function svelteHydrate(path, src) {
    const code = [
        'const exports = {};',
        src.replace(/ require\(/g, ' await require('),
        'return exports;'
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