import fs from 'fs/promises';
import path from 'path';

const DEFAULT_TMP_DIR = path.join(process.cwd(), '.sentinel_tmp');

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

export async function safeUpdate(filePath: string, transform: (content: string) => string) {
  await ensureTmpDir(DEFAULT_TMP_DIR);
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  const base = sanitizeRel(rel);
  const ts = Date.now();
  const backupPath = path.join(DEFAULT_TMP_DIR, `${base}.bak.${ts}`);
  const tmpPath = path.join(DEFAULT_TMP_DIR, `${base}.tmp.${ts}`);
  let backupMade = false;
  try {
    const original = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(backupPath, original, 'utf8');
    backupMade = true;
    const updated = transform(original);
    await fs.writeFile(tmpPath, updated, 'utf8');
    try {
      await fs.rename(tmpPath, filePath);
    } catch (renameErr: any) {
      // fallback: try copying the temp file into place (handles cross-device/FS issues)
      try {
        await fs.copyFile(tmpPath, filePath);
        try { await fs.unlink(tmpPath); } catch {}
      } catch (copyErr) {
        throw renameErr;
      }
    }
    return { success: true, backupPath };
  } catch (e: any) {
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
    return { success: false, error: e?.message ?? String(e) };
  }
}
