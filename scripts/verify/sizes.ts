import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.resolve('.output/chrome-mv3');

export function runSizesCheck(): boolean {
  console.log('\n=============================================');
  console.log('🔍 Running Production Bundle Size Audit...');
  console.log('=============================================');

  const filesToAudit = [
    { name: 'background.js', limit: 1024 * 1024 }, // 1MB limit
    { name: 'content-scripts/content.js', limit: 1024 * 1024 }, // 1MB limit
  ];

  let hasSizeRegression = false;
  const reportLines: string[] = [];

  reportLines.push('| File Path | Size (Bytes) | Size (KB) | Status |');
  reportLines.push('|:---|:---|:---|:---|');

  for (const file of filesToAudit) {
    const fullPath = path.join(OUTPUT_DIR, file.name);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const sizeBytes = stats.size;
      const sizeKb = (sizeBytes / 1024).toFixed(2);
      const status = sizeBytes > file.limit ? '⚠️ OVER LIMIT' : '✅ OK';

      reportLines.push(`| \`${file.name}\` | ${sizeBytes} | ${sizeKb} KB | ${status} |`);

      if (sizeBytes > file.limit) {
        console.error(
          `❌ Size regression detected on ${file.name}! Size ${sizeKb} KB exceeds limit of ${file.limit / 1024} KB`
        );
        hasSizeRegression = true;
      }
    } else {
      console.warn(`⚠️ Warning: ${file.name} is missing in output directory.`);
    }
  }

  // Scan chunks directory
  const chunksDir = path.join(OUTPUT_DIR, 'chunks');
  if (fs.existsSync(chunksDir)) {
    const chunks = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.js'));
    for (const chunk of chunks) {
      const chunkPath = path.join(chunksDir, chunk);
      const stats = fs.statSync(chunkPath);
      const sizeBytes = stats.size;
      const sizeKb = (sizeBytes / 1024).toFixed(2);
      // Let's flag any chunk larger than 500KB
      const status = sizeBytes > 500 * 1024 ? '⚠️ LARGE' : '✅ OK';
      reportLines.push(`| \`chunks/${chunk}\` | ${sizeBytes} | ${sizeKb} KB | ${status} |`);
    }
  }

  // Write report to .output/bundle-summary.txt
  fs.mkdirSync(path.dirname(OUTPUT_DIR), { recursive: true });
  fs.writeFileSync(path.resolve('.output/bundle-summary.txt'), reportLines.join('\n'), 'utf8');
  console.log('✅ Bundle sizes report generated successfully at .output/bundle-summary.txt');
  console.log(reportLines.join('\n'));

  return !hasSizeRegression;
}

import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const success = runSizesCheck();
  process.exit(success ? 0 : 1);
}
