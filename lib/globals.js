'use strict';



var x = module.exports;

x.now = Date.now;

x.setTimeout = setTimeout;

x.clearTimeout = clearTimeout;

x.setImmediate = require('../vendor/node_modules/set-immediate-shim');

x.options = {};