/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var AggregateError = require('../lib/aggregate-error');
var BBPromise = require('bluebird');
var assert = require('chai').assert;
var fs = require('fs');
var nodecat = require('..');
var path = require('path');
var sinon = require('sinon');
var stream = require('stream');

var filePath = path.resolve(__dirname, '..', 'package.json');
var fileContent = fs.readFileSync(filePath);

describe('nodecat', function() {
  it('concatenates a named file to outStream', function(done) {
    var options = {
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat([filePath], options, function(err) {
      assert.ifError(err);
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), fileContent);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
  });

  it('concatenates two named files to outStream', function(done) {
    var options = {
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat([filePath, filePath], options, function(err) {
      assert.ifError(err);
      options.outStream.end(function() {
        assert.deepEqual(
          options.outStream.read(),
          Buffer.concat([fileContent, fileContent])
        );
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
  });

  it('concatenates stdout to outStream', function(done) {
    var testData = new Buffer('Stuff');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat(['-'], options, function(err) {
      assert.ifError(err);
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('concatenates stdout once when named twice', function(done) {
    var testData = new Buffer('Stuff');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat(['-', '-'], options, function(err) {
      assert.ifError(err);
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('continues with next file after read error', function(done) {
    var errTest = new Error('test read error');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    var callCount = 0;
    nodecat(['-', filePath], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.strictEqual(err, errTest);
      assert.strictEqual(err.fileName, '-');
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), fileContent);
        assert.match(
          options.errStream.read(),
          /^nodecat: -: .*test read error.*\n$/
        );
        done();
      });
    });
    inStream.emit('error', errTest);
  });

  it('does not retry stream after read error', function(done) {
    var testData = new Buffer('Stuff');
    var errTest = new Error('test read error');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    var callCount = 0;
    nodecat(['-', filePath, '-'], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.strictEqual(err, errTest);
      assert.strictEqual(err.fileName, '-');
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), fileContent);
        assert.match(
          options.errStream.read(),
          /^nodecat: -: .*test read error.*\n$/
        );
        done();
      });
    });
    inStream.emit('error', errTest);
    inStream.end(testData);
  });

  it('returns AggregateError for multiple read errors', function(done) {
    var errTest1 = new Error('test read error 1');
    var errTest2 = new Error('test read error 2');
    var errTest3 = new Error('test read error 3');
    var stream1 = new stream.PassThrough();
    var stream2 = new stream.PassThrough();
    var stream3 = new stream.PassThrough();
    var options = {
      fileStreams: {
        'file1.txt': stream1,
        'file2.txt': stream2,
        'file3.txt': stream3
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    var callCount = 0;
    nodecat(['file1.txt', 'file2.txt', 'file3.txt'], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.instanceOf(err, AggregateError);
      assert.strictEqual(err.length, 3);
      assert.strictEqual(err[0], errTest1);
      assert.strictEqual(err[0].fileName, 'file1.txt');
      assert.strictEqual(err[1], errTest2);
      assert.strictEqual(err[1].fileName, 'file2.txt');
      assert.strictEqual(err[2], errTest3);
      assert.strictEqual(err[2].fileName, 'file3.txt');

      // Confirm that AggregateError.toString has contained messages
      var errMsgRE = new RegExp(
          '.*test read error 1.*\\n' +
          '.*test read error 2.*\\n' +
          '.*test read error 3.*\\n.*');
      assert.match(String(err), errMsgRE);

      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), null);
        var errText = String(options.errStream.read());
        var errRE =
          new RegExp('^nodecat: file1.txt: .*test read error 1.*\\n' +
              'nodecat: file2.txt: .*test read error 2.*\\n' +
              'nodecat: file3.txt: .*test read error 3.*\\n$');
        assert.match(errText, errRE);
        done();
      });
    });
    stream1.emit('error', errTest1);
    process.nextTick(function() {
      stream2.emit('error', errTest2);
      process.nextTick(function() {
        stream3.emit('error', errTest3);
      });
    });
  });

  it('returns AggregateError for read and write errors', function(done) {
    var errTestRead = new Error('test read error');
    var errTestWrite = new Error('test write error');
    var stream1 = new stream.PassThrough();
    var stream2 = new stream.PassThrough();
    var options = {
      fileStreams: {
        'file1.txt': stream1,
        'file2.txt': stream2
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    var callCount = 0;
    nodecat(['file1.txt', 'file2.txt'], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.instanceOf(err, AggregateError);
      assert.strictEqual(err.length, 2);
      assert.strictEqual(err[0], errTestRead);
      assert.strictEqual(err[0].fileName, 'file1.txt');
      assert.strictEqual(err[1], errTestWrite);
      assert.strictEqual(err[1].fileName, undefined);
      options.outStream.end(function() {
        assert.deepEqual(options.outStream.read(), null);
        var errText = String(options.errStream.read());
        var errRE =
          new RegExp('^nodecat: file1.txt: .*test read error.*\\n' +
              'nodecat: .*test write error.*\\n$');
        assert.match(errText, errRE);
        done();
      });
    });
    stream1.emit('error', errTestRead);
    options.outStream.emit('error', errTestWrite);
  });

  it('stops writing after write error', function(done) {
    var testData = new Buffer('Stuff');
    var errTest = new Error('test write error');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    options.fileStreams[filePath] = {
      pipe: sinon.mock().never()
    };
    var callCount = 0;
    nodecat(['-', filePath], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.strictEqual(err, errTest);
      process.nextTick(function() {
        assert.strictEqual(options.outStream.read(), null);
        assert.match(
          options.errStream.read(),
          /^nodecat: .*test write error.*\n/
        );
        done();
      });
    });
    options.outStream.emit('error', errTest);
    inStream.end(testData);
  });

  it('stops listening for read error after write error', function(done) {
    var testData = new Buffer('Stuff');
    var errTestRead = new Error('test read error');
    var errTestWrite = new Error('test write error');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    options.fileStreams[filePath] = {
      pipe: sinon.mock().never()
    };
    // Assert would throw without this test listener.
    inStream.on('error', function() {
      assert.strictEqual(this.listenerCount('error'), 1);
    });
    var callCount = 0;
    nodecat(['-', filePath], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.strictEqual(err, errTestWrite);
      inStream.emit('error', errTestRead);
      setImmediate(function() {
        assert.strictEqual(options.outStream.read(), null);
        assert.match(
          options.errStream.read(),
          /^nodecat: .*test write error.*\n/
        );
        done();
      });
    });
    options.outStream.emit('error', errTestWrite);
    inStream.emit('error', errTestRead);
    inStream.end(testData);
  });

  it('stops listening for write error after callback', function(done) {
    var testData = new Buffer('Stuff');
    var errTestWrite = new Error('test write error');
    var inStream = new stream.PassThrough();
    var options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    // Assert would throw without this test listener.
    options.outStream.on('error', function() {
      assert.strictEqual(this.listenerCount('error'), 1);
    });
    var callCount = 0;
    nodecat(['-'], options, function(err) {
      assert.strictEqual(++callCount, 1);
      assert.ifError(err);
      options.outStream.emit('error', errTestWrite);
      setImmediate(function() {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('throws TypeError for non-function callback', function() {
    assert.throws(
      function() { nodecat([], {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('yields TypeError for non-Array-like fileNames', function(done) {
    nodecat('file.txt', function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\bfileNames\b/);
      done();
    });
  });

  it('yields TypeError for non-object options', function(done) {
    nodecat([], true, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('yields TypeError for non-object options.fileStreams', function(done) {
    nodecat([], {fileStreams: true}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.fileStreams\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable outStream', function(done) {
    nodecat([], {outStream: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.outStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable errStream', function(done) {
    nodecat([], {errStream: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.errStream\b/);
      done();
    });
  });

  it('returns undefined when called with a function', function(done) {
    var result = nodecat([], done);
    assert.strictEqual(result, undefined);
  });

  describe('without global.Promise', function() {
    var hadPromise, oldPromise;

    before('remove global Promise', function() {
      if (global.Promise) {
        hadPromise = global.hasOwnProperty('Promise');
        oldPromise = global.Promise;
        // Note:  Deleting triggers Mocha's global leak detection.
        // Also wouldn't work if global scope had a prototype chain.
        global.Promise = undefined;
      }
    });

    after('restore global Promise', function() {
      if (oldPromise) {
        if (hadPromise) {
          global.Promise = oldPromise;
        } else {
          delete global.Promise;
        }
      }
    });

    it('throws without a callback', function() {
      assert.throws(
        function() { nodecat([]); },
        TypeError,
        /\bcallback\b/
      );
    });
  });

  describe('with global.Promise', function() {
    var hadPromise, oldPromise;

    before('ensure global Promise', function() {
      if (typeof global.Promise !== 'function') {
        hadPromise = global.hasOwnProperty('Promise');
        oldPromise = global.Promise;
        global.Promise = BBPromise;
      }
    });

    after('restore global Promise', function() {
      if (hadPromise === true) {
        global.Promise = oldPromise;
      } else if (hadPromise === false) {
        delete global.Promise;
      }
    });

    it('returns a Promise when called without a function', function() {
      var result = nodecat([]);
      assert(result instanceof global.Promise);
    });

    it('returned Promise is resolved after writing', function() {
      var ended = false;
      var inStream = new stream.PassThrough();
      var options = {
        fileStreams: {
          '-': inStream
        },
        outStream: new stream.PassThrough(),
        errStream: new stream.PassThrough()
      };
      setImmediate(function() {
        ended = true;
        inStream.end();
      });
      return nodecat(['-'], options).then(function() {
        assert(ended);
      });
    });

    it('returned Promise is rejected with argument Error', function() {
      var result = nodecat([], true);
      return result.then(
        sinon.mock().never(),
        function(err) { assert.instanceOf(err, TypeError); }
      );
    });

    it('returned Promise is rejected with read Error', function() {
      var errTest = new Error('test error');
      var inStream = new stream.PassThrough();
      var options = {
        fileStreams: {
          '-': inStream
        },
        outStream: new stream.PassThrough(),
        errStream: new stream.PassThrough()
      };
      setImmediate(function() {
        inStream.emit('error', errTest);
      });
      return nodecat(['-'], options).then(
        sinon.mock().never(),
        function(err) { assert.strictEqual(err, errTest); }
      );
    });

    it('returned Promise is rejected with write Error', function() {
      var errTest = new Error('test error');
      var options = {
        fileStreams: {
          '-': new stream.PassThrough()
        },
        outStream: new stream.PassThrough(),
        errStream: new stream.PassThrough()
      };
      setImmediate(function() {
        options.outStream.emit('error', errTest);
      });
      return nodecat(['-'], options).then(
        sinon.mock().never(),
        function(err) { assert.strictEqual(err, errTest); }
      );
    });
  });
});
