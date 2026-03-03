/**
 * File: utils/templates.js
 * Purpose: Ships 100+ curated prompt templates across numerous categories.
 * Communicates with: popup/popup.js, sidepanel/sidepanel.js.
 */

(() => {
  const TEMPLATES = [
    // ─── Coding & Development (15) ───
    {
      id: 'tpl-code-review',
      title: 'Code Review Assistant',
      text: 'Review the following code for bugs, performance issues, security vulnerabilities, and readability. Provide specific suggestions with code examples for each issue found. Organize feedback by severity (critical, major, minor).\n\n```\n[Paste your code here]\n```',
      tags: ['coding', 'review'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-debug',
      title: 'Debug This Error',
      text: 'I\'m getting the following error in my project. Explain what is causing it, why it happens, and provide a step-by-step fix. If there are multiple possible causes, list them in order of likelihood.\n\nError message:\n[Paste error here]\n\nRelevant code:\n[Paste code here]',
      tags: ['coding', 'debugging'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-refactor',
      title: 'Refactor for Clean Code',
      text: 'Refactor the following code to improve readability, reduce complexity, and follow SOLID principles. Explain each change you make and why it improves the code. Preserve the original functionality exactly.\n\n```\n[Paste your code here]\n```',
      tags: ['coding', 'refactoring'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-explain-code',
      title: 'Explain This Code',
      text: 'Explain the following code line by line as if teaching a junior developer. Cover what each section does, why it\'s written that way, and any patterns or idioms being used. Highlight any potential gotchas.\n\n```\n[Paste your code here]\n```',
      tags: ['coding', 'explanation'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-regex',
      title: 'Regex Generator',
      text: 'Write a Regular Expression that matches [describe exactly what to match]. Also provide strings that should match and strings that should fail to ensure it is robust. Write it for [JavaScript / Python / PCRE].',
      tags: ['coding', 'regex', 'utility'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-unit-tests',
      title: 'Generate Unit Tests',
      text: 'Write comprehensive unit tests for the following [Language/Framework] code. Use [Testing Library e.g. Jest/PyTest]. Cover standard use cases, edge cases, and expected exceptions.\n\n```\n[Paste code here]\n```',
      tags: ['coding', 'testing'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-git-cmd',
      title: 'Git Command Helper',
      text: 'I am stuck in Git. Here is my current situation: [I accidentally committed to main / I have a merge conflict / I want to squash 5 commits]. Give me the exact terminal commands to safely fix this, explaining what each command does.',
      tags: ['coding', 'git', 'terminal'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-db-schema',
      title: 'Database Schema Design',
      text: 'Design a relational database schema for a [type of app, e.g. ride-sharing app]. Provide the SQL CREATE TABLE statements for [PostgreSQL/MySQL]. Include primary keys, foreign keys, and indexes for optimal read performance.',
      tags: ['coding', 'database', 'sql'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-api-design',
      title: 'REST API Endpoint Design',
      text: 'Design a RESTful API for [a specific feature]. Provide the endpoints, HTTP methods, route paths, expected JSON request payloads, and JSON response formats. Ensure it follows standard REST conventions.',
      tags: ['coding', 'api', 'backend'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-docker-compose',
      title: 'Docker Compose Setup',
      text: 'Create a `docker-compose.yml` file for a typical [Node.js / Python / Go] web application that connects to a [PostgreSQL/MongoDB] database and a Redis cache. Include volume mapping for persistent data and a basic network bridge.',
      tags: ['coding', 'devops', 'docker'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-bash-script',
      title: 'Bash Automation Script',
      text: 'Write a Bash script that [describe task, e.g. loops through all .png files in a folder and compresses them]. Ensure the script has error handling, uses standard POSIX syntax where possible, and includes comments.',
      tags: ['coding', 'bash', 'automation'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-css-animations',
      title: 'CSS Keyframe Animation',
      text: 'Write the pure CSS for an animation that does the following: [describe animation, e.g. a subtle floating effect with a glow]. Provide the `@keyframes` block and a utility class to apply it.',
      tags: ['coding', 'css', 'frontend'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-react-component',
      title: 'React Functional Component',
      text: 'Create a React functional component using TypeScript and Tailwind CSS for a [describe component, e.g. user profile card]. Include proper typing for props and handle an empty state.',
      tags: ['coding', 'react', 'frontend'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-cron-job',
      title: 'Cron Job Schedule',
      text: 'What is the correct cron expression to run a script [describe frequency, e.g. every weekday at 3 AM]. Then, explain what each asterisk or number in the expression represents.',
      tags: ['coding', 'devops', 'utility'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tpl-time-complexity',
      title: 'Big O Complexity Analysis',
      text: 'Analyze the time and space complexity (Big O format) of the following algorithm. Explain which lines contribute to heavily to the complexity and propose an optimized approach if one exists.\n\n```\n[Paste code here]\n```',
      tags: ['coding', 'algorithm', 'performance'],
      category: 'Coding & Development',
      isTemplate: true
    },

    // ─── Engineering & CAD (15) ───
    {
      id: 'tpl-solidworks-macro',
      title: 'SolidWorks VBA Macro',
      text: 'Write a SolidWorks VBA macro that [describe task, e.g. iterates through all assembly components and suppresses resolved parts]. Include comments explaining the SolidWorks API calls used.',
      tags: ['engineering', 'solidworks', 'macro'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-autocad-lisp',
      title: 'AutoCAD AutoLISP Script',
      text: 'Write an AutoLISP routine for AutoCAD that [describe task, e.g. draws a rectangle given its center point and area]. Provide instructions on how to load and execute it via the command line.',
      tags: ['engineering', 'autocad', 'lisp'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-matlab-script',
      title: 'MATLAB Data Plotting',
      text: 'Write a MATLAB script that reads a CSV file named [filename.csv], extracts columns [A] and [B], and plots them on a line graph. Include axis labels, a title, a legend, and save the figure as a high-res PNG.',
      tags: ['engineering', 'matlab', 'analytics'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-fusion360-api',
      title: 'Fusion 360 Python API',
      text: 'Generate a Python script using the Autodesk Fusion 360 API to automate [describe task, e.g. creating a basic gear given tooth count, modulus, and pressure angle].',
      tags: ['engineering', 'fusion360', 'python'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-fe-analysis',
      title: 'FEA Setup Guide',
      text: 'I am performing Finite Element Analysis (FEA) on a [describe part, e.g. steel bracket] subjected to [describe load]. Help me determine the best meshing strategy, boundary conditions to apply, and typical failure criteria to evaluate.',
      tags: ['engineering', 'fea', 'analysis'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-material-selection',
      title: 'Material Selection Matrix',
      text: 'I need to select a material for [describe part/product]. It must withstand [operating temperatures, stresses, corrosive environment]. Create a comparison matrix of 4 candidate materials (metals/polymers) weighing cost, machinability, and strength-to-weight ratio.',
      tags: ['engineering', 'materials', 'manufacturing'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-gdnt-guide',
      title: 'GD&T Tolerance Explanation',
      text: 'Explain the Geometric Dimensioning and Tolerancing (GD&T) symbol for [True Position / Profile of a Surface]. How is it measured in inspection, and what datums does it typically reference?',
      tags: ['engineering', 'gdnt', 'drafting'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-pcb-design',
      title: 'PCB Layout Best Practices',
      text: 'What are the PCB layout best practices for designing a board handling [high frequency RF / high current power supply]? Cover trace width routing, grounding techniques, decoupling capacitors, and via placement.',
      tags: ['engineering', 'electrical', 'pcb'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-arduino-sketch',
      title: 'Arduino Sensor Sketch',
      text: 'Write an Arduino sketch (`.ino`) that interfaces with an [I2C/SPI sensor name, e.g. BME280] to read [temperature/humidity/pressure] and output it to the Serial Monitor every [X] seconds. Include required library includes.',
      tags: ['engineering', 'arduino', 'electronics'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-thermodynamics',
      title: 'Thermodynamics Calculation',
      text: 'Help me calculate the [heat transfer rate / thermal efficiency / pressure drop] for a system where [list variables: e.g. fluid type, flow rate, inlet/outlet temps]. Provide the formulas used step-by-step.',
      tags: ['engineering', 'mechanical', 'thermodynamics'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-civil-statics',
      title: 'Statics Beam Analysis',
      text: 'Calculate the reaction forces and bending moments for a simply supported beam of length [L] with a [point load / distributed load] positioned at [distance x from the left]. Show the free body diagram breakdown.',
      tags: ['engineering', 'civil', 'statics'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-gcode-explain',
      title: 'G-Code Translator',
      text: 'Explain what the following CNC G-code snippet does line-by-line. Identify the feed rates, spindle speeds, tool changes, and positioning modes (absolute vs incremental).\n\n```\n[Paste G-code]\n```',
      tags: ['engineering', 'cnc', 'manufacturing'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-ansys-workflow',
      title: 'ANSYS Simulation Workflow',
      text: 'Outline the step-by-step workflow for setting up a [Computational Fluid Dynamics (CFD) / Thermal] simulation in ANSYS Workbench for a [describe assembly]. List the key physics models needed.',
      tags: ['engineering', 'ansys', 'simulation'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-pid-tuning',
      title: 'PID Controller Tuning Strategies',
      text: 'I have a PID controller loop controlling a [heater / motor speed]. It is currently [overshooting / oscillating / too slow]. Suggest tuning adjustments for the Proportional (P), Integral (I), and Derivative (D) gains to stabilize it using the Ziegler-Nichols method.',
      tags: ['engineering', 'control-systems', 'electrical'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tpl-revit-api',
      title: 'Autodesk Revit C# API',
      text: 'Write a C# script for an Autodesk Revit add-in that [describe task, e.g. selects all walls of a specific type and changes their height]. Walk through the transaction handling.',
      tags: ['engineering', 'architecture', 'revit'],
      category: 'Engineering & CAD',
      isTemplate: true
    },

    // ─── 3D Modeling & Animation (10) ───
    {
      id: 'tpl-blender-python',
      title: 'Blender Python Script (bpy)',
      text: 'Write a Python script using Blender\'s `bpy` API to automate creating a [describe object, e.g. a grid of 10x10 cubes with randomized Z-heights]. Show how to run it in the script editor.',
      tags: ['3d-modeling', 'blender', 'python'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-topology-guide',
      title: '3D Topology Best Practices',
      text: 'Critique this description of a 3D model\'s topology: [Describe topology]. Provide rules of thumb for good edge flow, dealing with N-gons and poles, and ensuring deformation behaves correctly during rigging.',
      tags: ['3d-modeling', 'topology', 'design'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-maya-mel',
      title: 'Autodesk Maya MEL Script',
      text: 'Write a MEL script for Autodesk Maya that selects all objects with the prefix "[Prefix_]" and parent-constrains them to a locator named "[LocatorName]".',
      tags: ['3d-modeling', 'maya', 'scripting'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-unity-csharp',
      title: 'Unity C# Behavior Script',
      text: 'Write a Unity C# MonoBehaviour script for a [describe mechanic, e.g. smooth third-person camera follow or player jump with raycast grounding]. Expose variables to the inspector.',
      tags: ['3d-modeling', 'game-dev', 'unity'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-unreal-blueprint',
      title: 'Unreal Engine Blueprint Logic',
      text: 'I am creating logic in Unreal Engine 5 for [describe feature, e.g. an interactive door that opens when pressing E]. Walk me through the exact Blueprint nodes I need to connect and the casting logic required.',
      tags: ['3d-modeling', 'game-dev', 'unreal'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-rendering-opt',
      title: 'Render Settings Optimization',
      text: 'I am rendering an animation in [Cycles / V-Ray / Arnold]. A single frame is taking 20 minutes because of heavy [glass refractions / volumetric fog / subsurface scattering]. Give me 5 advanced settings I can tweak to cut render times in half without ruining quality.',
      tags: ['3d-modeling', 'rendering', 'optimization'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-pbr-textures',
      title: 'PBR Material Setup',
      text: 'What is the correct way to map a physically-based rendering (PBR) metallic-roughness texture set? Describe which maps (Albedo, Normal, Roughness, Metalness, AO) go into which slots, and the color space (sRGB vs Linear/Non-Color) required for each.',
      tags: ['3d-modeling', 'texturing', 'pbr'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-substance-designer',
      title: 'Substance Designer Node Graph',
      text: 'Help me plan out the node graph sequence in Substance Designer to create a procedural material looking like [e.g. wet cobblestone with moss]. What generator strings, warps, and blend modes should be the main anchors?',
      tags: ['3d-modeling', 'texturing', 'substance'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-rigging-ikfk',
      title: 'IK / FK Rigging Explanation',
      text: 'Explain the difference between Forward Kinematics (FK) and Inverse Kinematics (IK) in 3D character rigging. List specific scenarios for a character\'s arms and legs where one method is preferable over the other.',
      tags: ['3d-modeling', 'animation', 'rigging'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tpl-zbrush-workflow',
      title: 'ZBrush Sculpting Workflow',
      text: 'Outline standard industry workflow steps for creating a high-poly character sculpt in ZBrush and baking it down to a low-poly asset for a game engine. Include ZRemesher, Decimation, and UV mapping stages.',
      tags: ['3d-modeling', 'sculpting', 'workflow'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },

    // ─── Design & UI/UX (12) ───
    {
      id: 'tpl-figma-plugin',
      title: 'Figma Plugin Idea Blueprint',
      text: 'I want to build a Figma plugin that [describe functionality]. Detail the user flow, the Figma API methods I will likely need, and the UI layout of the plugin window.',
      tags: ['design', 'figma', 'plugin'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-ui-critique',
      title: 'UI Component Critique',
      text: 'Act as a Senior UX Designer. I am designing a [carousel / pricing table / checkout form]. List 5 common usability mistakes made with this component, and 5 "golden rules" for maximizing conversion and accessibility.',
      tags: ['design', 'ui', 'ux'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-color-palette',
      title: 'Color Palette Generation',
      text: 'Generate a comprehensive color palette for a brand that is [describe brand vibe: e.g. eco-friendly, modern, aggressive]. Provide hex codes for a primary, secondary, accent, and a 5-step grayscale (for text/backgrounds). Explain the psychological reasoning behind the choices.',
      tags: ['design', 'color', 'branding'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-font-pairing',
      title: 'Typography Pairing Suggestion',
      text: 'Suggest 3 Google Fonts pairings (Header + Body) suitable for a [SaaS dashboard / fashion blog / portfolio]. State why these fonts complement each other in terms of contrast, x-height, and aesthetic.',
      tags: ['design', 'typography', 'branding'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-ux-writing',
      title: 'Microcopy & UX Writing',
      text: 'Give me 3 friendly, tone-appropriate variations for an error message when a user [describe action, e.g. tries to upload a file that is too large]. Do not sound robotic; add a hint of [humor / empathy].',
      tags: ['design', 'ux', 'copywriting'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-accessibilty-check',
      title: 'Accessibility (WCAG) Checklist',
      text: 'Provide a quick checklist of WCAG AAA accessibility requirements for a [web form / data table / navigation menu]. Include contrast ratios, ARIA attributes, and keyboard navigation expectations.',
      tags: ['design', 'accessibility', 'a11y'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-user-persona',
      title: 'User Persona Creator',
      text: 'Generate a detailed user persona for a product targeting [describe demographic, e.g. Gen-Z freelance videographers]. Include demographics, daily tools used, primary pain points, and specific feature desires.',
      tags: ['design', 'ux', 'research'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-design-system',
      title: 'Design System Token Structure',
      text: 'Write out a JSON structure for design tokens (spacing, typography, colors, border-radii) for a modern frontend project. Keep the naming conventions semantic (e.g., color-primary-500, spacing-sm).',
      tags: ['design', 'system', 'architecture'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-wireframe-prompt',
      title: 'Text-Based Wireframe',
      text: 'Create a text-based ASCII wireframe and layout hierarchy for a mobile app screen dedicated to [describe screen, e.g. habit tracker daily view]. Detail where the floating action buttons and tab bars go.',
      tags: ['design', 'wireframing', 'layout'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-iconography',
      title: 'Iconography Concept Ideas',
      text: 'If I am designing icons for a [describe app category], what are 3 distinct visual metaphors I can use to represent the following actions: 1. [Action 1] 2. [Action 2] 3. [Action 3]?',
      tags: ['design', 'icons', 'visual'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-midjourney-prompt',
      title: 'Midjourney Prompt Engineer',
      text: 'Write an ultra-detailed Midjourney/DALL-E prompt to generate a [describe image, e.g. futuristic cyberpunk cityscape at sunset]. Include specific camera lenses, lighting styles (volumetric, cinematic), aspect ratio (--ar), and artistic medium.',
      tags: ['design', 'ai-art', 'midjourney'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tpl-logo-concept',
      title: 'Logo Concept Brainstorm',
      text: 'I am designing a logo for a company named "[Name]" that does "[Industry]". Give me 5 distinct logomark concepts combining geometric shapes, typography play, and negative space metaphors.',
      tags: ['design', 'logo', 'branding'],
      category: 'Design & UI/UX',
      isTemplate: true
    },

    // ─── Writing & Content (10) ───
    {
      id: 'tpl-blog-post',
      title: 'Blog Post Outline & Draft',
      text: 'Write a well-structured blog post about [topic]. Include:\n- An attention-grabbing headline and hook\n- 3-5 main sections with subheadings\n- Practical examples or case studies\n- A clear conclusion with a call to action\n\nTone: [professional / casual / technical]\nWord count: approximately [number] words.',
      tags: ['writing', 'blog', 'content'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-email-draft',
      title: 'Professional Email Draft',
      text: 'Draft a professional email for the following situation:\n\nContext: [describe the situation]\nRecipient: [who is this going to]\nTone: [formal / friendly / urgent]\n\nKeep it concise, clear, and actionable. Include a specific subject line.',
      tags: ['writing', 'email', 'communication'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-storytelling',
      title: 'Short Story Starter',
      text: 'Write the opening 500 words of a short story.\nGenre: [fantasy / sci-fi / mystery]\nSetting: [describe location]\nMain character: [brief description]\nConflict: [what drives the story]\nUse vivid sensory details and end on a hook.',
      tags: ['writing', 'creative', 'fiction'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-copy-editing',
      title: 'Copy Editor / Proofreader',
      text: 'Act as a strict copy editor. Review the following text for grammar, punctuation, flow, and clarity. Point out passive voice, awkward phrasing, and redundancies. Provide a heavily edited final version.\n\n[Paste text]',
      tags: ['writing', 'editing', 'grammar'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-press-release',
      title: 'Press Release Generator',
      text: 'Write a standard PR skeleton for a product launch: "[Product Name]". Include standard PR sections: FOR IMMEDIATE RELEASE, Dateline, engaging headline, introductory paragraph, quote from leadership, features, and an "About the Company" boilerplate.',
      tags: ['writing', 'pr', 'media'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-tone-rewrite',
      title: 'Tone Re-writer',
      text: 'Rewrite the following text so it sounds more [professional / academic / humorous / aggressive / concise], keeping the core information identical:\n\n[Paste text]',
      tags: ['writing', 'revision'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-news-summary',
      title: 'Summarize Article / News',
      text: 'Read the following article text and give me a 3-bullet-point summary, the primary bias of the author (if any), and 2 questions left unanswered by the piece.\n\n[Paste article]',
      tags: ['writing', 'summary', 'news'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-character-bio',
      title: 'Character Backstory Creator',
      text: 'Generate a rich, multi-dimensional backstory for a character named [Name] who works as a [Profession]. Include their fatal flaw, their greatest secret, a specific quirky habit, and their core philosophical belief.',
      tags: ['writing', 'creative', 'character'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-youtube-script',
      title: 'YouTube Script Framework',
      text: 'Outline a script for a [X]-minute YouTube video about [Topic]. Provide the 15-second hook, the intro, the main body split into 3 chapters, b-roll visual suggestions, and a concluding call-to-action (subscribe/like).',
      tags: ['writing', 'video', 'script'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tpl-book-blurb',
      title: 'Book Blurb (Back Cover)',
      text: 'Write a captivating 200-word back-cover blurb for a book titled "[Title]". The overarching plot is [describe plot]. End it with a rhetorical question that makes the reader want to buy it.',
      tags: ['writing', 'marketing', 'books'],
      category: 'Writing & Content',
      isTemplate: true
    },

    // ─── Academic & Study (10) ───
    {
      id: 'tpl-explain-concept',
      title: 'Explain Like I\'m a Beginner',
      text: 'Explain [concept/topic] in simple, clear language as if I\'m encountering it for the first time. Use a real-world analogy to build intuition and common misconceptions to avoid.',
      tags: ['study', 'explanation'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-quiz-gen',
      title: 'Generate Practice Quiz',
      text: 'Create a 10-question quiz on [topic/subject] to test my understanding. Include multiple choice, short answer, and true/false. Provide the answer key at the end with brief explanations. Difficulty: [beginner/intermediate/advanced].',
      tags: ['study', 'quiz'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-paper-outline',
      title: 'Research Paper Outline',
      text: 'Create a detailed outline for a [length]-page academic research paper about [Topic/Thesis]. Include sections for Introduction, Literature Review, Methodology, Argumentation/Data, and Conclusion.',
      tags: ['study', 'academic', 'writing'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-flashcards',
      title: 'Anki Flashcard Generator',
      text: 'Extract 15 core facts from the following text and format them into a two-column table (Front of card | Back of card) suitable for importing into Anki or Quizlet.\n\n[Paste study text]',
      tags: ['study', 'flashcards', 'memorization'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-citation-formatter',
      title: 'Citation Formatter',
      text: 'Format the following source information into strict [APA 7 / MLA 9 / Chicago] style. Note any missing information that I would need to provide for a complete citation.\n\nAuthor: [Name]\nTitle: [Title]\nDate: [Date]\nURL/Publisher: [URL/Publisher]',
      tags: ['study', 'academic', 'citation'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-debate-prep',
      title: 'Debate Prep: Devil\'s Advocate',
      text: 'My position on [Topic] is [Your stance]. Act as an expert opponent and give me the 3 strongest counter-arguments against my position. For each counter-argument, suggest a statistical or philosophical rebuttal I can use.',
      tags: ['study', 'debate', 'critical-thinking'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-language-tutor',
      title: 'Foreign Language Tutor',
      text: 'I am learning [Language]. Write a short, simple paragraph at an [A1/B2/C1] level about [Topic]. Then, extract 5 key vocabulary words and explain their grammar constructs (conjugation, gender, etc).',
      tags: ['study', 'language', 'learning'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-math-solver',
      title: 'Math Step-by-Step Solver',
      text: 'Solve the following mathematical equation/problem step-by-step. Do not skip any algebraic operations. State what theorem or rule you are applying at each step.\n\nProblem: [Paste equation or word problem]',
      tags: ['study', 'math', 'solver'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-syllabus-schedule',
      title: 'Study Schedule Planner',
      text: 'I need to master [Topic] in exactly [X] weeks. I can dedicate [Y] hours a day. Break down a week-by-week syllabus chunking the subject into logical milestones, ending with a final review week.',
      tags: ['study', 'planning', 'productivity'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tpl-plagiarism-checker',
      title: 'Paraphrase & Summarize',
      text: 'Take this highly technical paragraph and paraphrase it completely in your own words so it retains the exact meaning but uses entirely different vocabulary and sentence structures.\n\n[Paste text]',
      tags: ['study', 'paraphrasing', 'writing'],
      category: 'Academic & Study',
      isTemplate: true
    },

    // ─── Career & Business (10) ───
    {
      id: 'tpl-resume-bullet',
      title: 'Resume Bullet Point Writer',
      text: 'Transform the following job responsibility into 3 powerful resume bullet points using the XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]). Make each point action-oriented and quantified.',
      tags: ['career', 'resume'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-interview-prep',
      title: 'Interview Question Prep',
      text: 'I have an interview for a [job title] at [Company]. Generate 5 behavioral questions (STAR format) and 3 technical questions. Give a structured answer framework for each. Suggest 3 smart questions I should ask the interviewer.',
      tags: ['career', 'interview'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-cover-letter',
      title: 'Cover Letter Generator',
      text: 'Write a compelling cover letter for [Title] at [Company]. Key job requirements: [paste 3 requirements]. My experience: [paste brief experience]. Tone: Professional but personable. Keep it under 350 words.',
      tags: ['career', 'writing', 'job-search'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-salary-negotiation',
      title: 'Salary Negotiation Email',
      text: 'I was offered [Offer Amount] for [Role] at [Company], but based on market research and my [number] years of experience in [Skill], I want to counter with [Target Amount]. Draft a polite, confident, appreciative, yet firm negotiation email.',
      tags: ['career', 'negotiation', 'email'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-linkedin-bio',
      title: 'LinkedIn About Section',
      text: 'Write a LinkedIn "About" section for a [Profession, e.g. B2B Sales Executive]. I specialize in [Skills]. I am passionate about [Interest]. Make it read naturally in the first person, highlight my value proposition, and end with a call to connect.',
      tags: ['career', 'linkedin', 'networking'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-business-plan',
      title: 'One-Page Business Plan',
      text: 'Draft a Lean Canvas one-page business plan for a startup that [describe what the company does]. Break it down into: Problem, Solution, Unique Value Proposition, Unfair Advantage, Customer Segments, Key Metrics, Channels, Cost Structure, and Revenue Streams.',
      tags: ['career', 'business', 'startup'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-pitch-deck',
      title: 'Pitch Deck Slide Outline',
      text: 'Outline the 10 standard slides needed for a Seed Round pitch deck for an app that [describe app]. Give me a one-sentence summary of what exactly goes on each slide (Traction, Team, Market Size, etc).',
      tags: ['career', 'startup', 'presentation'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-resignation',
      title: 'Resignation Letter',
      text: 'Write a polite resignation letter to my manager, [Manager Name]. My last day will be [Date]. I am leaving because [Optional: describe reason or keep vague]. Express gratitude for the opportunity.',
      tags: ['career', 'email', 'hr'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-okrs',
      title: 'Generate OKRs',
      text: 'I am a [Job Title / Department]. My main goal for this quarter is to [describe high level goal]. Create 1 primary Objective and 3 measurable Key Results (OKRs) that are ambitious but quantifiable.',
      tags: ['career', 'management', 'goals'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tpl-networking',
      title: 'Cold Outreach Networking',
      text: 'Write a cold LinkedIn message or email (under 100 words) to reach out to [Name], who is a [Role] at [Company]. My goal is to [ask for a 15-min coffee chat / ask about their career path]. Follow the "give-before-you-ask" networking principle.',
      tags: ['career', 'networking', 'communication'],
      category: 'Career & Business',
      isTemplate: true
    },

    // ─── Marketing & SEO (10) ───
    {
      id: 'tpl-social-media',
      title: 'Social Media Content Pack',
      text: 'Create a social media content pack for [brand/product/topic]. Provide 3 post variations for Twitter, LinkedIn, and Instagram. Include hashtags and engagement-driving CTAs. Tone: [professional / witty].',
      tags: ['marketing', 'social-media'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-ad-copy',
      title: 'Ad Copy Generator',
      text: 'Write high-converting Facebook ad copy for [product/service]. Audience: [demographics]. Provide 3 headlines, 3 short descriptions, and 1 long-form ad using the PAS framework (Problem-Agitate-Solution).',
      tags: ['marketing', 'copywriting', 'ads'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-seo',
      title: 'SEO Content Optimizer',
      text: 'Optimize the following content for search engines. Target keyword: [primary keyword]. Secondary keywords: [list 3-5]. Provide: Optimized title tag, Meta description, H2/H3 structure, and readability improvements.\n\n[Paste content]',
      tags: ['marketing', 'seo', 'optimization'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-email-newsletter',
      title: 'Weekly Newsletter Blueprint',
      text: 'I run a weekly email newsletter about [Niche]. Write a template for this week\'s edition. Structure: engaging intro, 3 curated links with my brief commentary, a "tip of the week", and a sign-off. Give me 3 catchy subject line options.',
      tags: ['marketing', 'email', 'newsletter'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-buyer-journey',
      title: 'Map the Buyer\'s Journey',
      text: 'Map out the classic Buyer\'s Journey (Awareness, Consideration, Decision, Retention) for a customer buying [Product/Service type]. For each stage, tell me their mindset, the questions they ask, and the type of content we should serve them.',
      tags: ['marketing', 'strategy', 'sales'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-competitor-analysis',
      title: 'Competitor SWOT Setup',
      text: 'I am creating a SWOT table comparing my business ([My Business]) against [Competitor A] and [Competitor B]. Ask me the 10 most critical probing questions I need to answer to fill out this SWOT matrix effectively.',
      tags: ['marketing', 'strategy', 'swot'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-affiliate-pitch',
      title: 'Affiliate Partnership Pitch',
      text: 'Draft an email pitching an affiliate marketing partnership to an influencer in the [Niche] space. Focus on the mutual benefit, our specific commission structure ([X]%), and offer to send them a free piece of hardware/demo for review.',
      tags: ['marketing', 'sales', 'email'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-product-description',
      title: 'E-commerce Product Description',
      text: 'Write an SEO-friendly e-commerce product description for [Product]. Features: [list features]. Benefits: [list benefits]. Include a bulleted feature list and a single-paragraph emotional hook that appeals to their lifestyle.',
      tags: ['marketing', 'ecommerce', 'copywriting'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-go-to-market',
      title: 'Go-To-Market (GTM) Plan',
      text: 'Outline a 30-day Go-To-Market strategy for launching [App/Product]. Break it down into pre-launch hype, launch day execution (Product Hunt, PR, Socials), and post-launch week 1 retention tactics.',
      tags: ['marketing', 'launch', 'startup'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tpl-video-hook',
      title: 'TikTok / Reel Video Hooks',
      text: 'Give me 10 viral-style video hooks (the first 3 seconds of a script) for a short-form video about [Topic]. Use psychology triggers like curiosity gaps, controversial statements, or "how-to" promises.',
      tags: ['marketing', 'social-media', 'video'],
      category: 'Marketing & SEO',
      isTemplate: true
    },

    // ─── Daily Life & General (12) ───
    {
      id: 'tpl-news-update',
      title: 'What\'s The Latest News?',
      text: 'Summarize the top 5 global news stories right now in technology, geopolitics, and science. Keep each summary to two sentences and remain entirely neutral and objective. (Note: Relies on LLM internet access capability).',
      tags: ['daily', 'news', 'update'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-weekly-meal-plan',
      title: 'Weekly Meal Planner',
      text: 'Create a 5-day dinner meal plan for [number] people. Dietary restrictions: [Vegan/Keto/None]. Goal: [High protein/Cheap/Fast]. Under each day, list the meal, estimated prep time, and provide a consolidated grocery shopping list organized by supermarket aisle.',
      tags: ['daily', 'food', 'planning'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-workout-routine',
      title: 'Custom Workout Routine',
      text: 'Generate a [X]-day per week workout routine. Goal: [Muscle gain / weight loss / endurance]. Equipment available: [Dumbbells, Gym, Bodyweight only]. Detail the exercises, sets, reps, and rest times between sets.',
      tags: ['daily', 'fitness', 'health'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-travel-itinerary',
      title: 'Travel Itinerary Generator',
      text: 'Plan a [Number]-day vacation to [Destination]. My travel style is [relaxed / packed / foodie / historical]. Give me a day-by-day itinerary including morning, afternoon, and evening activities, plus local food recommendations.',
      tags: ['daily', 'travel', 'planning'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-gift-ideas',
      title: 'Gift Idea Brainstormer',
      text: 'Give me 10 unique gift ideas for a [relation, e.g. 30yo brother] who is interested in [Interest 1], [Interest 2], and [Interest 3]. Budget is under $[Amount]. Exclude generic things like gift cards or clothing.',
      tags: ['daily', 'gifts', 'brainstorm'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-budget-planner',
      title: 'Monthly Budget Breakdown',
      text: 'My monthly take-home pay is $[Amount]. My fixed expenses (rent, insurance, car) total $[Amount]. Allocate the remaining amount using the 50/30/20 rule (Needs/Wants/Savings) and suggest specific categories to track.',
      tags: ['daily', 'finance', 'budgeting'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-chore-schedule',
      title: 'Household Chore Matrix',
      text: 'Create a fair household chore schedule for [number] roommates/family members. Break chores into daily tasks (e.g. dishes), weekly tasks (e.g. bathroom), and monthly deep cleans. Display it as a markdown table.',
      tags: ['daily', 'home', 'organization'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-book-recs',
      title: 'Book / Media Recommendations',
      text: 'I loved reading [Book 1] and [Book 2], and my favorite movie is [Movie]. Give me 5 highly-rated book recommendations that share similar themes, pacing, or world-building. Give a 1-sentence synopsis for each without spoilers.',
      tags: ['daily', 'review', 'books'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-apology-message',
      title: 'Apology / Difficult Text',
      text: 'Help me draft a text message to a [friend/family member] apologizing for [canceling plans last minute / missing their birthday / an argument]. Tone should be sincere, taking accountability without over-explaining or sounding dramatic.',
      tags: ['daily', 'relationships', 'texting'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-fridge-recipe',
      title: 'What\'s In My Fridge Recipe',
      text: 'I have the following ingredients in my kitchen: [Ingredient 1, Ingredient 2, Ingredient 3...]. Give me 3 different recipes I can make right now using mostly these items, along with basic pantry staples (oil, salt, pepper, garlic).',
      tags: ['daily', 'cooking', 'food'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-movie-night',
      title: 'Movie Night Picker',
      text: 'Act as a film critic. Suggest 3 hidden-gem movies from the [Decade, e.g. 1990s] in the [Genre] genre. They must have a high Rotten Tomatoes score but barely be talked about today. Explain exactly why I should watch each.',
      tags: ['daily', 'entertainment', 'movies'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tpl-pet-advice',
      title: 'New Pet Training Basics',
      text: 'I just adopted a [describe pet: e.g. 8-week old golden retriever]. Give me a checklist for the first 48 hours at home, including socialization priorities, potty training basics, and signs of stress to watch out for.',
      tags: ['daily', 'pets', 'advice'],
      category: 'Daily Life & General',
      isTemplate: true
    },

    // ─── Data & Analysis (8) ───
    {
      id: 'tpl-data-analysis',
      title: 'Data Analysis Framework',
      text: 'I have a dataset about [describe your data]. Suggest 5 key questions this data could answer, the best visualization types for each, and potential biases or data quality issues to watch for.',
      tags: ['data', 'analysis', 'framework'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-sql-query',
      title: 'SQL Query Builder',
      text: 'Write an optimized SQL query for [PostgreSQL/MySQL]. Tables involved: [table names]. I need: [desired output]. Filters: [WHERE conditions]. Provide comments explaining the query and suggest relevant indexes for performance.',
      tags: ['data', 'sql', 'database'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-report',
      title: 'Report Generator',
      text: 'Generate a professional report structure for [topic]. Key findings: [finding 1, 2, 3]. Include an executive summary, methodology, detailed findings with evidence, visualization suggestions, and conclusions. Audience: [technical/executive].',
      tags: ['data', 'writing', 'report'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-excel-formula',
      title: 'Complex Excel/Sheets Formula',
      text: 'I need a formula for [Excel/Google Sheets] that does the following: [describe logic, e.g. looks up a value in column A based on multiple criteria in columns B and C, ignoring blanks]. Use modern functions like XLOOKUP or FILTER if applicable.',
      tags: ['data', 'excel', 'spreadsheet'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-python-pandas',
      title: 'Python Pandas Manipulation',
      text: 'Write python code using the Pandas library to accomplish this: I have a DataFrame `df`. I need to drop nulls in column [A], group by column [B], calculate the mean of column [C], and sort descending.',
      tags: ['data', 'python', 'pandas'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-data-cleaning',
      title: 'Data Cleaning Script',
      text: 'Provide a Python/Pandas script that serves as a robust "cleaning pipeline" for a dirty CSV file. It should handle standardizing date formats to ISO, stripping whitespace from string columns, filling NaNs with median/mode, and dropping duplicate rows.',
      tags: ['data', 'python', 'cleaning'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-stats-test',
      title: 'Statistical Test Selector',
      text: 'I need to prove a hypothesis. I have [type of data: e.g. categorical, continuous], and my sample size is [N]. I want to know if [Group A] is significantly different from [Group B]. What is the correct statistical test to use (e.g. T-test, ANOVA, Chi-Square), and what are the assumptions for it?',
      tags: ['data', 'statistics', 'math'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tpl-regex-data',
      title: 'Regex for Data Extraction',
      text: 'Write a Regular Expression (for Python) that parses an unformatted log file and extracts the [Timestamp], [IP Address], and the [Error Code]. The lines look like this: [Paste example line]. Output it using named capture groups.',
      tags: ['data', 'regex', 'parsing'],
      category: 'Data & Analysis',
      isTemplate: true
    },

    // ─── Productivity (8) ───
    {
      id: 'tpl-meeting-agenda',
      title: 'Meeting Agenda Builder',
      text: 'Create a structured meeting agenda for: Purpose: [goal]. Duration: [time]. Include: Welcome (2 min), Discussion topics with time allocations, Decision points clearly marked, and Action items/Next steps.',
      tags: ['productivity', 'meeting', 'management'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-decision-matrix',
      title: 'Decision Matrix Analyzer',
      text: 'Make a decision between: 1. [Option A] 2. [Option B] 3. [Option C]. Criteria: [cost, time, quality, risk]. Create a weighted decision matrix, score each, and provide a clear recommendation.',
      tags: ['productivity', 'analysis', 'decision'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-sop',
      title: 'Standard Operating Procedure (SOP)',
      text: 'Write a step-by-step SOP for [process name]. Include: Purpose, prerequisites, numbered instructions, decision points with if/then logic, quality checkpoints, and troubleshooting common issues.',
      tags: ['productivity', 'documentation', 'process'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-pomodoro-schedule',
      title: 'Deep Work Schedule (Pomodoro)',
      text: 'I have [X] hours to complete [List of 3-4 Tasks]. Suggest a strict time-blocking schedule using the Pomodoro technique (or 90-minute deep work cycles). Recommend what I should do during the small and large breaks to maximize focus recovery.',
      tags: ['productivity', 'time-management', 'focus'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-prioritization',
      title: 'Eisenhower Matrix Sorter',
      text: 'Here is my brain-dump of things I need to do: [List items]. Categorize them into an Eisenhower Matrix (Urgent & Important, Important not Urgent, Urgent not Important, Neither). Tell me what to DO, SCHEDULE, DELEGATE, and DELETE.',
      tags: ['productivity', 'prioritization', 'planning'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-habit-tracker',
      title: 'Habit Formation Protocol',
      text: 'I want to build a daily habit of [Habit, e.g. meditating for 10 minutes]. Using behavioral psychology (like James Clear\'s Atomic Habits), give me a 4-step framework to make the cue obvious, craving attractive, response easy, and reward satisfying.',
      tags: ['productivity', 'habits', 'psychology'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-email-triage',
      title: 'Inbox Zero Triage Rules',
      text: 'My inbox is overflowing. Suggest a 5-folder system for achieving "Inbox Zero" and outline the exact triage rule logic I should set up in [Gmail / Outlook] to auto-route newsletters, calendar invites, client emails, and internal team memos.',
      tags: ['productivity', 'email', 'organization'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tpl-retrospective',
      title: 'Project Retrospective Generator',
      text: 'We just finished deploying [Project Name]. Generate an asynchronous format template for a Sprint Retrospective covering: 1) What went well, 2) What didn\'t go well, 3) Action items for improvement, and 4) Shoutouts/Kudos.',
      tags: ['productivity', 'agile', 'management'],
      category: 'Productivity',
      isTemplate: true
    },

    // ─── Variable-First Template Pack (58) ───
    {
      id: 'tplv-coding-pr-review',
      title: 'PR Review Plan',
      text: 'Review pull request {{pr_title}} for repository {{repo_name}}. Focus areas: {{focus_areas}}. Risk level: {{risk_level}}. Optional context: {{context?}}. Return: 1) blocking issues, 2) non-blocking improvements, 3) test gaps, 4) merge recommendation.',
      tags: ['coding', 'review', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-commit-msg',
      title: 'Conventional Commit Writer',
      text: 'Generate {{commit_count}} Conventional Commit messages for changes in {{module_name}}. Change summary: {{change_summary}}. Type preference: {{commit_type}}. Optional ticket prefix: {{ticket_prefix?}}.',
      tags: ['coding', 'git', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-api-spec',
      title: 'API Endpoint Spec',
      text: 'Draft an API spec for endpoint {{http_method}} {{route_path}} in service {{service_name}}. Request shape: {{request_contract}}. Response shape: {{response_contract}}. Auth model: {{auth_model}}. Optional rate limits: {{rate_limits?}}.',
      tags: ['coding', 'api', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-bug-ticket',
      title: 'Bug Ticket Formatter',
      text: 'Create a complete bug ticket for issue {{bug_title}} in product {{product_name}}. Environment: {{environment}}. Repro steps: {{repro_steps}}. Expected behavior: {{expected_behavior}}. Actual behavior: {{actual_behavior}}. Optional logs: {{logs?}}.',
      tags: ['coding', 'debugging', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-refactor-plan',
      title: 'Refactor Plan Generator',
      text: 'Create a phased refactor plan for module {{module_name}}. Current pain points: {{pain_points}}. Constraints: {{constraints}}. Success criteria: {{success_criteria}}. Optional deadline: {{deadline?}}.',
      tags: ['coding', 'refactoring', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-test-cases',
      title: 'Test Case Matrix',
      text: 'Generate a test matrix for feature {{feature_name}} in {{framework}}. Primary behaviors: {{behaviors}}. Edge cases: {{edge_cases}}. Failure modes: {{failure_modes}}. Optional non-functional checks: {{non_functional?}}.',
      tags: ['coding', 'testing', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-security-audit',
      title: 'Security Audit Checklist',
      text: 'Audit component {{component_name}} for security risks. Tech stack: {{tech_stack}}. Data handled: {{data_types}}. Threat model scope: {{threat_scope}}. Optional compliance target: {{compliance_target?}}.',
      tags: ['coding', 'security', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },
    {
      id: 'tplv-coding-release-notes',
      title: 'Release Notes Draft',
      text: 'Write release notes for version {{version_number}} of {{product_name}}. Major updates: {{major_updates}}. Fixes: {{bug_fixes}}. Breaking changes: {{breaking_changes}}. Optional migration notes: {{migration_notes?}}.',
      tags: ['coding', 'release', 'variables'],
      category: 'Coding & Development',
      isTemplate: true
    },

    {
      id: 'tplv-eng-fea-setup',
      title: 'FEA Setup Brief',
      text: 'Create an FEA setup checklist for part {{part_name}} under load case {{load_case}}. Material: {{material}}. Boundary conditions: {{boundary_conditions}}. Mesh target: {{mesh_target}}. Optional solver notes: {{solver_notes?}}.',
      tags: ['engineering', 'fea', 'variables'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tplv-eng-bom',
      title: 'BOM Normalizer',
      text: 'Normalize this bill of materials for assembly {{assembly_name}}. Inputs: {{bom_input}}. Required output columns: {{required_columns}}. Grouping rule: {{grouping_rule}}. Optional vendor constraints: {{vendor_constraints?}}.',
      tags: ['engineering', 'manufacturing', 'variables'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tplv-eng-dfm',
      title: 'DFM Review Prompt',
      text: 'Run a design-for-manufacturing review for {{part_name}} made with {{process_name}}. Geometry summary: {{geometry_summary}}. Tolerance expectations: {{tolerance_expectations}}. Volume target: {{volume_target}}. Optional cost target: {{cost_target?}}.',
      tags: ['engineering', 'dfm', 'variables'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tplv-eng-test-protocol',
      title: 'Validation Test Protocol',
      text: 'Draft a validation protocol for product {{product_name}}. Test objective: {{test_objective}}. Pass/fail criteria: {{pass_fail_criteria}}. Required instruments: {{instruments}}. Optional safety notes: {{safety_notes?}}.',
      tags: ['engineering', 'testing', 'variables'],
      category: 'Engineering & CAD',
      isTemplate: true
    },
    {
      id: 'tplv-eng-cad-handoff',
      title: 'CAD Handoff Package',
      text: 'Prepare a CAD handoff checklist for project {{project_name}}. Deliverables required: {{deliverables}}. File formats: {{file_formats}}. Revision tag: {{revision_tag}}. Optional receiving team notes: {{handoff_notes?}}.',
      tags: ['engineering', 'cad', 'variables'],
      category: 'Engineering & CAD',
      isTemplate: true
    },

    {
      id: 'tplv-3d-asset-brief',
      title: '3D Asset Production Brief',
      text: 'Create a production brief for asset {{asset_name}} for platform {{platform_name}}. Poly budget: {{poly_budget}}. Texture budget: {{texture_budget}}. Style guide: {{style_guide}}. Optional animation requirement: {{animation_requirement?}}.',
      tags: ['3d-modeling', 'workflow', 'variables'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tplv-3d-material-prompt',
      title: 'Procedural Material Recipe',
      text: 'Design a procedural material for {{material_name}} in {{tool_name}}. Visual characteristics: {{visual_characteristics}}. Required maps: {{required_maps}}. Tiling constraints: {{tiling_constraints}}. Optional weathering level: {{weathering_level?}}.',
      tags: ['3d-modeling', 'texturing', 'variables'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tplv-3d-rig-checklist',
      title: 'Rig QA Checklist',
      text: 'Generate a rig QA checklist for character {{character_name}}. Required controls: {{required_controls}}. Deformation zones: {{deformation_zones}}. Export target: {{export_target}}. Optional engine constraints: {{engine_constraints?}}.',
      tags: ['3d-modeling', 'rigging', 'variables'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },
    {
      id: 'tplv-3d-render-pass',
      title: 'Render Pass Plan',
      text: 'Plan render passes for scene {{scene_name}} in {{renderer}}. Shot goal: {{shot_goal}}. Required passes: {{required_passes}}. Denoise strategy: {{denoise_strategy}}. Optional compositing notes: {{compositing_notes?}}.',
      tags: ['3d-modeling', 'rendering', 'variables'],
      category: '3D Modeling & Animation',
      isTemplate: true
    },

    {
      id: 'tplv-design-landing-page',
      title: 'Landing Page UX Brief',
      text: 'Design a landing page brief for product {{product_name}} targeting {{audience}}. Primary conversion action: {{primary_cta}}. Proof points: {{proof_points}}. Brand tone: {{brand_tone}}. Optional objections to address: {{objections?}}.',
      tags: ['design', 'ux', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tplv-design-design-system',
      title: 'Design System Seed',
      text: 'Create a starter design system for {{product_type}}. Color direction: {{color_direction}}. Typography direction: {{typography_direction}}. Core components: {{core_components}}. Optional accessibility level: {{accessibility_level?}}.',
      tags: ['design', 'system', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tplv-design-user-flow',
      title: 'User Flow Mapper',
      text: 'Map a user flow for task {{task_name}} in app {{app_name}}. Entry point: {{entry_point}}. Key steps: {{key_steps}}. Drop-off risks: {{dropoff_risks}}. Optional recovery steps: {{recovery_steps?}}.',
      tags: ['design', 'research', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tplv-design-ux-heuristic',
      title: 'Heuristic UX Audit',
      text: 'Run a heuristic audit on screen {{screen_name}}. Known pain points: {{pain_points}}. Business objective: {{business_objective}}. Severity rubric: {{severity_rubric}}. Optional benchmark apps: {{benchmark_apps?}}.',
      tags: ['design', 'ui', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tplv-design-case-study',
      title: 'Design Case Study Draft',
      text: 'Draft a case study for project {{project_name}}. Problem statement: {{problem_statement}}. Role and scope: {{role_scope}}. Outcome metrics: {{outcome_metrics}}. Optional constraints: {{constraints?}}.',
      tags: ['design', 'portfolio', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },
    {
      id: 'tplv-design-icon-set',
      title: 'Icon Set Direction',
      text: 'Define icon style rules for product {{product_name}}. Visual style: {{visual_style}}. Base grid: {{base_grid}}. Stroke/fill rule: {{stroke_fill_rule}}. Optional brand motifs: {{brand_motifs?}}.',
      tags: ['design', 'icons', 'variables'],
      category: 'Design & UI/UX',
      isTemplate: true
    },

    {
      id: 'tplv-writing-email',
      title: 'Variable Professional Email',
      text: 'Write a {{tone}} email to {{recipient}} about {{topic}}. Goal: {{goal}}. Keep under {{word_limit}} words. Optional context to include: {{context?}}.',
      tags: ['writing', 'email', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tplv-writing-blog-outline',
      title: 'Blog Outline with Variables',
      text: 'Create a blog outline for {{topic}} aimed at {{audience}}. Desired angle: {{angle}}. Include {{section_count}} main sections, FAQ, and CTA. Optional keyword list: {{keywords?}}.',
      tags: ['writing', 'blog', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tplv-writing-edit-pass',
      title: 'Editing Pass Instructions',
      text: 'Edit the draft below for {{editing_goal}} while preserving voice {{voice_style}}. Remove {{remove_items}} and strengthen {{strengthen_items}}. Optional strict word cap: {{word_cap?}}.\n\nDraft:\n{{draft_text}}',
      tags: ['writing', 'editing', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tplv-writing-social-thread',
      title: 'Social Thread Builder',
      text: 'Write a {{platform}} thread about {{topic}} for {{audience}}. Include hook style {{hook_style}}, {{tweet_count}} posts, and CTA {{cta_text}}. Optional example story: {{example_story?}}.',
      tags: ['writing', 'social-media', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tplv-writing-press-qa',
      title: 'Press Q&A Sheet',
      text: 'Generate a press Q&A sheet for announcement {{announcement_name}}. Core message: {{core_message}}. Risky questions to prepare for: {{risky_questions}}. Approved tone: {{approved_tone}}. Optional embargo details: {{embargo_details?}}.',
      tags: ['writing', 'pr', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },
    {
      id: 'tplv-writing-summary-brief',
      title: 'Executive Summary Brief',
      text: 'Summarize document {{document_name}} for {{audience_type}}. Prioritize {{priority_topics}}. Output format: {{output_format}}. Include action items for {{owner}}. Optional length target: {{length_target?}}.',
      tags: ['writing', 'summary', 'variables'],
      category: 'Writing & Content',
      isTemplate: true
    },

    {
      id: 'tplv-study-lesson-plan',
      title: 'Lesson Plan Generator',
      text: 'Create a lesson plan for topic {{topic}} at level {{level}}. Session duration: {{duration}}. Learning outcomes: {{learning_outcomes}}. Assessment type: {{assessment_type}}. Optional prerequisite review: {{prerequisites?}}.',
      tags: ['study', 'planning', 'variables'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tplv-study-exam-drill',
      title: 'Exam Drill Pack',
      text: 'Create an exam drill pack for subject {{subject}}. Difficulty: {{difficulty}}. Question count: {{question_count}}. Topics to cover: {{topics}}. Optional time limit per section: {{time_limit?}}.',
      tags: ['study', 'quiz', 'variables'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tplv-study-paper-abstract',
      title: 'Abstract Rewrite',
      text: 'Rewrite this abstract for paper {{paper_title}} with focus on {{focus}}. Keep technical rigor appropriate for {{target_journal}}. Word limit: {{word_limit}}. Optional methods emphasis: {{methods_emphasis?}}.\n\nSource abstract:\n{{source_abstract}}',
      tags: ['study', 'academic', 'variables'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tplv-study-concept-map',
      title: 'Concept Map Creator',
      text: 'Generate a concept map for {{topic}} with core nodes {{core_nodes}} and dependencies {{dependencies}}. Audience level: {{audience_level}}. Optional misconceptions to address: {{misconceptions?}}.',
      tags: ['study', 'explanation', 'variables'],
      category: 'Academic & Study',
      isTemplate: true
    },
    {
      id: 'tplv-study-citation-check',
      title: 'Citation Consistency Checker',
      text: 'Check citation consistency for style {{citation_style}} across section {{section_name}}. Known issues: {{known_issues}}. Required fixes: {{required_fixes}}. Optional bibliography source: {{bibliography?}}.',
      tags: ['study', 'citation', 'variables'],
      category: 'Academic & Study',
      isTemplate: true
    },

    {
      id: 'tplv-career-resume-bullets',
      title: 'Resume Bullet Optimizer',
      text: 'Turn this experience into {{bullet_count}} quantified resume bullets for role {{target_role}}. Scope: {{scope}}. Metrics: {{metrics}}. Optional ATS keywords: {{ats_keywords?}}.\n\nRaw experience:\n{{raw_experience}}',
      tags: ['career', 'resume', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tplv-career-cover-letter',
      title: 'Cover Letter with Variables',
      text: 'Write a cover letter for {{role}} at {{company}}. Relevant experience: {{experience_highlights}}. Why this company: {{why_company}}. Tone: {{tone}}. Optional referral mention: {{referral?}}.',
      tags: ['career', 'job-search', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tplv-career-interview-stories',
      title: 'STAR Story Builder',
      text: 'Build {{story_count}} STAR interview stories for competency {{competency}} based on this background: {{background}}. Target role: {{target_role}}. Optional company values to align: {{company_values?}}.',
      tags: ['career', 'interview', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tplv-career-performance-review',
      title: 'Performance Review Draft',
      text: 'Draft a self-review for period {{review_period}} as {{role}}. Top achievements: {{achievements}}. Impact metrics: {{impact_metrics}}. Growth areas: {{growth_areas}}. Optional manager context: {{manager_context?}}.',
      tags: ['career', 'management', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tplv-career-cold-outreach',
      title: 'Cold Outreach Message',
      text: 'Write a cold outreach note to {{recipient_name}} ({{recipient_role}} at {{recipient_company}}). Ask: {{ask_type}}. Shared context: {{shared_context}}. Tone: {{tone}}. Optional value add: {{value_add?}}.',
      tags: ['career', 'networking', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },
    {
      id: 'tplv-career-offer-eval',
      title: 'Job Offer Comparison',
      text: 'Compare offers {{offer_a_name}} and {{offer_b_name}} for candidate priorities {{priorities}}. Compensation details: {{compensation_details}}. Culture signals: {{culture_signals}}. Optional risk factors: {{risk_factors?}}.',
      tags: ['career', 'decision', 'variables'],
      category: 'Career & Business',
      isTemplate: true
    },

    {
      id: 'tplv-mkt-campaign-brief',
      title: 'Campaign Brief Generator',
      text: 'Create a campaign brief for {{campaign_name}} promoting {{product_name}} to {{audience}}. Primary KPI: {{primary_kpi}}. Channels: {{channels}}. Optional creative constraints: {{creative_constraints?}}.',
      tags: ['marketing', 'strategy', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tplv-mkt-seo-cluster',
      title: 'SEO Topic Cluster Plan',
      text: 'Build an SEO cluster around pillar topic {{pillar_topic}} for site {{site_type}}. Target intent: {{search_intent}}. Competitor signals: {{competitor_signals}}. Optional locale target: {{locale?}}.',
      tags: ['marketing', 'seo', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tplv-mkt-ad-variants',
      title: 'Ad Variant Generator',
      text: 'Generate {{variant_count}} ad variants for product {{product_name}} targeting {{audience}}. Value proposition: {{value_prop}}. Tone: {{tone}}. Optional banned claims: {{banned_claims?}}.',
      tags: ['marketing', 'ads', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tplv-mkt-audience-persona',
      title: 'Audience Persona Sheet',
      text: 'Create persona {{persona_name}} for market {{market}}. Core pains: {{core_pains}}. Desired outcomes: {{desired_outcomes}}. Purchase blockers: {{purchase_blockers}}. Optional channels: {{channels?}}.',
      tags: ['marketing', 'research', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tplv-mkt-launch-calendar',
      title: 'Launch Content Calendar',
      text: 'Generate a {{duration_weeks}}-week launch calendar for {{launch_name}}. Key dates: {{key_dates}}. Content formats: {{content_formats}}. Team owners: {{team_owners}}. Optional budget notes: {{budget_notes?}}.',
      tags: ['marketing', 'launch', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },
    {
      id: 'tplv-mkt-funnel-audit',
      title: 'Funnel Audit Prompt',
      text: 'Audit funnel {{funnel_name}} from {{entry_channel}} to {{conversion_event}}. Current metrics: {{current_metrics}}. Suspected leaks: {{suspected_leaks}}. Optional experiment ideas: {{experiment_ideas?}}.',
      tags: ['marketing', 'growth', 'variables'],
      category: 'Marketing & SEO',
      isTemplate: true
    },

    {
      id: 'tplv-daily-trip-plan',
      title: 'Trip Plan with Variables',
      text: 'Plan a {{trip_length}} trip to {{destination}} for {{traveler_type}}. Budget: {{budget}}. Must-do experiences: {{must_do}}. Pace: {{pace}}. Optional dietary notes: {{dietary_notes?}}.',
      tags: ['daily', 'travel', 'variables'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tplv-daily-week-menu',
      title: 'Weekly Menu Builder',
      text: 'Create a {{days_count}}-day menu for {{household_size}} people. Goal: {{goal}}. Dietary style: {{diet_style}}. Max prep time: {{prep_time}}. Optional excluded ingredients: {{excluded_ingredients?}}.',
      tags: ['daily', 'food', 'variables'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tplv-daily-budget-reset',
      title: 'Budget Reset Plan',
      text: 'Build a monthly budget reset for income {{monthly_income}} and fixed costs {{fixed_costs}}. Savings target: {{savings_target}}. Debt priority: {{debt_priority}}. Optional upcoming one-offs: {{one_offs?}}.',
      tags: ['daily', 'finance', 'variables'],
      category: 'Daily Life & General',
      isTemplate: true
    },
    {
      id: 'tplv-daily-difficult-message',
      title: 'Difficult Message Draft',
      text: 'Draft a {{tone}} message to {{recipient}} about {{situation}}. Desired outcome: {{desired_outcome}}. Boundaries to set: {{boundaries}}. Optional context to avoid: {{avoid_context?}}.',
      tags: ['daily', 'communication', 'variables'],
      category: 'Daily Life & General',
      isTemplate: true
    },

    {
      id: 'tplv-data-sql-analysis',
      title: 'SQL Analysis Prompt',
      text: 'Write SQL for question {{analysis_question}} using tables {{table_list}}. Required grain: {{grain}}. Time window: {{time_window}}. Output columns: {{output_columns}}. Optional engine: {{engine?}}.',
      tags: ['data', 'sql', 'variables'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tplv-data-dashboard-spec',
      title: 'Dashboard Spec Draft',
      text: 'Draft a dashboard spec for team {{team_name}} tracking {{business_goal}}. Core metrics: {{core_metrics}}. Filter dimensions: {{filter_dimensions}}. Refresh cadence: {{refresh_cadence}}. Optional alert thresholds: {{alert_thresholds?}}.',
      tags: ['data', 'analytics', 'variables'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tplv-data-cleaning-plan',
      title: 'Data Cleaning Plan',
      text: 'Create a cleaning plan for dataset {{dataset_name}}. Known issues: {{known_issues}}. Validation rules: {{validation_rules}}. Output schema: {{output_schema}}. Optional imputation policy: {{imputation_policy?}}.',
      tags: ['data', 'cleaning', 'variables'],
      category: 'Data & Analysis',
      isTemplate: true
    },
    {
      id: 'tplv-data-experiment-design',
      title: 'Experiment Design Template',
      text: 'Design an experiment for hypothesis {{hypothesis}}. Population: {{population}}. Primary metric: {{primary_metric}}. Minimum detectable effect: {{mde}}. Optional guardrail metrics: {{guardrails?}}.',
      tags: ['data', 'statistics', 'variables'],
      category: 'Data & Analysis',
      isTemplate: true
    },

    {
      id: 'tplv-prod-week-plan',
      title: 'Weekly Priority Planner',
      text: 'Create a weekly plan for role {{role}}. Top goals: {{top_goals}}. Hard deadlines: {{deadlines}}. Available focus hours: {{focus_hours}}. Optional meeting load: {{meeting_load?}}.',
      tags: ['productivity', 'planning', 'variables'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tplv-prod-meeting-notes',
      title: 'Meeting Notes Synthesizer',
      text: 'Convert notes from meeting {{meeting_name}} into decisions and action items. Raw notes: {{raw_notes}}. Owners: {{owners}}. Due date format: {{due_date_format}}. Optional follow-up cadence: {{followup_cadence?}}.',
      tags: ['productivity', 'meeting', 'variables'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tplv-prod-decision-log',
      title: 'Decision Log Entry',
      text: 'Write a decision log entry for decision {{decision_title}}. Context: {{context}}. Options considered: {{options_considered}}. Chosen option: {{chosen_option}}. Optional revisit trigger: {{revisit_trigger?}}.',
      tags: ['productivity', 'decision', 'variables'],
      category: 'Productivity',
      isTemplate: true
    },
    {
      id: 'tplv-prod-retro-template',
      title: 'Retro Template with Variables',
      text: 'Generate a retrospective template for sprint {{sprint_name}} with team {{team_name}}. Wins: {{wins}}. Pain points: {{pain_points}}. Improvement themes: {{improvement_themes}}. Optional facilitator notes: {{facilitator_notes?}}.',
      tags: ['productivity', 'agile', 'variables'],
      category: 'Productivity',
      isTemplate: true
    }
  ];

  /** Returns all templates, optionally filtered and ranked by a search term. */
  const getTemplates = (filter = '') => {
    if (!filter) return TEMPLATES;
    const q = filter.trim().toLowerCase();
    if (!q) return TEMPLATES;

    // Use the AI scoring engine if loaded, otherwise fall back to basic filter
    if (window.AI && typeof window.AI.semanticSearch === 'function') {
      // Score each template via the shared engine
      const scored = [];
      for (const tpl of TEMPLATES) {
        // Use scorePrompt directly if available (it's in global scope from ai.js)
        const score = typeof scorePrompt === 'function'
          ? scorePrompt(q, tpl)
          : 0;
        if (score > 0) {
          scored.push({ ...tpl, _semanticScore: score });
        }
      }
      if (scored.length) {
        scored.sort((a, b) => b._semanticScore - a._semanticScore);
        return scored;
      }
    }

    // Fallback: simple text matching
    return TEMPLATES.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.text.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  };

  /** Returns the list of unique template categories. */
  const getCategories = () => [...new Set(TEMPLATES.map(t => t.category))];

  // Expose the templates universally
  window.PromptTemplates = { TEMPLATES, getTemplates, getCategories };
})();
