export type Finding = {
  filePath: string;
  line: number;
  column: number;
  match: string;
  context?: string;
  ruleName?: string;
  severity?: 'low' | 'medium' | 'high';
  // ML enrichment (optional)
  confidence?: number; // 0..1
  tags?: string[];
  message?: string;
};

// Optional richer result for scanners that can compute a file hash while scanning
export type ScanResult = {
  findings: Finding[];
  computedHash?: string;
};

export interface Rotator {
  name: string;
  rotate(
    finding: Finding,
    options?: { dryRun?: boolean; template?: string; verify?: boolean },
  ): Promise<{ success: boolean; message?: string }>;
  // Optional batch API: perform a single-file multi-finding rotation in one write
  rotateFile?: (
    filePath: string,
    findings: Finding[],
    options?: { dryRun?: boolean; template?: string; verify?: boolean },
  ) => Promise<Array<{ success: boolean; message?: string }>>;
}
