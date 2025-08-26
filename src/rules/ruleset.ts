import { loadPatterns } from '../config.js';

export type Severity = 'low' | 'medium' | 'high';

export type RuleDef = {
  name: string;
  regex: string;
  severity?: Severity;
  enabled?: boolean;
};

export type Rule = {
  name: string;
  re: RegExp;
  severity: Severity;
};

// Built-in curated rules with severities
const BUILTIN_RULES: Rule[] = [
  { name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/g, severity: 'high' },
  { name: 'Generic API Key', re: /(?:api_key|apikey|api-key)\s*[:=]\s*['\"]?([A-Za-z0-9-_]{16,})/gi, severity: 'medium' },
  { name: 'JWT-Like', re: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, severity: 'low' },
];

export async function loadRules(baseDir?: string): Promise<Rule[]> {
  // Back-compat: loadPatterns returns {name, regex} from config/defaults or project config
  const defs = await loadPatterns(baseDir);
  if (!defs || defs.length === 0) return BUILTIN_RULES;
  const custom: Rule[] = [];
  for (const d of defs as unknown as RuleDef[]) {
    if (d.enabled === false) continue;
    try {
      const re = new RegExp(d.regex, 'g');
  const sev = (d.severity || 'medium');
  const severity: Severity = (sev === 'low' || sev === 'high' || sev === 'medium') ? sev : 'medium';
      custom.push({ name: d.name, re, severity });
    } catch {
      // skip invalid regex
    }
  }
  return [...BUILTIN_RULES, ...custom];
}
