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