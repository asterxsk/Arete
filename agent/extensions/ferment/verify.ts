import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface VerifyResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runVerifyCommand(command: string, timeout = 120_000): VerifyResult {
  try {
    const stdout = execSync(command, { timeout, encoding: "utf-8" });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}

// For long-running commands, use the async variant so the agent loop stays responsive.
export async function runVerifyCommandAsync(
  command: string,
  timeout = 120_000
): Promise<VerifyResult> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}
