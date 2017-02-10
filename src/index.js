if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

import chalk from 'chalk';
import NanoBuffer from 'nanobuffer';
import supportsColor from 'supports-color';
import util from 'util';

import { Transform, Writable } from 'stream';

/**
 * Contains a namespaced logger. The actual log functions are defined on the
 * Logger's prototype.
 *
 * Note that this is for internal use only and should not used publicly.
 */
class Logger extends Function {
	/**
	 * Constructs a new logger instance.
	 *
	 * @param {?String} [namespace] - The name for this logger instance.
	 * @param {?Logger} [parent] - The parent logger.
	 * @param {?String} [style] - The style for this namespace. Ultimately it's
	 * up to the theme as to how the namespace is styled.
	 * @access public
	 */
	constructor(namespace, parent = null, root = null, style = null) {
		const ns = (parent && parent._ns || []).concat(namespace);

		return Object.defineProperties(
			Object.setPrototypeOf(
				function createNamespace(namespace, style) {
					return new Logger(namespace, createNamespace, root, style);
				},
				Logger.prototype
			), {
				/**
				 * The actual log namespace used for filtering. Namespaces are
				 * separated by a colon (:).
				 * @type {String}
				 */
				_namespace: { writable: true, value: ns.join(':') },

				/**
				 * The style for the namespace. This value is either manually
				 * specified or automatically chosen.
				 * @type {String}
				 */
				_namespaceStyle: { value: style },

				/**
				 * An array of namespaces to make it easier when constructing a
				 * new namespace's name.
				 * @type {Array.<String>}
				 */
				_ns: { writable: true, value: ns },

				/**
				 * A reference to the parent logger. Used to construct the
				 * namespace.
				 * @type {?Logger}
				 */
				_parent: { writable: true, value: parent },

				/**
				 * A reference to the top-level SnoopLogg instance.
				 * @type {?SnoopLogg}
				 */
				_root: { value: root }
			}
		);
	}

	/**
	 * Determines if this logger is enabled based on the pattern set by
	 * `enabled()`.
	 * @type {Boolean}
	 */
	get enabled() {
		let root = this._root || this;

		const allow = root._allow;
		if (allow === null) {
			// all logging is silenced
			return false;
		}

		if (!this._namespace || allow === '*') {
			// nothing to filter
			return true;
		}

		const ignore = root._ignore;
		if (allow && allow.test(this._namespace) && (!ignore || !ignore.test(this._namespace))) {
			return true;
		}

		return false;
	}

	/**
	 * The fully resolved namespace including parent namespaces.
	 * @type {?String}
	 */
	get namespace() {
		return this._namespace || null;
	}
}

/**
 * Defines the global logger instance which added additional public APIs for
 * configuration and features.
 */
