import fs from 'fs/promises';
import path from 'path';
import ignore from 'ignore';

// load .gitignore, .secretignore if present and accept extra patterns
export async function loadIgnorePatterns(startDir: string, extraPatterns?: string[]): Promise<ignore.Ignore> {
  const ig = ignore();
  const files = ['.gitignore', '.secretignore'];
  for (const f of files) {
    const p = path.join(startDir, f);
    try {
      const content = await fs.readFile(p, 'utf8');
      ig.add(content.split(/\r?\n/));
    } catch (e) {
      // ignore missing file
    }
  }
  if (extraPatterns && extraPatterns.length) {
    ig.add(extraPatterns);
  }
  return ig;
}
