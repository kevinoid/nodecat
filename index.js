/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var AggregateError = require('./lib/aggregate-error');
var fs = require('fs');

/** Combines one or more errors into a single error.
 *
 * @param {AggregateError|Error} errPrev Previous errors, if any.
 * @param {!Error} errNew New error.
 * @return {!AggregateError|!Error} Error which represents all errors that have
 * occurred.  If only one error has occurred, it will be returned.  Otherwise
 * an {@link AggregateError} including all previous errors will be returned.
 * @private
 */
function combineErrors(errPrev, errNew) {
  if (!errPrev) {
    return errNew;
  }

  var errCombined;
  if (errPrev instanceof AggregateError) {
    errCombined = errPrev;
  } else {
    errCombined = new AggregateError();
    errCombined.push(errPrev);
  }

  errCombined.push(errNew);
  return errCombined;
}

/** Options for {@link nodecat}.
 *
 * @typedef {{
 *   fileStreams: (Object<string,!stream.Readable>|undefined),
 *   outStream: (stream.Writable|undefined),
 *   errStream: (stream.Writable|undefined)
 * }} CommandOptions
 * @property {Object<string,!stream.Readable>=} fileStreams Mapping from file
 * names to readable streams which will be read for the named file.  If the
 * file appears multiple times, the stream is only read once.
 * @property {stream.Writable=} outStream Stream to which concatenated output
 * is written. (default: <code>process.stdout</code>)
 * @property {stream.Writable=} errStream Stream to which errors (and
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
 * @return {Promise|undefined} If <code>callback</code> is not given and
 * <code>global.Promise</code> is defined, a <code>Promise</code> which
 * resolves once all output has been written.
 */
function nodecat(fileNames, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback) {
    return new Promise((resolve, reject) => {
      nodecat(fileNames, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  var callerStreamEnded = {};
  var callerStreams = (options && options.fileStreams) || {};
  var errStream = (options && options.errStream) || process.stderr;
  var outStream = (options && options.outStream) || process.stdout;

  try {
    if (!fileNames ||
        typeof fileNames !== 'object' ||
        fileNames.length !== Math.floor(fileNames.length)) {
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
    process.nextTick(() => {
      callback(err);
    });
    return undefined;
  }

  // Error which will be returned from nodecat
  var errNodecat = null;
  // Cleanup function for the currently piping input stream
  var inCleanup;

  function allDone() {
    outStream.removeListener('error', onOutError);
    callback(errNodecat);
  }

  // Note:  src.unpipe is called by stream.Readable internals on dest 'error'
  function onOutError(err) {
    errNodecat = combineErrors(errNodecat, err);
    errStream.write('nodecat: ' + err + '\n');
    if (inCleanup) {
      inCleanup();
    }
    allDone();
  }
  outStream.once('error', onOutError);

  var i = 0;
  function catNext() {
    if (i >= fileNames.length) {
      allDone();
      return;
    }

    var fileName = fileNames[i];
    i += 1;
    var callerStream = callerStreams[fileName];
    if (callerStream && callerStreamEnded[fileName]) {
      catNext();
      return;
    }

    var inStream = callerStream || fs.createReadStream(fileName);

    inCleanup = function cleanup() {
      inStream.removeListener('error', onInError);
      inStream.removeListener('end', done);
    };

    function done() {
      if (callerStream) {
        callerStreamEnded[fileName] = true;
      }
      inCleanup();
      catNext();
    }

    function onInError(err) {
      // Mark error with the name of the file which caused it
      err.fileName = fileName;
      errNodecat = combineErrors(errNodecat, err);
      errStream.write('nodecat: ' + fileName + ': ' + err.message + '\n');
      // There is no way to know whether more data may be emitted.
      // To be safe, unpipe to prevent interleaving data after starting next.
      if (typeof inStream.unpipe === 'function') {
        inStream.unpipe(outStream);
      }
      done();
    }
    inStream.once('error', onInError);
    inStream.once('end', done);

    inStream.pipe(outStream, {end: false});
  }

  catNext();
  return undefined;
}

module.exports = nodecat;
