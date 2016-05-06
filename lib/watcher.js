'use strict';
var nodePath = require('path');
var debug = require('../vendor/node_modules/debug')('ava:watcher');
var diff = require('../vendor/node_modules/arr-diff');
var flatten = require('../vendor/node_modules/arr-flatten');
var union = require('../vendor/node_modules/array-union');
var uniq = require('../vendor/node_modules/array-uniq');
var defaultIgnore = require('../vendor/node_modules/ignore-by-default').directories();
var multimatch = require('../vendor/node_modules/multimatch');
var slash = require('../vendor/node_modules/slash');
var AvaError = require('./ava-error');

function requireChokidar() {
	try {
		return require('chokidar');} 
	catch (err) {
		throw new AvaError('The optional dependency chokidar failed to install and is required for --watch. Chokidar is likely not supported on your platform.');}}



function rethrowAsync(err) {


	setImmediate(function () {
		throw err;});}





var matchable = process.platform === 'win32' ? slash : function (path) {
	return path;};


function Watcher(logger, api, files, sources) {
	this.debouncer = new Debouncer(this);

	this.isTest = makeTestMatcher(files, api.excludePatterns);
	this.run = function (specificFiles) {
		logger.reset();

		var runOnlyExclusive = false;

		if (specificFiles) {
			var exclusiveFiles = specificFiles.filter(function (file) {
				return this.filesWithExclusiveTests.indexOf(file) !== -1;}, 
			this);

			runOnlyExclusive = exclusiveFiles.length !== this.filesWithExclusiveTests.length;

			if (runOnlyExclusive) {


				var remainingFiles = diff(specificFiles, exclusiveFiles);
				specificFiles = this.filesWithExclusiveTests.concat(remainingFiles);}}



		this.busy = api.run(specificFiles || files, { 
			runOnlyExclusive: runOnlyExclusive }).
		then(function () {
			logger.finish();}, 
		rethrowAsync);};


	this.testDependencies = [];
	this.trackTestDependencies(api, sources);

	this.filesWithExclusiveTests = [];
	this.trackExclusivity(api);

	this.dirtyStates = {};
	this.watchFiles(files, sources);
	this.rerunAll();}


module.exports = Watcher;

Watcher.prototype.watchFiles = function (files, sources) {
	var self = this;
	var patterns = getChokidarPatterns(files, sources);

	requireChokidar().watch(patterns.paths, { 
		ignored: patterns.ignored, 
		ignoreInitial: true }).
	on('all', function (event, path) {
		if (event === 'add' || event === 'change' || event === 'unlink') {
			debug('Detected %s of %s', event, path);
			self.dirtyStates[path] = event;
			self.debouncer.debounce();}});};




Watcher.prototype.trackTestDependencies = function (api, sources) {
	var self = this;
	var isSource = makeSourceMatcher(sources);
	var cwd = process.cwd();

	var relative = function (absPath) {
		return nodePath.relative(cwd, absPath);};


	api.on('dependencies', function (file, dependencies) {
		var sourceDeps = dependencies.map(relative).filter(isSource);
		self.updateTestDependencies(file, sourceDeps);});};



Watcher.prototype.updateTestDependencies = function (file, sources) {
	if (sources.length === 0) {
		this.testDependencies = this.testDependencies.filter(function (dep) {
			return dep.file !== file;});


		return;}


	var isUpdate = this.testDependencies.some(function (dep) {
		if (dep.file !== file) {
			return false;}


		dep.sources = sources;

		return true;});


	if (!isUpdate) {
		this.testDependencies.push(new TestDependency(file, sources));}};



Watcher.prototype.trackExclusivity = function (api) {
	var self = this;

	api.on('stats', function (stats) {
		self.updateExclusivity(stats.file, stats.hasExclusive);});};



Watcher.prototype.updateExclusivity = function (file, hasExclusiveTests) {
	var index = this.filesWithExclusiveTests.indexOf(file);

	if (hasExclusiveTests && index === -1) {
		this.filesWithExclusiveTests.push(file);} else 
	if (!hasExclusiveTests && index !== -1) {
		this.filesWithExclusiveTests.splice(index, 1);}};



Watcher.prototype.cleanUnlinkedTests = function (unlinkedTests) {
	unlinkedTests.forEach(function (testFile) {
		this.updateTestDependencies(testFile, []);
		this.updateExclusivity(testFile, false);}, 
	this);};


Watcher.prototype.observeStdin = function (stdin) {
	var self = this;

	stdin.resume();
	stdin.setEncoding('utf8');

	stdin.on('data', function (data) {
		data = data.trim().toLowerCase();
		if (data !== 'r' && data !== 'rs') {
			return;}




		self.debouncer.cancel();
		self.busy.then(function () {


			self.debouncer.cancel();
			self.rerunAll();});});};




