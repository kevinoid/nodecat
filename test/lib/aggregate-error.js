/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');

const AggregateError = require('../../lib/aggregate-error');

describe('AggregateError', () => {
  it('sets .message from argument', () => {
    const testMsg = 'test message';
    const a = new AggregateError(testMsg);
    assert.strictEqual(a.message, testMsg);
  });

  it('can be instantiated without arguments', () => {
    const a = new AggregateError();
    assert(a.message, 'has default message');
  });

  it('behaves like an Array', () => {
    const a = new AggregateError();
    assert.strictEqual(a.length, 0);

    const testError = new Error('test');
    a.push(testError);
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0], testError);
  });

  it('can be instantiated without new', () => {
    const testMsg = 'test message';
    const a = AggregateError(testMsg);  // eslint-disable-line new-cap
    assert(a instanceof AggregateError);
    assert.strictEqual(a.message, testMsg);
  });

  it('inherits from Error', () => {
    const testMsg = 'test message';
    const a = new AggregateError(testMsg);
    assert(a instanceof Error);
  });
});
