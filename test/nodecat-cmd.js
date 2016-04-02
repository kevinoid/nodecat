/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */
'use strict';

var BBPromise = require('bluebird');
var assert = require('chai').assert;
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var stream = require('stream');

var match = sinon.match;

// Simulate arguments passed by the node runtime
var RUNTIME_ARGS = ['node', 'nodecat'];

describe('nodecat command', function() {
  // In order to test the command parsing module in isolation, we need to mock
  // the nodecat module function.  To use different mocks for each test without
  // re-injecting the module repeatedly, we use this shared variable.
  var nodecat;
  var nodecatCmd = proxyquire(
    '../bin/nodecat',
    {
      '..': function nodecatInjected() {
        return nodecat.apply(this, arguments);
      }
    }
  );

  // Ensure that expectations are not carried over between tests
  beforeEach(function() {
    nodecat = sinon.expectation.create('nodecat').never();
  });

  function expectArgsAs(args, expectFiles, expectOpts) {
    var msg = 'interprets ' + args.join(' ') + ' as ' +
      expectFiles.join(' ') + ' with ' + expectOpts;
    it(msg, function() {
      nodecat = sinon.mock()
        .once()
        .withArgs(
          match(expectFiles),
          expectOpts,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(args);
      nodecatCmd(allArgs, sinon.mock().never());
      nodecat.verify();
    });
  }

  function expectArgsErr(args, expectErrMsg) {
    it('prints error and exits for ' + args.join(' '), function(done) {
      var outStream = new stream.PassThrough();
      var errStream = new stream.PassThrough();
      var options = {
        outStream: outStream,
        errStream: errStream
      };
      var allArgs = RUNTIME_ARGS.concat(args);
      nodecatCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.isAtLeast(code, 1);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), expectErrMsg);
        done();
      });
    });
  }

  // Check individual arguments are handled correctly
  var matchDefaultOpts = match({
    fileStreams: match({
      '-': match.object
    })
  });
  expectArgsAs([], ['-'], matchDefaultOpts);
  expectArgsAs(['-'], ['-'], matchDefaultOpts);
  expectArgsAs(['file.txt'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(['--', 'file.txt'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(['file.txt', '--'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(['file.txt', '--', 'file.txt'], ['file.txt', 'file.txt'],
    matchDefaultOpts);
  expectArgsAs(['--'], ['-'], matchDefaultOpts);
  expectArgsAs(['--', '-'], ['-'], matchDefaultOpts);
  expectArgsAs(['--', '--'], ['--'], matchDefaultOpts);
  expectArgsAs(['-u'], ['-'], matchDefaultOpts);
  expectArgsAs(['-u', '-'], ['-'], matchDefaultOpts);
  expectArgsAs(['-', '-u', '-'], ['-', '-'], matchDefaultOpts);
  expectArgsAs(['--', '-u', '-'], ['-u', '-'], matchDefaultOpts);
  expectArgsAs(['-u', '--', '-'], ['-'], matchDefaultOpts);
  expectArgsAs(['-u', '--', '-u', '-'], ['-u', '-'], matchDefaultOpts);
  expectArgsAs(['-uu'], ['-'], matchDefaultOpts);
  expectArgsAs(['-uu', '--', '-uu'], ['-uu'], matchDefaultOpts);
  expectArgsAs(['--', '-a'], ['-a'], matchDefaultOpts);

  // Check argument errors are handled correctly
  function matchBadOpt(opt) {
    var reexp = '(known|legal|recognized|supported)\\b.+' + opt;
    return new RegExp(reexp, 'i');
  }
  expectArgsErr(['-a'], matchBadOpt('-a'));
  expectArgsErr(['--unknown'], matchBadOpt('--unknown'));

  it('yields 0 for non-Error nodecat result', function(done) {
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func
      )
      .yields(null);
    nodecatCmd([], {}, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      done();
    });
  });

  it('yields non-0 for Error nodecat result', function(done) {
    var errTest = new Error('test error');
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func
      )
      .yields(errTest);
    nodecatCmd([], {}, function(err, code) {
      // Note:  Error is not propagated, since it is fully handled by nodecat
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      done();
    });
  });

  it('throws TypeError for non-function callback', function() {
    assert.throws(
      function() { nodecatCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('yields TypeError for non-object options', function(done) {
    nodecatCmd([], true, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('yields TypeError for non-Readable in', function(done) {
    nodecatCmd([], {inStream: {}}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.inStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable outStream', function(done) {
    nodecatCmd([], {outStream: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.outStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable errStream', function(done) {
    nodecatCmd([], {errStream: new stream.Readable()}, function(err) {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.errStream\b/);
      done();
    });
  });

  it('returns undefined when called with a function', function() {
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func
      );
    var result = nodecatCmd(RUNTIME_ARGS, sinon.mock().never());
    nodecat.verify();
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
        function() { nodecatCmd(RUNTIME_ARGS); },
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
      nodecat = sinon.stub();
      var result = nodecatCmd(RUNTIME_ARGS);
      assert(result instanceof global.Promise);
    });

    it('returned Promise is resolved with exit code', function() {
      nodecat = sinon.stub();
      var options = {
        outStream: new stream.PassThrough(),
        errStream: new stream.PassThrough()
      };
      var result = nodecatCmd(RUNTIME_ARGS, options);
      nodecat.yield(null);
      return result.then(function(code) {
        assert.strictEqual(code, 0);
      });
    });

    it('returned Promise is rejected with Error', function() {
      nodecat = sinon.stub();
      var result = nodecatCmd(RUNTIME_ARGS, true);
      return result.then(
        sinon.mock().never(),
        function(err) { assert.instanceOf(err, TypeError); }
      );
    });
  });
});
