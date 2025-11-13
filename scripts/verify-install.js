#!/usr/bin/env node

/**
 * Post-install verification script
 * Ensures the package is correctly installed and executable
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Verifying SecretSentinel installation...\n');

try {
  // Check dist folder exists
  const distPath = join(__dirname, 'dist');
  if (!existsSync(distPath)) {
    console.error('❌ Error: dist/ folder not found. Package may not be built correctly.');
    process.exit(1);
  }
  console.log('✅ Build artifacts found');

  // Check main entry point
  const cliPath = join(__dirname, 'dist', 'cli.js');
  if (!existsSync(cliPath)) {
    console.error('❌ Error: CLI entry point not found at dist/cli.js');
    process.exit(1);
  }
  console.log('✅ CLI entry point exists');

  // Check config directory
  const configPath = join(__dirname, 'config', 'defaults.json');
  if (!existsSync(configPath)) {
    console.warn('⚠️  Warning: Default config not found. Scanner may use built-in patterns only.');
  } else {
    console.log('✅ Default configuration found');
  }

  console.log('\n✨ SecretSentinel is ready to use!');
  console.log('\nQuick start:');
  console.log('  sentinel --help              # Show all options');
  console.log('  sentinel . --rotator dry-run # Scan current directory');
  console.log('  sentinel --version           # Show version\n');

} catch (error) {
  console.error('❌ Installation verification failed:', error.message);
  process.exit(1);
}
