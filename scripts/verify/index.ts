import { runReproducibilityCheck } from './reproducibility';
import { runBundleCheck } from './bundle';
import { runSizesCheck } from './sizes';
import { runLicenseAudit } from './license';
import { runArtifactsCheck } from './artifacts';

function main() {
  console.log('🏁 Starting Promptium Unified Verification Pipeline...');
  
  try {
    // 1. Check build reproducibility & compile
    const repOk = runReproducibilityCheck();
    if (!repOk) {
      console.error('❌ Build reproducibility verification failed.');
      process.exit(1);
    }

    // 2. Validate bundle structure
    const bundleOk = runBundleCheck();
    if (!bundleOk) {
      console.error('❌ Bundle structural validation failed.');
      process.exit(1);
    }

    // 3. Audit sizes
    const sizesOk = runSizesCheck();
    if (!sizesOk) {
      console.error('❌ Bundle size audit failed.');
      process.exit(1);
    }

    // 4. Audit dependency licenses
    const licenseOk = runLicenseAudit();
    if (!licenseOk) {
      console.error('❌ License audit failed.');
      process.exit(1);
    }

    // 5. Package and sign release artifacts
    const artifactsOk = runArtifactsCheck();
    if (!artifactsOk) {
      console.error('❌ Artifact validation failed.');
      process.exit(1);
    }

    console.log('\n🎉 All verification checks passed successfully!');
  } catch (error) {
    console.error('❌ Verification pipeline encountered a critical error:', error);
    process.exit(1);
  }
}

main();
