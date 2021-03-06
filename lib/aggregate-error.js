/**
 * @copyright Copyright (c) 2013-2015 Petka Antonov
 * @copyright Copyright 2016 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { inherits } = require('util');

/** Constructs an AggregateError.
 *
 * Based on the AggregateError class from bluebird.
 *
 * @class Represents a collection of errors.
 * @class
 * @augments Error
 * @augments Array
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
      writable: true,
    });
  }
}
inherits(AggregateError, Error);
Object.defineProperty(AggregateError.prototype, 'length', {
  value: 0,
  writable: true,
});
Object.defineProperty(AggregateError.prototype, 'message', {
  value: 'Multiple errors occurred',
  configurable: true,
  writable: true,
});
Object.defineProperty(AggregateError.prototype, 'name', {
  value: 'AggregateError',
  configurable: true,
  writable: true,
});
let level = 0;
Object.defineProperty(AggregateError.prototype, 'toString', {
  value: function AggregateErrorToString() {
    let indent = ' '.repeat(level * 4);
    let ret = `\n${indent}AggregateError of:\n`;
    level += 1;
    indent = ' '.repeat(level * 4);
    for (let i = 0; i < this.length; i += 1) {
      let str = this[i] === this ? '[Circular AggregateError]' : `${this[i]}`;
      const lines = str.split('\n');
      for (let j = 0; j < lines.length; j += 1) {
        lines[j] = indent + lines[j];
      }
      str = lines.join('\n');
      ret += `${str}\n`;
    }
    level -= 1;
    return ret;
  },
  configurable: true,
  writable: true,
});
Object.defineProperty(
  AggregateError.prototype,
  'toLocaleString',
  Object.getOwnPropertyDescriptor(AggregateError.prototype, 'toString'),
);

for (const propName of Object.getOwnPropertyNames(Array.prototype)) {
  if (!hasOwnProperty.call(AggregateError.prototype, propName)) {
    Object.defineProperty(
      AggregateError.prototype,
      propName,
      Object.getOwnPropertyDescriptor(Array.prototype, propName),
    );
  }
}

module.exports = AggregateError;
