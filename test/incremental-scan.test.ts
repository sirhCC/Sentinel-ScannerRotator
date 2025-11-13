import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('incremental scanning', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-incremental-'));
    // Initialize git repo
    await execFileAsync('git', ['init'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('scans all files on first run without cache', async () => {
    // Create test files
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'nothing suspicious here');
    await fs.writeFile(path.join(tmpDir, 'file3.txt'), 'another clean file');

    // Commit all files
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan: should scan all files
    const findings1 = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
    });

    expect(findings1.length).toBeGreaterThan(0); // Should find AWS key
    expect(findings1.some((f) => f.filePath.includes('file1.txt'))).toBe(true);
  });

  it('only scans changed files on subsequent runs', async () => {
    // Create initial files
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'nothing suspicious here');
    await fs.writeFile(path.join(tmpDir, 'file3.txt'), 'another clean file');

    // Commit all files
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan: populate cache
    const findings1 = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
    });

    expect(findings1.length).toBeGreaterThan(0);
    const findingsWithSecrets = findings1.filter((f) => f.filePath.includes('file1.txt'));
    expect(findingsWithSecrets.length).toBeGreaterThan(0);

    // Modify only file2.txt (no secrets)
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'still nothing suspicious');

    // Second scan with incremental: should only scan file2.txt but return all findings
    const findings2 = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
    });

    // Should still return cached finding from file1.txt
    expect(findings2.length).toBeGreaterThanOrEqual(findingsWithSecrets.length);
    expect(findings2.some((f) => f.filePath.includes('file1.txt'))).toBe(true);
  });

  it('detects new files with incremental scanning', async () => {
    // Create .gitignore to exclude cache file
    await fs.writeFile(path.join(tmpDir, '.gitignore'), '.cache.json\n');

    // Create initial file
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'clean file');

    // Commit
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan
    const findings1 = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
    });

    expect(findings1.length).toBe(0);

    // Wait for cache to be fully written
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Add new file with secret (untracked)
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');

    // Small delay to ensure filesystem/git sees the file
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second scan: should detect new file
    const findings2 = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
    });

    expect(findings2.length).toBeGreaterThan(0);
    expect(findings2.some((f) => f.filePath.includes('file2.txt'))).toBe(true);
  });

  it('respects --no-incremental to scan all files', async () => {
    // Create files
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'nothing here');

    // Commit
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan to populate cache
    await scanPath(tmpDir, [], tmpDir, { cachePath, incremental: true });

    // Modify file2
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'still nothing');

    // Scan with incremental: false (should scan all files)
    const findings = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: false,
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.filePath.includes('file1.txt'))).toBe(true);
  });

  it('falls back to full scan when not in git repo', async () => {
    // Create a non-git directory
    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-non-git-'));

    try {
      await fs.writeFile(
        path.join(nonGitDir, 'file1.txt'),
        'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
      );

      const { scanPath } = await import('../src/scanner.js');
      const cachePath = path.join(nonGitDir, '.cache.json');

      // Should scan all files even with incremental enabled
      const findings = await scanPath(nonGitDir, [], nonGitDir, {
        cachePath,
        incremental: true,
      });

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.filePath.includes('file1.txt'))).toBe(true);
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it('uses gitBase option to compare against specific ref', async () => {
    // Create initial files
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'clean file');

    // Commit
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'commit 1'], { cwd: tmpDir });

    // Create tag
    await execFileAsync('git', ['tag', 'v1.0'], { cwd: tmpDir });

    // Add new file
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'commit 2'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan to populate cache
    await scanPath(tmpDir, [], tmpDir, { cachePath });

    // Scan with gitBase: should detect changes since v1.0
    const findings = await scanPath(tmpDir, [], tmpDir, {
      cachePath,
      incremental: true,
      gitBase: 'v1.0',
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.filePath.includes('file2.txt'))).toBe(true);
  });

  it('preserves cache entries for unchanged files in incremental mode', async () => {
    // Create files
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'nothing here');

    // Commit
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });

    const { scanPath } = await import('../src/scanner.js');
    const { loadCache } = await import('../src/cache.js');
    const cachePath = path.join(tmpDir, '.cache.json');

    // First scan
    await scanPath(tmpDir, [], tmpDir, { cachePath, incremental: true });

    // Load cache and count entries
    const cache1 = await loadCache(cachePath);
    const entries1Count = Object.keys(cache1.entries).length;
    expect(entries1Count).toBeGreaterThanOrEqual(2); // At least our 2 files

    // Modify only file2
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'still nothing');

    // Second scan
    await scanPath(tmpDir, [], tmpDir, { cachePath, incremental: true });

    // Cache should preserve entries (or grow slightly from detection of modified file)
    const cache2 = await loadCache(cachePath);
    const entries2Count = Object.keys(cache2.entries).length;

    // In incremental mode, we don't prune unchanged entries
    expect(entries2Count).toBeGreaterThanOrEqual(entries1Count);
  });
});
