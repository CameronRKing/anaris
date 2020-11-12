require('./source-code-live-image.js');
require('./sync-live-image-with-files.js');
// when the live image loads the home workspace, side effects will be evaluated
// which is how the first component gets rendered onto the page

// I don't know how to keep errors from interrupting page function
// right now, as soon as a svelte component throws an error, EVERYTHING stops working
// these listeners prevent the error from reaching the console, but there's no recovery
window.addEventListener('unhandledrejection', function (event) {
    // the svelte compiler error stack trace is unreadable by default
    // only when .toString() is called does it show where the error occurred
    if (event.reason.name === 'ParseError') 
        console.error(event.reason.filename, '\n', event.reason.toString());

    // if I want to get access to the eval'ed code,
    // then I can't intercept the errors
    // logging the manually destroys the reference to the actual code location
    // console.error(event.reason);
    // event.preventDefault();
    // return false;
});

// window.addEventListener('error', (event) => {
//     console.error(event)
//     event.preventDefault();
//     return false;
// });
