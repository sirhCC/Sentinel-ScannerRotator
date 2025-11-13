import fs from 'fs/promises';
import path from 'path';
import ignoreModule from 'ignore';

// load .gitignore, .secretignore if present and accept extra patterns
export async function loadIgnorePatterns(startDir: string, extraPatterns?: string[]): Promise<any> {
  const createIgnore = ignoreModule as unknown as (options?: any) => any;
  const ig = createIgnore();
  const files = ['.gitignore', '.secretignore'];
  for (const f of files) {
    const p = path.join(startDir, f);
    try {
      const content = await fs.readFile(p, 'utf8');
      ig.add(content.split(/\r?\n/));
    } catch {
      // ignore missing file
    }
  }
  if (extraPatterns && extraPatterns.length) {
    ig.add(extraPatterns);
  }
  return ig;
}
