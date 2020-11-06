// source code live image
const { buildChain } = require('./build-chain.js');
const { resolvePathAliases, remove } = require('./utils.js');
const { writable, get } = require('svelte/store');
const actualStoreObject = {};

const building = {};
// the fetching is working, but I'm getting strange component blinks
// my guess is that EVERY component is getting refreshed EVERY TIME the store blinks
// the offending line:
    // $: component = $dis[cmpName] ? $dis[cmpName].default : null
// I follow why it's happening. The line runs every time dis changes.
// so, every time it changes, we reassign the component to itself, even it it hasn't changed
// not good
// really, I don't want to watch the WHOLE store, I want to watch only a specific property on it
// I need to add a more fine-grained subscribe() function
// then I can use it outside svelte components, too
// something like . . .
    // let dependency;
    // await dis.watch('dependency', dep => dependency = dep.default);
// where dis.watch returns a promise that resolves when the dependency first appears
// with this logic, ANY module will receive updated versions of its dependencies as they become available,
const watchers = {};
const proxiedStore = new Proxy(actualStoreObject, {
    get(target, prop, receiver) {
        if (!target[prop] && !building[prop]) {
            building[prop] = true;
            buildChain(resolvePathAliases(prop)).then(() => building[prop] = false);
        }
        return target[prop];
    },
    set(target, prop, value) {
        target[prop] = value;
        const cbs = watchers[prop];
        if (cbs) cbs.slice().forEach((cb, idx, arr) => cb(value));
        return true;
    }
});

const base = writable(proxiedStore);
const dis = new Proxy({
    subscribe: base.subscribe,
    get: () => proxiedStore,
    waitFor(path) {
        return new Promise((resolve, reject) => {
            const MAX_WAIT = 5000;
            const timeout = setTimeout(() => reject(`${path} not loaded within ${MAX_WAIT}ms`), MAX_WAIT);
            const unsub = base.subscribe(store => {
                if (store[path]) {
                    unsub();
                    clearTimeout(timeout);
                    resolve(store[path]);
                }
            });
        });
    },
    watch(path, cb) {
        if (!watchers[path]) watchers[path] = [];
        watchers[path].push(cb);
        // return a promise that resolves when a value is available
        return new Promise((resolve, reject) => {
            if (proxiedStore[path]) {
                cb(proxiedStore[path]);
                resolve(() => remove(watchers[path], cb));
            }
            const fn = () => {
                remove(watchers[path], fn);
                resolve(() => remove(watchers[path], cb));
            }
            watchers[path].push(fn);
        });
    } 
}, {
    // if the object doesn't have the property,
    // pass it through to the underlying store
    get(target, prop, receiver) {
        // referencing proxiedStore directly saves us some computation from get(base)
        return target[prop] || proxiedStore[prop];
    },
    // the top-level object is frozen
    // any property sets are passed through to the underlying store
    set(target, prop, value) {
        base.update(store => Object.assign(store, { [prop]: value }));
        return true;
    }
});
// this object is so fundamental to the architecture
// that it belongs in the global scope
// dis = Dependency Injection Store
window.dis = dis;

// but we'll also export it to make code easier to understand
// I wonder . . . is it building a NEW dependency store every time its imported?
module.exports = dis;
