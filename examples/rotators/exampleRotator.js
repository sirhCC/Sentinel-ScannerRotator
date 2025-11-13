// Minimal example custom rotator
// Usage: sentinel <target> --rotators-dir ./examples/rotators --rotator example
export const example = {
  name: 'example',
  async rotate(finding) {
    // do nothing, just report
    return { success: true, message: `example would handle: ${finding.filePath}:${finding.line}` };
  },
};
