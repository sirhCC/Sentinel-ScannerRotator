# Contributing to SecretSentinel

Thank you for your interest in contributing to SecretSentinel Scanner & Rotator! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Release Process](#release-process)

---

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**

- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**

- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (recommended)
- **npm** 7+ or **yarn** 1.22+
- **Git** 2.30+
- **TypeScript** knowledge (for core contributions)
- **PowerShell** or **Bash** (for running scripts)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

```powershell
git clone https://github.com/YOUR_USERNAME/Sentinel-ScannerRotator.git
cd Sentinel-ScannerRotator
```

3. Add upstream remote:

```powershell
git remote add upstream https://github.com/sirhCC/Sentinel-ScannerRotator.git
```

### Install Dependencies

```powershell
npm install
```

### Build

```powershell
npm run build
```

### Run Tests

```powershell
npm test
```

---

## Development Workflow

### 1. Create a Branch

```powershell
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

**Branch naming conventions:**

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications
- `chore/` - Maintenance tasks

### 2. Make Changes

Follow the [Coding Standards](#coding-standards) below.

### 3. Test Your Changes

```powershell
# Run all tests
npm test

# Run specific test file
npx vitest run test/scanner.test.ts

# Run tests in watch mode
npx vitest

# Check test coverage
npm run test:coverage
```

### 4. Lint and Format

```powershell
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### 5. Commit Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```powershell
git commit -m "feat: add new scanner plugin for YAML files"
git commit -m "fix: resolve cache corruption on Windows"
git commit -m "docs: update API documentation for rotators"
```

**Commit types:**

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Code style/formatting (no code change)
- `refactor:` - Code refactoring
- `test:` - Test additions or corrections
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

**Examples:**

```powershell
feat(scanner): add support for .env.local files
fix(cache): prevent corruption on concurrent writes
docs(api): document error handling utilities
test(rotator): add tests for backend rotator retry logic
```

### 6. Keep Your Branch Updated

```powershell
git fetch upstream
git rebase upstream/main
```

### 7. Push to Your Fork

```powershell
git push origin feature/your-feature-name
```

### 8. Open a Pull Request

Go to GitHub and create a pull request from your fork to the main repository.

---

## Testing

### Test Structure

Tests are located in the `test/` directory:

```
test/
├── scanner.test.ts          # Scanner core tests
├── rotator.test.ts          # Rotator tests
├── cache.test.ts            # Cache tests
├── error-handling.test.ts   # Error handling utilities
└── e2e.test.ts             # End-to-end tests
```

### Writing Tests

We use [Vitest](https://vitest.dev/) for testing:

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should do something', () => {
    expect(myFunction()).toBe('expected result');
  });

  it('should handle errors', async () => {
    await expect(async () => {
      await failingFunction();
    }).rejects.toThrow('Expected error');
  });
});
```

### Test Coverage

Aim for at least **80% code coverage** for new features:

```powershell
npm run test:coverage
```

### Test Best Practices

1. **One assertion per test** (when possible)
2. **Clear test names** that describe what's being tested
3. **Arrange-Act-Assert** pattern:
   ```typescript
   it('should calculate total', () => {
     // Arrange
     const items = [1, 2, 3];
     
     // Act
     const result = calculateTotal(items);
     
     // Assert
     expect(result).toBe(6);
   });
   ```
4. **Mock external dependencies**
5. **Clean up after tests** (temp files, database connections, etc.)

---

## Documentation

### Types of Documentation

1. **Code Comments**
   - Use JSDoc for exported functions
   - Explain "why" not "what"
   - Keep comments up to date

2. **API Documentation** (API.md)
   - Document all public APIs
   - Provide usage examples
   - List parameters and return types

3. **README**
   - Quick start guide
   - Feature overview
   - Basic usage examples

4. **Migration Guides** (MIGRATION.md)
   - Breaking changes
   - Migration steps
   - Before/after examples

5. **Changelog** (CHANGELOG.md)
   - All notable changes
   - Follow Keep a Changelog format
   - Group by Added/Changed/Fixed/Security

### Documentation Standards

#### Code Comments

Use JSDoc for exported functions:

```typescript
/**
 * Scans a file for secrets using the provided rules
 * @param filePath - Absolute path to the file to scan
 * @param rules - Array of rules to match against
 * @param options - Optional scanning options
 * @returns Promise resolving to array of findings
 * @throws {Error} If file cannot be read
 * @example
 * ```typescript
 * const findings = await scanFile('/path/to/file.ts', rules, {
 *   logger: console,
 *   cache: true,
 * });
 * ```
 */
export async function scanFile(
  filePath: string,
  rules: Rule[],
  options?: ScanOptions
): Promise<Finding[]> {
  // Implementation
}
```

#### README Sections

When adding features, update README:

1. **Features** - Add to feature table
2. **Installation** - If installation changes
3. **Usage** - Add usage examples
4. **Configuration** - Document new config options
5. **CLI** - Document new flags

#### Changelog Updates

Update CHANGELOG.md with every PR:

```markdown
## [Unreleased]

### Added

- New feature description (#PR-number)
- Another feature (#PR-number)

### Changed

- Modified behavior (#PR-number)

### Fixed

- Bug fix description (#PR-number)
```

---

## Pull Request Process

### Before Opening a PR

- [ ] Tests pass: `npm test`
- [ ] Linter passes: `npm run lint`
- [ ] Code formatted: `npm run format`
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Branch up to date with main

### PR Title Format

Use conventional commit format:

```
feat(scanner): add YAML file support
fix(cache): resolve corruption on Windows
docs(api): add examples for custom rotators
```

### PR Description Template

```markdown
## Description

Brief description of the changes.

## Motivation

Why is this change needed? What problem does it solve?

## Changes Made

- Change 1
- Change 2
- Change 3

## Testing

How was this tested?

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Breaking Changes

List any breaking changes and migration steps.

## Checklist

- [ ] Tests pass
- [ ] Linter passes
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] No merge conflicts
```

### Review Process

1. **Automated Checks** - CI must pass
2. **Code Review** - At least one approval required
3. **Testing** - Reviewer may request additional tests
4. **Documentation** - Reviewer may request doc updates
5. **Revisions** - Address review comments
6. **Merge** - Maintainer will merge when approved

### After Merge

- Delete your branch
- Update your fork
- Close related issues

---

## Coding Standards

### TypeScript

- Use **TypeScript** for all source code
- Enable strict mode in `tsconfig.json`
- Avoid `any` - use proper types
- Export types for public APIs

### Code Style

We use **Prettier** for formatting and **ESLint** for linting:

```typescript
// Good
export async function scanFile(
  filePath: string,
  rules: Rule[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  // Implementation
  return findings;
}

// Bad
export async function scanFile(filePath,rules) {
    let findings = []
    return findings
}
```

### Naming Conventions

- **Files**: kebab-case (`error-handling.ts`)
- **Classes**: PascalCase (`CircuitBreaker`)
- **Functions**: camelCase (`scanFile`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_RETRY_OPTIONS`)
- **Interfaces**: PascalCase (`Rotator`)
- **Types**: PascalCase (`Finding`)

### Error Handling

- Use `try-catch` for async operations
- Throw meaningful errors
- Use custom error classes when appropriate
- Always mask secrets before logging

```typescript
// Good
try {
  await riskyOperation();
} catch (error) {
  const masked = maskError(error as Error);
  logger.error(`Operation failed: ${masked.message}`);
  throw new Error(`Failed to complete operation: ${masked.message}`);
}

// Bad
try {
  await riskyOperation();
} catch (error) {
  console.log(error); // May leak secrets!
  throw error;
}
```

### Async/Await

- Prefer `async/await` over promises
- Always handle rejections
- Use `Promise.all()` for parallel operations

```typescript
// Good
async function processFiles(files: string[]): Promise<void> {
  const results = await Promise.all(
    files.map(file => scanFile(file, rules))
  );
}

// Bad
function processFiles(files: string[]): Promise<void> {
  return Promise.resolve().then(() => {
    files.forEach(file => {
      scanFile(file, rules).then(result => {
        // Nested promises
      });
    });
  });
}
```

---

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0) - Breaking changes
- **MINOR** (0.1.0) - New features (backwards compatible)
- **PATCH** (0.0.1) - Bug fixes (backwards compatible)

### Release Checklist

For maintainers releasing a new version:

- [ ] All tests passing
- [ ] Changelog updated
- [ ] Version bumped in `package.json`
- [ ] Documentation updated
- [ ] Migration guide updated (if breaking)
- [ ] Git tag created
- [ ] npm package published
- [ ] GitHub release created
- [ ] Announcement made

### Creating a Release

```powershell
# Update version (automatically updates package.json and creates git tag)
npm version major|minor|patch

# Push changes and tags
git push origin main --tags

# GitHub Actions will automatically publish to npm
```

---

## Project Structure

```
Sentinel-ScannerRotator/
├── src/                    # Source code
│   ├── types.ts           # Core types
│   ├── scanner.ts         # Scanner implementation
│   ├── rotators/          # Rotator implementations
│   ├── rules/             # Rule management
│   ├── plugins/           # Plugin system
│   └── errorHandling.ts   # Error utilities
├── test/                  # Test files
├── examples/              # Usage examples
├── config/                # Default configuration
├── scripts/               # Build/maintenance scripts
├── dist/                  # Compiled output (gitignored)
├── docs/                  # Additional documentation
├── .github/               # GitHub Actions workflows
├── API.md                 # API documentation
├── CHANGELOG.md           # Version history
├── CONTRIBUTING.md        # This file
├── MIGRATION.md           # Migration guides
├── README.md              # Main documentation
├── SECURITY.md            # Security policy
├── package.json           # npm package config
└── tsconfig.json          # TypeScript config
```

---

## Getting Help

### Resources

- **Documentation**: See [README.md](./README.md) and [API.md](./API.md)
- **Examples**: Check `examples/` directory
- **Issues**: Search [GitHub Issues](https://github.com/sirhCC/Sentinel-ScannerRotator/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/sirhCC/Sentinel-ScannerRotator/discussions)

### Asking Questions

When asking for help:

1. **Search first** - Check existing issues and discussions
2. **Provide context** - OS, Node.js version, relevant config
3. **Include code** - Minimal reproducible example
4. **Share errors** - Full error messages and stack traces
5. **Be specific** - Clear description of expected vs actual behavior

### Reporting Bugs

Use the bug report template:

```markdown
**Describe the bug**
Clear description of the bug.

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. See error

**Expected behavior**
What you expected to happen.

**Environment:**
- OS: [e.g., Windows 11]
- Node.js: [e.g., 20.10.0]
- Version: [e.g., 0.2.0]

**Additional context**
Any other relevant information.
```

---

## Recognition

Contributors are recognized in several ways:

1. **Changelog** - Credited in CHANGELOG.md with PR number
2. **README** - Listed in contributors section
3. **GitHub** - Automatically tracked in GitHub insights
4. **Releases** - Mentioned in release notes

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to SecretSentinel! 🛡️
