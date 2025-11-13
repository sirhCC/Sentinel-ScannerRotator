import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Git integration for incremental scanning
 */

export interface GitDiffOptions {
  /**
   * Base ref to compare against (default: HEAD)
   */
  base?: string;

  /**
   * Include untracked files
   */
  includeUntracked?: boolean;

  /**
   * Include staged files
   */
  includeStaged?: boolean;

  /**
   * Repository root path
   */
  repoPath?: string;
}

export interface GitDiffResult {
  /**
   * Changed file paths (relative to repo root)
   */
  changedFiles: string[];

  /**
   * Whether this is a git repository
   */
  isGitRepo: boolean;

  /**
   * Repository root path
   */
  repoRoot?: string;
}

/**
 * Check if a directory is inside a git repository
 */
export async function isGitRepository(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the git repository
 */
export async function getGitRoot(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get list of changed files using git diff
 */
export async function getChangedFiles(options: GitDiffOptions = {}): Promise<GitDiffResult> {
  const {
    base = 'HEAD',
    includeUntracked = true,
    includeStaged = true,
    repoPath = process.cwd(),
  } = options;

  // Check if we're in a git repo
  const isRepo = await isGitRepository(repoPath);
  if (!isRepo) {
    return {
      changedFiles: [],
      isGitRepo: false,
    };
  }

  const repoRoot = await getGitRoot(repoPath);
  if (!repoRoot) {
    return {
      changedFiles: [],
      isGitRepo: false,
    };
  }

  const changedFiles = new Set<string>();

  try {
    // Get modified/deleted files (working tree)
    const { stdout: modifiedFiles } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=d', base],
      { cwd: repoPath },
    );
    modifiedFiles
      .split('\n')
      .filter(Boolean)
      .forEach((file) => changedFiles.add(path.join(repoRoot, file)));

    // Get staged files if requested
    if (includeStaged) {
      const { stdout: stagedFiles } = await execFileAsync(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=d', base],
        { cwd: repoPath },
      );
      stagedFiles
        .split('\n')
        .filter(Boolean)
        .forEach((file) => changedFiles.add(path.join(repoRoot, file)));
    }

    // Get untracked files if requested
    if (includeUntracked) {
      const { stdout: untrackedFiles } = await execFileAsync(
        'git',
        ['ls-files', '--others', '--exclude-standard'],
        { cwd: repoPath },
      );
      untrackedFiles
        .split('\n')
        .filter(Boolean)
        .forEach((file) => changedFiles.add(path.join(repoRoot, file)));
    }
  } catch {
    // If git commands fail, return empty list but indicate we're in a repo
    return {
      changedFiles: [],
      isGitRepo: true,
      repoRoot,
    };
  }

  return {
    changedFiles: Array.from(changedFiles),
    isGitRepo: true,
    repoRoot,
  };
}

/**
 * Get files changed between two commits/branches
 */
export async function getFilesBetween(
  base: string,
  head: string = 'HEAD',
  repoPath: string = process.cwd(),
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=d', `${base}...${head}`],
      { cwd: repoPath },
    );

    const repoRoot = await getGitRoot(repoPath);
    if (!repoRoot) return [];

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((file) => path.join(repoRoot, file));
  } catch {
    return [];
  }
}

/**
 * Get files changed in the last N commits
 */
export async function getRecentlyChangedFiles(
  commits: number = 1,
  repoPath: string = process.cwd(),
): Promise<string[]> {
  if (commits < 1) return [];

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', '--diff-filter=d', `HEAD~${commits}`, 'HEAD'],
      { cwd: repoPath },
    );

    const repoRoot = await getGitRoot(repoPath);
    if (!repoRoot) return [];

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((file) => path.join(repoRoot, file));
  } catch {
    return [];
  }
}
