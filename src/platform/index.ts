import { registerAdapter } from './base/registry';
import { ChatGPTAdapter } from './chatgpt/adapter';
import { GeminiAdapter } from './gemini/adapter';
import { ClaudeAdapter } from './claude/adapter';
import { PerplexityAdapter } from './perplexity/adapter';
import { CopilotAdapter } from './copilot/adapter';

// Automatically register all platforms on entry import
registerAdapter(new ChatGPTAdapter());
registerAdapter(new GeminiAdapter());
registerAdapter(new ClaudeAdapter());
registerAdapter(new PerplexityAdapter());
registerAdapter(new CopilotAdapter());

// Export types, interface, registry, diagnostics, and navigation
export * from './base/types';
export * from './base/adapter';
export * from './base/registry';
export * from './base/diagnostics';
export * from './base/navigation';
