/**
 * Represents a single security finding from a scan
 */
export type Finding = {
  /** Absolute or relative path to the file containing the finding */
  filePath: string;
  /** Line number where the finding was detected (1-indexed) */
  line: number;
  /** Column number where the finding starts (1-indexed) */
  column: number;
  /** The matched text that triggered the finding */
  match: string;
  /** Optional surrounding context for the match */
  context?: string;
  /** Name of the rule that triggered this finding */
  ruleName?: string;
  /** Severity level of the finding */
  severity?: 'low' | 'medium' | 'high';
  /** ML confidence score (0..1) when ML enrichment is enabled */
  confidence?: number;
  /** Additional tags for categorization */
  tags?: string[];
  /** Human-readable message describing the finding */
  message?: string;
};

/**
 * Result from scanning a file, including findings and optional hash
 */
export type ScanResult = {
  /** List of findings discovered during the scan */
  findings: Finding[];
  /** Optional computed file hash for caching */
  computedHash?: string;
};

/**
 * Interface for secret rotation implementations
 */
export interface Rotator {
  /** Unique name identifying this rotator */
  name: string;
  /**
   * Rotate a single finding
   * @param finding - The finding to rotate
   * @param options - Rotation options
   * @returns Promise resolving to rotation result
   */
  rotate(
    finding: Finding,
    options?: { dryRun?: boolean; template?: string; verify?: boolean },
  ): Promise<{ success: boolean; message?: string }>;
  /**
   * Optional batch API: perform a single-file multi-finding rotation in one write
   * @param filePath - Path to the file to rotate
   * @param findings - All findings in the file
   * @param options - Rotation options
   * @returns Promise resolving to array of rotation results
   */
  rotateFile?: (
    filePath: string,
    findings: Finding[],
    options?: { dryRun?: boolean; template?: string; verify?: boolean },
  ) => Promise<Array<{ success: boolean; message?: string }>>;
}
