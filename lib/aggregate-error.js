/**
 * @copyright Copyright (c) 2013-2015 Petka Antonov
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var inherits = require('util').inherits;

/** Constructs an AggregateError.
 *
 * Based on the AggregateError class from bluebird.
 *
 * @class Represents a collection of errors.
 * @constructor
 * @extends Error
 * @extends Array
 * @param {string=} message Human-readable description of the error.
 */
function AggregateError(message) {
  if (!(this instanceof AggregateError)) {
    return new AggregateError(message);
  }

  Error.captureStackTrace(this, AggregateError);
  // Like http://www.ecma-international.org/ecma-262/6.0/#sec-error-message
  if (message !== undefined) {
    Object.defineProperty(this, 'message', {
      value: String(message),
      configurable: true,
      writable: true
    });
  }
}
inherits(AggregateError, Error);
Object.defineProperty(AggregateError.prototype, 'length', {
  value: 0,
  writable: true
});
Object.defineProperty(AggregateError.prototype, 'message', {
  value: 'Multiple errors occurred',
  configurable: true,
  writable: true
});
Object.defineProperty(AggregateError.prototype, 'name', {
  value: 'AggregateError',
  configurable: true,
  writable: true
});
var level = 0;
Object.defineProperty(AggregateError.prototype, 'toString', {
  value: function AggregateErrorToString() {
    var indent = Array((level * 4) + 1).join(' ');
    var ret = '\n' + indent + 'AggregateError of:\n';
    level += 1;
    indent = Array((level * 4) + 1).join(' ');
    for (var i = 0; i < this.length; i += 1) {
      var str = this[i] === this ? '[Circular AggregateError]' : this[i] + '';
      var lines = str.split('\n');
      for (var j = 0; j < lines.length; j += 1) {
        lines[j] = indent + lines[j];
      }
      str = lines.join('\n');
      ret += str + '\n';
    }
    level -= 1;
    return ret;
  },
  configurable: true,
  writable: true
});
Object.defineProperty(
  AggregateError.prototype,
  'toLocaleString',
  Object.getOwnPropertyDescriptor(AggregateError.prototype, 'toString')
);

Object.getOwnPropertyNames(Array.prototype).forEach(function(propName) {
  if (!hasOwnProperty.call(AggregateError.prototype, propName)) {
    Object.defineProperty(
      AggregateError.prototype,
      propName,
      Object.getOwnPropertyDescriptor(Array.prototype, propName)
    );
  }
});

module.exports = AggregateError;
