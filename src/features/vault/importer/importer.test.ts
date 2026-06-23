// Mock chrome APIs before importing modules
(global as any).chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {}
    }
  }
};

import { detectImportSource, classifyContent, parseImportFile, addPreference, findPreferredType } from './index';

let failed = false;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✗ Assertion Failed: ${message}`);
    failed = true;
  } else {
    console.log(`✓ Passed: ${message}`);
  }
}

async function runTests() {
  console.log('Running Universal AI Context Importer verification tests...');

  // 1. Test Heuristics Format Detection
  assert(detectImportSource('CLAUDE.md', '') === 'claude', 'Detects CLAUDE.md by filename.');
  assert(detectImportSource('file.txt', '# CLAUDE.md') === 'claude', 'Detects CLAUDE.md by content header.');
  assert(detectImportSource('skills.sh', '') === 'skills', 'Detects skills.sh by filename.');
  assert(detectImportSource('.cursorrules', '') === 'cursor', 'Detects .cursorrules.');
  assert(detectImportSource('rules.json', '{"rules": []}') === 'cursor', 'Detects cursor rules from JSON contents.');
  assert(detectImportSource('test.md', '') === 'markdown', 'Detects generic markdown files.');

  // 2. Test Classifier & Confidence Levels
  const resultHigh = classifyContent('Software Architect Profile', 'You are an expert software architect...', 'skills.sh');
  assert(resultHigh.type === 'skill' && resultHigh.confidence >= 0.85, 'High confidence for auto-detected skills.');

  const resultMed = classifyContent('TypeScript Coding Guide', 'You should prefer using strict typescript type annotations.', 'style.md');
  assert(resultMed.type === 'instruction' && resultMed.confidence >= 0.60 && resultMed.confidence < 0.85, 'Medium confidence for instructions.');

  const resultLow = classifyContent('Plain document', 'This is some text about a topic with no instruction verbs or role descriptors.', 'generic.txt');
  assert(resultLow.confidence < 0.60, 'Low confidence for ambiguous plain text.');

  // 3. Test Mixed Content Splitting
  const claudeContent = `
# CLAUDE.md
Project instructions for building Promptium.

## Build Commands
pnpm build
pnpm test

## Coding Style
- Always use strict types.
- Avoid any type assignments.
  `;
  const drafts = await parseImportFile('CLAUDE.md', claudeContent);
  assert(drafts.length >= 2, 'CLAUDE.md splits into multiple drafts.');
  
  const instructionDraft = drafts.find(d => d.type === 'instruction');
  assert(!!instructionDraft, 'Successfully extracted an instruction draft from CLAUDE.md.');

  // 4. Test Learning Cache Behavior
  await addPreference({ titlePattern: 'SaaS Rules', preferredType: 'instruction' });
  const preferredType = findPreferredType('My SaaS Rules document', 'test.md');
  assert(preferredType === 'instruction', 'Retrieved preference from local override learning cache.');

  if (failed) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All importer tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
