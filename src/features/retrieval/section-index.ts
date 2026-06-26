import { VaultItem } from '../vault/types';
import { SectionMetadata } from './types';
export interface IndexedSection {
  content: string;
  metadata: SectionMetadata;
}
export function indexSections(item: VaultItem): IndexedSection[] {
  const lines = item.content.split(/\r?\n/);
  const sections: IndexedSection[] = [];
  let headingPath = [item.title];
  let buffer: string[] = [];
  const push = () => {
    const content = buffer.join('\n').trim();
    if (content)
      sections.push({
        content,
        metadata: {
          parentVaultItemId: item.id,
          chunkId: `${item.id}:${sections.length}`,
          headingPath: [...headingPath],
        },
      });
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      push();
      headingPath = [item.title, match[2]!.trim()];
    } else buffer.push(line);
  }
  push();
  if (sections.length <= 1)
    return item.content
      .split(/\n\s*\n/)
      .map((content, index) => ({
        content: content.trim(),
        metadata: {
          parentVaultItemId: item.id,
          chunkId: `${item.id}:${index}`,
          headingPath: [item.title],
        },
      }))
      .filter((section) => section.content);
  return sections;
}