class SnoopLogg extends Logger {
	/**
	 * Generates a namespaces logger class with the `SnoopLogg` prototype and
	 * initializes its properties.
	 * @access public
	 */
	constructor() {
		return Object.defineProperties(
			Object.setPrototypeOf(
				function createNamespace(namespace) {
					return new Logger(namespace, createNamespace, createNamespace);
				},
				SnoopLogg.prototype
			), {
				/**
				 * A regex pattern of namespaces to match or the string `*` to
				 * allow all namespaces.
				 * @type {RegExp|String|null}
				 */
				_allow:  { writable: true, value: null },

				/**
				 * The log message buffer.
				 * @type {Array.<Object>}
				 */
				_buffer: { writable: true, value: new NanoBuffer(250) },

				/**
				 * An array of available colors to choose from when rendering
				 * auto-styled labels such as the namespace.
				 * @type {Array.<String>}
				 */
				_colors: { writable: true, value: ['blue', 'cyan', 'green', 'magenta', 'red', 'yellow'] },

				/**
				 * The default theme to apply if a stream didn't specify one.
				 * @type {String}
				 */
				_defaultTheme: { writable: true, value: 'standard' },

				/**
				 * A lazy unique identifier for this `SnoopLogg` instance. This
				 * is used to prevent this instance from processing it's own
				 * messages.
				 * @type {Number}
				 */
				_id: { value: Math.round(Math.random() * 1e9) },

				/**
				 * A regex pattern of namespaces to ignore.
				 * @type {RegExp|null}
				 */
				_ignore: { writable: true, value: null },

				/**
				 * A list of middlewares to call and process log messages prior
				 * to dispatching.
				 * @type {Array.<Function>}
				 */
				_middlewares: { value: [] },

				/**
				 * A list of objects containing the stream and theme name.
				 * @type {Array.<Object>}
				 */
				_streams: { value: [] },

				/**
				 * A map of style names and their functions.
				 * @type {Object}
				 */
				styles: { enumerable: true, value: {} },

				/**
				 * A list of themes and the function to apply them.
				 * @type {Object.<String,Function>}
				 */
				_themes: { value: {} },

				/**
				 * A map of all registered log types.
				 * @type {Object.<String, Number>}
				 */
				_types: { value: {} },

				/**
				 * Re-export of the `chalk` library.
				 * @type {Object}
				 */
				chalk: {
					enumerable: true,
					value: chalk
				},

				/**
				 * Re-export of the `humanize` library. Note that this library
				 * is lazy loaded.
				 * @type {Object}
				 */
				humanize: {
					configurable: true,
					enumerable: true,
					get: function () {
						const value = require('humanize');
						Object.defineProperty(this, 'humanize', {
							enumerable: true,
							value
						});
						return value;
					}
				},

				/**
				 * Re-export of the `moment` library. Note that this library
				 * is lazy loaded.
				 * @type {Object}
				 */
				moment: {
					configurable: true,
					enumerable: true,
					get: function () {
						const value = require('moment');
						Object.defineProperty(this, 'moment', {
							enumerable: true,
							value
						});
						return value;
					}
				},

				/**
				 * Re-export of the `figures` library, but named `symbols`.
				 * Note that this library is lazy loaded.
				 * @type {Object}
				 */
				symbols: {
					configurable: true,
					enumerable: true,
					get: function () {
						const value = require('figures');
						Object.defineProperty(this, 'symbols', {
							enumerable: true,
							value
						});
						return value;
					}
				}
			}
		);
	}

	/**
	 * Enables all namespaces effectively allowing all logging to be written to
	 * stdout/stderr.
	 *
	 * @returns {SnoopLogg}
	 * @access public
	 */
	get stdio() {
		return this.enable('*');
	}

