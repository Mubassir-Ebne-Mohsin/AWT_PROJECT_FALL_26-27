import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runStep } from "./generator.mjs";
import { DEFAULT_LEVELS, affinityMask, nominalCapacity, parseTypeperf, ratesFor, windowExtremes } from "./plan.mjs";

// Runs the stepped test against the service under test and writes every measurement, with the state of the machine, to
// data/<out>.json. Windows only (it pins cores and reads paging counters through PowerShell and typeperf).
//
//   node src/run.mjs --workers 1 --repeats 3 --out w1
//   node src/run.mjs --smoke                     a short run to check the setup (2 steps, 2 s each)
//
// Options: --workers N  --work-ms MS  --repeats N  --step-ms MS  --warmup-ms MS  --levels 0.1,0.2,...  --out NAME
//          --min-available-mb MB (default 2048; the run refuses to start below it)  --arrival poisson|uniform
//          --abort-below-mb MB (default 1536; a repeat is abandoned below it, so a brief dip does not lose a whole run;
//          paging is recorded for every step either way)
//
// Cores (this laptop: 4 performance cores with two threads each, logical 0 to 7, then 4 efficiency cores, 8 to 11):
// the generator spins on one performance-core thread (logical 2, its sibling left idle); the service uses the other
// performance cores' first threads and the efficiency cores.

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = path.join(here, "service.mjs");
const DATA = path.join(here, "..", "data");
const GENERATOR_CORES = [2];
const SERVICE_CORES = [4, 6, 8, 9, 10, 11];
const MAX_ATTEMPTS = 3;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const smoke = flag("smoke");
const workers = Number(opt("workers", 1));
const workMs = Number(opt("work-ms", 20));
const repeats = Number(opt("repeats", smoke ? 1 : 3));
const stepMs = Number(opt("step-ms", smoke ? 2000 : 30000));
const warmupMs = Number(opt("warmup-ms", smoke ? 500 : 5000));
const levels = opt("levels", smoke ? "0.3,0.9" : DEFAULT_LEVELS.join(",")).split(",").map(Number);
const arrival = opt("arrival", "poisson");
const minAvailableMb = Number(opt("min-available-mb", 2048));
const abortBelowMb = Number(opt("abort-below-mb", 1536));
const outName = opt("out", smoke ? "smoke" : `w${workers}`);

const ps = (command) => execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true }).trim();
const availableMb = () => Math.round(Number(ps("(Get-Counter '\\Memory\\Available MBytes').CounterSamples[0].CookedValue")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (port, p) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: p, agent: false }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      })
      .on("error", reject);
  });

function setAffinity(pid, cores) {
  ps(`(Get-Process -Id ${pid}).ProcessorAffinity = ${affinityMask(cores)}`);
  const back = Number(ps(`[int](Get-Process -Id ${pid}).ProcessorAffinity`));
  if (back !== affinityMask(cores)) throw new Error(`could not pin process ${pid} to cores ${cores} (read back ${back})`);
}

function machineRecord() {
  const raw = ps(`
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor
    $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    $top = Get-Process | Group-Object Name | ForEach-Object { [pscustomobject]@{ name = $_.Name; count = $_.Count; mb = [int](($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) } } | Sort-Object mb -Descending | Select-Object -First 8
    [pscustomobject]@{
      osVersion = $os.Version
      cpuName = $cpu.Name
      cores = $cpu.NumberOfCores
      logicalProcessors = $cpu.NumberOfLogicalProcessors
      totalMb = [int]($os.TotalVisibleMemorySize / 1024)
      powerScheme = ((powercfg /getactivescheme) -replace '^.*\\(', '' -replace '\\).*$', '')
      onAcPower = if ($bat) { ($bat.BatteryStatus -ne 1) } else { $null }
      brave = [bool](Get-Process brave -ErrorAction SilentlyContinue)
      dockerDesktop = [bool](Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)
      topProcesses = $top
    } | ConvertTo-Json -Depth 4 -Compress`);
  return { ...JSON.parse(raw), node: process.version, platform: process.platform, startedAt: new Date().toISOString() };
}

async function timerTickMs() {
  const t0 = process.hrtime.bigint();
  await new Promise((resolve) => {
    let n = 0;
    const iv = setInterval(() => {
      if (++n === 30) {
        clearInterval(iv);
        resolve();
      }
    }, 1);
  });
  return Number(process.hrtime.bigint() - t0) / 1e6 / 30;
}

function startService() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVICE, "--serve", "--workers", String(workers), "--work-ms", String(workMs)], { stdio: ["ignore", "pipe", "inherit"] });
    child.once("error", reject);
    child.stdout.once("data", (chunk) => resolve({ ...JSON.parse(String(chunk)), stop: () => child.kill() }));
  });
}

