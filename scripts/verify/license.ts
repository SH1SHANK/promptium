import fs from 'node:fs';
import path from 'node:path';

function getLicenseForPackage(pkgName: string): { version: string; license: string } {
  try {
    const pkgPath = path.resolve('node_modules', pkgName, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const info = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return {
        version: info.version || 'unknown',
        license: info.license || (info.licenses ? info.licenses.map((l: any) => l.type).join(', ') : 'Unknown'),
      };
    }
  } catch {}
  return { version: 'unknown', license: 'Unknown' };
}

export function runLicenseAudit(): boolean {
  console.log('\n=============================================');
  console.log('🔍 Running Dependency License Audit...');
  console.log('=============================================');

  const rootPkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const dependencies = {
    ...rootPkg.dependencies,
    ...rootPkg.devDependencies,
  };

  const reportLines: string[] = [];
  reportLines.push('# Dependency License Audit Report\n');
  reportLines.push('| Package | Version | License | Status |');
  reportLines.push('|:---|:---|:---|:---|');

  const forbiddenLicenses = ['GPL', 'AGPL', 'LGPL'];
  let hasWarnings = false;

  const pkgNames = Object.keys(dependencies).sort();
  for (const name of pkgNames) {
    const { version, license } = getLicenseForPackage(name);
    
    let isForbidden = false;
    for (const forbidden of forbiddenLicenses) {
      if (typeof license === 'string' && license.toUpperCase().includes(forbidden)) {
        isForbidden = true;
      }
    }

    const status = isForbidden ? '⚠️ WARNING (Copyleft)' : '✅ Approved';
    if (isForbidden) hasWarnings = true;

    reportLines.push(`| \`${name}\` | ${version} | ${license} | ${status} |`);
  }

  const outputReportPath = path.resolve('.output/license-report.md');
  fs.mkdirSync(path.dirname(outputReportPath), { recursive: true });
  fs.writeFileSync(outputReportPath, reportLines.join('\n'), 'utf8');

  console.log(`✅ Dependency license report generated at .output/license-report.md`);
  console.log(`Audited ${pkgNames.length} packages. Copyleft warnings: ${hasWarnings ? 'Yes' : 'No'}`);
  
  return true; // We don't block build on license warnings unless required, but we log them.
}

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isMain) {
  const success = runLicenseAudit();
  process.exit(success ? 0 : 1);
}
