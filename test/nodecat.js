/**
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const {assert} = require('chai');
const fs = require('fs');
const nodecat = require('..');
const path = require('path');
const sinon = require('sinon');
const stream = require('stream');

const AggregateError = require('../lib/aggregate-error');

const filePath = path.resolve(__dirname, '..', 'package.json');
const fileContent = fs.readFileSync(filePath);

/** Gets the number of listeners for a named event on an emitter. */
function listenerCount(emitter, eventName) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(eventName);
  }

  return emitter.listeners(eventName).length;
}

describe('nodecat', () => {
  it('concatenates a named file to outStream', (done) => {
    const options = {
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat([filePath], options, (err) => {
      assert.ifError(err);
      options.outStream.end(() => {
        assert.deepEqual(options.outStream.read(), fileContent);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
  });

  it('concatenates two named files to outStream', (done) => {
    const options = {
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat([filePath, filePath], options, (err) => {
      assert.ifError(err);
      options.outStream.end(() => {
        assert.deepEqual(
          options.outStream.read(),
          Buffer.concat([fileContent, fileContent])
        );
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
  });

  it('concatenates stdout to outStream', (done) => {
    const testData = Buffer.from('Stuff');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat(['-'], options, (err) => {
      assert.ifError(err);
      options.outStream.end(() => {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('concatenates stdout once when named twice', (done) => {
    const testData = Buffer.from('Stuff');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    nodecat(['-', '-'], options, (err) => {
      assert.ifError(err);
      options.outStream.end(() => {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('continues with next file after read error', (done) => {
    const errTest = new Error('test read error');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    let callCount = 0;
    nodecat(['-', filePath], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(err, errTest);
      assert.strictEqual(err.fileName, '-');
      options.outStream.end(() => {
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

  it('does not retry stream after read error', (done) => {
    const testData = Buffer.from('Stuff');
    const errTest = new Error('test read error');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    let callCount = 0;
    nodecat(['-', filePath, '-'], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(err, errTest);
      assert.strictEqual(err.fileName, '-');
      options.outStream.end(() => {
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

  it('returns AggregateError for multiple read errors', (done) => {
    const errTest1 = new Error('test read error 1');
    const errTest2 = new Error('test read error 2');
    const errTest3 = new Error('test read error 3');
    const stream1 = new stream.PassThrough();
    const stream2 = new stream.PassThrough();
    const stream3 = new stream.PassThrough();
    const options = {
      fileStreams: {
        'file1.txt': stream1,
        'file2.txt': stream2,
        'file3.txt': stream3
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    let callCount = 0;
    nodecat(['file1.txt', 'file2.txt', 'file3.txt'], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.instanceOf(err, AggregateError);
      assert.strictEqual(err.length, 3);
      assert.strictEqual(err[0], errTest1);
      assert.strictEqual(err[0].fileName, 'file1.txt');
      assert.strictEqual(err[1], errTest2);
      assert.strictEqual(err[1].fileName, 'file2.txt');
      assert.strictEqual(err[2], errTest3);
      assert.strictEqual(err[2].fileName, 'file3.txt');

      // Confirm that AggregateError.toString has contained messages
      const errMsgRE = new RegExp(
        '.*test read error 1.*\\n'
          + '.*test read error 2.*\\n'
          + '.*test read error 3.*\\n.*'
      );
      assert.match(String(err), errMsgRE);

      options.outStream.end(() => {
        assert.deepEqual(options.outStream.read(), null);
        const errText = String(options.errStream.read());
        const errRE = new RegExp(
          '^nodecat: file1.txt: .*test read error 1.*\\n'
            + 'nodecat: file2.txt: .*test read error 2.*\\n'
            + 'nodecat: file3.txt: .*test read error 3.*\\n$'
        );
        assert.match(errText, errRE);
        done();
      });
    });
    stream1.emit('error', errTest1);
    process.nextTick(() => {
      stream2.emit('error', errTest2);
      process.nextTick(() => {
        stream3.emit('error', errTest3);
      });
    });
  });

  it('returns AggregateError for read and write errors', (done) => {
    const errTestRead = new Error('test read error');
    const errTestWrite = new Error('test write error');
    const stream1 = new stream.PassThrough();
    const stream2 = new stream.PassThrough();
    const options = {
      fileStreams: {
        'file1.txt': stream1,
        'file2.txt': stream2
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    let callCount = 0;
    nodecat(['file1.txt', 'file2.txt'], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.instanceOf(err, AggregateError);
      assert.strictEqual(err.length, 2);
      assert.strictEqual(err[0], errTestRead);
      assert.strictEqual(err[0].fileName, 'file1.txt');
      assert.strictEqual(err[1], errTestWrite);
      assert.strictEqual(err[1].fileName, undefined);
      options.outStream.end(() => {
        assert.deepEqual(options.outStream.read(), null);
        const errText = String(options.errStream.read());
        const errRE = new RegExp(
          '^nodecat: file1.txt: .*test read error.*\\n'
          + 'nodecat: .*test write error.*\\n$'
        );
        assert.match(errText, errRE);
        done();
      });
    });
    stream1.emit('error', errTestRead);
    options.outStream.emit('error', errTestWrite);
  });

  it('stops writing after write error', (done) => {
    const testData = Buffer.from('Stuff');
    const errTest = new Error('test write error');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    options.fileStreams[filePath] = {
      pipe: sinon.mock().never()
    };
    let callCount = 0;
    nodecat(['-', filePath], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(err, errTest);
      process.nextTick(() => {
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

  it('stops listening for read error after write error', (done) => {
    const testData = Buffer.from('Stuff');
    const errTestRead = new Error('test read error');
    const errTestWrite = new Error('test write error');
    const inStream = new stream.PassThrough();
    const options = {
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
      assert.strictEqual(listenerCount(this, 'error'), 1);
    });
    let callCount = 0;
    nodecat(['-', filePath], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(err, errTestWrite);
      inStream.emit('error', errTestRead);
      setImmediate(() => {
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

  it('stops listening for write error after callback', (done) => {
    const testData = Buffer.from('Stuff');
    const errTestWrite = new Error('test write error');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    // Assert would throw without this test listener.
    options.outStream.on('error', function() {
      assert.strictEqual(listenerCount(this, 'error'), 1);
    });
    let callCount = 0;
    nodecat(['-'], options, (err) => {
      callCount += 1;
      assert.strictEqual(callCount, 1);
      assert.ifError(err);
      options.outStream.emit('error', errTestWrite);
      setImmediate(() => {
        assert.deepEqual(options.outStream.read(), testData);
        assert.strictEqual(options.errStream.read(), null);
        done();
      });
    });
    inStream.end(testData);
  });

  it('throws TypeError for non-function callback', () => {
    assert.throws(
      () => { nodecat([], {}, true); },
      TypeError,
      /\bcallback\b/
    );
  });

  it('yields TypeError for non-Array-like fileNames', (done) => {
    nodecat('file.txt', (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\bfileNames\b/);
      done();
    });
  });

  it('yields TypeError for non-object options', (done) => {
    nodecat([], true, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions\b/);
      done();
    });
  });

  it('yields TypeError for non-object options.fileStreams', (done) => {
    nodecat([], {fileStreams: true}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.fileStreams\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable outStream', (done) => {
    nodecat([], {outStream: new stream.Readable()}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.outStream\b/);
      done();
    });
  });

  it('yields TypeError for non-Writable errStream', (done) => {
    nodecat([], {errStream: new stream.Readable()}, (err) => {
      assert.instanceOf(err, TypeError);
      assert.match(err.message, /\boptions.errStream\b/);
      done();
    });
  });

  it('returns undefined when called with a function', (done) => {
    const result = nodecat([], done);
    assert.strictEqual(result, undefined);
  });

  it('returns a Promise when called without a function', () => {
    const result = nodecat([]);
    assert(result instanceof global.Promise);
  });

  it('returned Promise is resolved after writing', () => {
    let ended = false;
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    setImmediate(() => {
      ended = true;
      inStream.end();
    });
    return nodecat(['-'], options).then(() => {
      assert(ended);
    });
  });

  it('returned Promise is rejected with argument Error', () => {
    const result = nodecat([], true);
    return result.then(
      sinon.mock().never(),
      (err) => { assert.instanceOf(err, TypeError); }
    );
  });

  it('returned Promise is rejected with read Error', () => {
    const errTest = new Error('test error');
    const inStream = new stream.PassThrough();
    const options = {
      fileStreams: {
        '-': inStream
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    setImmediate(() => {
      inStream.emit('error', errTest);
    });
    return nodecat(['-'], options).then(
      sinon.mock().never(),
      (err) => { assert.strictEqual(err, errTest); }
    );
  });

  it('returned Promise is rejected with write Error', () => {
    const errTest = new Error('test error');
    const options = {
      fileStreams: {
        '-': new stream.PassThrough()
      },
      outStream: new stream.PassThrough(),
      errStream: new stream.PassThrough()
    };
    setImmediate(() => {
      options.outStream.emit('error', errTest);
    });
    return nodecat(['-'], options).then(
      sinon.mock().never(),
      (err) => { assert.strictEqual(err, errTest); }
    );
  });
});
