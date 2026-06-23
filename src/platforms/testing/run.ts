import { getAdapters } from '../base/registry';
import { validateAdapter } from './validateAdapter';

// Register all adapters by importing the platforms bundle index
import '../index';

let failed = false;
const adapters = getAdapters();

console.log(`Running validation on ${adapters.length} adapters...`);

for (const adapter of adapters) {
  const result = validateAdapter(adapter);
  if (result.ok) {
    console.log(`✓ ${adapter.id} Adapter (v${adapter.version}) passed contract validation.`);
  } else {
    console.error(`✗ ${adapter.id} Adapter failed contract validation:`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('All adapters validated successfully.');
  process.exit(0);
}
