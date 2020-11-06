const path = require('path');

exports.normalizePath = (str) => str.split(path.sep).join(path.posix.sep);

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

function remove(arr, el) {
    arr.splice(arr.indexOf(el), 1);
}
exports.remove = remove;