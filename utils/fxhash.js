/**
 * Standalone generative runtime: provides window.$fx and globals used by params.js.
 * Compatible with the fx(params) subset used here (hash, rand, select params, features, preview).
 * PRNG matches the former fxhash snippet (hash → four uint32 → U()).
 */
(function () {
	"use strict";

	var BASE58 =
		"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

	function randomDefaultHash() {
		return (
			"oo" +
			Array.from({ length: 49 }, function () {
				return BASE58[(Math.random() * BASE58.length) | 0];
			}).join("")
		);
	}

	function randomTezosAddress() {
		return (
			"tz1" +
			Array.from({ length: 33 }, function () {
				return BASE58[(Math.random() * BASE58.length) | 0];
			}).join("")
		);
	}

	function isBase58Len36(t) {
		if (t.length !== 36) return false;
		for (var i = 0; i < t.length; i++) {
			if (BASE58.indexOf(t[i]) === -1) return false;
		}
		return true;
	}

	function isEthAddress(t) {
		return /^(0x)?[0-9a-fA-F]{40}$/.test(t);
	}

	function isLongHex(t) {
		return /^(0x)?([A-Fa-f0-9]{64})$/.test(t);
	}

	function b58ChunkVal(chunk) {
		var acc = 0;
		for (var i = 0; i < chunk.length; i++) {
			acc = (acc * BASE58.length + BASE58.indexOf(chunk[i])) | 0;
		}
		return acc;
	}

	function splitChunks(str, start, mapFn) {
		var rest = str.slice(start);
		var chunkLen = rest.length >> 2;
		var re = new RegExp(".{" + chunkLen + "}", "g");
		var parts = rest.match(re);
		if (!parts) return [0, 0, 0, 0];
		return parts.map(mapFn);
	}

	function parseHashToUint32(hashStr) {
		if (isLongHex(hashStr) || isEthAddress(hashStr)) {
			return splitChunks(hashStr, 2, function (h) {
				return parseInt(h, 16) | 0;
			});
		}
		if (isBase58Len36(hashStr)) {
			return splitChunks(hashStr, 3, b58ChunkVal);
		}
		return splitChunks(hashStr, 2, b58ChunkVal);
	}

	function prngFromState(state) {
		var a = state[0] | 0;
		var b = state[1] | 0;
		var c = state[2] | 0;
		var d = state[3] | 0;
		return function () {
			a |= 0;
			b |= 0;
			c |= 0;
			d |= 0;
			var t = (a + b | 0) + d | 0;
			d = (d + 1) | 0;
			a = b ^ (b >>> 9);
			b = c + (c << 3) | 0;
			c = (c << 21) | (c >>> 11);
			c = c + t | 0;
			return (t >>> 0) / 4294967296;
		};
	}

	function makeRand(seedStr, assign) {
		var state = parseHashToUint32(seedStr);
		var fn = prngFromState(state);
		fn.reset = function () {
			makeRand(seedStr, assign);
		};
		assign(fn);
		return fn;
	}

	var search = new URLSearchParams(window.location.search);
	var hash = search.get("fxhash") || randomDefaultHash();
	var minter = search.get("fxminter") || randomTezosAddress();
	var iteration = Number(search.get("fxiteration")) || 1;
	var context = search.get("fxcontext") || "standalone";
	var isPreview = search.get("preview") === "1";

	var $fx = {
		_version: "standalone-1.0.0",
		hash: hash,
		minter: minter,
		iteration: iteration,
		context: context,
		isPreview: isPreview,
		_params: [],
		_rawValues: {},
		_paramValues: {},
		_features: undefined,

		params: function (definitions) {
			var self = this;
			this._params = definitions.map(function (d) {
				return Object.assign({}, d, { version: self._version });
			});
			this._rawValues = {};
			for (var i = 0; i < this._params.length; i++) {
				var param = this._params[i];
				if (param.type === "select") {
					var opts =
						param.options && param.options.options
							? param.options.options
							: [];
					var val;
					if (typeof param.default !== "undefined") {
						val = param.default;
					} else if (opts.length > 0) {
						var idx = Math.floor(this.rand() * opts.length) % opts.length;
						val = opts[idx];
					} else {
						val = undefined;
					}
					this._rawValues[param.id] = val;
				}
			}
			this._paramValues = Object.assign({}, this._rawValues);
		},

		features: function (obj) {
			this._features = obj;
		},

		getFeature: function (id) {
			return this._features && this._features[id];
		},

		getFeatures: function () {
			return this._features;
		},

		getParam: function (id) {
			return this._paramValues[id];
		},

		getParams: function () {
			return this._paramValues;
		},

		getRawParam: function (id) {
			return this._rawValues[id];
		},

		getRawParams: function () {
			return this._rawValues;
		},

		getDefinitions: function () {
			return this._params;
		},

		preview: function () {},
	};

	makeRand(hash, function (fn) {
		$fx.rand = fn;
	});
	makeRand(minter, function (fn) {
		$fx.randminter = fn;
	});

	window.$fx = $fx;
})();
