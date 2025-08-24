// TypeScript example rotator
// Build to JS before using at runtime, or place a compiled JS next to it.
import { defineRotator, Rotator } from '../../src/rotators/schema';

export const exampleTs: Rotator = defineRotator({
  name: 'example-ts',
  async rotate(finding, options) {
    const mode = options?.dryRun ? 'dry-run' : 'apply';
    return {
      success: true,
      message: `[${mode}] example-ts would handle ${finding.filePath}:${finding.line}`,
    };
  },
});
