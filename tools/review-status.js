/*
 * Read-only review record: .ai/last-review.json, relative to the Git root.
 * The external reviewer writes:
 * { "digest": "<SHA-256 hex from --hash>", "baseRef": "",
 *   "verdict": "VERDICT: CHANGES REQUESTED", "timestamp": "2026-09-21T12:00:00Z" }
 * baseRef is the original ref passed to the reviewer; "" means HEAD.
 * timestamp is an ISO timestamp. Additional fields are allowed.
 * The digest covers the index (what would be committed), not the working tree.
 * Hash input is the length-prefixed index diff, excluding .ai/.
 * The base ref and review metadata themselves are not hashed.
 */
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd: cwd, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
    });
}

function digest(root, baseRef) {
    var from = baseRef ? git(['merge-base', baseRef, 'HEAD'], root).toString('utf8').trim() : 'HEAD';
    var hash = crypto.createHash('sha256');
    function add(bytes) {
        hash.update(String(bytes.length) + ':');
        hash.update(bytes);
    }
    // Disable rename detection for stable diff output.
    add(git(['diff', '--cached', from, '--no-renames', '--', '.', ':!.ai'], root));
    return hash.digest('hex');
}

function readRecord(root) {
    try {
        var record = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'last-review.json'), 'utf8'));
        if (!record || typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(record.digest) ||
                typeof record.baseRef !== 'string' || typeof record.verdict !== 'string' ||
                !record.verdict.trim() || typeof record.timestamp !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T/.test(record.timestamp) || !Number.isFinite(Date.parse(record.timestamp))) {
            return null;
        }
        return record;
    } catch (err) {
        return null;
    }
}

try {
    var args = process.argv.slice(2);
    if (args.length && (args[0] !== '--hash' || args.length > 2)) {
        throw new Error('Usage: node tools/review-status.js [--hash [baseRef]]');
    }
    var root = git(['rev-parse', '--show-toplevel'], process.cwd()).toString('utf8').trim();
    if (args[0] === '--hash') {
        console.log(digest(root, args[1] || ''));
    } else {
        var record = readRecord(root);
        if (!record) {
            console.log('NO REVIEW RECORDED - no usable .ai/last-review.json; run the reviewer.');
            process.exitCode = 1;
        } else {
            console.log('Recorded VERDICT: ' + record.verdict);
            console.log('Base ref: ' + (record.baseRef || 'HEAD (default)'));
            console.log('Review ran: ' + record.timestamp);
            try {
                var fresh = digest(root, record.baseRef) === record.digest.toLowerCase();
                console.log(fresh ? 'FRESH - recorded review covers the current tree; freshness is not approval.' :
                    'STALE - recorded review does not cover the current tree. Re-run the reviewer.');
                process.exitCode = fresh ? 0 : 1;
            } catch (err) {
                console.log('STALE - cannot verify the recorded review. Re-run the reviewer.');
                process.exitCode = 1;
            }
            if (/CHANGES REQUESTED/i.test(record.verdict)) {
                console.log('STOP: the reviewer requested changes; this review is not approval to commit.');
                // Non-zero even when FRESH: a current review that demanded changes is
                // not approval, and the exit code must not say otherwise.
                process.exitCode = 1;
            }
        }
    }
} catch (err) {
    console.error('Review status failed: ' + err.message);
    process.exitCode = 1;
}
