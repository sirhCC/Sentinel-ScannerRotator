import { Rotator, Finding } from "../types";
import fs from "fs/promises";

export const applyRotator: Rotator = {
  name: "apply",
  async rotate(finding: Finding) {
    // naive replacement: overwrite the file replacing the matched token with a placeholder.
    try {
      const content = await fs.readFile(finding.filePath, "utf8");
      const replaced = content.replace(finding.match, `__REPLACED_SECRET_${Date.now()}__`);
      await fs.writeFile(finding.filePath, replaced, "utf8");
      return { success: true, message: `Replaced in ${finding.filePath}` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  },
};
