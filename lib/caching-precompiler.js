'use strict';
var path = require('path');
var fs = require('fs');
var convertSourceMap = require('../vendor/node_modules/convert-source-map');
var cachingTransform = require('../vendor/node_modules/caching-transform');
var objectAssign = require('../vendor/node_modules/object-assign');
var stripBom = require('../vendor/node_modules/strip-bom');
var md5Hex = require('../vendor/node_modules/md5-hex');
var enhanceAssert = require('./enhance-assert');

function CachingPrecompiler(cacheDirPath, babelConfig) {
	if (!(this instanceof CachingPrecompiler)) {
		throw new TypeError('Class constructor CachingPrecompiler cannot be invoked without \'new\'');}


	this.babelConfig = babelConfig;
	this.cacheDirPath = cacheDirPath;
	this.fileHashes = {};

	Object.keys(CachingPrecompiler.prototype).forEach(function (name) {
		this[name] = this[name].bind(this);}, 
	this);

	this.transform = this._createTransform();}


module.exports = CachingPrecompiler;

CachingPrecompiler.prototype.precompileFile = function (filePath) {
	if (!this.fileHashes[filePath]) {
		var source = stripBom(fs.readFileSync(filePath));

		this.transform(source, filePath);}


	return this.fileHashes[filePath];};



CachingPrecompiler.prototype._factory = function () {
	this._init();

	return this._transform;};


CachingPrecompiler.prototype._init = function () {
	this.babel = require('../vendor/node_modules/babel-core');

	this.defaultPresets = [
	require('../vendor/node_modules/babel-preset-stage-2'), 
	require('../vendor/node_modules/babel-preset-es2015')];


	var transformRuntime = require('../vendor/node_modules/babel-plugin-transform-runtime');
	var rewriteBabelPaths = this._createRewritePlugin();
	var powerAssert = this._createEspowerPlugin();

	this.defaultPlugins = [
	powerAssert, 
	rewriteBabelPaths, 
	transformRuntime];};



CachingPrecompiler.prototype._transform = function (code, filePath, hash) {
	code = code.toString();

	var options = this._buildOptions(filePath, code);
	var result = this.babel.transform(code, options);


	var mapPath = path.join(this.cacheDirPath, hash + '.js.map');
	fs.writeFileSync(mapPath, JSON.stringify(result.map));










	var dirPath = path.dirname(filePath);
	var relativeMapPath = path.relative(dirPath, mapPath);
	var comment = convertSourceMap.generateMapFileComment(relativeMapPath);

	return result.code + '\n' + comment;};


CachingPrecompiler.prototype._buildOptions = function (filePath, code) {
	var options = { babelrc: false };

	if (!this.babelConfig || this.babelConfig === 'default') {
		objectAssign(options, { presets: this.defaultPresets });} else 
	if (this.babelConfig === 'inherit') {
		objectAssign(options, { babelrc: true });} else 
	{
		objectAssign(options, this.babelConfig);}


	var sourceMap = this._getSourceMap(filePath, code);

	objectAssign(options, { 
		inputSourceMap: sourceMap, 
		filename: filePath, 
		sourceMaps: true, 
		ast: false });


	options.plugins = (options.plugins || []).concat(this.defaultPlugins);

	return options;};


CachingPrecompiler.prototype._getSourceMap = function (filePath, code) {
	var sourceMap = convertSourceMap.fromSource(code);

	if (!sourceMap) {
		var dirPath = path.dirname(filePath);

		sourceMap = convertSourceMap.fromMapFileSource(code, dirPath);}


	if (sourceMap) {
		sourceMap = sourceMap.toObject();}


	return sourceMap;};


CachingPrecompiler.prototype._createRewritePlugin = function () {
	var wrapListener = require('../vendor/node_modules/babel-plugin-detective/wrap-listener');

	return wrapListener(this._rewriteBabelRuntimePaths, 'rewrite-runtime', { 
		generated: true, 
		require: true, 
		import: true });};



CachingPrecompiler.prototype._rewriteBabelRuntimePaths = function (path) {
	var isBabelPath = /^babel-runtime[\\\/]?/.test(path.node.value);

	if (path.isLiteral() && isBabelPath) {
		path.node.value = require.resolve(path.node.value);}};



CachingPrecompiler.prototype._createEspowerPlugin = function () {
	var createEspowerPlugin = require('../vendor/node_modules/babel-plugin-espower/create');


	return createEspowerPlugin(this.babel, { 
		patterns: enhanceAssert.PATTERNS });};



CachingPrecompiler.prototype._createTransform = function () {
	var dependencies = { 
		'babel-plugin-espower': require('../vendor/node_modules/babel-plugin-espower/package.json').version, 
		'ava': require('../package.json').version, 
		'babel-core': require('../vendor/node_modules/babel-core/package.json').version, 
		'babelConfig': this.babelConfig };


	var salt = new Buffer(JSON.stringify(dependencies));

	return cachingTransform({ 
		factory: this._factory, 
		cacheDir: this.cacheDirPath, 
		hash: this._generateHash, 
		salt: salt, 
		ext: '.js' });};



CachingPrecompiler.prototype._generateHash = function (code, filePath, salt) {
	var hash = md5Hex([code, filePath, salt]);
	this.fileHashes[filePath] = hash;

	return hash;};