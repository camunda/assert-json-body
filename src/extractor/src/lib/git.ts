import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export function run(cmd: string, args: string[], opts: { inherit?: boolean } = {}) {
  console.info(`> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: opts.inherit ? 'inherit' : 'pipe', encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr || res.status}`);
  console.info(res.stdout)
  return res.stdout;
}

export function sparseCheckout(repo: string, specPath: string, ref = 'main'): { workdir: string; commit: string; specContent: string } {
  const workdir = join(tmpdir(), `spec-checkout-${Date.now()}`);
  run('git', ['init', workdir]);
  run('git', ['-C', workdir, 'remote', 'add', 'origin', repo]);
  run('git', ['-C', workdir, 'config', 'core.sparseCheckout', 'true']);
  const specDir = dirname(specPath);
  const pattern = specDir === '.' ? '*' : `${specDir}/`;
  writeFileSync(join(workdir, '.git', 'info', 'sparse-checkout'), pattern + '\n');
  run('git', ['-C', workdir, 'pull', 'origin', ref, '--depth', '1'], { inherit: true });
  const commit = run('git', ['-C', workdir, 'rev-parse', 'HEAD']).trim();
  const specContent = readFileSync(join(workdir, specPath), 'utf8');
  return { workdir, commit, specContent };
}
