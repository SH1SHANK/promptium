import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.resolve('.output/chrome-mv3');

export function runBundleCheck(): boolean {
  console.log('\n=============================================');
  console.log('🔍 Running Production Bundle Structural Audit...');
  console.log('=============================================');

  const requiredFiles = [
    'manifest.json',
    'background.js',
    'content-scripts/content.js',
    'icons/promptium/icon16.png',
    'icons/promptium/icon32.png',
    'icons/promptium/icon48.png',
    'icons/promptium/icon128.png',
  ];

  let missingFiles: string[] = [];
  for (const file of requiredFiles) {
    const fullPath = path.join(OUTPUT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    console.error(`❌ Structural validation failed! Missing required files:`);
    for (const file of missingFiles) {
      console.error(`   - ${file}`);
    }
    return false;
  }

  console.log('✅ All key bundles, manifests, and assets exist in build outputs.');
  return true;
}

import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const success = runBundleCheck();
  process.exit(success ? 0 : 1);
}
