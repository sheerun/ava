'use strict';
var path = require('path');
var chalk = require('./vendor/node_modules/chalk');
var serializeError = require('./lib/serialize-error');
var globals = require('./lib/globals');
var Runner = require('./lib/runner');
var send = require('./lib/send');


require('./lib/test-worker').avaRequired = true;

var opts = globals.options;
var runner = new Runner({ 
	serial: opts.serial, 
	bail: opts.failFast, 
	match: opts.match });



var isForked = typeof process.send === 'function';

if (!isForked) {
	var fp = path.relative('.', process.argv[1]);

	console.log();
	console.error('Test files must be run with the AVA CLI:\n\n    ' + chalk.grey.dim('$') + ' ' + chalk.cyan('ava ' + fp) + '\n');

	process.exit(1);}




var isFailed = false;

Error.stackTraceLimit = Infinity;

function test(props) {
	if (isFailed) {
		return;}


	var hasError = typeof props.error !== 'undefined';


	if (!hasError && props.type !== 'test') {
		return;}


	if (hasError) {
		props.error = serializeError(props.error);} else 
	{
		props.error = null;}


	send('test', props);

	if (hasError && opts.failFast) {
		isFailed = true;
		exit();}}



function exit() {
	var stats = runner._buildStats();

	send('results', { 
		stats: stats });}



globals.setImmediate(function () {
	var hasExclusive = runner.tests.hasExclusive;
	var numberOfTests = runner.tests.tests.concurrent.length + runner.tests.tests.serial.length;

	if (numberOfTests === 0) {
		send('no-tests', { avaRequired: true });
		return;}


	send('stats', { 
		testCount: numberOfTests, 
		hasExclusive: hasExclusive });


	runner.on('test', test);

	process.on('ava-run', function (options) {
		runner.run(options).then(exit);});


	process.on('ava-init-exit', function () {
		exit();});});



module.exports = runner.test;




module.exports.default = runner.test;