async function drain(port) {
  for (let i = 0; i < 30; i++) {
    const s = JSON.parse(await get(port, "/stats"));
    if (s.queueNow === 0 && s.busyWorkers === 0) break;
    await sleep(500);
  }
  await sleep(1000);
}

const summary = (r) => ({ sent: r.sent, offeredRps: r.offeredRps, achievedRps: r.achievedRps, errors: r.errors, timeouts: r.timeouts, errorRate: r.errorRate, latency: r.latency, lateness: r.lateness, valid: r.valid });

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const before = availableMb();
  if (before < minAvailableMb) {
    console.error(`Refusing to start: ${before} MB available, ${minAvailableMb} MB required. Close other programs (see the README) and try again.`);
    process.exit(2);
  }
  setAffinity(process.pid, GENERATOR_CORES);
  const machine = { ...machineRecord(), timerTickMs: await timerTickMs(), availableMbAtStart: before, generatorCores: GENERATOR_CORES, serviceCores: SERVICE_CORES };
  const config = { workers, workMs, nominalCapacityRps: nominalCapacity(workers, workMs), repeats, stepMs, warmupMs, levels, arrival, minAvailableMb, abortBelowMb };
  const out = { machine, config, repeats: [] };
  const file = path.join(DATA, `${outName}.json`);
  const save = () => fs.writeFileSync(file, JSON.stringify(out, null, 2));
  const csv = path.join(DATA, `${outName}.paging.csv`);
  const typeperf = spawn("typeperf", ["\\Memory\\Pages/sec", "\\Memory\\Available MBytes", "-si", "2", "-o", csv, "-y"], { stdio: "ignore", windowsHide: true });
  console.log(`machine: ${machine.cpuName}, timer tick ${machine.timerTickMs.toFixed(1)} ms, ${before} MB available, power "${machine.powerScheme}", AC ${machine.onAcPower}`);
  console.log(`plan: ${workers} worker(s) x ${workMs} ms (capacity ${config.nominalCapacityRps} rps), ${levels.length} levels, ${repeats} repeat(s), ${stepMs / 1000} s per step`);

  try {
    for (let rep = 0; rep < repeats; rep++) {
      const mb = availableMb();
      if (mb < abortBelowMb) throw new Error(`stopping: only ${mb} MB available before repeat ${rep + 1}`);
      const service = await startService();
      setAffinity(service.pid, SERVICE_CORES);
      const repeat = { index: rep, availableMbAtStart: mb, service: { pid: service.pid, port: service.port }, steps: [] };
      out.repeats.push(repeat);
      try {
        await runStep({ url: `http://127.0.0.1:${service.port}/`, rps: Math.max(5, config.nominalCapacityRps * 0.2), durationMs: 3000, warmupMs: 500 });
        await drain(service.port);
        for (const { level, rps } of ratesFor(levels, workers, workMs)) {
          const step = { level, rps, attempts: [], final: -1 };
          repeat.steps.push(step);
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            await get(service.port, "/reset");
            const startedAt = Date.now();
            const result = await runStep({ url: `http://127.0.0.1:${service.port}/`, rps, durationMs: stepMs, warmupMs, arrival, seed: 1000 * (rep + 1) + Math.round(level * 100) + attempt });
            const endedAt = Date.now();
            const serviceStats = JSON.parse(await get(service.port, "/stats"));
            step.attempts.push({ startedAt, endedAt, ...summary(result), serviceStats });
            await drain(service.port);
            if (result.valid) {
              step.final = attempt;
              break;
            }
            console.log(`  level ${level}: the generator fell behind (lateness p99 ${result.lateness.p99.toFixed(1)} ms); repeating`);
          }
          if (step.final < 0) step.final = step.attempts.length - 1;
          const f = step.attempts[step.final];
          console.log(`repeat ${rep + 1} level ${String(level).padEnd(4)} ${String(rps).padStart(6)} rps: p50 ${f.latency.p50?.toFixed(1)} p95 ${f.latency.p95?.toFixed(1)} errors ${(f.errorRate * 100).toFixed(1)}% valid ${f.valid} (attempt ${step.final + 1})`);
          save();
        }
      } finally {
        service.stop();
        await sleep(500);
      }
    }
  } finally {
    typeperf.kill();
    await sleep(500);
    try {
      const samples = parseTypeperf(fs.readFileSync(csv, "utf8"));
      for (const repeat of out.repeats) for (const step of repeat.steps) for (const attempt of step.attempts) attempt.paging = windowExtremes(samples, attempt.startedAt, attempt.endedAt);
    } catch (error) {
      console.error(`could not read the paging log: ${error.message}`);
    }
    out.machine.availableMbAtEnd = availableMb();
    out.machine.finishedAt = new Date().toISOString();
    save();
    console.log(`wrote ${file}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
