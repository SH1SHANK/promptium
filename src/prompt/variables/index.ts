// File: src/prompt/variables/index.ts

export * from './variable-types';
export * from './variable-parser';
export * from './variable-resolver';

import * as parser from './variable-parser';
import * as resolver from './variable-resolver';

// Expose as window global for legacy content-script consumers (window.TemplateParser)
const TemplateParser = {
  ...parser,
  ...resolver,
};

if (typeof window !== 'undefined') {
  (window as any).TemplateParser = TemplateParser;
}
