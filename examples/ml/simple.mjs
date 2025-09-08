// Example ML hook module demonstrating analyzeFile and analyzeLine
// Emits tokens that look like secrets and a simple multi-line detector

export function analyzeLine(line, { filePath, lineNumber }) {
  const out = [];
  const m = /(AKIA[0-9A-Z]{16}|TOKEN_[A-Z0-9_]{6,})/.exec(line);
  if (m) out.push({ token: m[1], index: m.index, ruleName: 'ML-Line', severity: 'low' });
  return out;
}

export function analyzeFile(lines, { filePath }) {
  const content = lines.join('\n');
  const hits = [];
  const m = /BEGIN PRIVATE KEY[\s\S]+END PRIVATE KEY/.exec(content);
  if (m) hits.push({ token: 'PRIVATE_KEY_BLOCK', index: m.index, ruleName: 'ML-File', severity: 'high' });
  return hits;
}
