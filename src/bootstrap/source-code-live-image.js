// source code live image
const { writable, get } = require('svelte/store');
const base = writable({});
const dis = new Proxy({
    subscribe: base.subscribe,
    get: () => get(base),
}, {
    // if the object doesn't have the property,
    // pass it through to the underlying store
    get(target, prop, receiver) {
        return target[prop] || get(target)[prop];
    },
    // the top-level object is frozen
    // any property sets are passed through to the underlying store
    set(obj, prop, value) {
        base.update(store => Object.assign(store, {[prop]: value}));
        return true;
    }
});
// this object is so fundamental to the architecture
// that it belongs in the global scope
// dis = Dependency Injection Store
window.dis = dis;

// but we'll also export it to make code easier to understand
module.exports = dis;
