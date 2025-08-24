import { Rotator, Finding } from "../types.js";
import { safeUpdate } from "../fileSafeUpdate.js";

export const applyRotator: Rotator = {
  name: "apply",
  async rotate(finding: Finding, options?: { dryRun?: boolean; template?: string }) {
    const ts = Date.now();
    const placeholder = options?.template
      ? options.template
          .replace(/\{\{match\}\}/g, finding.match)
          .replace(/\{\{timestamp\}\}/g, String(ts))
          .replace(/\{\{file\}\}/g, finding.filePath)
      : `__REPLACED_SECRET_${ts}__`;
    const res = await safeUpdate(
      finding.filePath,
      (content) => content.replace(finding.match, placeholder)
    );
    if (res.success) return { success: true, message: `Replaced in ${finding.filePath} (backup: ${res.backupPath})` };
    return { success: false, message: `Failed to replace in ${finding.filePath}: ${res.error}` };
  },
};
