import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

describe('rotator loader', () => {
  it('loads built-in rotators', async () => {
    const { loadRotators } = await import('../src/rotators/loader');
    const list = await loadRotators();
    const names = list.map((r) => r.name).sort();
    expect(names).toContain('dry-run');
    expect(names).toContain('apply');
  });

  it('can load a custom rotator from an extra directory', async () => {
    const { loadRotators } = await import('../src/rotators/loader');
    const dir = path.join(process.cwd(), 'tmp-rotators');
    try {
      fs.mkdirSync(dir);
    } catch {}
    const file = path.join(dir, 'customRotator.js');
    fs.writeFileSync(
      file,
      `export const custom = { name: 'custom', async rotate() { return { success: true, message: 'ok'}; } };`,
    );
    const list = await loadRotators({ extraDirs: [dir] });
    const names = list.map((r) => r.name);
    expect(names).toContain('custom');
    try {
      fs.rmSync(dir, { recursive: true });
    } catch {}
  });

  it('loads the example rotator from examples/rotators', async () => {
    const { loadRotators } = await import('../src/rotators/loader');
    const dir = path.join(process.cwd(), 'examples', 'rotators');
    const list = await loadRotators({ extraDirs: [dir] });
    const names = list.map((r) => r.name);
    expect(names).toContain('example');
  });
});
