import { registerPlugin } from './registry';
import { genericPlugin } from './plugins/generic';
import { markdownPlugin } from './plugins/markdown';
import { claudePlugin } from './plugins/claude';
import { agentsPlugin } from './plugins/agents';
import { cursorPlugin } from './plugins/cursor';
import { skillsPlugin } from './plugins/skills';
import { hermesPlugin } from './plugins/hermes';
import { designPlugin } from './plugins/design';
import { architecturePlugin } from './plugins/architecture';
import { prdPlugin } from './plugins/prd';
import { aiderPlugin } from './plugins/aider';
import { clinePlugin } from './plugins/cline';
import { windsurfPlugin } from './plugins/windsurf';
import { codexPlugin } from './plugins/codex';

// Register all pluggable parsers
registerPlugin(genericPlugin);
registerPlugin(markdownPlugin);
registerPlugin(claudePlugin);
registerPlugin(agentsPlugin);
registerPlugin(cursorPlugin);
registerPlugin(skillsPlugin);
registerPlugin(hermesPlugin);
registerPlugin(designPlugin);
registerPlugin(architecturePlugin);
registerPlugin(prdPlugin);
registerPlugin(aiderPlugin);
registerPlugin(clinePlugin);
registerPlugin(windsurfPlugin);
registerPlugin(codexPlugin);

export * from './types';
export * from './registry';
export * from './detector';
export * from './classifier';
export * from './converter';
export * from './learning-cache';
