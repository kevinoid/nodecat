Nodecat
========

[![Build Status: Linux](https://img.shields.io/travis/kevinoid/nodecat/master.svg?style=flat&label=build+on+linux)](https://travis-ci.org/kevinoid/nodecat)
[![Build Status: Windows](https://img.shields.io/appveyor/ci/kevinoid/nodecat/master.svg?style=flat&label=build+on+windows)](https://ci.appveyor.com/project/kevinoid/nodecat)
[![Coverage](https://img.shields.io/codecov/c/github/kevinoid/nodecat.svg?style=flat)](https://codecov.io/github/kevinoid/nodecat?branch=master)
[![Dependency Status](https://img.shields.io/david/kevinoid/nodecat.svg?style=flat)](https://david-dm.org/kevinoid/nodecat)
[![Supported Node Version](https://img.shields.io/node/v/nodecat.svg?style=flat)](https://www.npmjs.com/package/nodecat)
[![Version on NPM](https://img.shields.io/npm/v/nodecat.svg?style=flat)](https://www.npmjs.com/package/nodecat)

A Node.js implementation of cat, as [specified by
POSIX/SUSv3](http://pubs.opengroup.org/onlinepubs/9699919799/utilities/cat.html).
No frills, no buffering, no charset conversion, just cat.

## Introductory Example

```sh
$ marked README.md | nodecat header.html - footer.html > README.html
```

## Features

* Supports copying stdin by default or explicitly using the name `-`.
* Copies all files byte-for-byte without requiring a valid encoding.
* Does not buffer any input or output (beyond any buffering done by the
  libuv/Node internals and the `stream.Readable.prototype.pipe`
  implementation).
* Handles both read and write errors gracefully.
* Recognizes the `-u` option specified by POSIX (which is ignored, since
  nodecat is always unbuffered).
* Recognizes the `--` option delimiter, allowing filenames which begin with
  `-` after the delimiter.
* Asynchronous, non-blocking API to support concurrent use cases and
  caller-provided streams.

## Installation

[This package](https://www.npmjs.com/package/nodecat) can be
installed using [npm](https://www.npmjs.com/), either globally or locally, by
running:

```sh
npm install nodecat
```

## Recipes

### Concatenate a filename starting with -

```sh
$ nodecat -- -unfortunate-name.html footer.html > combined.html
```

### Concatenate to `stdout` via the API

```js
var nodecat = require('nodecat');
nodecat(
  ['header.html', '-', 'footer.html'],
  {fileStreams: {'-': process.stdin}},
  function(err) {
    if (err) {
      console.error('Error concatenating files: ', err);
    } else {
      console.error('Done concatenating files.');
    }
  }
);
```

### Concatenate to a `stream` via the API

To concatenate files into a `stream.Writable` (which may be a
`fs.WriteStream`, `net.Socket`, `tty.WriteStream`, `stream.PassThrough`, or
any other `stream.Writable` subtype):

```js
var nodecat = require('nodecat');
var stream = require('stream');
var outStream = stream.PassThrough();
var errStream = stream.PassThrough();
nodecat(
  ['header.html', '-', 'footer.html'],
  {
    fileStreams: {'-': process.stdin},
    outStream: outStream,
    errStream: errStream
  },
  function(err) {
    if (err) {
      console.error('Error concatenating files: ', err);
    } else {
      console.error('Done concatenating files.');
      console.error('Content:\n', String(outStream.read()));
    }
  }
);
```

Note:  When `nodecat` is called on large files and `stdout` is redirected to a
file, it may be useful to use `fs.createWriteStream('-', {fd: 1})` instead of
`process.stdout`, which does [synchronous
writes](https://nodejs.org/api/process.html#process_process_stdout).  Be sure
to end the stream before exiting.

More examples can be found in the [test
specifications](https://kevinoid.github.io/nodecat/spec).

## API Docs

To use this module as a library, see the [API
Documentation](https://kevinoid.github.io/nodecat/api).

## Contributing

Contributions are welcome and very much appreciated!  Please add tests to
cover any changes and ensure `npm test` passes.

If the desired change is large, complex, backwards-incompatible, can have
significantly differing implementations, or may not be in scope for this
project, opening an issue before writing the code can avoid frustration and
save a lot of time and effort.

## Alternatives

If nodecat does not satisfy your needs, you may want to consider these
alternatives:

* [cash-cat](https://www.npmjs.com/package/cash-cat)
* [minicat](https://www.npmjs.com/package/minicat)
* [posix-cat](https://www.npmjs.com/package/posix-cat)

## License

This package is available under the terms of the
[MIT License](https://opensource.org/licenses/MIT).
