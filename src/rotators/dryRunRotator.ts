import { Rotator, Finding } from "../types";

export const dryRunRotator: Rotator = {
  name: "dry-run",
  async rotate(finding: Finding) {
    return { success: true, message: `Would rotate ${finding.match} in ${finding.filePath}:${finding.line}` };
  },
};