Watcher.prototype.rerunAll = function () {
	this.dirtyStates = {};
	this.run();};


Watcher.prototype.runAfterChanges = function () {
	var dirtyStates = this.dirtyStates;
	this.dirtyStates = {};

	var dirtyPaths = Object.keys(dirtyStates);
	var dirtyTests = dirtyPaths.filter(this.isTest);
	var dirtySources = diff(dirtyPaths, dirtyTests);
	var addedOrChangedTests = dirtyTests.filter(function (path) {
		return dirtyStates[path] !== 'unlink';});

	var unlinkedTests = diff(dirtyTests, addedOrChangedTests);

	this.cleanUnlinkedTests(unlinkedTests);

	if (unlinkedTests.length === dirtyPaths.length) {
		return;}


	if (dirtySources.length === 0) {

		this.run(addedOrChangedTests);
		return;}



	var testsBySource = dirtySources.map(function (path) {
		return this.testDependencies.filter(function (dep) {
			return dep.contains(path);}).
		map(function (dep) {
			debug('%s is a dependency of %s', path, dep.file);
			return dep.file;});}, 

	this).filter(function (tests) {
		return tests.length > 0;});




	if (testsBySource.length !== dirtySources.length) {
		debug('Sources remain that cannot be traced to specific tests. Rerunning all tests');
		this.run();
		return;}



	this.run(union(addedOrChangedTests, uniq(flatten(testsBySource))));};


function Debouncer(watcher) {
	this.watcher = watcher;
	this.timer = null;
	this.repeat = false;}


Debouncer.prototype.debounce = function () {
	if (this.timer) {
		this.again = true;
		return;}


	var self = this;

	var timer = this.timer = setTimeout(function () {
		self.watcher.busy.then(function () {


			if (self.timer !== timer) {
				return;}


			if (self.again) {
				self.timer = null;
				self.again = false;
				self.debounce();} else 
			{
				self.watcher.runAfterChanges();
				self.timer = null;
				self.again = false;}});}, 


	10);};


Debouncer.prototype.cancel = function () {
	if (this.timer) {
		clearTimeout(this.timer);
		this.timer = null;
		this.again = false;}};



function getChokidarPatterns(files, sources) {
	var paths = [];
	var ignored = [];

	sources.forEach(function (pattern) {
		if (pattern[0] === '!') {
			ignored.push(pattern.slice(1));} else 
		{
			paths.push(pattern);}});



	if (paths.length === 0) {
		paths = ['package.json', '**/*.js'];}


	paths = paths.concat(files);

	if (ignored.length === 0) {
		ignored = defaultIgnore;}


	return { 
		paths: paths, 
		ignored: ignored };}



function makeSourceMatcher(sources) {
	var patterns = sources;

	var hasPositivePattern = patterns.some(function (pattern) {
		return pattern[0] !== '!';});


	var hasNegativePattern = patterns.some(function (pattern) {
		return pattern[0] === '!';});



	if (!hasPositivePattern) {
		patterns = ['package.json', '**/*.js'].concat(patterns);}


	if (!hasNegativePattern) {
		patterns = patterns.concat(defaultIgnore.map(function (dir) {
			return '!' + dir + '/**/*';}));}



	return function (path) {


		if (/^\.\./.test(path)) {
			return false;}


		return multimatch(matchable(path), patterns).length === 1;};}



function makeTestMatcher(files, excludePatterns) {
	var initialPatterns = files.concat(excludePatterns);

	return function (path) {

		if (nodePath.extname(path) !== '.js' || nodePath.basename(path)[0] === '_') {
			return false;}



		if (multimatch(matchable(path), initialPatterns).length === 1) {
			return true;}



		var dirname = nodePath.dirname(path);
		if (dirname === '.') {
			return false;}




		var subpaths = dirname.split(nodePath.sep).reduce(function (subpaths, component) {
			var parent = subpaths[subpaths.length - 1];
			if (parent) {

				subpaths.push(parent + '/' + component);} else 
			{
				subpaths.push(component);}

			return subpaths;}, 
		[]);



		var recursivePatterns = subpaths.filter(function (subpath) {
			return multimatch(subpath, initialPatterns).length === 1;}).
		map(function (subpath) {

			return subpath + '/**/*.js';});




		return multimatch(matchable(path), recursivePatterns.concat(excludePatterns)).length === 1;};}



function TestDependency(file, sources) {
	this.file = file;
	this.sources = sources;}


TestDependency.prototype.contains = function (source) {
	return this.sources.indexOf(source) !== -1;};