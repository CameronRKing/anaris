require('./source-code-live-image.js');
require('./sync-live-image-with-files.js');
// when the live image loads the home workspace, side effects will be evaluated
// which is how the first component gets rendered onto the page

// I don't know how to keep errors from interrupting page function
// right now, as soon as a svelte component throws an error, EVERYTHING stops working
// these listeners prevent the error from reaching the console, but there's no recovery
// window.addEventListener('unhandledrejection', function (event) {
//     console.error(event);
//     event.preventDefault();
//     return false;
// });

// window.addEventListener('error', (event) => {
//     console.error(event)
//     event.preventDefault();
//     return false;
// });
