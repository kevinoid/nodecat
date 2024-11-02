/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const stream = require('node:stream');

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const { match } = sinon;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'nodecat'];

describe('nodecat command', () => {
  // In order to test the command parsing module in isolation, we need to mock
  // the nodecat module function.  To use different mocks for each test without
  // re-injecting the module repeatedly, we use this shared variable.
  let nodecat;
  const nodecatCmd = proxyquire(
    '../bin/nodecat',
    {
      '..': function nodecatInjected(...args) {
        return nodecat.apply(this, args);
      },
    },
  );

  // Ensure that expectations are not carried over between tests
  beforeEach(() => {
    nodecat = sinon.expectation.create('nodecat').never();
  });

  function expectArgsAs(args, expectFiles, expectOpts) {
    const msg = `interprets ${args.join(' ')} as ${
      expectFiles.join(' ')} with ${expectOpts}`;
    it(msg, () => {
      nodecat = sinon.mock()
        .once()
        .withArgs(
          match(expectFiles),
          expectOpts,
          match.func,
        );
      const allArgs = [...RUNTIME_ARGS, ...args];
      nodecatCmd(allArgs, sinon.mock().never());
      nodecat.verify();
    });
  }

  function expectArgsErr(args, expectErrMsg) {
    it(`prints error and exits for ${args.join(' ')}`, (done) => {
      const outStream = new stream.PassThrough();
      const errStream = new stream.PassThrough();
      const options = {
        outStream,
        errStream,
      };
      const allArgs = [...RUNTIME_ARGS, ...args];
      nodecatCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.isAtLeast(code, 1);
        assert.strictEqual(outStream.read(), null);
        assert.match(String(errStream.read()), expectErrMsg);
        done();
      });
    });
  }

  // Check individual arguments are handled correctly
  const matchDefaultOpts = match({
    fileStreams: match({
      '-': match.object,
    }),
  });
  expectArgsAs([], ['-'], matchDefaultOpts);
  expectArgsAs(['-'], ['-'], matchDefaultOpts);
  expectArgsAs(['file.txt'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(['--', 'file.txt'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(['file.txt', '--'], ['file.txt'], matchDefaultOpts);
  expectArgsAs(
    ['file.txt', '--', 'file.txt'],
    ['file.txt', 'file.txt'],
    matchDefaultOpts,
  );
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
  // eslint-disable-next-line unicorn/consistent-function-scoping
  function matchBadOpt(opt) {
    const reexp = `(known|legal|recognized|supported)\\b.+${opt}`;
    return new RegExp(reexp, 'i');
  }
  expectArgsErr(['-a'], matchBadOpt('-a'));
  expectArgsErr(['--unknown'], matchBadOpt('--unknown'));

  it('yields 0 for non-Error nodecat result', (done) => {
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func,
      )
      .yields(null);
    nodecatCmd([], {}, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      done();
    });
  });

  it('yields non-0 for Error nodecat result', (done) => {
    const errTest = new Error('test error');
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func,
      )
      .yields(errTest);
    nodecatCmd([], {}, (err, code) => {
      // Note:  Error is not propagated, since it is fully handled by nodecat
      assert.ifError(err);
      assert.isAtLeast(code, 1);
      done();
    });
  });

  it('throws TypeError for non-function callback', () => {
    assert.throws(
      () => { nodecatCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/,
    );
  });

  it('yields TypeError for non-object options', (done) => {
    nodecatCmd([], true, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('yields TypeError for non-Readable in', (done) => {
    nodecatCmd([], { inStream: {} }, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.inStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable outStream', (done) => {
    nodecatCmd([], { outStream: new stream.Readable() }, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.outStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable errStream', (done) => {
    nodecatCmd([], { errStream: new stream.Readable() }, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.errStream\b/);
      done();
    });
  });

  it('returns undefined when called with a function', () => {
    nodecat = sinon.mock()
      .once()
      .withArgs(
        match(['-']),
        match.object,
        match.func,
      );
    const result = nodecatCmd(RUNTIME_ARGS, sinon.mock().never());
    nodecat.verify();
    assert.strictEqual(result, undefined);
  });

  it('returns a Promise when called without a function', () => {
    nodecat = sinon.stub();
    const result = nodecatCmd(RUNTIME_ARGS);
    assert(result instanceof globalThis.Promise);
  });

  it('returned Promise is resolved with exit code', () => {
    nodecat = sinon.stub();
    const options = {
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough(),
    };
    const result = nodecatCmd(RUNTIME_ARGS, options);
    nodecat.yield(null);
    return result.then((code) => {
      assert.strictEqual(code, 0);
    });
  });

  it('returned Promise is rejected with Error', () => {
    nodecat = sinon.stub();
    const result = nodecatCmd(RUNTIME_ARGS, true);
    return result.then(
      sinon.mock().never(),
      (err) => { assert.instanceOf(err, TypeError); },
    );
  });
});
