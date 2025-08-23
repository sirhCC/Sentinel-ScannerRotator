import fs from 'fs/promises';
import path from 'path';
import ignore from 'ignore';

export async function loadIgnorePatterns(startDir: string): Promise<ignore.Ignore> {
  const ig = ignore();
  const gitignore = path.join(startDir, '.gitignore');
  try {
    const content = await fs.readFile(gitignore, 'utf8');
    ig.add(content.split(/\r?\n/));
  } catch (e) {
    // no .gitignore is fine
  }
  return ig;
}
