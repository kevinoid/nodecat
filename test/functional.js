/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assert = require('assert');
var execFile = require('child_process').execFile;
var fs = require('fs');
var path = require('path');

var deepEqual = assert.deepStrictEqual || assert.deepEqual;
var binPath = path.join(__dirname, '..', 'bin', 'nodecat.js');
var testFiles = [
  path.join(__dirname, '..', 'doc-src', 'spec', 'footer.xhtml'),
  path.join(__dirname, '..', 'doc-src', 'spec', 'header.xhtml')
];
var testFileContent = testFiles.reduce(function(contents, file) {
  contents[file] = fs.readFileSync(file);
  return contents;
}, {});

describe('nodecat', function() {
  it('concatenates files around stdin', function(done) {
    var testContent = new Buffer(256);
    for (var i = 0; i < 256; i += 1) {
      testContent[i] = i;
    }

    var proc = execFile(
      process.execPath,
      [
        binPath,
        testFiles[0],
        '-',
        testFiles[1]
      ],
      {encoding: null},
      function(err, stdout, stderr) {
        assert.ifError(err);
        var expected = Buffer.concat([
          testFileContent[testFiles[0]],
          testContent,
          testFileContent[testFiles[1]]
        ]);
        if (typeof stdout === 'string') {
          // Node 0.10 doesn't support returning Buffer
          deepEqual(stdout, String(expected));
          deepEqual(stderr, '');
        } else {
          deepEqual(stdout, expected);
          deepEqual(stderr, new Buffer(0));
        }
        done();
      }
    );
    proc.stdin.end(testContent);
  });

  it('exits code 1 with error message for non-existent file', function(done) {
    var testContent = new Buffer(256);
    for (var i = 0; i < 256; i += 1) {
      testContent[i] = i;
    }

    var proc = execFile(
      process.execPath,
      [
        binPath,
        'nonexistent.txt',
        testFiles[0],
        '-',
        testFiles[1]
      ],
      {encoding: null},
      function(err, stdout, stderr) {
        assert.strictEqual(err.code, 1);

        // stdout has data that can be read
        var expected = Buffer.concat([
          testFileContent[testFiles[0]],
          testContent,
          testFileContent[testFiles[1]]
        ]);
        if (typeof stdout === 'string') {
          // Node 0.10 doesn't support returning Buffer
          deepEqual(stdout, String(expected));
        } else {
          deepEqual(stdout, expected);
        }

        // stderr contains an error message with the problematic file
        var stderrStr = String(stderr);
        assert(
          /nonexistent\.txt/i.test(stderrStr),
          stderrStr + ' should contain "nonexistent.txt"'
        );
        done();
      }
    );
    proc.stdin.end(testContent);
  });
});
