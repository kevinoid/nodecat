#!/usr/bin/env node
/**
 * Executable nodecat command.
 *
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module nodecat/bin/nodecat.js
 */

'use strict';

const assert = require('assert');

// https://github.com/import-js/eslint-plugin-import/issues/2844
// eslint-disable-next-line import/extensions
const nodecat = require('..');

function usage() {
  return 'usage: nodecat [-u] [file...]\n';
}

function parseArgs(args) {
  let dashdash = false;

  return args.slice(2).filter((arg) => {
    if (dashdash || arg === '-' || arg[0] !== '-') {
      // Non-option argument
      return true;
    }

    if (arg === '--') {
      // XBD non-option argument delimiter
      dashdash = true;
      return false;
    }

    if (/^-u+$/.test(arg)) {
      // POSIX/SUSv3 -u unbuffered I/O option
      // Node output is already unbuffered, so -u option is ignored
      return false;
    }

    throw new Error(`illegal option -- ${arg}`);
  });
}

/** Options for command entry points.
 *
 * @typedef {{
 *   inStream: (module:stream.Readable|undefined),
 *   outStream: (module:stream.Writable|undefined),
 *   errStream: (module:stream.Writable|undefined)
 * }} CommandOptions
 * @property {module:stream.Readable=} inStream Stream from which the file
 * named '-' (also the default if no file names are given) is read.
 * (default: <code>process.stdin</code>)
 * @property {module:stream.Writable=} outStream Stream to which output is
 * written.  (default: <code>process.stdout</code>)
 * @property {module:stream.Writable=} errStream Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/**
 * Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=} callback Callback for the exit code or
 * an <code>Error</code>.  Required if <code>global.Promise</code> is not
 * defined.
 * @returns {Promise<number>|undefined} If <code>callback</code> is not given
 * and <code>global.Promise</code> is defined, a <code>Promise</code> with the
 * exit code or <code>Error</code>.
 */
function nodecatCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (!callback && typeof Promise === 'function') {
    return new Promise((resolve, reject) => {
      nodecatCmd(args, options, (err, result) => {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = {
      inStream: (options && options.inStream) || process.stdin,
      outStream: (options && options.outStream) || process.stdout,
      errStream: (options && options.errStream) || process.stderr,
    };

    if (!options.inStream || typeof options.inStream.pipe !== 'function') {
      throw new TypeError('options.inStream must be a stream.Readable');
    }
    if (!options.outStream || typeof options.outStream.write !== 'function') {
      throw new TypeError('options.outStream must be a stream.Writable');
    }
    if (!options.errStream || typeof options.errStream.write !== 'function') {
      throw new TypeError('options.errStream must be a stream.Writable');
    }
  } catch (err) {
    queueMicrotask(() => {
      callback(err);
    });
    return undefined;
  }

  let fileNames;
  try {
    fileNames = parseArgs(args);
  } catch (errArgs) {
    options.errStream.write(`nodecat: ${errArgs.message}\n${usage()}`);
    // Use null to preserve existing behavior
    // eslint-disable-next-line unicorn/no-null
    queueMicrotask(() => { callback(null, 1); });
    return undefined;
  }

  if (fileNames.length === 0) {
    // Process stdin by default
    fileNames = ['-'];
  }

  const catOptions = {
    errStream: options.errStream,
    fileStreams: {
      '-': options.inStream,
    },
    outStream: options.outStream,
  };
  nodecat(fileNames, catOptions, (err) => {
    // Note:  Error message, if any, was printed when it occurred
    // Use null to preserve existing behavior
    // eslint-disable-next-line unicorn/no-null
    callback(null, err ? 1 : 0);
  });
  return undefined;
}

module.exports = nodecatCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  const mainOptions = {
    inStream: process.stdin,
    outStream: process.stdout,
    errStream: process.stderr,
  };
  nodecatCmd(process.argv, mainOptions, (err, code) => {
    assert.ifError(err);
    process.exit(code);
  });
}
