'use strict';
var opts = JSON.parse(process.argv[2]);
var testPath = opts.file;


if (opts.tty) {
	process.stdout.isTTY = true;
	process.stdout.columns = opts.tty.columns || 80;
	process.stdout.rows = opts.tty.rows;

	var tty = require('tty');
	var isatty = tty.isatty;

	tty.isatty = function (fd) {
		if (fd === 1 || fd === process.stdout) {
			return true;}


		return isatty(fd);};}



var path = require('path');
var fs = require('fs');
var debug = require('../vendor/node_modules/debug')('ava');
var sourceMapSupport = require('../vendor/node_modules/source-map-support');

if (debug.enabled) {


	if (opts._sorted) {
		process.argv.push('--sorted');}


	require('../vendor/node_modules/time-require');}



var globals = require('./globals');
globals.options = opts;
var Promise = require('../vendor/node_modules/bluebird');


Promise.longStackTraces();

(opts.require || []).forEach(require);

var sourceMapCache = Object.create(null);

sourceMapSupport.install({ 
	handleUncaughtExceptions: false, 
	retrieveSourceMap: function (source) {
		if (sourceMapCache[source]) {
			return { 
				url: source, 
				map: fs.readFileSync(sourceMapCache[source], 'utf8') };}} });





var loudRejection = require('../vendor/node_modules/loud-rejection/api')(process);
var serializeError = require('./serialize-error');
var send = require('./send');
var installPrecompiler = require('../vendor/node_modules/require-precompiled');
var cacheDir = opts.cacheDir;


exports.avaRequired = false;

installPrecompiler(function (filename) {
	var precompiled = opts.precompiled[filename];

	if (precompiled) {
		sourceMapCache[filename] = path.join(cacheDir, precompiled + '.js.map');
		return fs.readFileSync(path.join(cacheDir, precompiled + '.js'), 'utf8');}


	return null;});


var dependencies = [];
Object.keys(require.extensions).forEach(function (ext) {
	var wrappedHandler = require.extensions[ext];
	require.extensions[ext] = function (module, filename) {
		if (filename !== testPath) {
			dependencies.push(filename);}

		wrappedHandler(module, filename);};});



require(testPath);

process.on('uncaughtException', function (exception) {
	send('uncaughtException', { exception: serializeError(exception) });});



if (!exports.avaRequired) {
	send('no-tests', { avaRequired: false });}



process.on('message', function (message) {
	if (!message.ava) {
		return;}


	process.emit(message.name, message.data);});


process.on('ava-exit', function () {

	var delay = process.env.AVA_APPVEYOR ? 100 : 0;

	globals.setTimeout(function () {
		process.exit(0);}, 
	delay);});


var tearingDown = false;
process.on('ava-teardown', function () {

	if (tearingDown) {
		return;}

	tearingDown = true;

	var rejections = loudRejection.currentlyUnhandled();

	if (rejections.length === 0) {
		exit();
		return;}


	rejections = rejections.map(function (rejection) {
		return serializeError(rejection.reason);});


	send('unhandledRejections', { rejections: rejections });
	globals.setTimeout(exit, 100);});


function exit() {



	send('teardown', { dependencies: dependencies });}