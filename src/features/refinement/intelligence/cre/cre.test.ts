// Mock chrome APIs before importing modules
const mockStorage: Record<string, any> = {};

(global as any).chrome = {
  storage: {
    local: {
      get: async (keys: string[]) => {
        const res: Record<string, any> = {};
        for (const key of keys) {
          res[key] = mockStorage[key];
        }
        return res;
      },
      set: async (items: Record<string, any>) => {
        Object.assign(mockStorage, items);
      }
    }
  }
};

import { initVaultStore } from '../../../vault/store';
import { retrieveContext } from './engine';
import { budgetItems, CONTEXT_TOKEN_LIMIT } from './budget';
import { RetrievedItem } from './types';

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
  console.log('Running Context Retrieval Engine (CRE) verification tests...');

  // Setup mock vault items
  const VAULT_STORAGE_KEY = 'pn_vault_items'; // let's double check storage key in store.ts: 'promptium_vault_items'
  mockStorage['promptium_vault_items'] = [
    {
      id: 'skill_1',
      type: 'skill',
      title: 'Senior Database Administrator',
      content: 'You are an expert DBA. Provide detailed SQL queries and index recommendations.',
      tags: ['database', 'sql', 'postgres'],
      enabled: true
    },
    {
      id: 'knowledge_1',
      type: 'knowledge',
      title: 'PostgreSQL Indexing Guide',
      content: 'Always prefer using EXPLAIN ANALYZE to analyze queries. B-Tree indexes are standard.',
      tags: ['database', 'postgres'],
      enabled: true
    },
    {
      id: 'knowledge_2',
      type: 'knowledge',
      title: 'Rust Programming Best Practices',
      content: 'Prefer strict safety guidelines, match statements, and borrow checker rules.',
      tags: ['rust', 'coding'],
      enabled: true
    },
    {
      id: 'instruction_1',
      type: 'instruction',
      title: 'No commentary preference',
      content: 'Avoid outputting preamble or conversational chatter.',
      enabled: true
    }
  ];

  await initVaultStore();

  // 1. Test retrieval by matching tags and categories
  const res = await retrieveContext('How to optimize a PostgreSQL query index?');
  console.log("TEST CONTEXT RETRIEVED RESULT:", JSON.stringify(res, null, 2));

  assert(res.skill !== null, 'Skill retrieved correctly.');
  assert(res.skill?.item.id === 'skill_1', 'Matched database skill correctly.');
  assert(res.skill?.explanation.includes('postgres') || res.skill?.explanation.includes('database'), 'Explanation includes matched keywords/tags.');

  assert(res.knowledge.length >= 1, 'At least one knowledge item retrieved.');
  const pgGuide = res.knowledge.find(k => k.item.id === 'knowledge_1');
  assert(!!pgGuide, 'Indexing Guide knowledge item retrieved.');
  assert(pgGuide?.explanation.includes('postgres') || pgGuide?.explanation.includes('database'), 'Knowledge explanation lists tags or keywords.');

  // The Rust guide shouldn't be matched because it has no overlap
  const rustGuide = res.knowledge.find(k => k.item.id === 'knowledge_2');
  assert(!rustGuide, 'Irrelevant Rust guide not retrieved.');

  // Global instructions should always be retrieved
  assert(res.instructions.length === 1, 'Global instruction retrieved.');
  assert(res.instructions[0]?.item.id === 'instruction_1', 'Instruction 1 fetched correctly.');

  // 2. Test Budgeting functionality
  const dummyItems: RetrievedItem<string>[] = [
    { item: 'a', score: 0.9, explanation: 'high', tokenCount: 1500 },
    { item: 'b', score: 0.8, explanation: 'med', tokenCount: 1200 },
    { item: 'c', score: 0.5, explanation: 'low', tokenCount: 200 }
  ];

  // Budget is 2500. Prompt starts with e.g. 100.
  const budgetRes = await budgetItems(dummyItems, 100);
  assert(budgetRes.budgeted.length === 2, 'Only budgeted items that fit the limit are selected.');
  assert(budgetRes.budgeted.some(i => i.item === 'a') && budgetRes.budgeted.some(i => i.item === 'c'), 'Selected highest scoring items that fit the budget.');
  assert(budgetRes.isTruncated === true, 'Flagged as truncated since not all items fit.');

  if (failed) {
    console.error('Some CRE tests failed!');
    process.exit(1);
  } else {
    console.log('All CRE tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
