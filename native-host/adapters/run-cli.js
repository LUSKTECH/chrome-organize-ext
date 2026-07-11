// Shared spawn helper for CLI adapters (antigravity, kiro, and any future
// adapters). Mirrors the isolation guarantees of the Claude adapter: a private
// per-run working directory, a stdout size cap, a timeout with settle-before-kill,
// and a host-controlled environment. The command and args are always resolved by
// the adapter (host-side) — never from an extension message.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_MAX_STDOUT = 5 * 1024 * 1024; // 5 MB

// Runs a CLI once and resolves with its raw stdout (string). If `usesStdin` is
// true the prompt is piped to stdin; otherwise stdin is closed empty (the prompt
// is expected to already be in `args`).
export async function runCli({ command, args, prompt = '', usesStdin = false, env, timeoutMs = 120000, spawnFn = spawn, maxStdout = DEFAULT_MAX_STDOUT }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'borg-'));
  try {
    return await new Promise((resolve, reject) => {
      let child;
      try { child = spawnFn(command, args, { cwd, env }); }
      catch (err) { reject(err); return; }

      let stdout = '';
      let stderr = '';
      let done = false;
      const finish = (fn, arg) => { if (!done) { done = true; clearTimeout(timer); fn(arg); } };
      const timer = setTimeout(() => {
        finish(reject, new Error(`CLI timed out after ${timeoutMs}ms`));
        try { child.kill('SIGKILL'); } catch {}
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d;
        if (stdout.length > maxStdout) {
          finish(reject, new Error('CLI output exceeded size limit'));
          try { child.kill('SIGKILL'); } catch {}
        }
      });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => finish(reject, err));
      child.on('close', (code) => {
        if (code === 0 || code === null) finish(resolve, stdout);
        else finish(reject, new Error(`CLI exited ${code}: ${stderr.trim()}`));
      });

      if (usesStdin) { child.stdin.write(prompt); child.stdin.end(); }
      else if (child.stdin) { child.stdin.end(); }
    });
  } finally {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
  }
}

// Runs `<command> <versionArgs>` and resolves { version }.
export async function cliVersion({ command, versionArgs = ['--version'], env, spawnFn = spawn, timeoutMs = 10000 }) {
  return await new Promise((resolve, reject) => {
    let out = '';
    let child;
    try { child = spawnFn(command, versionArgs, { env }); }
    catch (err) { reject(err); return; }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {}; reject(new Error('version check timed out')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); (code === 0 || code === null) ? resolve({ version: out.trim() }) : reject(new Error(`version check exited ${code}`)); });
    if (child.stdin) child.stdin.end();
  });
}
