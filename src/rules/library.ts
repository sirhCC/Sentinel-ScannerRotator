import fs from 'fs/promises';
import path from 'path';
import { Rule, RuleDef, Severity } from './ruleset.js';

export type Ruleset = {
  name: string;
  rules: RuleDef[];
};

function toRule(def: RuleDef): Rule | undefined {
  try {
    const sev = (def.severity || 'medium');
    const re = new RegExp(def.regex, 'g');
    const severity: Severity = sev === 'low' || sev === 'high' || sev === 'medium' ? sev : 'medium';
    return { name: def.name, re, severity };
  } catch {
    return undefined;
  }
}

// Built-in curated rulesets
const BUILTIN_RULESETS: Record<string, Ruleset> = {
  common: {
    name: 'common',
    rules: [
      { name: 'Generic Bearer Token', regex: 'Bearer\s+[A-Za-z0-9\-._~+/]+=*', severity: 'medium' },
      { name: 'Slack Token (legacy-like)', regex: 'xox[abpr]-[A-Za-z0-9-]{10,}', severity: 'high' },
      { name: 'GitHub Token (ghp_)', regex: 'ghp_[A-Za-z0-9]{36,}', severity: 'high' },
    ],
  },
  cloud: {
    name: 'cloud',
    rules: [
      { name: 'AWS Secret Access Key-like', regex: '(?i)aws_?secret.*?[:=]\s*[\'\"]?[A-Za-z0-9+/]{40}[\'\"]?', severity: 'high' },
      { name: 'GCP Service Account Key fragment', regex: '"private_key_id"\s*:\s*"[a-f0-9]{32}"', severity: 'high' },
      { name: 'Azure Connection String', regex: '(?i)DefaultEndpointsProtocol=|AccountKey=|EndpointSuffix=', severity: 'medium' },
    ],
  },
};

async function readJsonRuleset(filePath: string): Promise<Ruleset | undefined> {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(txt);
    if (json && (Array.isArray(json) || Array.isArray(json.rules))) {
      const rules = Array.isArray(json) ? json : json.rules;
      const name = json.name || path.basename(filePath, path.extname(filePath));
      return { name, rules } as Ruleset;
    }
  } catch {}
  return undefined;
}

async function listDirJson(dir: string): Promise<string[]> {
  try {
    const ents = await fs.readdir(dir);
    return ents.filter((f) => /\.ruleset\.json$/i.test(f)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function listRulesets(extraDirs?: string[]): Promise<string[]> {
  const names = new Set<string>(Object.keys(BUILTIN_RULESETS));
  if (extraDirs) {
    for (const d of extraDirs) {
      const files = await listDirJson(d);
      for (const f of files) {
        const rs = await readJsonRuleset(f);
        if (rs) names.add(rs.name);
      }
    }
  }
  return Array.from(names).sort();
}

export async function loadSelectedRules(_baseDir?: string): Promise<Rule[]> {
  const selectedRaw = (process.env.SENTINEL_RULESETS || '').trim();
  const dirsRaw = (process.env.SENTINEL_RULESETS_DIRS || '').trim();
  const selected = selectedRaw ? selectedRaw.split(/[,;\s]+/).filter(Boolean) : [];
  const dirs = dirsRaw ? dirsRaw.split(/[,;]+/).filter(Boolean) : [];

  const out: Rule[] = [];
  // include built-in curated sets if selected
  for (const name of selected) {
    const rs = BUILTIN_RULESETS[name];
    if (rs) {
      for (const def of rs.rules) {
        if (def.enabled === false) continue;
        const r = toRule(def);
        if (r) out.push(r);
      }
    }
  }
  // include external .ruleset.json from extra dirs matching names
  if (dirs.length && selected.length) {
    const foundByName: Record<string, Ruleset> = {};
    for (const d of dirs) {
      const files = await listDirJson(d);
      for (const f of files) {
        const rs = await readJsonRuleset(f);
        if (rs) foundByName[rs.name] = rs;
      }
    }
    for (const name of selected) {
      const rs = foundByName[name];
      if (rs) {
        for (const def of rs.rules) {
          if (def.enabled === false) continue;
          const r = toRule(def);
          if (r) out.push(r);
        }
      }
    }
  }

  // If nothing selected, return empty (merge is handled in ruleset.ts with built-ins/config)
  // If disableBuiltins is true AND some selected rules exist, ruleset.ts should honor that flag.
  return out;
}
