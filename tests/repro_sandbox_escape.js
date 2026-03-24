const { createSafeProxy } = require('../src/agent/sandbox');
const assert = require('assert');

// Manual reproduction of the proxy logic to test the theory
function manualTest() {
    console.log('Testing proxy "this" wrapping in callbacks...');

    // An object that exists in the "host" (Node.js) context
    const hostObject = {
        name: 'host-object',
        doSomething: function(cb) {
            // JSDOM or other host functions might call the callback with a 'this' context from the host.
            // If the proxy doesn't wrap 'this', the callback gets the raw host 'this' object.
            cb.call({ secret: 'host-secret', hostProcess: process });
        }
    };

    const proxiedHost = createSafeProxy(hostObject);

    let escapeSuccessful = false;
    proxiedHost.doSomething(function() {
        // If 'this' is unproxied, it is the raw host object.

        // A proxied object from createSafeProxy should return undefined for 'constructor'
        if (this.constructor !== undefined) {
            console.log('VULNERABILITY: "this.constructor" is accessible! Proxy wrapping failed.');
            escapeSuccessful = true;
        } else {
            console.log('SUCCESS: "this.constructor" is blocked. "this" appears to be proxied.');
        }

        try {
            // If hostProcess is unproxied, this will be the real process object.
            // If proxied, it will be another proxy.
            if (this.hostProcess) {
                if (this.hostProcess.constructor !== undefined) {
                    console.log('VULNERABILITY: "this.hostProcess.constructor" is accessible!');
                    escapeSuccessful = true;
                } else {
                    console.log('SUCCESS: "this.hostProcess.constructor" is blocked.');
                }
            }
        } catch (e) {
            // console.log('Error:', e.message);
        }
    });

    if (escapeSuccessful) {
        console.log('Result: Vulnerability confirmed!');
        process.exit(1);
    } else {
        console.log('Result: Sandbox successfully blocked the escape!');
    }
}

manualTest();
