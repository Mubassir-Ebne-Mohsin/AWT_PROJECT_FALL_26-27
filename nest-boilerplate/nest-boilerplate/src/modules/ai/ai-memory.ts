import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { freemem, platform } from "node:os";
import { readFile } from "node:fs/promises";
const execute = promisify(execFile);
@Injectable()
export class AiMemory {
  private pending?: Promise<{ physicalMiB: number; commitMiB: number }>;
  private cached?: { at: number; value: { physicalMiB: number; commitMiB: number } };
  async sample(): Promise<{ physicalMiB: number; commitMiB: number }> {
    // Readiness polling must not spawn one Windows telemetry process per caller.
    if (this.cached && Date.now() - this.cached.at < 1000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.read();
    try {
      const value = await this.pending;
      this.cached = { at: Date.now(), value };
      return value;
    } finally { this.pending = undefined; }
  }
  private async read(): Promise<{ physicalMiB: number; commitMiB: number }> {
    if (platform() === "win32") {
      // Fixed command; no shell interpolation, prompts, config values or secrets.
      const { stdout } = await execute(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$snapshot=Get-CimInstance Win32_OperatingSystem; [Console]::Write(('{0},{1}' -f $snapshot.FreePhysicalMemory,$snapshot.FreeVirtualMemory))",
        ],
        { timeout: 3000, windowsHide: true, maxBuffer: 1024 },
      );
      const [physical, commit] = stdout.trim().split(",").map(Number);
      if (![physical, commit].every((n) => Number.isFinite(n) && n >= 0))
        throw new Error("Memory telemetry unavailable");
      return { physicalMiB: physical / 1024, commitMiB: commit / 1024 };
    }
    if (platform() === "linux") {
      const text = await readFile("/proc/meminfo", "utf8");
      const values = Object.fromEntries(
        [...text.matchAll(/^(\w+):\s+(\d+) kB$/gm)].map((m) => [
          m[1],
          Number(m[2]),
        ]),
      );
      if (!values.CommitLimit || !Number.isFinite(values.Committed_AS))
        throw new Error("Memory telemetry unavailable");
      return {
        physicalMiB: (values.MemAvailable ?? freemem() / 1024) / 1024,
        commitMiB: Math.max(0, values.CommitLimit - values.Committed_AS) / 1024,
      };
    }
    throw new Error("Memory telemetry unsupported on this host");
  }
}
