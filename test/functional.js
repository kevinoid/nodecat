/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const binPath = path.join(__dirname, '..', 'bin', 'nodecat.js');
const testFiles = [
  path.join(__dirname, '..', 'doc-src', 'spec', 'footer.xhtml'),
  path.join(__dirname, '..', 'doc-src', 'spec', 'header.xhtml'),
];
const testFileContent = testFiles.reduce((contents, file) => {
  contents[file] = fs.readFileSync(file);
  return contents;
}, {});

describe('nodecat', () => {
  it('concatenates files around stdin', (done) => {
    const testContent = Buffer.allocUnsafe(256);
    for (let i = 0; i < 256; i += 1) {
      testContent[i] = i;
    }

    const proc = execFile(
      process.execPath,
      [
        binPath,
        testFiles[0],
        '-',
        testFiles[1],
      ],
      { encoding: null },
      (err, stdout, stderr) => {
        assert.ifError(err);
        const expected = Buffer.concat([
          testFileContent[testFiles[0]],
          testContent,
          testFileContent[testFiles[1]],
        ]);
        if (typeof stdout === 'string') {
          // Node 0.10 doesn't support returning Buffer
          assert.deepStrictEqual(stdout, String(expected));
          assert.deepStrictEqual(stderr, '');
        } else {
          assert.deepStrictEqual(stdout, expected);
          assert.deepStrictEqual(stderr, Buffer.alloc(0));
        }
        done();
      },
    );
    proc.stdin.end(testContent);
  });

  it('exits code 1 with error message for non-existent file', (done) => {
    const testContent = Buffer.allocUnsafe(256);
    for (let i = 0; i < 256; i += 1) {
      testContent[i] = i;
    }

    const badFilename = 'nonexistent.txt';
    const proc = execFile(
      process.execPath,
      [
        binPath,
        badFilename,
        testFiles[0],
        '-',
        testFiles[1],
      ],
      { encoding: null },
      (err, stdout, stderr) => {
        assert.strictEqual(err.code, 1);

        // stdout has data that can be read
        const expected = Buffer.concat([
          testFileContent[testFiles[0]],
          testContent,
          testFileContent[testFiles[1]],
        ]);
        if (typeof stdout === 'string') {
          // Node 0.10 doesn't support returning Buffer
          assert.deepStrictEqual(stdout, String(expected));
        } else {
          assert.deepStrictEqual(stdout, expected);
        }

        // stderr contains an error message with the problematic file
        const stderrStr = String(stderr);
        assert(
          stderrStr.includes(badFilename),
          `"${stderrStr}" should contain "${badFilename}"`,
        );
        done();
      },
    );
    proc.stdin.end(testContent);
  });
});
