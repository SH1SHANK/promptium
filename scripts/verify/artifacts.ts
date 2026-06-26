import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { getBuildMetadata } from './metadata';

const OUTPUT_DIR = path.resolve('.output');

function runCommand(cmd: string) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function computeFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

export function runArtifactsCheck(): boolean {
  console.log('\n=============================================');
  console.log('🔍 Running Packaging & Artifact Integrity Audit...');
  console.log('=============================================');

  // Verify tag matches package version if tag is present
  const metadata = getBuildMetadata();
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const version = pkg.version;

  let gitTag = process.env.GITHUB_REF_NAME || metadata.tag;
  if (gitTag && gitTag.startsWith('refs/tags/')) {
    gitTag = gitTag.replace('refs/tags/', '');
  }

  if (gitTag && gitTag !== 'none' && !gitTag.includes('ci-')) {
    const expectedTag = `v${version}`;
    const expectedTagAlt = version;
    if (gitTag !== expectedTag && gitTag !== expectedTagAlt) {
      console.error(`❌ Release Tag / Version mismatch!`);
      console.error(`   Git Tag:        ${gitTag}`);
      console.error(`   package.json:   ${version} (Expected: ${expectedTag})`);
      return false;
    }
    console.log(`✅ Git Tag matches package.json version: ${gitTag} => v${version}`);
  }

  // Build ZIP if not present or run pnpm zip
  console.log('Creating ZIP archive...');
  runCommand('pnpm zip');

  const zipFiles = fs.readdirSync(OUTPUT_DIR).filter((file) => file.endsWith('.zip'));
  if (zipFiles.length === 0) {
    console.error('❌ ZIP package was not found in .output/');
    return false;
  }

  for (const zipFile of zipFiles) {
    const zipPath = path.join(OUTPUT_DIR, zipFile);
    const checksum = computeFileHash(zipPath);
    const checksumPath = `${zipPath}.sha256`;
    fs.writeFileSync(checksumPath, `${checksum}  ${zipFile}\n`, 'utf8');
    console.log(`✅ Cryptographic signature created for ${zipFile}:`);
    console.log(`   SHA256: ${checksum}`);
    console.log(`   Saved to: ${checksumPath}`);
  }

  return true;
}

import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const success = runArtifactsCheck();
  process.exit(success ? 0 : 1);
}
