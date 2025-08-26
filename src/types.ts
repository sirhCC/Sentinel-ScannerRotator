export type Finding = {
  filePath: string;
  line: number;
  column: number;
  match: string;
  context?: string;
};

export interface Rotator {
  name: string;
  rotate(
    finding: Finding,
  options?: { dryRun?: boolean; template?: string; verify?: boolean }
  ): Promise<{ success: boolean; message?: string }>;
}
