/**
 * File: utils/templates.js
 * Purpose: Ships curated template prompts with bracket-variable syntax.
 */

(() => {
  const ALLOWED_CATEGORIES = new Set([
    'writing',
    'coding',
    'study',
    'research',
    'creative',
    'work',
    'general',
  ]);

  const TEMPLATES = [
    // writing
    {
      id: 'tpl-writing-email',
      title: 'Write an Email',
      text: 'Write a [tone?] email to [recipient] about [subject]. Keep it clear and professional.',
      tags: ['writing', 'email'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-rewrite',
      title: 'Rewrite for Tone',
      text: 'Rewrite this message in a [tone?] tone while keeping the meaning:\n\n[paste text here]',
      tags: ['writing', 'rewrite'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-proofread',
      title: 'Proofread and Polish',
      text: 'Proofread the text below for grammar, flow, and clarity:\n\n[paste text here]',
      tags: ['writing', 'editing'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-linkedin',
      title: 'LinkedIn Post Draft',
      text: 'Write a LinkedIn post about [topic] for [audience]. Include a strong opening and one practical takeaway.',
      tags: ['writing', 'social'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-blog-outline',
      title: 'Blog Outline',
      text: 'Create a blog outline on [topic] for [audience]. Use a [tone?] style and include an actionable conclusion.',
      tags: ['writing', 'blog'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-summary',
      title: 'Summarize in Bullets',
      text: 'Summarize the following in 3 clear bullet points:\n\n[paste text here]',
      tags: ['writing', 'summary'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-press',
      title: 'Press Release Draft',
      text: 'Draft a press release for [product or event] aimed at [audience]. Keep it concise and newsworthy.',
      tags: ['writing', 'pr'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-writing-cover-letter',
      title: 'Cover Letter',
      text: 'Write a cover letter for [role] at [company]. Highlight a [strength?] and keep it under one page.',
      tags: ['writing', 'career'],
      category: 'writing',
      isTemplate: true,
    },

    // coding
    {
      id: 'tpl-coding-explain',
      title: 'Explain Code',
      text: 'Explain what this code does in simple terms:\n\n[paste your code here]\n\nAssume I have no technical background.',
      tags: ['coding', 'explain'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-debug',
      title: 'Debug This Error',
      text: 'Help me debug this [language] error:\n\n[error message]\n\nRelevant code:\n[paste code here]',
      tags: ['coding', 'debug'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-tests',
      title: 'Generate Test Cases',
      text: 'Generate test cases for this [feature] in [framework?]. Include happy path and edge cases:\n\n[paste code or behavior]',
      tags: ['coding', 'testing'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-refactor',
      title: 'Refactor Plan',
      text: 'Create a step-by-step refactor plan for [module]. Prioritize readability and lower risk.',
      tags: ['coding', 'refactor'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-api',
      title: 'API Endpoint Design',
      text: 'Design an API endpoint for [feature] with request and response examples. Include validation rules.',
      tags: ['coding', 'api'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-pr-review',
      title: 'PR Review Checklist',
      text: 'Review this pull request for [focus area?]. Return blockers, non-blockers, and missing tests:\n\n[paste diff or summary]',
      tags: ['coding', 'review'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-sql',
      title: 'Write SQL Query',
      text: 'Write a SQL query for [analysis goal] using these tables:\n\n[paste schema details]',
      tags: ['coding', 'sql'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-docs',
      title: 'Technical Docs Draft',
      text: 'Write developer docs for [feature]. Include setup, usage example, and common pitfalls.',
      tags: ['coding', 'docs'],
      category: 'coding',
      isTemplate: true,
    },

    // study
    {
      id: 'tpl-study-explain',
      title: 'Teach Me a Topic',
      text: 'Teach me [topic] like I am a beginner. Use plain language and one everyday example.',
      tags: ['study', 'learning'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-quiz',
      title: 'Practice Quiz',
      text: 'Create a [difficulty?] quiz on [topic] with 10 questions and an answer key.',
      tags: ['study', 'quiz'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-flashcards',
      title: 'Flashcards from Notes',
      text: 'Turn these notes into flashcards with question-answer pairs:\n\n[paste notes here]',
      tags: ['study', 'flashcards'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-lesson-plan',
      title: 'Lesson Plan',
      text: 'Create a lesson plan for [topic] for [level]. Include goals, activities, and a quick assessment.',
      tags: ['study', 'teaching'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-math',
      title: 'Solve Step by Step',
      text: 'Solve this problem step by step and explain each step:\n\n[paste problem here]',
      tags: ['study', 'math'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-study-plan',
      title: 'Study Plan',
      text: 'Build a [duration] study plan for [topic]. Include milestones and revision checkpoints.',
      tags: ['study', 'planning'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-memory',
      title: 'Memory Tricks',
      text: 'Give me memory techniques for [topic] and include one short recall exercise.',
      tags: ['study', 'memory'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-study-citation',
      title: 'Citation Formatter',
      text: 'Format this source in [citation style] and flag missing details:\n\n[paste source info]',
      tags: ['study', 'citation'],
      category: 'study',
      isTemplate: true,
    },

    // research
    {
      id: 'tpl-research-compare',
      title: 'Compare Options',
      text: 'Compare [option A] vs [option B] for [use case]. Include pros, cons, and recommendation.',
      tags: ['research', 'analysis'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-swot',
      title: 'SWOT Analysis',
      text: 'Create a SWOT analysis for [company or idea] in [market?].',
      tags: ['research', 'strategy'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-report',
      title: 'Research Report Outline',
      text: 'Draft a report outline on [topic] for [audience]. Include methodology and key findings sections.',
      tags: ['research', 'report'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-questions',
      title: 'Research Questions',
      text: 'Generate strong research questions about [topic] for [goal].',
      tags: ['research', 'planning'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-summary',
      title: 'Source Summary',
      text: 'Summarize this source and highlight credibility risks:\n\n[paste source content]',
      tags: ['research', 'summary'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-market',
      title: 'Market Scan',
      text: 'Run a quick market scan for [product idea] in [region?]. Include demand signals and risks.',
      tags: ['research', 'market'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-interview',
      title: 'User Interview Guide',
      text: 'Create a user interview guide for [product] targeting [audience]. Include 10 open-ended questions.',
      tags: ['research', 'user-research'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-research-literature',
      title: 'Literature Review Notes',
      text: 'Turn these papers into a structured literature review summary:\n\n[paste paper notes]',
      tags: ['research', 'academic'],
      category: 'research',
      isTemplate: true,
    },

    // creative
    {
      id: 'tpl-creative-story',
      title: 'Story Starter',
      text: 'Write the opening scene of a [genre] story set in [setting]. Add a [tone?] mood.',
      tags: ['creative', 'story'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-ideas',
      title: 'Brainstorm Ideas',
      text: 'Give me 20 creative ideas for [project]. Prioritize surprising but realistic options.',
      tags: ['creative', 'brainstorm'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-character',
      title: 'Character Profile',
      text: 'Create a character profile for [character name] in a [genre?] world.',
      tags: ['creative', 'character'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-brand',
      title: 'Brand Name Ideas',
      text: 'Generate brand name ideas for [business type]. Keep names short and memorable.',
      tags: ['creative', 'branding'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-taglines',
      title: 'Tagline Generator',
      text: 'Create 15 tagline options for [product] with a [tone?] style.',
      tags: ['creative', 'marketing'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-video',
      title: 'Video Script Hook',
      text: 'Write 10 opening hooks for a short video about [topic].',
      tags: ['creative', 'video'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-poem',
      title: 'Poem Draft',
      text: 'Write a [style?] poem about [theme]. Keep it vivid and emotionally clear.',
      tags: ['creative', 'poetry'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-world',
      title: 'Worldbuilding Pack',
      text: 'Design a world for [story idea]. Include culture, conflict, and one unique rule.',
      tags: ['creative', 'worldbuilding'],
      category: 'creative',
      isTemplate: true,
    },

    // work
    {
      id: 'tpl-work-meeting-agenda',
      title: 'Meeting Agenda',
      text: 'Create a [duration] meeting agenda for [meeting topic] with decisions and owners.',
      tags: ['work', 'meeting'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-status-update',
      title: 'Status Update',
      text: 'Write a weekly status update for [project]. Include wins, blockers, and next steps.',
      tags: ['work', 'report'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-okrs',
      title: 'OKR Draft',
      text: 'Draft 1 objective and 3 measurable key results for [team goal].',
      tags: ['work', 'planning'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-roadmap',
      title: 'Roadmap Outline',
      text: 'Create a quarterly roadmap for [product or team]. Include priorities and dependencies.',
      tags: ['work', 'roadmap'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-feedback',
      title: 'Constructive Feedback',
      text: 'Write constructive feedback for [person or team] about [topic] in a respectful tone.',
      tags: ['work', 'communication'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-retro',
      title: 'Retro Template',
      text: 'Create a sprint retrospective template for [team]. Include wins, pain points, and actions.',
      tags: ['work', 'agile'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-prd',
      title: 'PRD Starter',
      text: 'Draft a PRD for [feature]. Include problem statement, user stories, and success metrics.',
      tags: ['work', 'product'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-work-followup',
      title: 'Client Follow-Up',
      text: 'Write a follow-up message to [client] after [meeting or event]. Keep it concise and clear.',
      tags: ['work', 'client'],
      category: 'work',
      isTemplate: true,
    },

    // general
    {
      id: 'tpl-general-plan-day',
      title: 'Plan My Day',
      text: 'Create a practical plan for today based on these priorities:\n\n[paste priorities]',
      tags: ['general', 'planning'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-decision',
      title: 'Decision Support',
      text: 'Help me decide between [option A] and [option B] based on [criteria].',
      tags: ['general', 'decision'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-checklist',
      title: 'Checklist Builder',
      text: 'Create a checklist for [task or event]. Keep it simple and chronological.',
      tags: ['general', 'checklist'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-compare-tools',
      title: 'Tool Comparison',
      text: 'Compare these tools for [use case]: [tool list]. Return a quick recommendation.',
      tags: ['general', 'tools'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-message',
      title: 'Difficult Message',
      text: 'Draft a [tone?] message to [recipient] about [situation].',
      tags: ['general', 'communication'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-pros-cons',
      title: 'Pros and Cons List',
      text: 'Create a pros and cons list for [decision]. End with one recommendation.',
      tags: ['general', 'analysis'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-translation',
      title: 'Translate and Simplify',
      text: 'Translate this into [language] and keep the meaning simple:\n\n[paste text here]',
      tags: ['general', 'translation'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-explain-terms',
      title: 'Explain Terms',
      text: 'Explain these terms in plain language:\n\n[paste terms here]',
      tags: ['general', 'explain'],
      category: 'general',
      isTemplate: true,
    },

    // additional variable-first pack (8 more to exceed 50)
    {
      id: 'tpl-writing-proposal',
      title: 'Project Proposal',
      text: 'Write a proposal for [project] for [client or team]. Use a [tone?] tone and include timeline expectations.',
      tags: ['writing', 'proposal'],
      category: 'writing',
      isTemplate: true,
    },
    {
      id: 'tpl-coding-commit',
      title: 'Commit Message Helper',
      text: 'Write 5 concise commit messages for [change summary] using [style?] conventions.',
      tags: ['coding', 'git'],
      category: 'coding',
      isTemplate: true,
    },
    {
      id: 'tpl-study-oral-exam',
      title: 'Oral Exam Practice',
      text: 'Act as an examiner and ask me [difficulty?] questions on [topic].',
      tags: ['study', 'practice'],
      category: 'study',
      isTemplate: true,
    },
    {
      id: 'tpl-research-risk',
      title: 'Risk Analysis',
      text: 'Analyze risks for [initiative] in [context]. Include likelihood, impact, and mitigation.',
      tags: ['research', 'risk'],
      category: 'research',
      isTemplate: true,
    },
    {
      id: 'tpl-creative-prompt-pack',
      title: 'Creative Prompt Pack',
      text: 'Generate 15 creative prompts around [theme] for [format?].',
      tags: ['creative', 'prompts'],
      category: 'creative',
      isTemplate: true,
    },
    {
      id: 'tpl-work-brief',
      title: 'Executive Brief',
      text: 'Create an executive brief for [project] aimed at [stakeholder group].',
      tags: ['work', 'brief'],
      category: 'work',
      isTemplate: true,
    },
    {
      id: 'tpl-general-learning-path',
      title: 'Learning Path',
      text: 'Build a learning path for [skill] over [duration]. Include milestones and resources.',
      tags: ['general', 'learning'],
      category: 'general',
      isTemplate: true,
    },
    {
      id: 'tpl-general-brain-dump',
      title: 'Organize Brain Dump',
      text: 'Organize this brain dump into clear action items:\n\n[paste notes here]',
      tags: ['general', 'organization'],
      category: 'general',
      isTemplate: true,
    },
  ];

  const countVariables = (text) => {
    if (window.TemplateParser?.parse) {
      return window.TemplateParser.parse(String(text || '')).length;
    }
    const matches = String(text || '').match(/\[([^\[\]]+?)\]/g) || [];
    return matches.length;
  };

  const validateTemplates = () => {
    TEMPLATES.forEach((template) => {
      if (!ALLOWED_CATEGORIES.has(template.category)) {
        console.warn(
          '[Promptium] Template category must be canonical:',
          template.id,
          template.category
        );
      }

      if (/\{\{[^}]+\}\}/.test(template.text)) {
        console.warn('[Promptium] Legacy variable syntax found in template text:', template.id);
      }

      const varCount = countVariables(template.text);
      if (varCount > 3) {
        console.warn('[Promptium] Template has more than 3 variables:', template.id, varCount);
      }
    });
  };

  validateTemplates();

  const getTemplates = (filter = '') => {
    if (!filter) return TEMPLATES;
    const query = String(filter || '')
      .trim()
      .toLowerCase();
    if (!query) return TEMPLATES;

    if (window.AI && typeof window.AI.semanticSearch === 'function') {
      const scored = [];
      for (const template of TEMPLATES) {
        const score = typeof scorePrompt === 'function' ? scorePrompt(query, template) : 0;
        if (score > 0) {
          scored.push({ ...template, _semanticScore: score });
        }
      }
      if (scored.length) {
        scored.sort((a, b) => b._semanticScore - a._semanticScore);
        return scored;
      }
    }

    return TEMPLATES.filter(
      (template) =>
        String(template.title || '')
          .toLowerCase()
          .includes(query) ||
        String(template.text || '')
          .toLowerCase()
          .includes(query) ||
        String(template.category || '')
          .toLowerCase()
          .includes(query) ||
        (template.tags || []).some((tag) =>
          String(tag || '')
            .toLowerCase()
            .includes(query)
        )
    );
  };

  const getCategories = () => [...new Set(TEMPLATES.map((template) => template.category))];

  window.PromptTemplates = { TEMPLATES, getTemplates, getCategories };
})();
