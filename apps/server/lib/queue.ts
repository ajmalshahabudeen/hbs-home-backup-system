import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type EnqueueResult = {
  ok: boolean;
  jobId?: string;
  taskId?: string;
  type?: string;
  error?: string;
  queueBackend?: string;
};

function pythonBin(): string {
  return (
    process.env.PYTHON_BIN ||
    (process.platform === "win32" ? "python" : "python3")
  );
}

function scriptsDir(): string {
  const env = process.env.PYTHON_SCRIPTS_DIR;
  if (env && fs.existsSync(env)) return env;

  const cwd = /* turbopackIgnore: true */ process.cwd();
  const candidates: string[] = [
    path.resolve(cwd, "../../python"),
    path.resolve(cwd, "python"),
    "/app/python",
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "enqueue_job.py"))) return c;
  }
  return "/app/python";
}

export async function enqueueJob(
  args: string[],
  timeoutMs = 20_000
): Promise<EnqueueResult> {
  const backend = process.env.QUEUE_BACKEND || "celery";
  if (backend === "inline") {
    return {
      ok: false,
      error: "inline backend not implemented — set QUEUE_BACKEND=celery",
    };
  }

  const dir = scriptsDir();
  const script = path.join(dir, "enqueue_job.py");
  if (!fs.existsSync(script)) {
    return {
      ok: false,
      error: `enqueue_job.py not found at ${script}. Is the worker/python package installed?`,
    };
  }

  return new Promise((resolve) => {
    const child = spawn(
      /* turbopackIgnore: true */ pythonBin(),
      [script, ...args],
      {
        env: { ...process.env },
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      }
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        ok: false,
        error: `enqueue timeout after ${timeoutMs}ms: ${stderr}`,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .pop();
      if (!line) {
        resolve({
          ok: false,
          error: stderr || `enqueue exited ${code} with empty stdout`,
        });
        return;
      }
      try {
        const parsed = JSON.parse(line) as EnqueueResult;
        resolve(parsed);
      } catch {
        resolve({ ok: false, error: `bad JSON: ${line}` });
      }
    });
  });
}
