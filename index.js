/**
 * @copyright Copyright 2016-2020 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module nodecat
 */

'use strict';

const fs = require('fs');

/** Options for {@link nodecat}.
 *
 * @typedef {{
 *   fileStreams: (Object<string,!module:stream.Readable>|undefined),
 *   outStream: (module:stream.Writable|undefined),
 *   errStream: (module:stream.Writable|undefined)
 * }} NodecatOptions
 * @property {Object<string,!module:stream.Readable>=} fileStreams Mapping from
 * file names to readable streams which will be read for the named file.  If
 * the file appears multiple times, the stream is only read once.
 * @property {module:stream.Writable=} outStream Stream to which concatenated
 * output is written. (default: <code>process.stdout</code>)
 * @property {module:stream.Writable=} errStream Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 */
// var NodecatOptions;

/** Concatenate named files.
 *
 * @param {!Array<string>} fileNames Names of files to be concatenated, in the
 * order in which their content will appear.  Files may appear multiple times.
 * If the Array is empty, no output will be written.
 * @param {NodecatOptions=} options Options.
 * @param {?function(Error)=} callback Callback with the first
 * <code>Error</code> which occurred, if any.  Note that concatenation
 * continues after errors.  Required if <code>global.Promise</code> is not
 * defined.
 * @returns {Promise|undefined} If <code>callback</code> is not given and
 * <code>global.Promise</code> is defined, a <code>Promise</code> which
 * resolves once all output has been written.
 */
function nodecat(fileNames, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (!callback) {
    return new Promise((resolve, reject) => {
      nodecat(fileNames, options, (err, result) => {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  const callerStreamEnded = {};
  const callerStreams = (options && options.fileStreams) || {};
  const errStream = (options && options.errStream) || process.stderr;
  const outStream = (options && options.outStream) || process.stdout;

  try {
    if (!fileNames
        || typeof fileNames !== 'object'
        || fileNames.length !== Math.floor(fileNames.length)) {
      throw new TypeError('fileNames must be an Array-like object');
    }
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    if (typeof callerStreams !== 'object') {
      throw new TypeError('options.fileStreams must be an object');
    }
    if (typeof outStream.write !== 'function') {
      throw new TypeError('options.outStream must be a stream.Writable');
    }
    if (typeof errStream.write !== 'function') {
      throw new TypeError('options.errStream must be a stream.Writable');
    }
  } catch (err) {
    queueMicrotask(() => {
      callback(err);
    });
    return undefined;
  }

  // Errors encountered during this nodecat invocation
  const errors = [];

  // Cleanup function for the currently piping input stream
  let inCleanup;

  function allDone() {
    // eslint-disable-next-line no-use-before-define
    outStream.removeListener('error', onOutError);
    callback(
      // Use null for compatibility with previous versions
      // eslint-disable-next-line unicorn/no-null
      errors.length === 0 ? null
        : errors.length === 1 ? errors[0]
          : new AggregateError(
            errors,
            errors.map((err) => err.message).join('\n'),
          ),
    );
  }

  // Note:  src.unpipe is called by stream.Readable internals on dest 'error'
  function onOutError(err) {
    errors.push(err);
    errStream.write(`nodecat: ${err}\n`);
    if (inCleanup) {
      inCleanup();
    }
    allDone();
  }
  outStream.once('error', onOutError);

  let i = 0;
  function catNext() {
    if (i >= fileNames.length) {
      allDone();
      return;
    }

    const fileName = fileNames[i];
    i += 1;
    const callerStream = callerStreams[fileName];
    if (callerStream && callerStreamEnded[fileName]) {
      catNext();
      return;
    }

    const inStream = callerStream || fs.createReadStream(fileName);

    function done() {
      if (callerStream) {
        callerStreamEnded[fileName] = true;
      }
      inCleanup();
      catNext();
    }
    inStream.once('end', done);

    function onInError(err) {
      // Mark error with the name of the file which caused it
      err.fileName = fileName;
      errors.push(err);
      errStream.write(`nodecat: ${fileName}: ${err.message}\n`);
      // There is no way to know whether more data may be emitted.
      // To be safe, unpipe to prevent interleaving data after starting next.
      if (typeof inStream.unpipe === 'function') {
        inStream.unpipe(outStream);
      }
      done();
    }
    inStream.once('error', onInError);

    inCleanup = function cleanup() {
      inStream.removeListener('error', onInError);
      inStream.removeListener('end', done);
    };

    inStream.pipe(outStream, { end: false });
  }

  catNext();
  return undefined;
}

module.exports = nodecat;