	/**
	 * Allows settings to be changed.
	 *
	 * @param {Object} [opts] - Various options.
	 * @param {String|Array.<String>} [opts.colors] - An array or
	 * comma-separated list of colors to choose from when auto-styling.
	 * @param [opts.maxBufferSize] - The max buffer size.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	config(opts = {}) {
		if (!opts || typeof opts !== 'object') {
			throw new TypeError('Expected config options to be an object');
		}

		if (opts.colors) {
			if (typeof opts.colors !== 'string' && !Array.isArray(opts.colors)) {
				throw new TypeError('Expected colors to be a string or array');
			}
			this._colors = typeof opts.colors === 'string' ? opts.colors.split(',') : opts.colors;
		}

		if (opts.theme) {
			if (typeof opts.theme !== 'string') {
				throw new TypeError('Expected theme to be a string');
			}
			this._defaultTheme = opts.theme;
		}

		if (opts.hasOwnProperty('maxBufferSize')) {
			try {
				this._buffer.maxSize = opts.maxBufferSize;
			} catch (e) {
				let err = e;
				if (e instanceof TypeError) {
					err = new TypeError(`Invalid max buffer size: ${e.message}`);
				} else if (e instanceof RangeError) {
					err = new RangeError(`Invalid max buffer size: ${e.message}`);
				}
				throw err;
			}
		}

		return this;
	}

	/**
	 * Enables log output for the given pattern.
	 *
	 * @param {String} [pattern] - A string with one or more comma-separated
	 * namespaces to enable logging for. If the string is empty or null, then
	 * all log output will be silenced. If the pattern is `*`, then all log
	 * messages will be displayed.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	enable(pattern = '') {
		if (pattern && typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
			throw new TypeError('Expected pattern to be a string or regex');
		}

		this._allow = null;
		this._ignore = null;

		if (pattern === '*') {
			this._allow = '*';

		} else if (pattern instanceof RegExp) {
			this._allow = pattern;

		} else if (pattern) {
			const allows = [];
			const ignores = [];

			for (let p of pattern.split(/[\s,]+/)) {
				if (p) {
					p = p.replace(/\*/g, '.*?');
					if (p[0] === '-') {
						ignores.push(p.slice(1));
					} else {
						allows.push(p);
					}
				}
			}

			if (allows.length) {
				this._allow = new RegExp(`^(${allows.join('|')})$`);
			}
			if (ignores.length) {
				this._ignore = new RegExp(`^(${ignores.join('|')})$`);
			}
		}

		return this;
	}

	/**
	 * Registers a new log type.
	 *
	 * @param {String} name - The log type name.
	 * @param {Object} [opts] - Various options.
	 * @param {String} [opts.style] - The color to associate with this type.
	 * @param {String} [opts.label] - The label to display when print this type
	 * of log message.
	 * @param {Number} [opts.fd] - The file descriptor. Use `0` for stdout and
	 * `1` for stderr.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	type(name, opts = {}) {
		if (!name || typeof name !== 'string') {
			throw new TypeError('Expected name to be a non-empty string');
		}

		if (!opts || typeof opts !== 'object') {
			throw new TypeError('Expected opts to be an object');
		}

		const type = this._types[name] = {
			type:      name,
			typeStyle: opts.style,
			typeLabel: opts.label !== undefined ? opts.label : name,
			fd:        opts.fd || 0
		};

		if (!Object.getOwnPropertyDescriptor(Logger.prototype, name)) {
			// wire up the actual log type function
			// note: this has to use a getter so that `this` can be resolved at
			// runtime because if you `import { info } from 'SnoopLogg'`, `info()`
			// gets forced into the global context.
			Object.defineProperty(Logger.prototype, name, {
				enumerable: true,
				get: function () {
					const value = (...args) => {
						(this._root || this).dispatch({
							id: (this._root || this)._id,
							args,
							...type,
							ns: this._namespace,
							nsStyle: this._namespaceStyle,
							ts: new Date,
							enabled: this.enabled
						});
						return this;
					};
					Object.defineProperty(this, name, { enumerable: true, value });
					return value;
				}
			});
		}

		return this;
	}

	/**
	 * Registers a function that applies a theme to a message.
	 *
	 * @param {String} name - The name of the theme.
	 * @param {Function} fn - A function to call that applies the theme.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	theme(name, fn) {
		if (!name || typeof name !== 'string') {
			throw new TypeError('Expected name to be a string');
		}

		if (!fn || typeof fn !== 'function') {
			throw new TypeError('Expected fn to be a function');
		}

		this._themes[name] = fn.bind(this);

		return this;
	}

	/**
	 * Registers a function that applies a style to a message.
	 *
	 * @param {String} name - The name of the style.
	 * @param {Function} fn - A function to call that applies the style.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	style(name, fn) {
		if (!name || typeof name !== 'string') {
			throw new TypeError('Expected name to be a string');
		}

		if (!fn || typeof fn !== 'function') {
			throw new TypeError('Expected fn to be a function');
		}

		this.styles[name] = fn.bind(this);

		return this;
	}

	/**
	 * Adds a middleware function to the message dispatching system.
	 *
	 * @param {Function} middleware
	 * @param {Number} [priority=0]
	 * @returns {SnoopLogg}
	 * @access public
	 */
	use(middleware, priority = 0) {
		if (typeof middleware !== 'function') {
			throw new TypeError('Expected middleware to be a function');
		}

		if (typeof priority !== 'number') {
			throw new TypeError('Expected priority to be a number');
		}

		this._middlewares.push({ fn: middleware, priority });
		this._middlewares.sort((a, b) => b.priority - a.priority);

		return this;
	}

	/**
	 * Starts listenening for events from other SnoopLogg instances.
	 *
	 * @returns {SnoopLogg}
	 * @access public
	 */
	snoop() {
		this.unsnoop();

		this.onSnoopMessage = msg => {
			if (msg.id !== this._id) {
				this.dispatch(msg);
			}
		};

		process.on('snooplogg', this.onSnoopMessage);

		return this;
	}

	/**
	 * Stops listenening for events from other SnoopLogg instances.
	 *
	 * @returns {SnoopLogg}
	 * @access public
	 */
	unsnoop() {
		if (this.onSnoopMessage) {
			process.removeListener('snooplogg', this.onSnoopMessage);
		}
		return this;
	}

	/**
	 * Adds a stream to pipe log messages to.
	 *
	 * @param {stream.Writable} stream - The stream to pipe messages to.
	 * @param {Object} [opts] - Various options.
	 * @param {Boolean} [opts.flush=false] - When true, immediately flushes the
	 * buffer of log messages to the stream.
	 * @param {String} [opts.theme] - The theme to apply to all messages written
	 * to this stream.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	pipe(stream, opts = {}) {
		if (!stream) {
			throw new TypeError('Invalid stream');
		}

		if (opts && typeof opts !== 'object') {
			throw new TypeError('Expected options to be an object');
		}

		// don't add the stream twice
		for (const s of this._streams) {
			if (s.stream === stream) {
				return this;
			}
		}
		this._streams.push({ stream, theme: opts.theme });

		// flush the buffers
		if (opts.flush) {
			for (const msg of this._buffer) {
				if (msg.enabled) {
					msg.formatter = opts.theme && this._themes[opts.theme] || this._themes[this._defaultTheme];
					stream.write(stream._writableState && stream._writableState.objectMode ? msg : format(msg));
				}
			}
		}

		return this;
	}

	/**
	 * Stops piping messages to the specified stream.
	 *
	 * @param {stream.Writable} stream - The stream to no longer pipe messages to.
	 * @returns {SnoopLogg}
	 * @access public
	 */
	unpipe(stream) {
		if (!stream) {
			throw new TypeError('Invalid stream');
		}

		for (let i = 0; i < this._streams.length; i++) {
			if (this._streams[i].stream === stream) {
				this._streams.splice(i--, 1);
			}
		}

		return this;
	}

	/**
	 * Dispatches a message object through the middlewares, filters, and
	 * eventually to all output streams.
	 *
	 * @param {Object} msg - A message object.
	 * @param {Array} msg.args - An array of zero or more arguments that will be
	 * formatted into the final log message.
	 * @access private
	 */
	dispatch(msg) {
		if (!msg || typeof msg !== 'object') {
			return;
		}

		if (!Array.isArray(msg.args)) {
			throw new TypeError('Expected args to be an array');
		}

		// run all middleware
		for (const { fn } of this._middlewares) {
			msg = fn(msg) || msg;
		}

		// add the message to the buffer
		this._buffer.push(msg);

		if (msg.enabled) {
			for (const s of this._streams) {
				msg.formatter = this._themes[s.theme] || this._themes[this._defaultTheme];
				s.stream.write(s.stream._writableState && s.stream._writableState.objectMode ? msg : format(msg));
			}
		}

		if (msg.id === this._id) {
			process.emit('snooplogg', msg);
		}
	}

	/**
	 * Stylizes text.
	 *
	 * @param {String} style - A comma-separated list of styles to apply.
	 * @param {*} text - The string to stylize.
	 * @returns {String}
	 * @access private
	 */
	applyStyle(style, text) {
		if (style && text) {
			return style.split(',').reduce((text, style) => this.styles[style] ? this.styles[style](text) : text, String(text));
		}
		return text;
	}
}

