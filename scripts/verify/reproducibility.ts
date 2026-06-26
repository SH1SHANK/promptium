import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeMetadataFile } from './metadata';

const OUTPUT_DIR = path.resolve('.output/chrome-mv3');

function runCommand(cmd: string) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

function computeFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function collectHashes(): Record<string, string> {
  const files = getFilesRecursively(OUTPUT_DIR);
  const hashes: Record<string, string> = {};
  for (const file of files) {
    if (file.endsWith('.zip') || file.includes('metadata.json')) continue;
    const relativePath = path.relative(OUTPUT_DIR, file);
    hashes[relativePath] = computeFileHash(file);
  }
  return hashes;
}

export function runReproducibilityCheck(): boolean {
  console.log('\n=============================================');
  console.log('🔍 Running Build Reproducibility Audit...');
  console.log('=============================================');

  console.log('Building for the first time...');
  if (fs.existsSync('.output')) {
    fs.rmSync('.output', { recursive: true, force: true });
  }
  runCommand('pnpm build');
  const hashes1 = collectHashes();

  console.log('Building for the second time (clean rebuild)...');
  fs.rmSync('.output', { recursive: true, force: true });
  runCommand('pnpm build');
  const hashes2 = collectHashes();

  const files1 = Object.keys(hashes1).sort();
  const files2 = Object.keys(hashes2).sort();

  let hasMismatch = false;

  if (JSON.stringify(files1) !== JSON.stringify(files2)) {
    console.error('❌ Build output file lists do not match between compilations!');
    const removed = files1.filter(x => !files2.includes(x));
    const added = files2.filter(x => !files1.includes(x));
    if (removed.length) console.error(`Removed files: ${removed.join(', ')}`);
    if (added.length) console.error(`Added files: ${added.join(', ')}`);
    hasMismatch = true;
  }

  for (const file of files1) {
    if (hashes1[file] !== hashes2[file]) {
      console.error(`❌ Hash mismatch in file: ${file}`);
      console.error(`   First build:  ${hashes1[file]}`);
      console.error(`   Second build: ${hashes2[file]}`);
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    console.error('❌ Reproducibility audit failed!');
    return false;
  }

  console.log('✅ Successive clean builds produce identical hashes.');
  writeMetadataFile(OUTPUT_DIR);
  return true;
}

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const success = runReproducibilityCheck();
  process.exit(success ? 0 : 1);
}
