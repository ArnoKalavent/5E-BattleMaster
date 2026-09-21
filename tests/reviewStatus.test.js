/* Review freshness tests in an isolated Git repository. Run with: npm test */
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var tool = path.resolve(__dirname, '..', 'tools', 'review-status.js');
var fixture = fs.mkdtempSync(path.join(__dirname, 'review-status-tmp-'));
var failures = 0;

function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
function git(args) {
    return childProcess.execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function write(name, content) { fs.writeFileSync(path.join(fixture, name), content); }
function run(args) {
    return childProcess.spawnSync(process.execPath, [tool].concat(args || []), { cwd: fixture, encoding: 'utf8' });
}
function hash(base) {
    var result = run(['--hash'].concat(base ? [base] : []));
    if (result.status !== 0) { throw new Error(result.stderr); }
    return result.stdout.trim();
}
function record(value, base, verdict) {
    write('.ai/last-review.json', JSON.stringify({
        digest: value, baseRef: base || '',
        verdict: verdict || 'VERDICT: CHANGES REQUESTED', timestamp: '2026-09-21T12:00:00Z'
    }));
}

try {
    git(['init']);
    git(['config', 'user.email', 'review-test@example.invalid']);
    git(['config', 'user.name', 'Review Test']);
    git(['config', 'core.autocrlf', 'false']);
    write('.gitignore', '.ai/\n');
    write('tracked.txt', 'original\n');
    git(['add', '.']);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture']);
    git(['branch', 'review-base']);

    var initial = hash();
    expect('hash stdout is only a hex digest and newline', run(['--hash']).stdout, initial + '\n');
    expect('hash is SHA-256 hex', /^[a-f0-9]{64}$/.test(initial), true);
    expect('unchanged index is deterministic', hash(), initial);
    write('tracked.txt', 'edited\n');
    expect('unstaged tracked edit does not change digest', hash(), initial);
    git(['add', 'tracked.txt']);
    var edited = hash();
    expect('staging tracked modification changes digest', edited !== initial, true);
    write('tracked.txt', 'original\n');
    expect('reverting worktree preserves staged digest', hash(), edited);
    expect('staged change with reverted worktree differs from baseline', hash() !== initial, true);
    expect('unchanged staged index is deterministic', hash(), edited);
    write('untracked space.txt', 'new\n');
    expect('untracked file does not change digest', hash(), edited);
    write('untracked space.txt', 'changed\n');
    expect('untracked contents do not change digest', hash(), edited);
    fs.renameSync(path.join(fixture, 'untracked space.txt'), path.join(fixture, 'renamed.txt'));
    expect('untracked path does not change digest', hash(), edited);
    fs.unlinkSync(path.join(fixture, 'renamed.txt'));

    fs.mkdirSync(path.join(fixture, '.ai'));
    write('.ai/scratch.txt', 'scratch');
    expect('.ai addition is excluded', hash(), edited);
    write('.ai/scratch.txt', 'different scratch');
    expect('.ai edits are excluded', hash(), edited);
    // Pin the pathspec exclusion even if scratch is accidentally force-tracked.
    git(['add', '-f', '.ai/scratch.txt']);
    expect('tracked .ai changes are excluded', hash(), edited);
    git(['reset', '--', '.ai/scratch.txt']);

    write('new staged space.txt', 'new staged content\n');
    var beforeStaging = hash();
    git(['add', 'new staged space.txt']);
    var stagedAddition = hash();
    expect('staging previously untracked file changes digest', stagedAddition !== beforeStaging, true);
    write('new staged space.txt', 'edited after staging\n');
    var afterStagedEdit = hash();
    expect('working-tree edits to staged new files do not change digest', afterStagedEdit, stagedAddition);
    write('.ai/scratch.txt', 'scratch with staged new file');
    expect('.ai edits with staged new files are excluded', hash(), afterStagedEdit);
    git(['add', '-f', '.ai/scratch.txt']);
    expect('staged .ai additions with staged new files are excluded', hash(), afterStagedEdit);
    fs.unlinkSync(path.join(fixture, 'new staged space.txt'));
    var missingAddition = run(['--hash']);
    expect('deleted staged addition hashes successfully', missingAddition.status, 0);
    expect('deleted staged addition does not throw', missingAddition.stderr, '');
    expect('deleted staged addition digest is stable', run(['--hash']).stdout, missingAddition.stdout);
    expect('deleted staged addition preserves index digest', missingAddition.stdout.trim(), stagedAddition);
    git(['reset']);
    expect('fixture staging verification resets cleanly', hash(), initial);

    var result = run();
    expect('missing record reports no review', result.stdout.includes('NO REVIEW RECORDED'), true);
    expect('missing record exits 1', result.status, 1);
    ['', '{broken', '{}', 'null'].forEach(function (invalid) {
        write('.ai/last-review.json', invalid);
        result = run();
        expect('invalid record reports no review: ' + invalid, result.stdout.includes('NO REVIEW RECORDED'), true);
        expect('invalid record exits 1', result.status, 1);
        expect('invalid record does not throw', result.stderr, '');
    });
    fs.unlinkSync(path.join(fixture, '.ai/last-review.json'));
    fs.mkdirSync(path.join(fixture, '.ai/last-review.json'));
    expect('unreadable record reports no review', run().stdout.includes('NO REVIEW RECORDED'), true);
    fs.rmdirSync(path.join(fixture, '.ai/last-review.json'));

    record(hash());
    result = run();
    expect('matching record is FRESH', result.stdout.includes('FRESH -'), true);
    // A current review that demanded changes is not approval. The exit code must
    // say so too - the STOP line alone is not enough for anything scripted.
    expect('FRESH but changes requested exits 1', result.status, 1);
    expect('FRESH surfaces verdict', result.stdout.includes('Recorded VERDICT: VERDICT: CHANGES REQUESTED'), true);
    expect('changes requested explicitly stops approval', result.stdout.includes('STOP:'), true);
    expect('report includes default base', result.stdout.includes('Base ref: HEAD (default)'), true);
    expect('report includes timestamp', result.stdout.includes('2026-09-21T12:00:00Z'), true);

    // The only combination that means "safe to commit": current AND approved.
    record(hash(), '', 'VERDICT: PASS');
    result = run();
    expect('FRESH and PASS is the approving case', result.stdout.includes('FRESH -'), true);
    expect('FRESH and PASS exits 0', result.status, 0);
    expect('FRESH and PASS does not print STOP', result.stdout.includes('STOP:'), false);
    record(hash());
    write('tracked.txt', 'post-review fix\n');
    git(['add', 'tracked.txt']);
    result = run();
    expect('post-review staged edit is STALE', result.stdout.includes('STALE -'), true);
    expect('STALE exits 1', result.status, 1);
    expect('STALE surfaces verdict', result.stdout.includes('CHANGES REQUESTED'), true);
    expect('STALE asks for re-review', result.stdout.includes('Re-run the reviewer'), true);

    git(['add', 'tracked.txt']);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'second fixture commit']);
    expect('default hashes diff from HEAD', hash(), initial);
    expect('explicit base includes committed changes', hash('review-base') !== hash(), true);
    // PASS verdict so exit 0 means "fresh" here rather than "fresh and approved".
    record(hash('review-base'), 'review-base', 'VERDICT: PASS');
    result = run();
    expect('report recomputes with recorded base', result.stdout.includes('FRESH -'), true);
    expect('report recomputes with recorded base (exit)', result.status, 0);
    expect('report displays recorded base', result.stdout.includes('Base ref: review-base'), true);
    // Re-record with the default changes-requested verdict BEFORE the orphan
    // checkout: the next case asserts the verdict is still surfaced when the
    // digest cannot be recomputed, and after the checkout hash() itself fails.
    record(hash('review-base'), 'review-base');
    git(['checkout', '--orphan', 'unrelated']);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'unrelated root']);
    result = run();
    expect('unresolvable merge-base is STALE', result.stdout.includes('STALE -'), true);
    expect('failed hash still surfaces verdict', result.stdout.includes('CHANGES REQUESTED'), true);
    expect('failed hash exits 1', result.status, 1);
} finally {
    // mkdtempSync created this exact directory under tests; never remove the repo.
    fs.rmSync(fixture, { recursive: true, force: true });
}

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
