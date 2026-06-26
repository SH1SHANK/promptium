import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface BuildMetadata {
  commitSha: string;
  timestamp: string;
  tag: string;
  branch: string;
  nodeVersion: string;
  pnpmVersion: string;
  wxtVersion: string;
}

export function getBuildMetadata(): BuildMetadata {
  let commitSha = 'unknown';
  let branch = 'unknown';
  let tag = 'none';

  try {
    commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {}

  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {}

  try {
    tag = execSync('git describe --tags --exact-match 2>/dev/null || echo "none"', {
      encoding: 'utf8',
    }).trim();
  } catch {}

  let nodeVersion = process.version;
  let pnpmVersion = 'unknown';
  try {
    pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
  } catch {}

  let wxtVersion = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    wxtVersion = pkg.devDependencies?.wxt || 'unknown';
  } catch {}

  return {
    commitSha,
    timestamp: new Date().toISOString(),
    tag,
    branch,
    nodeVersion,
    pnpmVersion,
    wxtVersion,
  };
}

export function writeMetadataFile(destDir: string) {
  const metadata = getBuildMetadata();
  const filePath = path.join(destDir, 'metadata.json');
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`✅ Build metadata written to ${filePath}`);
}
