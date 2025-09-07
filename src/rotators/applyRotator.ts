import { Rotator, Finding } from "../types.js";
import { safeUpdate } from "../fileSafeUpdate.js";

export const applyRotator: Rotator = {
  name: "apply",
  async rotateFile(filePath, findings, options) {
    if (!Array.isArray(findings) || !findings.length) return [];
    if (options?.dryRun) {
      return findings.map(f => ({ success: true, message: `Would replace in ${filePath}:${f.line}` }));
    }
    const ts = Date.now();
    const replacements = findings.map(f => ({
      raw: f.match,
      placeholder: (options?.template
        ? options.template
          .replace(/\{\{match\}\}/g, f.match)
          .replace(/\{\{timestamp\}\}/g, String(ts))
          .replace(/\{\{file\}\}/g, f.filePath)
        : `__REPLACED_SECRET_${ts}__`),
    }));
    const res = await safeUpdate(filePath, (content) => {
      let out = content;
      for (const r of replacements) {
        const esc = r.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(esc, 'g'), r.placeholder);
      }
      return out;
    });
    if (res.success) {
      return [{ success: true, message: `Replaced in ${filePath} (backup: ${res.backupPath})` }];
    }
    return [{ success: false, message: `Failed to replace in ${filePath}: ${res.error}` }];
  },
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
      (content) => {
        // Replace all occurrences of the exact matched string
        if (!finding.match) return content;
        // Escape special regex chars and use global replacement
        const esc = finding.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return content.replace(new RegExp(esc, 'g'), placeholder);
      }
    );
    if (res.success) return { success: true, message: `Replaced in ${finding.filePath} (backup: ${res.backupPath})` };
    return { success: false, message: `Failed to replace in ${finding.filePath}: ${res.error}` };
  },
};
