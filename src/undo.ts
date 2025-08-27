import fs from 'fs/promises';
import path from 'path';

function resolveTmpDir() {
  const fromEnv = process.env.SENTINEL_TMP_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv);
  return path.join(process.cwd(), '.sentinel_tmp');
}

function sanitizeRel(rel: string) {
  return rel.replace(/[\\/]/g, '_');
}

export async function restoreLastBackup(targetFile: string): Promise<{ success: boolean; message: string }>{
  const TMP = resolveTmpDir();
  const rel = path.relative(process.cwd(), targetFile) || path.basename(targetFile);
  const base = sanitizeRel(rel);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(TMP);
  } catch {
    return { success: false, message: `No temp dir found at ${TMP}` };
  }
  const prefix = `${base}.bak.`;
  const candidates = entries.filter((e) => e.startsWith(prefix));
  if (!candidates.length) return { success: false, message: `No backups found for ${rel} in ${TMP}` };
  // pick the one with the largest timestamp suffix
  let best: string | undefined;
  let bestTs = -1;
  for (const c of candidates) {
    const tsStr = c.substring(prefix.length);
    const ts = Number(tsStr);
    if (!Number.isNaN(ts) && ts > bestTs) { bestTs = ts; best = c; }
  }
  if (!best) return { success: false, message: `No valid backups found for ${rel}` };
  const backupPath = path.join(TMP, best);
  try {
    const content = await fs.readFile(backupPath, 'utf8');
    await fs.writeFile(targetFile, content, 'utf8');
    return { success: true, message: `Restored ${rel} from ${path.relative(process.cwd(), backupPath)}` };
  } catch (e: any) {
    return { success: false, message: `Failed to restore: ${e?.message || e}` };
  }
}
