(() => {
  /**
   * File: utils/export-preview-renderer.js
   * Purpose: Pure, CSP-safe preview rendering helpers for code and Mermaid blocks.
   */

  const normalizeCodeLanguage = (lang: any) => {
    const value = String(lang || '')
      .trim()
      .toLowerCase();
    if (!value) return 'text';
    if (['js', 'javascript', 'node', 'jsx', 'mjs', 'cjs'].includes(value)) return 'javascript';
    if (['ts', 'typescript', 'tsx'].includes(value)) return 'typescript';
    if (['py', 'python'].includes(value)) return 'python';
    if (['sh', 'shell', 'bash', 'zsh'].includes(value)) return 'bash';
    if (['json', 'jsonc'].includes(value)) return 'json';
    if (['html', 'xml', 'svg'].includes(value)) return 'html';
    if (['css', 'scss', 'less'].includes(value)) return 'css';
    if (['sql'].includes(value)) return 'sql';
    if (['md', 'markdown'].includes(value)) return 'markdown';
    if (['dart', 'flutter', 'dartlang'].includes(value)) return 'dart';
    if (['kotlin', 'kt', 'kts'].includes(value)) return 'kotlin';
    if (['swift'].includes(value)) return 'swift';
    if (['java'].includes(value)) return 'java';
    if (['csharp', 'cs', '.net', 'dotnet'].includes(value)) return 'csharp';
    if (['go', 'golang'].includes(value)) return 'go';
    if (['rust', 'rs'].includes(value)) return 'rust';
    if (['php'].includes(value)) return 'php';
    if (['ruby', 'rb'].includes(value)) return 'ruby';
    if (['yaml', 'yml'].includes(value)) return 'yaml';
    if (['toml'].includes(value)) return 'toml';
    if (['powershell', 'ps1', 'pwsh'].includes(value)) return 'powershell';
    if (['cpp', 'c++', 'cc', 'cxx'].includes(value)) return 'cpp';
    if (['c'].includes(value)) return 'c';
    if (['lua'].includes(value)) return 'lua';
    if (['r'].includes(value)) return 'r';
    if (['scala'].includes(value)) return 'scala';
    if (['mermaid', 'mmd'].includes(value)) return 'mermaid';
    return value.replace(/[^a-z0-9_-]/g, '') || 'text';
  };

  const escapeCodeHtml = (value: any) =>
    String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  const escapeRegex = (value: any) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const escapeSvgText = (value: any) =>
    String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const trimMermaidLabel = (value: any, maxLen = 44) => {
    const compact = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!compact) return '';
    if (compact.length <= maxLen) return compact;
    return `${compact.slice(0, maxLen - 1)}…`;
  };

  const splitLabelLines = (value: any, maxChars = 20, maxLines = 3) => {
    const words = trimMermaidLabel(value, maxChars * maxLines + 8).split(' ');
    if (!words.length) return [''];
    const lines = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if (`${current} ${word}`.length <= maxChars) {
        current = `${current} ${word}`;
        continue;
      }
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }

    if (current && lines.length < maxLines) {
      lines.push(current);
    }

    return lines.slice(0, maxLines);
  };

  const CODE_KEYWORDS = {
    javascript: [
      'as',
      'async',
      'await',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'debugger',
      'default',
      'delete',
      'do',
      'else',
      'export',
      'extends',
      'finally',
      'for',
      'from',
      'function',
      'if',
      'import',
      'in',
      'instanceof',
      'let',
      'new',
      'of',
      'return',
      'static',
      'super',
      'switch',
      'this',
      'throw',
      'try',
      'typeof',
      'var',
      'void',
      'while',
      'with',
      'yield',
    ],
    typescript: [
      'abstract',
      'any',
      'as',
      'asserts',
      'async',
      'await',
      'bigint',
      'boolean',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'constructor',
      'continue',
      'debugger',
      'declare',
      'default',
      'delete',
      'do',
      'else',
      'enum',
      'export',
      'extends',
      'false',
      'finally',
      'for',
      'from',
      'function',
      'get',
      'if',
      'implements',
      'import',
      'in',
      'infer',
      'instanceof',
      'interface',
      'is',
      'keyof',
      'let',
      'module',
      'namespace',
      'never',
      'new',
      'null',
      'number',
      'object',
      'of',
      'override',
      'private',
      'protected',
      'public',
      'readonly',
      'return',
      'satisfies',
      'set',
      'static',
      'string',
      'super',
      'switch',
      'symbol',
      'this',
      'throw',
      'true',
      'try',
      'type',
      'typeof',
      'undefined',
      'unknown',
      'var',
      'void',
      'while',
    ],
    python: [
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'case',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'False',
      'finally',
      'for',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'match',
      'None',
      'nonlocal',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'True',
      'try',
      'while',
      'with',
      'yield',
    ],
    bash: [
      'case',
      'coproc',
      'do',
      'done',
      'elif',
      'else',
      'esac',
      'export',
      'fi',
      'for',
      'function',
      'if',
      'in',
      'local',
      'readonly',
      'return',
      'select',
      'then',
      'time',
      'until',
      'while',
    ],
    sql: [
      'all',
      'alter',
      'and',
      'as',
      'asc',
      'between',
      'by',
      'case',
      'create',
      'delete',
      'desc',
      'distinct',
      'drop',
      'else',
      'end',
      'from',
      'group',
      'having',
      'in',
      'insert',
      'into',
      'is',
      'join',
      'left',
      'like',
      'limit',
      'not',
      'null',
      'on',
      'or',
      'order',
      'outer',
      'right',
      'select',
      'set',
      'table',
      'then',
      'union',
      'update',
      'values',
      'when',
      'where',
    ],
    dart: [
      'abstract',
      'as',
      'assert',
      'async',
      'await',
      'base',
      'bool',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'covariant',
      'default',
      'deferred',
      'do',
      'dynamic',
      'else',
      'enum',
      'export',
      'extends',
      'extension',
      'external',
      'factory',
      'false',
      'final',
      'finally',
      'for',
      'Function',
      'get',
      'hide',
      'if',
      'implements',
      'import',
      'in',
      'interface',
      'is',
      'late',
      'library',
      'mixin',
      'new',
      'null',
      'on',
      'operator',
      'part',
      'required',
      'rethrow',
      'return',
      'sealed',
      'set',
      'show',
      'static',
      'super',
      'switch',
      'this',
      'throw',
      'true',
      'try',
      'typedef',
      'var',
      'void',
      'when',
      'while',
      'with',
      'yield',
    ],
    kotlin: [
      'abstract',
      'annotation',
      'as',
      'break',
      'by',
      'catch',
      'class',
      'companion',
      'const',
      'constructor',
      'continue',
      'data',
      'do',
      'else',
      'enum',
      'false',
      'final',
      'for',
      'fun',
      'if',
      'import',
      'in',
      'inline',
      'interface',
      'internal',
      'is',
      'lateinit',
      'null',
      'object',
      'open',
      'operator',
      'out',
      'override',
      'package',
      'private',
      'protected',
      'public',
      'reified',
      'return',
      'sealed',
      'super',
      'suspend',
      'this',
      'throw',
      'true',
      'try',
      'typealias',
      'val',
      'var',
      'when',
      'while',
    ],
    swift: [
      'actor',
      'as',
      'async',
      'await',
      'break',
      'case',
      'catch',
      'class',
      'continue',
      'defer',
      'do',
      'else',
      'enum',
      'extension',
      'fallthrough',
      'false',
      'for',
      'func',
      'guard',
      'if',
      'import',
      'in',
      'init',
      'let',
      'nil',
      'private',
      'protocol',
      'public',
      'repeat',
      'return',
      'self',
      'struct',
      'super',
      'switch',
      'throw',
      'throws',
      'true',
      'try',
      'var',
      'where',
      'while',
    ],
    java: [
      'abstract',
      'assert',
      'boolean',
      'break',
      'byte',
      'case',
      'catch',
      'char',
      'class',
      'const',
      'continue',
      'default',
      'do',
      'double',
      'else',
      'enum',
      'extends',
      'false',
      'final',
      'finally',
      'float',
      'for',
      'if',
      'implements',
      'import',
      'instanceof',
      'int',
      'interface',
      'long',
      'new',
      'null',
      'package',
      'private',
      'protected',
      'public',
      'return',
      'short',
      'static',
      'super',
      'switch',
      'this',
      'throw',
      'throws',
      'true',
      'try',
      'var',
      'void',
      'while',
    ],
    csharp: [
      'abstract',
      'as',
      'async',
      'await',
      'base',
      'bool',
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'decimal',
      'default',
      'do',
      'double',
      'else',
      'enum',
      'event',
      'explicit',
      'extern',
      'false',
      'finally',
      'fixed',
      'float',
      'for',
      'foreach',
      'get',
      'if',
      'implicit',
      'in',
      'int',
      'interface',
      'internal',
      'is',
      'lock',
      'long',
      'namespace',
      'new',
      'null',
      'object',
      'operator',
      'out',
      'override',
      'params',
      'private',
      'protected',
      'public',
      'readonly',
      'record',
      'ref',
      'return',
      'sealed',
      'set',
      'short',
      'static',
      'string',
      'struct',
      'switch',
      'this',
      'throw',
      'true',
      'try',
      'typeof',
      'using',
      'value',
      'var',
      'virtual',
      'void',
      'while',
    ],
    go: [
      'break',
      'case',
      'chan',
      'const',
      'continue',
      'default',
      'defer',
      'else',
      'fallthrough',
      'false',
      'for',
      'func',
      'go',
      'goto',
      'if',
      'import',
      'interface',
      'map',
      'nil',
      'package',
      'range',
      'return',
      'select',
      'struct',
      'switch',
      'true',
      'type',
      'var',
    ],
    rust: [
      'as',
      'async',
      'await',
      'break',
      'const',
      'continue',
      'crate',
      'else',
      'enum',
      'extern',
      'false',
      'fn',
      'for',
      'if',
      'impl',
      'in',
      'let',
      'loop',
      'match',
      'mod',
      'move',
      'mut',
      'pub',
      'ref',
      'return',
      'self',
      'Self',
      'static',
      'struct',
      'super',
      'trait',
      'true',
      'type',
      'unsafe',
      'use',
      'where',
      'while',
    ],
    php: [
      'abstract',
      'and',
      'array',
      'as',
      'break',
      'callable',
      'case',
      'catch',
      'class',
      'clone',
      'const',
      'continue',
      'declare',
      'default',
      'do',
      'echo',
      'else',
      'elseif',
      'enum',
      'extends',
      'false',
      'final',
      'finally',
      'for',
      'foreach',
      'function',
      'global',
      'if',
      'implements',
      'include',
      'interface',
      'match',
      'namespace',
      'new',
      'null',
      'or',
      'private',
      'protected',
      'public',
      'readonly',
      'require',
      'return',
      'self',
      'static',
      'switch',
      'throw',
      'trait',
      'true',
      'try',
      'use',
      'var',
      'while',
      'yield',
    ],
    ruby: [
      'BEGIN',
      'END',
      'alias',
      'and',
      'begin',
      'break',
      'case',
      'class',
      'def',
      'defined?',
      'do',
      'else',
      'elsif',
      'end',
      'ensure',
      'false',
      'for',
      'if',
      'in',
      'module',
      'next',
      'nil',
      'not',
      'or',
      'redo',
      'rescue',
      'retry',
      'return',
      'self',
      'super',
      'then',
      'true',
      'undef',
      'unless',
      'until',
      'when',
      'while',
      'yield',
    ],
    yaml: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
    toml: ['true', 'false'],
    cpp: [
      'alignas',
      'alignof',
      'and',
      'asm',
      'auto',
      'bool',
      'break',
      'case',
      'catch',
      'char',
      'class',
      'const',
      'constexpr',
      'continue',
      'default',
      'delete',
      'do',
      'double',
      'else',
      'enum',
      'explicit',
      'export',
      'extern',
      'false',
      'float',
      'for',
      'friend',
      'if',
      'inline',
      'int',
      'long',
      'namespace',
      'new',
      'noexcept',
      'nullptr',
      'operator',
      'private',
      'protected',
      'public',
      'register',
      'return',
      'short',
      'signed',
      'sizeof',
      'static',
      'struct',
      'switch',
      'template',
      'this',
      'throw',
      'true',
      'try',
      'typedef',
      'typename',
      'union',
      'unsigned',
      'using',
      'virtual',
      'void',
      'volatile',
      'while',
    ],
    c: [
      'auto',
      'break',
      'case',
      'char',
      'const',
      'continue',
      'default',
      'do',
      'double',
      'else',
      'enum',
      'extern',
      'float',
      'for',
      'goto',
      'if',
      'inline',
      'int',
      'long',
      'register',
      'return',
      'short',
      'signed',
      'sizeof',
      'static',
      'struct',
      'switch',
      'typedef',
      'union',
      'unsigned',
      'void',
      'volatile',
      'while',
    ],
    lua: [
      'and',
      'break',
      'do',
      'else',
      'elseif',
      'end',
      'false',
      'for',
      'function',
      'goto',
      'if',
      'in',
      'local',
      'nil',
      'not',
      'or',
      'repeat',
      'return',
      'then',
      'true',
      'until',
      'while',
    ],
    r: [
      'FALSE',
      'TRUE',
      'NULL',
      'break',
      'else',
      'for',
      'function',
      'if',
      'in',
      'next',
      'repeat',
      'return',
      'while',
    ],
    scala: [
      'abstract',
      'case',
      'catch',
      'class',
      'def',
      'do',
      'else',
      'extends',
      'false',
      'final',
      'finally',
      'for',
      'forSome',
      'if',
      'implicit',
      'import',
      'lazy',
      'match',
      'new',
      'null',
      'object',
      'override',
      'package',
      'private',
      'protected',
      'return',
      'sealed',
      'super',
      'this',
      'throw',
      'trait',
      'true',
      'try',
      'type',
      'val',
      'var',
      'while',
      'with',
      'yield',
    ],
    powershell: [
      'begin',
      'break',
      'catch',
      'class',
      'continue',
      'data',
      'do',
      'dynamicparam',
      'else',
      'elseif',
      'end',
      'enum',
      'exit',
      'filter',
      'finally',
      'for',
      'foreach',
      'function',
      'if',
      'in',
      'param',
      'process',
      'return',
      'switch',
      'throw',
      'trap',
      'try',
      'until',
      'using',
      'var',
      'while',
    ],
  };

  const KEYWORD_REGEX_CACHE = new Map();

  const getKeywordRegex = (lang: any) => {
    const key = String(lang || '').toLowerCase();
    if (KEYWORD_REGEX_CACHE.has(key)) {
      return KEYWORD_REGEX_CACHE.get(key);
    }
    const words = (CODE_KEYWORDS as Record<string, string[]>)[key] || [];
    if (!words.length) {
      KEYWORD_REGEX_CACHE.set(key, null);
      return null;
    }
    const regex = new RegExp(`\\b(${words.map(escapeRegex).join('|')})\\b`, 'g');
    KEYWORD_REGEX_CACHE.set(key, regex);
    return regex;
  };

  const tokenizeCodeSegments = (
    source: string,
    regex: RegExp,
    className: string,
    tokenStore: string[]
  ) =>
    source.replace(regex, (match: string) => {
      const token = `__pn_token_${tokenStore.length}__`;
      tokenStore.push(`<span class="${className}">${match}</span>`);
      return token;
    });

  const getCommentPattern = (lang: string) => {
    if (['python', 'bash', 'ruby', 'yaml', 'toml', 'lua', 'r', 'powershell'].includes(lang)) {
      return /#.*$/gm;
    }
    if (lang === 'sql') {
      return /--.*$|\/\*[\s\S]*?\*\//gm;
    }
    if (lang === 'html') {
      return /<!--[\s\S]*?-->/gm;
    }
    if (lang === 'css') {
      return /\/\*[\s\S]*?\*\//gm;
    }
    return /\/\/.*$|\/\*[\s\S]*?\*\//gm;
  };

  const highlightCodeForPreview = (source: string, languageHint: string = '') => {
    const lang = normalizeCodeLanguage(languageHint);
    let output = escapeCodeHtml(source).replace(/\r\n/g, '\n');

    if (!output.trim() || ['text', 'plain', 'plaintext', 'markdown', 'mermaid'].includes(lang)) {
      return output;
    }

    const tokenStore: string[] = [];
    const commentPattern = getCommentPattern(lang);

    output = tokenizeCodeSegments(output, commentPattern, 'pn-code-token-comment', tokenStore);
    output = tokenizeCodeSegments(
      output,
      /`[^`\n]*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gm,
      'pn-code-token-string',
      tokenStore
    );

    if (lang === 'json') {
      output = output.replace(
        /("(?:\\.|[^"\\])*?")(\s*:)/g,
        '<span class="pn-code-token-key">$1</span>$2'
      );
      output = output.replace(
        /\b(true|false|null)\b/g,
        '<span class="pn-code-token-keyword">$1</span>'
      );
    } else if (lang === 'yaml') {
      output = output.replace(
        /^(\s*[-]?\s*[A-Za-z0-9_.-]+)(\s*:)/gm,
        '<span class="pn-code-token-key">$1</span>$2'
      );
      const keywordRegex = getKeywordRegex('yaml');
      if (keywordRegex) {
        output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
      }
    } else if (lang === 'toml') {
      output = output.replace(
        /^(\s*[A-Za-z0-9_.-]+)(\s*=)/gm,
        '<span class="pn-code-token-key">$1</span>$2'
      );
      const keywordRegex = getKeywordRegex('toml');
      if (keywordRegex) {
        output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
      }
    } else {
      const keywordRegex = getKeywordRegex(lang) || getKeywordRegex('javascript');
      if (keywordRegex) {
        output = output.replace(keywordRegex, '<span class="pn-code-token-keyword">$1</span>');
      }
      output = output.replace(
        /\b([A-Z][A-Za-z0-9_]*)\b/g,
        '<span class="pn-code-token-type">$1</span>'
      );
    }

    output = output.replace(
      /\b-?(?:0x[a-fA-F0-9]+|\d+(?:\.\d+)?)\b/g,
      '<span class="pn-code-token-number">$&</span>'
    );

    tokenStore.forEach((tokenMarkup: string, index: number) => {
      const token = `__pn_token_${index}__`;
      output = output.split(token).join(tokenMarkup);
    });

    return output;
  };

  const parseMermaidNodeToken = (token: string) => {
    const raw = String(token || '')
      .trim()
      .replace(/[;,]+$/, '');
    if (!raw) return null;

    const patterns = [
      /^([A-Za-z0-9_-]+)\s*\(\(\s*"?(.+?)"?\s*\)\)$/,
      /^([A-Za-z0-9_-]+)\s*\[\s*"?(.+?)"?\s*\]$/,
      /^([A-Za-z0-9_-]+)\s*\(\s*"?(.+?)"?\s*\)$/,
      /^([A-Za-z0-9_-]+)\s*\{\s*"?(.+?)"?\s*\}$/,
      /^([A-Za-z0-9_-]+)\s*$/,
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match) continue;
      const id = String(match[1] || '').trim();
      if (!id) return null;
      const label = trimMermaidLabel(
        String(match[2] || id)
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim(),
        52
      );
      return { id, label: label || id };
    }

    return null;
  };

  const cleanMermaidEndpointToken = (value: string) =>
    String(value || '')
      .replace(/^\|[^|]*\|\s*/g, '')
      .replace(/\s*\|[^|]*\|$/g, '')
      .trim();

  const findMermaidEdge = (statement: string) => {
    const edgeOps = ['<-->', '-.->', '-->', '==>', '---', '<--', '->', '<-'];
    let best = null;
    for (const op of edgeOps) {
      const idx = statement.indexOf(op);
      if (idx <= 0) continue;
      if (!best || idx < best.index) {
        best = { op, index: idx };
      }
    }
    if (!best) return null;

    const left = cleanMermaidEndpointToken(statement.slice(0, best.index));
    const right = cleanMermaidEndpointToken(statement.slice(best.index + best.op.length));
    if (!left || !right) return null;
    return { left, right };
  };

  const renderMermaidFlowchart = (source: string, direction = 'td') => {
    const chunks = String(source || '')
      .split('\n')
      .flatMap((line) => line.split(';'))
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('%%'));

    const nodes = new Map();
    const edges = [];
    const registerNode = (token: string) => {
      const parsed = parseMermaidNodeToken(token);
      if (!parsed) return null;
      if (!nodes.has(parsed.id)) {
        nodes.set(parsed.id, parsed);
      } else if (parsed.label && nodes.get(parsed.id).label === parsed.id) {
        nodes.set(parsed.id, parsed);
      }
      return parsed.id;
    };

    for (const chunk of chunks) {
      if (/^(flowchart|graph)\b/i.test(chunk)) continue;
      if (/^(subgraph|end|style|classDef|class|linkStyle|click)\b/i.test(chunk)) continue;

      const edge = findMermaidEdge(chunk);
      if (edge) {
        const from = registerNode(edge.left);
        const to = registerNode(edge.right);
        if (from && to) {
          edges.push({ from, to });
        }
        continue;
      }

      registerNode(chunk);
    }

    const nodeList = Array.from(nodes.values());
    if (!nodeList.length) return null;

    const isHorizontal = ['lr', 'rl'].includes(direction);
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodeList.length)));
    const rows = Math.max(1, Math.ceil(nodeList.length / columns));
    const boxWidth = 168;
    const boxHeight = 56;
    const gapX = 44;
    const gapY = 34;
    const pad = 28;
    const width = pad * 2 + columns * boxWidth + (columns - 1) * gapX;
    const height = pad * 2 + rows * boxHeight + (rows - 1) * gapY;
    const positions = new Map();

    nodeList.forEach((node, index) => {
      let column = index % columns;
      let row = Math.floor(index / columns);
      if (direction === 'rl') {
        column = columns - 1 - column;
      }
      if (direction === 'bt') {
        row = rows - 1 - row;
      }
      if (isHorizontal && rows > 1) {
        column = Math.floor(index / rows);
        row = index % rows;
        if (direction === 'rl') {
          column = Math.max(1, Math.ceil(nodeList.length / rows)) - 1 - column;
        }
      }
      const x = pad + column * (boxWidth + gapX);
      const y = pad + row * (boxHeight + gapY);
      positions.set(node.id, { x, y });
    });

    const edgeMarkup = edges
      .map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return '';
        let x1 = from.x + boxWidth / 2;
        let y1 = from.y + boxHeight / 2;
        let x2 = to.x + boxWidth / 2;
        let y2 = to.y + boxHeight / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (Math.abs(dx) > Math.abs(dy)) {
          x1 += Math.sign(dx || 1) * (boxWidth / 2);
          x2 -= Math.sign(dx || 1) * (boxWidth / 2);
        } else {
          y1 += Math.sign(dy || 1) * (boxHeight / 2);
          y2 -= Math.sign(dy || 1) * (boxHeight / 2);
        }
        return `<line class="pn-mermaid-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#pn-mermaid-arrow)"></line>`;
      })
      .join('');

    const nodeMarkup = nodeList
      .map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return '';
        const centerX = pos.x + boxWidth / 2;
        const centerY = pos.y + boxHeight / 2;
        const lines = splitLabelLines(node.label, 18, 3);
        const startY = centerY - (lines.length - 1) * 8;
        const textMarkup = lines
          .map(
            (line, index) =>
              `<tspan x="${centerX}" dy="${index === 0 ? 0 : 16}">${escapeSvgText(line)}</tspan>`
          )
          .join('');
        return `
      <g class="pn-mermaid-node-group">
        <rect class="pn-mermaid-node" x="${pos.x}" y="${pos.y}" width="${boxWidth}" height="${boxHeight}" rx="10" ry="10"></rect>
        <text class="pn-mermaid-label" x="${centerX}" y="${startY}">${textMarkup}</text>
      </g>
    `;
      })
      .join('');

    return `
    <svg class="pn-mermaid-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid diagram">
      <defs>
        <marker id="pn-mermaid-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L10,4 L0,8 z" class="pn-mermaid-arrow"></path>
        </marker>
      </defs>
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
  `;
  };

  const renderMermaidSequence = (source: string) => {
    const chunks = String(source || '')
      .split('\n')
      .flatMap((line) => line.split(';'))
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('%%'));

    const participantOrder: string[] = [];
    const participantLabels = new Map();
    const messages = [];

    const ensureParticipant = (id: string, label = '') => {
      const safeId = String(id || '').trim();
      if (!safeId) return;
      if (!participantLabels.has(safeId)) {
        participantOrder.push(safeId);
        participantLabels.set(safeId, trimMermaidLabel(label || safeId, 28));
      } else if (label) {
        participantLabels.set(safeId, trimMermaidLabel(label, 28));
      }
    };

    for (const chunk of chunks) {
      if (/^sequenceDiagram\b/i.test(chunk)) continue;
      if (
        /^(autonumber|activate|deactivate|note|rect|loop|alt|else|end|opt|par|critical|break)\b/i.test(
          chunk
        )
      )
        continue;

      const participantMatch = chunk.match(
        /^(participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i
      );
      if (participantMatch) {
        const id = participantMatch[2] || '';
        const label = participantMatch[3] || id;
        if (id) {
          ensureParticipant(id, label);
        }
        continue;
      }

      const msgMatch = chunk.match(
        /^([A-Za-z0-9_-]+)\s*(->>|-->>|->|-->|=>|==>|<--|<<--|<-|<->)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/
      );
      if (!msgMatch) continue;
      const from = msgMatch[1] || '';
      const to = msgMatch[3] || '';
      const rawLabel = msgMatch[4] || '';
      const text = trimMermaidLabel(rawLabel, 44);
      if (from && to) {
        ensureParticipant(from);
        ensureParticipant(to);
        messages.push({ from, to, text });
      }
    }

    if (!participantOrder.length || !messages.length) return null;

    const colWidth = 170;
    const headerW = 120;
    const headerH = 34;
    const pad = 28;
    const topHeader = 16;
    const lifelineStart = topHeader + headerH + 12;
    const rowH = 36;
    const width = participantOrder.length * colWidth + pad * 2;
    const height = lifelineStart + messages.length * rowH + 32;

    const xByParticipant = new Map();
    participantOrder.forEach((id, index) => {
      xByParticipant.set(id, pad + index * colWidth + colWidth / 2);
    });

    const participantMarkup = participantOrder
      .map((id) => {
        const x = xByParticipant.get(id);
        const rectX = x - headerW / 2;
        const label = escapeSvgText(participantLabels.get(id) || id);
        return `
      <g class="pn-mermaid-node-group">
        <rect class="pn-mermaid-node" x="${rectX}" y="${topHeader}" width="${headerW}" height="${headerH}" rx="8" ry="8"></rect>
        <text class="pn-mermaid-label" x="${x}" y="${topHeader + 22}">
          <tspan x="${x}" dy="0">${label}</tspan>
        </text>
        <line class="pn-mermaid-lifeline" x1="${x}" y1="${lifelineStart}" x2="${x}" y2="${height - 18}"></line>
      </g>
    `;
      })
      .join('');

    const messageMarkup = messages
      .map((message, index) => {
        const x1 = xByParticipant.get(message.from);
        const x2 = xByParticipant.get(message.to);
        if (!x1 || !x2) return '';
        const y = lifelineStart + index * rowH + 10;
        const textX = (x1 + x2) / 2;
        const label = escapeSvgText(message.text || '');
        return `
      <g class="pn-mermaid-seq-message">
        <line class="pn-mermaid-edge" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-end="url(#pn-mermaid-arrow)"></line>
        <text class="pn-mermaid-label pn-mermaid-label--small" x="${textX}" y="${y - 8}">
          <tspan x="${textX}" dy="0">${label}</tspan>
        </text>
      </g>
    `;
      })
      .join('');

    return `
    <svg class="pn-mermaid-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid sequence diagram">
      <defs>
        <marker id="pn-mermaid-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L10,4 L0,8 z" class="pn-mermaid-arrow"></path>
        </marker>
      </defs>
      ${participantMarkup}
      ${messageMarkup}
    </svg>
  `;
  };

  const renderMermaidDiagram = (source: string) => {
    const raw = String(source || '').trim();
    if (!raw) return null;
    const firstLine =
      raw
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean) || '';

    try {
      if (/^sequenceDiagram\b/i.test(firstLine)) {
        return renderMermaidSequence(raw);
      }
      const flowMatch = firstLine.match(/^(?:flowchart|graph)\s+([A-Za-z]{2})/i);
      if (flowMatch) {
        return renderMermaidFlowchart(raw, String(flowMatch[1] || 'td').toLowerCase());
      }
      if (raw.includes('-->') || raw.includes('-.->') || raw.includes('==>')) {
        return renderMermaidFlowchart(raw, 'td');
      }
    } catch (_) {
      return null;
    }

    return null;
  };

  /**
   * Creates a markdown-it parser with CSP-safe options.
   * No inline HTML rendering and no dynamic code execution paths are used.
   */
  const createMarkdownParser = (markdownItFactory: any) => {
    const markdownitFn =
      typeof markdownItFactory === 'function' ? markdownItFactory : window.markdownit;
    if (typeof markdownitFn !== 'function') {
      return null;
    }

    return markdownitFn({
      html: false,
      breaks: true,
      linkify: true,
      highlight: (str: string, lang: string) => {
        const normalizedLang = normalizeCodeLanguage(lang);
        if (normalizedLang === 'mermaid') {
          const diagramMarkup = renderMermaidDiagram(str);
          if (diagramMarkup) {
            return `<div class="pn-mermaid-wrap">${diagramMarkup}</div>`;
          }
          return `<pre class="pn-code-block"><code class="pn-code language-mermaid">${escapeCodeHtml(str)}</code></pre>`;
        }
        const highlighted = highlightCodeForPreview(str, normalizedLang);
        return `<pre class="pn-code-block"><code class="pn-code language-${normalizedLang}">${highlighted}</code></pre>`;
      },
    });
  };

  const renderMarkdownDocument = (parser: any, markdownText: string) => {
    const markdown = String(markdownText || '');
    if (parser && typeof parser.render === 'function') {
      return parser.render(markdown);
    }
    return escapeCodeHtml(markdown).replaceAll('\n', '<br />');
  };

  const ExportPreviewRenderer = {
    normalizeCodeLanguage,
    highlightCodeForPreview,
    renderMermaidDiagram,
    createMarkdownParser,
    renderMarkdownDocument,
  };

  if (typeof window !== 'undefined') {
    window.ExportPreviewRenderer = ExportPreviewRenderer;
  }
})();

export {};
