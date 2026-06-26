export interface RetrievalScenario {
  prompt: string;
  expectedId: string;
  expectedSource?: 'retrieved' | 'pinned';
}
const base = [
  ['Design SaaS Architecture', 'saas-guide'],
  ['Create Supabase RLS Policies', 'supabase-guide'],
  ['Build FlutterFlow Attendance App', 'flutter-guide'],
  ['Research Water Hyacinth Harvesting', 'aqua-guide'],
  ['Write TypeScript API', 'typescript-rule'],
] as const;
export const retrievalScenarios: RetrievalScenario[] = Array.from({ length: 50 }, (_, index) => {
  const item = base[index % base.length]!;
  return {
    prompt: `${item[0]} scenario ${index + 1}`,
    expectedId: item[1],
    expectedSource: item[1] === 'typescript-rule' ? 'pinned' : 'retrieved',
  };
});
