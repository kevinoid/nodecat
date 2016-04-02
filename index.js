/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var fs = require('fs');

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

  if (!callback && typeof Promise === 'function') {
    // eslint-disable-next-line no-undef
    return new Promise(function(resolve, reject) {
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
        fileNames.length !== fileNames.length | 0) {
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
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  // Cleanup function for the currently piping input stream
  var inCleanup;

  function allDone(err) {
    outStream.removeListener('error', onOutError);
    callback(err);
  }

  // Note:  src.unpipe is called by stream.Readable internals on dest 'error'
  function onOutError(err) {
    errStream.write('nodecat: ' + err + '\n');
    if (inCleanup) {
      inCleanup();
    }
    allDone(err);
  }
  outStream.once('error', onOutError);

  var firstError = null;
  var i = 0;
  function catNext() {
    if (i >= fileNames.length) {
      allDone(firstError);
      return;
    }

    var fileName = fileNames[i++];
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
      firstError = firstError || err;
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
