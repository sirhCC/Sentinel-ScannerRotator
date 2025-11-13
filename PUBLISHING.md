# Publishing Guide

This document describes how to publish new versions of SecretSentinel to npm and GitHub Packages.

## Prerequisites

### For npm Publishing

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **npm authentication**: Login locally with `npm login`
3. **npm token**: Generate a token at https://www.npmjs.com/settings/tokens
   - Set the `NPM_TOKEN` secret in GitHub repository settings
4. **Package access**: Ensure you have publish rights to `secret-sentinel-scanner-rotator`

### For GitHub Packages

1. GitHub automatically provides `GITHUB_TOKEN` for workflows
2. No additional configuration needed

## Publishing Workflow

### Option 1: Automated via GitHub Release (Recommended)

1. **Update version in package.json** or use npm version command:
   ```powershell
   # Patch release (0.2.0 -> 0.2.1)
   npm version patch
   
   # Minor release (0.2.1 -> 0.3.0)
   npm version minor
   
   # Major release (0.3.0 -> 1.0.0)
   npm version major
   ```
   
   This automatically:
   - Updates `package.json`
   - Runs formatting
   - Creates a git commit
   - Creates a git tag
   - Pushes to GitHub

2. **Create a GitHub Release**:
   - Go to https://github.com/sirhCC/Sentinel-ScannerRotator/releases/new
   - Select the tag created by `npm version`
   - Add release notes describing changes
   - Click "Publish release"

3. **Automated publishing**:
   - GitHub Actions will automatically:
     - Run tests
     - Build the package
     - Publish to npm
     - Publish to GitHub Packages
     - Update release notes with installation instructions

### Option 2: Manual Publishing

If you need to publish manually:

```powershell
# 1. Ensure you're on main branch and up to date
git checkout main
git pull

# 2. Clean and test
npm run clean
npm install
npm test

# 3. Update version
npm version patch  # or minor/major

# 4. Build
npm run build

# 5. Verify package contents
npm pack --dry-run

# 6. Publish to npm
npm publish --access public

# 7. Push tags
git push && git push --tags
```

### Option 3: Workflow Dispatch

Trigger publishing manually from GitHub:

1. Go to https://github.com/sirhCC/Sentinel-ScannerRotator/actions/workflows/publish.yml
2. Click "Run workflow"
3. Optionally specify a version
4. Click "Run workflow"

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.2.0): New features, backward-compatible
- **PATCH** (0.2.1): Bug fixes, backward-compatible

## Pre-release Versions

For beta/alpha releases:

```powershell
# Alpha release
npm version prerelease --preid=alpha
# Results in: 0.2.1-alpha.0

# Beta release
npm version prerelease --preid=beta
# Results in: 0.2.1-beta.0

# Publish with tag
npm publish --tag beta
```

Users can install with:
```powershell
npm install -g secret-sentinel-scanner-rotator@beta
```

## Post-Publishing Checklist

After successful publication:

1. ✅ Verify npm package: https://www.npmjs.com/package/secret-sentinel-scanner-rotator
2. ✅ Test global installation:
   ```powershell
   npm install -g secret-sentinel-scanner-rotator
   sentinel --version
   sentinel --help
   ```
3. ✅ Update CHANGELOG.md with release notes
4. ✅ Announce on relevant channels (if applicable)
5. ✅ Update documentation if needed

## Troubleshooting

### "You do not have permission to publish"

- Ensure you're logged in: `npm whoami`
- Verify package ownership: `npm owner ls secret-sentinel-scanner-rotator`
- Check organization access if scoped package

### "Version already exists"

- Bump the version: `npm version patch`
- Cannot republish the same version (npm is immutable)

### "Invalid bin field"

- Ensure `dist/cli.js` exists and has shebang: `#!/usr/bin/env node`
- Rebuild: `npm run build`

### "ENOENT: no such file or directory"

- Ensure all files in `files` array exist
- Run `npm pack --dry-run` to preview package contents

### GitHub Actions fails

- Check secrets are configured: `NPM_TOKEN`
- Verify workflow has correct permissions
- Review build logs for specific errors

## Package Size Optimization

Check package size before publishing:

```powershell
npm pack
# Creates a .tgz file - check its size
```

To reduce size:
- Ensure `.npmignore` excludes unnecessary files
- Remove unused dependencies
- Minimize bundled assets

Current package includes only:
- `dist/` (compiled JavaScript)
- `config/` (default configuration)
- `README.md`, `LICENSE`, `SECURITY.md`

## Testing Before Publishing

Always test the package locally before publishing:

```powershell
# 1. Pack the package
npm pack

# 2. Install globally from the tarball
npm install -g secret-sentinel-scanner-rotator-0.2.0.tgz

# 3. Test the CLI
sentinel --version
sentinel --help
sentinel . --rotator dry-run

# 4. Uninstall
npm uninstall -g secret-sentinel-scanner-rotator
```

## Rolling Back a Release

If a release has critical issues:

1. **Deprecate the version** (doesn't remove, just warns):
   ```powershell
   npm deprecate secret-sentinel-scanner-rotator@0.2.1 "Critical bug - use 0.2.2 instead"
   ```

2. **Publish a fixed version**:
   ```powershell
   npm version patch  # Creates 0.2.2
   npm publish
   ```

3. **Update GitHub Release** to mark as "Pre-release" or add warning

**Note**: Cannot unpublish versions after 24 hours or if downloaded by others.

## Release Checklist Template

Copy this for each release:

```markdown
## Pre-Release
- [ ] All tests passing
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] README reflects new features
- [ ] Security.md updated if needed
- [ ] No console.log or debug code

## Release
- [ ] GitHub release created with notes
- [ ] CI/CD pipeline completed successfully
- [ ] Package published to npm
- [ ] Package published to GitHub Packages

## Post-Release
- [ ] Verified on npm
- [ ] Tested global installation
- [ ] Tested basic commands
- [ ] Documentation updated
- [ ] Announcement posted (if applicable)
```

## Contact

For publishing issues, contact the repository maintainer or open an issue.
