const storage: Record<string, any> = {};
(global as any).chrome = {
  storage: {
    local: {
      get: async (keys: string[] | string) => {
        const result: Record<string, any> = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => (result[key] = storage[key]));
        return result;
      },
      set: async (items: Record<string, any>) => Object.assign(storage, items),
    },
  },
};
import { initVaultStore } from '../vault/store';
import { KeywordRetrievalProvider } from './keyword-provider';
import { retrievalScenarios } from './retrieval-scenarios';
async function run() {
  storage.promptium_vault_items = [
    {
      id: 'saas-guide',
      type: 'knowledge',
      title: 'SaaS Architecture Guide',
      content: 'SaaS architecture scalability startup system design.',
      tags: ['saas', 'architecture'],
      enabled: true,
    },
    {
      id: 'supabase-guide',
      type: 'knowledge',
      title: 'Supabase Guide',
      content: `# Authentication\n${'Authentication guidance. '.repeat(80)}\n# RLS\n${'Supabase RLS policies row level security. '.repeat(80)}\n# Storage\n${'Storage guidance. '.repeat(80)}`,
      tags: ['supabase', 'rls'],
      enabled: true,
    },
    {
      id: 'flutter-guide',
      type: 'knowledge',
      title: 'FlutterFlow Attendance',
      content: 'FlutterFlow attendance app architecture.',
      tags: ['flutterflow', 'attendance'],
      enabled: true,
    },
    {
      id: 'aqua-guide',
      type: 'knowledge',
      title: 'AquaHarvester Research',
      content: 'Water hyacinth harvesting research methodology.',
      tags: ['research', 'hyacinth'],
      enabled: true,
    },
    {
      id: 'typescript-rule',
      type: 'instruction',
      title: 'Always TypeScript',
      content: 'Always use TypeScript.',
      tags: ['typescript'],
      enabled: true,
      pinned: true,
      priority: 'high',
    },
  ];
  await initVaultStore();
  const provider = new KeywordRetrievalProvider();
  for (const scenario of retrievalScenarios) {
    const result = await provider.retrieve(scenario.prompt);
    const item = [result.skill, ...result.knowledge, ...result.instructions].find(
      (entry) => entry?.item.id === scenario.expectedId
    );
    if (!item || item.retrievalReason.source !== scenario.expectedSource)
      throw new Error(`Scenario failed: ${scenario.prompt}`);
  }
  const rls = await provider.retrieve('Create Supabase RLS Policies');
  const section = rls.knowledge.find((entry) => entry.item.id === 'supabase-guide')?.section;
  if (!section?.headingPath.includes('RLS')) throw new Error('RLS section was not selected');
  console.log(`Passed ${retrievalScenarios.length} retrieval scenarios.`);
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