/**
 * Applies the formatter to the message and returns the resulting string.
 *
 * @param {Object} msg - The message object
 * @returns {String}
 */
function format(msg) {
	if (msg && typeof msg === 'object' && !(msg instanceof Buffer)) {
		if (typeof msg.formatter === 'function') {
			return msg.formatter(msg);
		}
		return util.format.apply(null, msg.args) + '\n';
	}
	return String(msg);
}

/**
 * ANSI color sequence regex.
 * @type {RegExp}
 */
const stripRegExp = /\x1B\[\d+m/g;

/**
 * Transform stream that strips colors from the logger to the next stream in the
 * pipe.
 */
class StripColors extends Transform {
	_transform(msg, enc, cb) {
		if (msg && typeof msg === 'object') {
			this.push(format(msg).replace(stripRegExp, ''));
		} else {
			this.push(msg.toString().replace(stripRegExp, ''));
		}
		cb();
	}
}

/**
 * Helper stream that converts and formats the message object to a string. If
 * the message has already been converted to a string, then this simply passes
 * the text through.
 */
class Format extends Transform {
	constructor(opts = {}) {
		opts.objectMode = true;
		super(opts);
	}

	_transform(msg, enc, cb) {
		let message;

		if (msg && typeof msg === 'object' && !(msg instanceof Buffer)) {
			this.push(format(msg));
		} else {
			this.push(msg);
		}

		cb();
	}
}

/**
 * The default stream that writes log messages to stdio.
 */
class StdioStream extends Writable {
	constructor(opts = {}) {
		opts.objectMode = true;
		super(opts);

		if (supportsColor) {
			this.stdout = process.stdout;
			this.stderr = process.stderr;
		} else {
			(this.stdout = new StripColors).pipe(process.stdout);
			(this.stderr = new StripColors).pipe(process.stderr);
		}
	}

	_write(msg, enc, cb) {
		if (msg && typeof msg === 'object' && !(msg instanceof Buffer)) {
			if (msg.fd === 1) {
				this.stderr.write(format(msg));
			} else {
				this.stdout.write(format(msg));
			}
		} else {
			this.stdout.write(String(msg));
		}
		cb();
	}
}

function createInstanceWithDefaults() {
	return new SnoopLogg()
		.type('log',   { style: 'gray', label: null })
		.type('trace', { style: 'gray' })
		.type('debug', { style: 'magenta' })
		.type('info',  { style: 'green' })
		.type('warn',  { style: 'yellow',      fd: 1 })
		.type('error', { style: 'red',         fd: 1 })
		.type('fatal', { style: 'white,bgRed', fd: 1 })

		.style('bold',          chalk.bold)
		.style('dim',           chalk.dim)
		.style('italic',        chalk.italic)
		.style('underline',     chalk.underline)
		.style('inverse',       chalk.inverse)
		.style('hidden',        chalk.hidden)
		.style('strikethrough', chalk.strikethrough)

		.style('black',         chalk.black)
		.style('red',           chalk.red)
		.style('black',         chalk.black)
		.style('green',         chalk.green)
		.style('yellow',        chalk.yellow)
		.style('blue',          chalk.blue)
		.style('magenta',       chalk.magenta)
		.style('cyan',          chalk.cyan)
		.style('white',         chalk.white)
		.style('gray',          chalk.gray)

		.style('bgBlack',       chalk.bgBlack)
		.style('bgRed',         chalk.bgRed)
		.style('bgGreen',       chalk.bgGreen)
		.style('bgYellow',      chalk.bgYellow)
		.style('bgBlue',        chalk.bgBlue)
		.style('bgMagenta',     chalk.bgMagenta)
		.style('bgCyan',        chalk.bgCyan)
		.style('bgWhite',       chalk.bgWhite)

		.style('uppercase',     s => String(s).toUpperCase())
		.style('lowercase',     s => String(s).toLowerCase())
		.style('bracket',       s => `[${s}]`)
		.style('paren',         s => `(${s})`)
		.style('auto',          function (text) {
			let hash = 0;
			for (const i in text) {
				hash = (((hash << 5) - hash) + text.charCodeAt(i)) | 0;
			}
			const color = this._colors[Math.abs(hash) % this._colors.length];
			return this.styles[color](text);
		})

		.theme('detailed', function (msg) {
			const ns = this.applyStyle(msg.nsStyle || 'auto', msg.ns);
			const type = this.applyStyle(msg.typeStyle, msg.typeLabel);
			const prefix = this.applyStyle('magenta', msg.ts.toISOString()) + ' ' + (ns ? ns + ' ' : '') + (type ? type + ' ' : '');
			return util.format.apply(null, msg.args).split('\n').map(s => prefix + s).join('\n') + '\n';
		})
		.theme('standard', function (msg) {
			const ns = this.applyStyle(msg.nsStyle || 'auto', msg.ns);
			const type = this.applyStyle(msg.typeStyle, msg.typeLabel);
			const prefix = (ns ? ns + ' ' : '') + (type ? type + ' ' : '');
			return util.format.apply(null, msg.args).split('\n').map(s => prefix + s).join('\n') + '\n';
		})
		.theme('minimal', function (msg) {
			return util.format.apply(null, msg.args) + '\n';
		});
}

// create the global instance and wire up the built-in types
let instance = createInstanceWithDefaults()
	.enable(process.env.SNOOPLOGG || process.env.DEBUG)
	.pipe(new StdioStream, { flush: true });

// bind all methods to the main instance
for (const i of Object.getOwnPropertyNames(SnoopLogg.prototype)) {
	if (typeof SnoopLogg.prototype[i] === 'function') {
		instance[i] = instance[i].bind(instance);
	}
}

exports = module.exports = instance;

export default instance;

export { createInstanceWithDefaults, Format, Logger, SnoopLogg, StripColors };
