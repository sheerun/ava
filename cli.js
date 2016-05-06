#!/usr/bin/env node


var debug = require('./vendor/node_modules/debug')('ava');


var resolveCwd = require('./vendor/node_modules/resolve-cwd');
var localCLI = resolveCwd('ava/cli');

if (localCLI && localCLI !== __filename) {
	debug('Using local install of AVA');
	require(localCLI);
	return;}


if (debug.enabled) {
	require('./vendor/node_modules/time-require');}


var updateNotifier = require('./vendor/node_modules/update-notifier');
var figures = require('./vendor/node_modules/figures');
var arrify = require('./vendor/node_modules/arrify');
var meow = require('./vendor/node_modules/meow');
var Promise = require('./vendor/node_modules/bluebird');
var pkgConf = require('./vendor/node_modules/pkg-conf');
var chalk = require('./vendor/node_modules/chalk');
var isCi = require('./vendor/node_modules/is-ci');
var colors = require('./lib/colors');
var verboseReporter = require('./lib/reporters/verbose');
var miniReporter = require('./lib/reporters/mini');
var tapReporter = require('./lib/reporters/tap');
var Logger = require('./lib/logger');
var Watcher = require('./lib/watcher');
var Api = require('./api');


Promise.longStackTraces();

var conf = pkgConf.sync('ava', { 
	defaults: { 
		babel: 'default' } });




var isValidShortcut = ['default', 'inherit'].indexOf(conf.babel) !== -1;

if (!conf.babel || typeof conf.babel === 'string' && !isValidShortcut) {
	var message = '';
	message += 'Unexpected Babel configuration for AVA. ';
	message += 'See ' + chalk.underline('https://github.com/sindresorhus/ava#es2015-support') + ' for allowed values.';

	console.log('\n  ' + colors.error(figures.cross) + ' ' + message);
	process.exit(1);}


var cli = meow([
'Usage', 
'  ava [<file|directory|glob> ...]', 
'', 
'Options', 
'  --init           Add AVA to your project', 
'  --fail-fast      Stop after first test failure', 
'  --serial, -s     Run tests serially', 
'  --require, -r    Module to preload (Can be repeated)', 
'  --tap, -t        Generate TAP output', 
'  --verbose, -v    Enable verbose output', 
'  --no-cache       Disable the transpiler cache', 
'  --match, -m      Only run tests with matching title (Can be repeated)', 
'  --watch, -w      Re-run tests when tests and source files change', 
'  --source, -S     Pattern to match source files so tests can be re-run (Can be repeated)', 
'  --timeout, -T    Set global timeout', 
'', 
'Examples', 
'  ava', 
'  ava test.js test2.js', 
'  ava test-*.js', 
'  ava test', 
'  ava --init', 
'  ava --init foo.js', 
'', 
'Default patterns when no arguments:', 
'test.js test-*.js test/**/*.js'], 
{ 
	string: [
	'_', 
	'require', 
	'timeout', 
	'source', 
	'match'], 

	boolean: [
	'fail-fast', 
	'verbose', 
	'serial', 
	'tap', 
	'watch'], 

	default: conf, 
	alias: { 
		t: 'tap', 
		v: 'verbose', 
		r: 'require', 
		s: 'serial', 
		m: 'match', 
		w: 'watch', 
		S: 'source', 
		T: 'timeout' } });



updateNotifier({ pkg: cli.pkg }).notify();

if (cli.flags.init) {
	require('./vendor/node_modules/ava-init')();
	return;}


var api = new Api({ 
	failFast: cli.flags.failFast, 
	serial: cli.flags.serial, 
	require: arrify(cli.flags.require), 
	cacheEnabled: cli.flags.cache !== false, 
	explicitTitles: cli.flags.watch, 
	match: arrify(cli.flags.match), 
	babelConfig: conf.babel, 
	timeout: cli.flags.timeout });


var reporter;

if (cli.flags.tap) {
	reporter = tapReporter();} else 
if (cli.flags.verbose || isCi) {
	reporter = verboseReporter();} else 
{
	reporter = miniReporter();}


reporter.api = api;
var logger = new Logger(reporter);

logger.start();

api.on('test', logger.test);
api.on('error', logger.unhandledError);

api.on('stdout', logger.stdout);
api.on('stderr', logger.stderr);

var files = cli.input.length ? cli.input : arrify(conf.files);
if (files.length === 0) {
	files = [
	'test.js', 
	'test-*.js', 
	'test'];}



if (cli.flags.watch) {
	try {
		var watcher = new Watcher(logger, api, files, arrify(cli.flags.source));
		watcher.observeStdin(process.stdin);} 
	catch (err) {
		if (err.name === 'AvaError') {

			console.log('  ' + colors.error(figures.cross) + ' ' + err.message);
			logger.exit(1);} else 
		{

			throw err;}}} else 


{
	api.run(files).
	then(function () {
		logger.finish();
		logger.exit(api.failCount > 0 || api.rejectionCount > 0 || api.exceptionCount > 0 ? 1 : 0);}).

	catch(function (err) {


		setImmediate(function () {
			throw err;});});}