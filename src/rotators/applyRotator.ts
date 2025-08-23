import { Rotator, Finding } from "../types";
import { safeUpdate } from "../fileSafeUpdate";

export const applyRotator: Rotator = {
  name: "apply",
  async rotate(finding: Finding) {
    const placeholder = `__REPLACED_SECRET_${Date.now()}__`;
    const res = await safeUpdate(finding.filePath, (content) => content.replace(finding.match, placeholder));
    if (res.success) return { success: true, message: `Replaced in ${finding.filePath} (backup: ${res.backupPath})` };
    return { success: false, message: `Failed to replace in ${finding.filePath}: ${res.error}` };
  },
};
