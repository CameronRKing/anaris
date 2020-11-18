const path = require('path');

const normalizePath = (str) => str.split(path.sep).join(path.posix.sep);
exports.normalizePath = normalizePath;

const aliases = {
    apps: '@',
    workspaces: '#',
    core: '!'
};
exports.aliases = aliases;
function hydratePathAliases(str) {
    return Object.entries(aliases)
        .reduce(
            (ppath, [folder, alias]) => ppath.replace(new RegExp(`^${folder}/`), alias + '/'),
            str
        );
}

exports.hydratePathAliases = hydratePathAliases;

function resolvePathAliases(str) {
    return Object.entries(aliases)
        .reduce(
            (ppath, [folder, alias]) => ppath.replace(new RegExp(`^${alias}/`), folder + '/'),
            str
        );
}
exports.resolvePathAliases = resolvePathAliases

exports.internalPath = (path) => hydratePathAliases(normalizePath(path));

function remove(arr, el) {
    arr.splice(arr.indexOf(el), 1);
}
exports.remove = remove;

const noop = () => {};
function instrument({ fn, before, after, hook }={}) {
    before = before || noop;
    after = after || noop;
    hook = hook || noop;

    return (...args) => {
        const memento = before(...args);

        fn.hook = (event, cb) => {
            if (!cb) {
                hook(event, memento);
                return;
            }

            return (...args) => {
                hook(event + '-start', memento);

                const res = cb(...args);

                if (typeof res.then === 'function') {
                    return res.then(async val => {
                        hook(event + '-end', memento);
                        return val;
                    })
                } else {
                    hook(event + '-end', memento);
                    return res;
                }
            }
        }

        const res = fn(...args);

        if (typeof res.then === 'function') {
            return res.then(async val => {
                await after(memento);
                return val;
            });
        } else {
            after(memento);
            return res;
        }
    }
}
exports.noop = noop;
exports.instrument = instrument;

Function.prototype.hook = (event, cb) => cb;