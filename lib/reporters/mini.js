'use strict';
var StringDecoder = require('string_decoder').StringDecoder;
var cliCursor = require('../../vendor/node_modules/cli-cursor');
var lastLineTracker = require('../../vendor/node_modules/last-line-stream/tracker');
var plur = require('../../vendor/node_modules/plur');
var spinners = require('../../vendor/node_modules/cli-spinners');
var chalk = require('../../vendor/node_modules/chalk');
var cliTruncate = require('../../vendor/node_modules/cli-truncate');
var colors = require('../colors');
var cross = require('../../vendor/node_modules/figures').cross;

chalk.enabled = true;
Object.keys(colors).forEach(function (key) {
	colors[key].enabled = true;});


function MiniReporter() {
	if (!(this instanceof MiniReporter)) {
		return new MiniReporter();}


	var spinnerDef = spinners.dots;
	this.spinnerFrames = spinnerDef.frames.map(function (c) {
		return chalk.gray.dim(c);});

	this.spinnerInterval = spinnerDef.interval;

	this.reset();
	this.stream = process.stderr;
	this.stringDecoder = new StringDecoder();}


module.exports = MiniReporter;

MiniReporter.prototype.start = function () {
	var self = this;

	this.interval = setInterval(function () {
		self.spinnerIndex = (self.spinnerIndex + 1) % self.spinnerFrames.length;
		self.write(self.prefix());}, 
	this.spinnerInterval);

	return this.prefix('');};


MiniReporter.prototype.reset = function () {
	this.clearInterval();
	this.passCount = 0;
	this.failCount = 0;
	this.skipCount = 0;
	this.todoCount = 0;
	this.rejectionCount = 0;
	this.exceptionCount = 0;
	this.currentStatus = '';
	this.currentTest = '';
	this.statusLineCount = 0;
	this.spinnerIndex = 0;
	this.lastLineTracker = lastLineTracker();};


MiniReporter.prototype.spinnerChar = function () {
	return this.spinnerFrames[this.spinnerIndex];};


MiniReporter.prototype.clearInterval = function () {
	clearInterval(this.interval);
	this.interval = null;};


MiniReporter.prototype.test = function (test) {
	if (test.todo) {
		this.todoCount++;} else 
	if (test.skip) {
		this.skipCount++;} else 
	if (test.error) {
		this.failCount++;} else 
	{
		this.passCount++;}


	if (test.todo || test.skip) {
		return;}


	return this.prefix(this._test(test));};


MiniReporter.prototype.prefix = function (str) {
	str = str || this.currentTest;
	this.currentTest = str;


	return ' \n ' + this.spinnerChar() + ' ' + str;};


MiniReporter.prototype._test = function (test) {
	var SPINNER_WIDTH = 3;
	var PADDING = 1;
	var title = cliTruncate(test.title, process.stdout.columns - SPINNER_WIDTH - PADDING);

	if (test.error) {
		title = colors.error(test.title);}


	return title + '\n' + this.reportCounts();};


MiniReporter.prototype.unhandledError = function (err) {
	if (err.type === 'exception') {
		this.exceptionCount++;} else 
	{
		this.rejectionCount++;}};



MiniReporter.prototype.reportCounts = function () {
	var status = '';

	if (this.passCount > 0) {
		status += '\n   ' + colors.pass(this.passCount, 'passed');}


	if (this.failCount > 0) {
		status += '\n   ' + colors.error(this.failCount, 'failed');}


	if (this.skipCount > 0) {
		status += '\n   ' + colors.skip(this.skipCount, 'skipped');}


	if (this.todoCount > 0) {
		status += '\n   ' + colors.todo(this.todoCount, 'todo');}


	return status;};


MiniReporter.prototype.finish = function () {
	this.clearInterval();

	var status = this.reportCounts();

	if (this.rejectionCount > 0) {
		status += '\n   ' + colors.error(this.rejectionCount, plur('rejection', this.rejectionCount));}


	if (this.exceptionCount > 0) {
		status += '\n   ' + colors.error(this.exceptionCount, plur('exception', this.exceptionCount));}


	var i = 0;

	if (this.failCount > 0) {
		this.api.errors.forEach(function (test) {
			if (!test.error || !test.error.message) {
				return;}


			i++;

			var title = test.error ? test.title : 'Unhandled Error';
			var description;

			if (test.error) {
				description = '  ' + test.error.message + '\n  ' + stripFirstLine(test.error.stack);} else 
			{
				description = JSON.stringify(test);}


			status += '\n\n  ' + colors.error(i + '.', title) + '\n';
			status += colors.stack(description);});}



	if (this.rejectionCount > 0 || this.exceptionCount > 0) {
		this.api.errors.forEach(function (err) {
			if (err.title) {
				return;}


			i++;

			if (err.type === 'exception' && err.name === 'AvaError') {
				status += '\n\n  ' + colors.error(cross + ' ' + err.message) + '\n';} else 
			{
				var title = err.type === 'rejection' ? 'Unhandled Rejection' : 'Uncaught Exception';
				var description = err.stack ? err.stack : JSON.stringify(err);

				status += '\n\n  ' + colors.error(i + '.', title) + '\n';
				status += '  ' + colors.stack(description);}});}




	if (this.failCount === 0 && this.rejectionCount === 0 && this.exceptionCount === 0) {
		status += '\n';}


	return status;};


MiniReporter.prototype.write = function (str) {
	cliCursor.hide();
	this.currentStatus = str;
	this._update();
	this.statusLineCount = this.currentStatus.split('\n').length;};


MiniReporter.prototype.stdout = MiniReporter.prototype.stderr = function (data) {
	this._update(data);};


MiniReporter.prototype._update = function (data) {
	var str = '';
	var ct = this.statusLineCount;
	var columns = process.stdout.columns;
	var lastLine = this.lastLineTracker.lastLine();


	lastLine = lastLine.substring(lastLine.length - lastLine.length % columns);


	if (lastLine.length) {
		ct++;}



	str += eraseLines(ct);


	str += lastLine;

	if (str.length) {
		this.stream.write(str);}


	if (data) {

		this.lastLineTracker.update(this.stringDecoder.write(data));
		this.stream.write(data);}


	var currentStatus = this.currentStatus;

	if (currentStatus.length) {
		lastLine = this.lastLineTracker.lastLine();



		if (lastLine.length % columns) {
			currentStatus = '\n' + currentStatus;}


		this.stream.write(currentStatus);}};




var CSI = '\u001b[';
var ERASE_LINE = CSI + '2K';
var CURSOR_TO_COLUMN_0 = CSI + '0G';
var CURSOR_UP = CSI + '1A';


function eraseLines(count) {
	var clear = '';

	for (var i = 0; i < count; i++) {
		clear += ERASE_LINE + (i < count - 1 ? CURSOR_UP : '');}


	if (count) {
		clear += CURSOR_TO_COLUMN_0;}


	return clear;}


function stripFirstLine(message) {
	return message.replace(/^[^\n]*\n/, '');}