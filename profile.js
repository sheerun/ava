'use strict';





var path = require('path');
var EventEmitter = require('events').EventEmitter;
var meow = require('./vendor/node_modules/meow');
var Promise = require('./vendor/node_modules/bluebird');
var pkgConf = require('./vendor/node_modules/pkg-conf');
var arrify = require('./vendor/node_modules/arrify');
var findCacheDir = require('./vendor/node_modules/find-cache-dir');
var uniqueTempDir = require('./vendor/node_modules/unique-temp-dir');
var CachingPrecompiler = require('./lib/caching-precompiler');
var globals = require('./lib/globals');


globals.setTimeout = setTimeout.bind(null);
globals.clearTimeout = clearTimeout.bind(null);

Promise.longStackTraces();

var conf = pkgConf.sync('ava', { 
	defaults: { 
		babel: 'default' } });




var cli = meow([
'Usage', 
'  $ iron-node node_modules/ava/profile.js <test-file>', 
'', 
'Options', 
'  --fail-fast    Stop after first test failure', 
'  --serial, -s   Run tests serially', 
'  --require, -r  Module to preload (Can be repeated)', 
''], 
{ 
	string: [
	'_', 
	'require'], 

	boolean: [
	'fail-fast', 
	'verbose', 
	'serial', 
	'tap'], 

	default: conf, 
	alias: { 
		r: 'require', 
		s: 'serial' } });



if (cli.input.length !== 1) {
	throw new Error('Specify a test file');}


var file = path.resolve(cli.input[0]);
var cacheDir = findCacheDir({ name: 'ava', files: [file] }) || uniqueTempDir();
var opts = { 
	file: file, 
	failFast: cli.flags.failFast, 
	serial: cli.flags.serial, 
	require: arrify(cli.flags.require), 
	tty: false, 
	cacheDir: cacheDir, 
	precompiled: new CachingPrecompiler(cacheDir, conf.babel).generateHashForFile(file) };


var events = new EventEmitter();


process.send = function (data) {
	if (data && data.ava) {
		var name = data.name.replace(/^ava-/, '');

		if (events.listenerCount(name)) {
			events.emit(name, data.data);} else 
		{
			console.log('UNHANDLED AVA EVENT:', name, data.data);}


		return;}


	console.log('NON AVA EVENT:', data);};


events.on('test', function (data) {
	console.log('TEST:', data.title, data.error);});


events.on('results', function (data) {
	console.profileEnd();
	console.log('RESULTS:', data.stats);});


events.on('stats', function () {
	setImmediate(function () {
		process.emit('ava-run');});});




process.argv[2] = JSON.stringify(opts);
process.argv.length = 3;

console.profile('AVA test-worker process');

setImmediate(function () {
	require('./lib/test-worker');});