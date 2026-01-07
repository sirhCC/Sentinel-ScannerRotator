import fs from 'fs/promises';
import path from 'path';
import { validateFilePath } from './validation.js';
import { toError } from './types/errors.js';

function resolveTmpDir() {
  const fromEnv = process.env.SENTINEL_TMP_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv);
  }
  return path.join(process.cwd(), '.sentinel_tmp');
}

async function ensureTmpDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function sanitizeRel(rel: string) {
  return rel.replace(/[\\/]/g, '_');
}

/**
 * Safely update a file with atomic write and automatic backup/rollback
 * @param filePath - Absolute path to the file to update
 * @param transform - Function that transforms the file content
 * @returns Result object with success status and backup path or error message
 */
export async function safeUpdate(filePath: string, transform: (content: string) => string) {
  // Validate file path to prevent directory traversal
  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    return { success: false, error: `Invalid file path: ${validation.error}` };
  }

  const TMP_DIR = resolveTmpDir();
  await ensureTmpDir(TMP_DIR);
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  const base = sanitizeRel(rel);
  const ts = Date.now();
  const backupPath = path.join(TMP_DIR, `${base}.bak.${ts}`);
  const tmpPath = path.join(TMP_DIR, `${base}.tmp.${ts}`);
  let backupMade = false;
  try {
    const original = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(backupPath, original, 'utf8');
    backupMade = true;
    const updated = transform(original);
    await fs.writeFile(tmpPath, updated, 'utf8');
    try {
      await fs.rename(tmpPath, filePath);
    } catch (renameErr) {
      // fallback: try copying the temp file into place (handles cross-device/FS issues)
      try {
        await fs.copyFile(tmpPath, filePath);
        try {
          await fs.unlink(tmpPath);
        } catch {}
      } catch {
        throw renameErr;
      }
    }
    return { success: true, backupPath };
  } catch (e) {
    const error = toError(e);
    // attempt rollback
    try {
      if (backupMade) {
        await fs.copyFile(backupPath, filePath);
      }
    } catch {
      // ignore rollback failure
    }
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    return { success: false, error: error.message };
  }
}
