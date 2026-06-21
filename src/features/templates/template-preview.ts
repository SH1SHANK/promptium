import { fill } from '../../lib/variables';

export const renderTemplatePreview = (text: string, values: Record<string, string>): string => {
  return fill(text, values);
};
