// Entropy-based detector (opt-in)
// Finds base64/hex-like high-entropy tokens on a line.

export type EntropyOptions = {
  threshold?: number; // default 3.5 bits/char
  minLength?: number; // default 32
};

function shannonEntropy(s: string): number {
  if (!s.length) return 0;
  const freq: Record<string, number> = {};
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let h = 0;
  const len = s.length;
  for (const k of Object.keys(freq)) {
    const p = freq[k] / len;
    h += -p * Math.log2(p);
  }
  return h;
}

function tokenizeCandidates(line: string): Array<{ token: string; index: number }> {
  const out: Array<{ token: string; index: number }> = [];
  // base64-ish and hex-ish sequences
  const patterns = [
    /[A-Za-z0-9+/=]{16,}/g, // base64-like
    /[A-Fa-f0-9]{16,}/g, // hex-like
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      out.push({ token: m[0], index: m.index });
    }
  }
  return out;
}

export function findHighEntropyTokens(line: string, opts?: EntropyOptions) {
  const envThr = Number(process.env.SENTINEL_ENTROPY_THRESHOLD);
  const envMin = Number(process.env.SENTINEL_ENTROPY_MINLEN);
  const threshold = Number.isFinite(envThr) ? envThr : ((opts && typeof opts.threshold === 'number') ? opts.threshold : 3.5);
  const minLength = Number.isFinite(envMin) ? envMin : ((opts && typeof opts.minLength === 'number') ? opts.minLength : 32);
  const results: Array<{ token: string; index: number; entropy: number }> = [];
  const cands = tokenizeCandidates(line);
  for (const c of cands) {
    if (c.token.length < minLength) continue;
    // ignore tokens with extremely low variance
    if (/^(.)\1+$/.test(c.token)) continue;
    const h = shannonEntropy(c.token);
    if (h >= threshold) results.push({ token: c.token, index: c.index, entropy: h });
  }
  return results;
}
