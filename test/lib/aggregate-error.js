/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var AggregateError = require('../../lib/aggregate-error');
var assert = require('assert');

describe('AggregateError', function() {
  it('sets .message from argument', function() {
    var testMsg = 'test message';
    var a = new AggregateError(testMsg);
    assert.strictEqual(a.message, testMsg);
  });

  it('can be instantiated without arguments', function() {
    var a = new AggregateError();
    assert(a.message, 'has default message');
  });

  it('behaves like an Array', function() {
    var a = new AggregateError();
    assert.strictEqual(a.length, 0);

    var testError = new Error('test');
    a.push(testError);
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0], testError);
  });

  it('can be instantiated without new', function() {
    var testMsg = 'test message';
    var a = AggregateError(testMsg);
    assert(a instanceof AggregateError);
    assert.strictEqual(a.message, testMsg);
  });

  it('inherits from Error', function() {
    var testMsg = 'test message';
    var a = new AggregateError(testMsg);
    assert(a instanceof Error);
  });
});
