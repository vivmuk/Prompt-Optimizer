/* ══════════════════════════════════════════════════════════════════════════
   model-guides.js — the provider prompting guides, distilled.

   Data only. Every provider and model here has published prompting guidance
   of its own; each claim below traces to one of the `sources` listed on the
   provider or the model. Providers without a first-party prompting guide for
   a current model are left out on purpose (see README › Model Tuner).

   Shape
     provider  { id, name, maker, mark, hue, blurb, chat, principles[], sources[], models[] }
     model     { id, name, apiId, tagline, bestFor[], specs[], pros[], cons[],
                 dos[], donts[], example, settings[], dialect, venice, sources[] }
     pros/cons/dos/donts are { t: the point, why: the reason it holds }.

   `venice` is a pattern matched against the live Venice catalogue so the
   tuned prompt can be test-run on the same model when Venice serves it.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const A = 'https://platform.claude.com/docs/en/';
  const SRC = {
    claudeBest:   { label: 'Anthropic · Prompting best practices', url: A + 'build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    claudeModels: { label: 'Anthropic · Models overview', url: A + 'models/overview' },
    fable51:      { label: 'Anthropic · Prompting Claude Fable 5.1', url: A + 'build-with-claude/prompt-engineering/prompting-claude-fable-5-1' },
    opus55:       { label: 'Anthropic · Prompting Claude Opus 5.5', url: A + 'build-with-claude/prompt-engineering/prompting-claude-opus-5-5' },
    sonnet55:     { label: 'Anthropic · Prompting Claude Sonnet 5.5', url: A + 'build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5' },

    oaiUsing6:    { label: 'OpenAI · Using GPT-6', url: 'https://developers.openai.com/api/docs/guides/latest-model' },
    oaiAstraBlog: { label: 'OpenAI · Rethinking skills and prompts for GPT-6 Astra', url: 'https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra' },
    oaiFamily:    { label: 'OpenAI · A model guide for the GPT-6 family', url: 'https://openai.com/index/practical-guide-building-gpt-6/' },
    oaiGuide55:   { label: 'OpenAI · Prompt guidance for GPT-5.5', url: 'https://developers.openai.com/api/docs/guides/prompt-guidance?model=gpt-5.5' },
    oai52:        { label: 'OpenAI Cookbook · GPT-5.2 prompting guide', url: 'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide' },
    oaiReasoning: { label: 'OpenAI · Reasoning models', url: 'https://developers.openai.com/api/docs/guides/reasoning' },
    oaiAstra:     { label: 'OpenAI · GPT-6 Astra model page', url: 'https://developers.openai.com/api/docs/models/gpt-6-astra' },
    oaiSol:       { label: 'OpenAI · Introducing GPT-6.1 Sol', url: 'https://openai.com/index/introducing-gpt-6-1-sol/' },
    oaiLuna:      { label: 'OpenAI · Introducing GPT-6 Sol and Luna', url: 'https://openai.com/index/introducing-gpt-6-sol-and-luna/' },
    oai55:        { label: 'OpenAI · GPT-5.5 model page', url: 'https://developers.openai.com/api/docs/models/gpt-5.5' },

    gStrategies:  { label: 'Google · Prompt design strategies', url: 'https://ai.google.dev/gemini-api/docs/prompting-strategies' },
    gGemini3:     { label: 'Google · Gemini 3 developer guide', url: 'https://ai.google.dev/gemini-api/docs/gemini-3' },
    gVertex3:     { label: 'Google Cloud · Gemini 3 prompting guide', url: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/gemini-3-prompting-guide' },
    g38:          { label: 'Google · What’s new in Gemini 3.8 Flash', url: 'https://ai.google.dev/gemini-api/docs/latest-model' },
    g35:          { label: 'Google · What’s new in Gemini 3.5 Flash', url: 'https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5' },
    gModels:      { label: 'Google · Gemini models', url: 'https://ai.google.dev/gemini-api/docs/models' },
    gPricing:     { label: 'Google · Gemini API pricing', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
    g31Card:      { label: 'Google DeepMind · Gemini 3.1 Pro model card', url: 'https://deepmind.google/models/model-cards/gemini-3-1-pro/' },

    dsParams:     { label: 'DeepSeek · The temperature parameter', url: 'https://api-docs.deepseek.com/quick_start/parameter_settings/' },
    dsPricing:    { label: 'DeepSeek · Models & pricing', url: 'https://api-docs.deepseek.com/quick_start/pricing/' },
    ds41:         { label: 'DeepSeek · DeepSeek-V4.1-Flash release', url: 'https://api-docs.deepseek.com/news/news260910/' },
    dsV4Card:     { label: 'DeepSeek · DeepSeek-V4-Pro model card', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro' },
    dsR1Card:     { label: 'DeepSeek · R1 usage recommendations', url: 'https://huggingface.co/deepseek-ai/DeepSeek-R1#usage-recommendations' },

    qwBlog:       { label: 'Qwen · Qwen3.8-Max announcement', url: 'https://qwen.ai/blog?id=qwen3.8' },
    qw27:         { label: 'Qwen · Qwen3.8-27B model card (Best practices)', url: 'https://huggingface.co/Qwen/Qwen3.8-27B' },
    qwAli:        { label: 'Alibaba Cloud · Qwen3.8-Max launch', url: 'https://www.alibabacloud.com/blog/alibaba-unveils-qwen3-8-max-its-largest-and-most-capable-flagship-model-to-date_603420' },

    miPrompt:     { label: 'Mistral · Prompting guide', url: 'https://docs.mistral.ai/models/best-practices/prompt-engineering' },
    miMedium:     { label: 'Mistral · Mistral Medium 3.5 model card', url: 'https://docs.mistral.ai/models/model-cards/mistral-medium-3-5-26-04' },
    miSmall4:     { label: 'Mistral · Introducing Mistral Small 4', url: 'https://mistral.ai/news/mistral-small-4/' },

    llPrompt:     { label: 'Meta · Llama prompting how-to guide', url: 'https://www.llama.com/docs/how-to-guides/prompting/' },
    llCard:       { label: 'Meta · Llama 4 model card & prompt format', url: 'https://www.llama.com/docs/model-cards-and-prompt-formats/llama4/' },
    llBlog:       { label: 'Meta · The Llama 4 herd', url: 'https://ai.meta.com/blog/llama-4-multimodal-intelligence/' }
  };

  /* ══ ANTHROPIC ══════════════════════════════════════════════════════════ */

  const anthropic = {
    id: 'anthropic',
    name: 'Anthropic',
    maker: 'Claude',
    mark: 'A',
    hue: '#E4622B',
    blurb: 'Claude follows instructions precisely and literally. It does its best work when you explain why, separate the parts of a prompt with XML tags, and use the effort setting, not prompt text, to control how much it thinks.',
    chat: { label: 'Claude', url: 'https://claude.ai' },
    principles: [
      { t: 'Be clear, direct and specific', why: 'Treat Claude like a brilliant new employee who lacks your context. If a colleague with no background would be confused by the prompt, so will Claude.' },
      { t: 'Explain the reason behind a rule', why: '"The reply is read by a text-to-speech engine, so never use ellipses" beats "NEVER use ellipses". Claude generalises from the reason.' },
      { t: 'Give 3–5 examples in <example> tags', why: 'Examples are the most reliable way to steer format and tone. Make them relevant and diverse so Claude does not copy a pattern you never intended.' },
      { t: 'Separate the parts with XML tags', why: '<instructions>, <context> and <input> remove ambiguity when a prompt mixes instructions, data and examples.' },
      { t: 'Put long documents first and the question last', why: 'Placing the question at the end improved response quality by up to 30% in Anthropic’s tests on multi-document inputs.' },
      { t: 'Say what to do, not what to avoid', why: '"Write in flowing prose paragraphs" steers formatting better than "Do not use markdown".' },
      { t: 'Ask for action when you want action', why: '"Can you suggest changes?" gets suggestions. "Change this function to…" gets the change.' },
      { t: 'Drop the shouting', why: 'Current models are more responsive to the system prompt. "CRITICAL: you MUST use this tool" now causes overtriggering, so write "Use this tool when…".' },
      { t: 'Use effort, not prompt text, to control thinking', why: 'Adaptive thinking is steered by the effort parameter. General guidance like "think thoroughly" often beats a hand-written step-by-step plan.' }
    ],
    sources: [SRC.claudeBest, SRC.claudeModels],
    models: [
      {
        id: 'claude-fable-5-1',
        name: 'Claude Fable 5.1',
        apiId: 'claude-fable-5-1',
        tagline: 'For demanding reasoning and long-horizon agentic work',
        bestFor: ['Hardest reasoning problems', 'Long autonomous agent runs', 'Work where Opus at high effort still falls short'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$10 / $50 per MTok' },
          { k: 'Latency', v: 'Slower' },
          { k: 'Thinking', v: 'Adaptive, always on' },
          { k: 'Default effort', v: 'high' }
        ],
        pros: [
          { t: 'Top of the lineup on reasoning and long-horizon work', why: 'Its gains over Fable 5 show at every effort level and are largest at the higher ones.' },
          { t: 'Strong value at low effort', why: 'At low effort it often costs about as much per task as Opus and Sonnet while scoring higher.' },
          { t: 'Clean writing', why: 'Few stock phrases, little unexplained jargon, and less bold and bullet clutter than earlier models.' }
        ],
        cons: [
          { t: 'Most expensive and slowest', why: 'Anthropic recommends starting most workloads on Opus 5.5 and moving to Fable 5.1 only when evals call for it.' },
          { t: 'Can stop before the job is done', why: 'On long async tasks it sometimes writes "Next, I’ll…" or asks "Shall I apply this?" instead of continuing.' },
          { t: 'Prose can run dense', why: 'Sentences run longer, with fewer paragraph breaks, than Fable 5’s.' },
          { t: 'Searches less at low effort', why: 'At low effort it calls search and retrieval tools less often, so it answers from memory more.' }
        ],
        dos: [
          { t: 'Run an effort sweep starting at high', why: 'Effort names do not mean the same amount of thinking across models. Step down to medium or low where your evals hold.' },
          { t: 'For unattended runs, say the user is not watching', why: '"You are operating autonomously… proceed without asking on reversible actions" stops it pausing for permission it already has.' },
          { t: 'Name mannered prose as the thing to avoid', why: 'Even "Please remove all mannered prose." makes the writing noticeably plainer.' },
          { t: 'Say what to leave out of scope', why: 'Asking it to report pre-existing bugs as follow-ups, rather than fixing them, sharply reduces unrequested changes.' }
        ],
        donts: [
          { t: 'Don’t carry over anti-markdown blocks from older prompts', why: 'It already formats less, so those blocks can strip out structure the content needs.' },
          { t: 'Don’t edit earlier turns between requests', why: 'Keep the conversation history append-only. Edited history can fail with "bound to a different conversation".' },
          { t: 'Don’t phrase code review as "does this compile?"', why: '"Are there any bugs in this program?" avoids safeguard false positives on benign coding requests.' }
        ],
        example: {
          label: 'Autonomous task',
          before: 'Can you look into the flaky checkout test?',
          after: 'You are operating autonomously. The user is not watching in real time, so for reversible actions that follow from this request, proceed without asking.\n\nFix the flaky checkout test so it passes reliably. If you find pre-existing bugs the task does not need, report them as follow-ups in your summary instead of fixing them.',
          why: 'It states that nobody is watching, gives a goal it can finish, and sets the scope, which together cover the three failure modes the guide lists.'
        },
        settings: [
          { k: 'effort', v: 'high (default)', why: 'Sweep low → max against your evals.' },
          { k: 'thinking', v: 'adaptive (only mode)', why: 'Always on. Steer it with effort.' },
          { k: 'max_tokens', v: 'generous', why: 'At xhigh/max, thinking counts toward the limit.' }
        ],
        dialect: 'xml',
        venice: 'claude.*fable',
        sources: [SRC.fable51, SRC.claudeModels]
      },
      {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        apiId: 'claude-opus-5-5',
        tagline: 'For long-running agentic coding and knowledge work · the recommended starting point',
        bestFor: ['Agentic coding in real repositories', 'Financial models, documents and slides', 'Reading charts, diagrams and screenshots'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$4 / $20 per MTok' },
          { k: 'Latency', v: 'Moderate' },
          { k: 'Thinking', v: 'Adaptive, always on' },
          { k: 'Default effort', v: 'medium' }
        ],
        pros: [
          { t: 'More done per token', why: 'At medium effort it matched or beat Opus 5 at high on coding, in fewer steps and tokens, and it generates output over 30% faster.' },
          { t: 'Rarely gets figures or citations wrong', why: 'It is much less likely to state an incorrect figure or cite the wrong source.' },
          { t: 'Accurate on visual material', why: 'Even at its lowest effort it read dense charts more accurately than Opus 5 at its highest.' },
          { t: 'Resists injected instructions', why: 'It resists prompt injection from tool results and web pages better than any earlier Opus model.' }
        ],
        cons: [
          { t: 'Starts work quickly', why: 'In multi-app workflows it can miss context the task did not point to unless told to look around first.' },
          { t: 'Thinks more per level than Opus 5', why: 'Carrying over your Opus 5 effort setting means longer turns and more output tokens.' },
          { t: 'Frontend defaults to house styles', why: 'Without design direction it falls back on a few default looks.' },
          { t: 'Won’t write its reasoning into the reply', why: 'Prompts that push it to reproduce internal reasoning may be declined as reasoning_extraction.' }
        ],
        dos: [
          { t: 'Set effort explicitly, starting at medium', why: 'Lowering effort cuts thinking, cost and latency more reliably than prompt instructions do.' },
          { t: 'Tell multi-app agents to explore first', why: '"Before taking any action, explore broadly…" measurably raised task completion in Anthropic’s testing.' },
          { t: 'Mark pasted text with <pasted_content id> tags', why: 'With a matching system note, it ignores instructions hidden in content the user pasted in.' },
          { t: 'Name the exact design patterns to avoid', why: 'A specific list beats a vague "avoid a generic AI look", which only swaps one default for another.' }
        ],
        donts: [
          { t: 'Don’t keep "think carefully before answering" in chat prompts', why: 'Removing it made replies start sooner with no clear drop in quality.' },
          { t: 'Don’t ask for its reasoning in the response text', why: 'Read summarized thinking blocks instead. A short explanation of the answer is still fine.' },
          { t: 'Don’t treat a text-only end of turn as "done"', why: 'In unattended loops, some progress reports end the turn. Keep a checklist and nudge it on when items are still open.' }
        ],
        example: {
          label: 'Frontend direction',
          before: 'Build me a personal website. Avoid a generic AI look.',
          after: 'Output a vanilla HTML/CSS personal website with placeholder data. Do not use a cream or off-white background, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, or pill-shaped buttons.',
          why: 'Naming concrete patterns gives it something it can check, where "generic" gives it nothing.'
        },
        settings: [
          { k: 'effort', v: 'medium (default)', why: 'Reserve xhigh/max for measured gains.' },
          { k: 'thinking', v: 'adaptive (cannot disable)', why: 'Start at low effort if you ran Opus 5 with thinking off.' },
          { k: 'max_tokens', v: 'up to 128,000', why: 'Thinking counts toward it on long agentic turns.' }
        ],
        dialect: 'xml',
        venice: 'claude.*opus',
        sources: [SRC.opus55, SRC.claudeModels, SRC.claudeBest]
      },
      {
        id: 'claude-sonnet-5-5',
        name: 'Claude Sonnet 5.5',
        apiId: 'claude-sonnet-5-5',
        tagline: 'The best combination of speed and intelligence',
        bestFor: ['Interactive chat and support', 'Well-specified agentic coding', 'High-throughput production workloads'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$2 / $10 per MTok' },
          { k: 'Latency', v: 'Fast' },
          { k: 'Thinking', v: 'Adaptive · or between_tools' },
          { k: 'Default effort', v: 'high' }
        ],
        pros: [
          { t: 'Fast and capable', why: 'Anthropic positions it as the best balance of speed and intelligence in the lineup.' },
          { t: 'Checks its own work', why: 'On agentic coding it generally runs a check before reporting a change as done (at medium effort and above).' },
          { t: 'Follows the house style', why: 'It adds tests and docs that match your repository’s conventions, which most teams welcome.' }
        ],
        cons: [
          { t: 'Checks in early at low/medium effort', why: 'On long tasks it may pause to confirm a plan or ask whether to continue.' },
          { t: 'Over-delivers at xhigh/max', why: 'It can start its own review rounds and launch reviewer subagents, which costs time and tokens.' },
          { t: 'Treats open-ended asks as build orders', why: '"Show me what you can do" can start a whole presentation when you only wanted ideas.' },
          { t: 'Answers from memory when it should search', why: 'For facts that change (what is allowed, required or charged) it may skip the search tool.' }
        ],
        dos: [
          { t: 'Pick effort by workload', why: 'high for general use, medium for agentic or latency-sensitive work, low for snappy chat.' },
          { t: 'Spell out "keep working until done, don’t add extras"', why: 'This one paragraph carries work through at lower effort and limits unrequested additions.' },
          { t: 'For JSON on reasoning tasks, add "Think the problem through before you answer."', why: 'At high effort this brings accuracy close to xhigh for a modest token cost.' },
          { t: 'Require a real check before "done"', why: 'Tests, a type-check or a build. A syntax-only check does not count.' }
        ],
        donts: [
          { t: 'Don’t write "minimize tool calls"', why: 'That language discourages the searches that catch details which have changed.' },
          { t: 'Don’t ask it to "think less" in the prompt', why: 'That doesn’t reliably work. Lower the effort level instead.' },
          { t: 'Don’t leave idea requests open-ended', why: 'Say "give options and stop until I say go", or it may start building.' }
        ],
        example: {
          label: 'Ideas, not a build',
          before: 'Show me what you can do with this dataset.',
          after: 'Give me five analyses worth running on this dataset. For each, name the question it answers and the columns it needs. Give ideas only, then stop. Don’t start building anything until I say to go ahead.',
          why: 'It sets how many ideas, what each must contain, and where to stop.'
        },
        settings: [
          { k: 'effort', v: 'high (default) · medium for agents', why: 'Sweep fresh. Levels were recalibrated.' },
          { k: 'thinking', v: 'adaptive · between_tools to skip upfront', why: 'Use adaptive for reasoning tasks without tools.' },
          { k: 'max_tokens', v: '128,000 for agentic coding', why: 'Stream long responses.' }
        ],
        dialect: 'xml',
        venice: 'claude.*sonnet',
        sources: [SRC.sonnet55, SRC.claudeModels, SRC.claudeBest]
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        apiId: 'claude-haiku-4-5-20251001',
        tagline: 'The fastest model with near-frontier intelligence',
        bestFor: ['Real-time, high-volume tasks', 'Sub-agents in a larger system', 'Classification and extraction at low cost'],
        specs: [
          { k: 'Context', v: '200K tokens' },
          { k: 'Max output', v: '64K' },
          { k: 'Price in / out', v: '$1 / $5 per MTok' },
          { k: 'Latency', v: 'Fastest' },
          { k: 'Thinking', v: 'Extended (budget_tokens)' },
          { k: 'Knowledge', v: 'Reliable to Feb 2025' }
        ],
        pros: [
          { t: 'Fastest and cheapest Claude', why: 'A quarter of Opus 5.5’s price, with the lowest latency in the lineup.' },
          { t: 'Still accepts prefill', why: 'Models before the 4.6 generation still let you start the assistant turn to force a format.' }
        ],
        cons: [
          { t: 'Older knowledge and a smaller context window', why: 'Reliable knowledge runs to Feb 2025, and the context window is 200K, not 1M.' },
          { t: 'No effort parameter', why: 'Thinking is the manual extended-thinking mode with a token budget.' },
          { t: 'Retirement window is close', why: 'Anthropic\u2019s commitment runs to "not sooner than October 15, 2026". Plan a migration path.' }
        ],
        dos: [
          { t: 'Lean on the fundamentals', why: 'XML tags, 3–5 examples and explicit output specs matter most on smaller models.' },
          { t: 'Use manual chain-of-thought when thinking is off', why: 'Ask it to think before answering and put the final answer in <answer> tags so you can extract it.' },
          { t: 'Add a self-check line', why: '"Before you finish, verify your answer against [criteria]" catches errors, especially in code and math.' }
        ],
        donts: [
          { t: 'Don’t send it the hardest long-horizon work', why: 'That is what Opus 5.5 and Fable 5.1 are for.' },
          { t: 'Don’t rely on it for recent facts', why: 'Supply anything after early 2025 in the prompt.' }
        ],
        example: {
          label: 'Fast classifier',
          before: 'What category is this ticket?',
          after: 'Classify the support ticket into exactly one category: billing, bug, how-to, or account.\n\n<examples>\n<example><ticket>I was charged twice this month</ticket><answer>billing</answer></example>\n<example><ticket>The export button does nothing</ticket><answer>bug</answer></example>\n<example><ticket>How do I add a teammate?</ticket><answer>how-to</answer></example>\n</examples>\n\n<ticket>{{TICKET}}</ticket>\n\nReply with the category inside <answer> tags.',
          why: 'It gives a closed label set, varied examples in tags, and an output you can extract by parsing the tags.'
        },
        settings: [
          { k: 'thinking', v: 'enabled + budget_tokens when needed', why: 'Manual mode on this generation.' },
          { k: 'effort', v: 'not supported', why: 'Use the thinking budget instead.' }
        ],
        dialect: 'xml',
        venice: 'claude.*haiku',
        sources: [SRC.claudeBest, SRC.claudeModels]
      }
    ]
  };

  /* ══ OPENAI ═════════════════════════════════════════════════════════════ */

  const openai = {
    id: 'openai',
    name: 'OpenAI',
    maker: 'GPT',
    mark: 'O',
    hue: '#35B98C',
    blurb: 'Current GPT models reason internally, and OpenAI’s guidance has moved to outcome-first prompts: state the result, who it is for, the constraints and what counts as done, then let the model choose the path.',
    chat: { label: 'ChatGPT', url: 'https://chatgpt.com' },
    principles: [
      { t: 'Describe the outcome, not the procedure', why: 'State what good looks like, the constraints, the evidence available and the final answer’s shape, then let the model choose an efficient path.' },
      { t: 'Start from the smallest prompt that works', why: 'Begin from a fresh baseline rather than porting an old prompt stack, then tune effort, verbosity, tools and format against real examples.' },
      { t: 'Skip "think step by step"', why: 'Reasoning models already reason internally, so asking them to explain or step through their reasoning adds nothing.' },
      { t: 'Define what "done" means', why: 'For agentic and research work, say what counts as done and how the model should verify it.' },
      { t: 'Set length with text.verbosity', why: 'Set the default level of detail with the parameter, and use the prompt for task-specific length.' },
      { t: 'Keep each section short', why: 'Suggested shape: Role · Personality · Goal · Success criteria · Constraints · Output · Stop rules. Add detail only where it changes behavior.' }
    ],
    sources: [SRC.oaiUsing6, SRC.oaiGuide55, SRC.oaiReasoning],
    models: [
      {
        id: 'gpt-6-astra',
        name: 'GPT-6 Astra',
        apiId: 'gpt-6-astra',
        tagline: 'The most capable model, for the hardest end-to-end work',
        bestFor: ['Complex coding and research', 'Hard analysis and problem-solving', 'Long agentic work with clear goals'],
        specs: [
          { k: 'Context', v: '1.05M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$10 / $50 per MTok' },
          { k: 'Cached input', v: '$1 per MTok' },
          { k: 'Reasoning', v: 'low → max (no none)' },
          { k: 'Tools', v: 'Responses API' }
        ],
        pros: [
          { t: 'The ceiling of the GPT-6 family', why: 'Astra at low effort can outperform Sol at high. OpenAI suggests trying it at low or medium where you used Sol at high.' },
          { t: 'Handles long instructions well', why: 'It follows instructions better than earlier models and copes with longer ones.' },
          { t: 'Needs less hand-holding', why: 'It works out what to read without being told to review the whole project, and runs tests on its own.' }
        ],
        cons: [
          { t: 'Sensitive to conflicting guidance', why: 'Unclear or contradictory text in skills or AGENTS.md can make it pause and block early.' },
          { t: 'Asks more questions', why: 'It is more likely to stop and ask when input could materially change the result, even where you expected it to assume and carry on.' },
          { t: 'Leans toward long, formatted replies', why: 'It tends toward detailed, structured answers with recurring phrases unless you set the style.' },
          { t: 'Premium price', why: 'Five times Sol’s per-token rate.' }
        ],
        dos: [
          { t: 'Give a clear assignment', why: 'State the result, who it is for, the context and constraints, and what counts as done.' },
          { t: 'Keep skill descriptions to when they apply', why: 'Make the root document a minimal router to supporting docs, so the model loads guidance only when it is relevant.' },
          { t: 'Specify writing style and structure', why: 'Otherwise it defaults to long, formatted responses.' },
          { t: 'Pre-authorise known-safe workflows', why: 'Granting permission in AGENTS.md (for example "run the local test suite") keeps it from stopping to ask.' }
        ],
        donts: [
          { t: 'Don’t keep scaffolding that once helped', why: 'Overly specific guidance can now hurt results. "Make sure to run the tests" has become noise.' },
          { t: 'Don’t leave contradictions in rule files', why: 'It is more sensitive to them than earlier models and may block on them.' },
          { t: 'Don’t request reasoning effort "none"', why: 'Astra supports low, medium, high, xhigh and max only.' }
        ],
        example: {
          label: 'Outcome over procedure',
          before: 'Read every file in the repo first, then make sure to run the tests, then fix the login bug step by step.',
          after: 'Fix the bug where users with uppercase letters in their email can’t log in.\n\nDone means: login is case-insensitive, existing sessions keep working, and the auth test suite passes. Keep changes inside auth/. Ask only if the fix would need a database migration.',
          why: 'It replaces the procedure with an outcome, a definition of done, a scope limit and one explicit stop rule.'
        },
        settings: [
          { k: 'reasoning.effort', v: 'start low / medium', why: 'Raise only on measured gains.' },
          { k: 'text.verbosity', v: 'set explicitly', why: 'Tames its long-form default.' },
          { k: 'API', v: 'Responses (for tools)', why: 'Chat Completions has no tool calling here.' }
        ],
        dialect: 'markdown',
        venice: 'gpt-?6.*astra',
        sources: [SRC.oaiAstraBlog, SRC.oaiFamily, SRC.oaiUsing6, SRC.oaiAstra]
      },
      {
        id: 'gpt-6-1-sol',
        name: 'GPT-6.1 Sol',
        apiId: 'gpt-6.1-sol',
        tagline: 'Near-Astra performance at lower cost',
        bestFor: ['Complex coding', 'Computer use', 'Research and professional work'],
        specs: [
          { k: 'Context', v: '1.05M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$2 / $10 per MTok' },
          { k: 'Cached input', v: '$0.10 per MTok' },
          { k: 'Reasoning', v: 'no none level' },
          { k: 'Tools', v: 'Responses API' }
        ],
        pros: [
          { t: 'Most of Astra’s ability for a fifth of the price', why: 'OpenAI positions it as near-Astra performance for complex coding, computer use and professional work.' },
          { t: 'Cheap cache reads', why: 'Cached input costs a twentieth of fresh input, so a stable prompt prefix pays off.' }
        ],
        cons: [
          { t: 'Not the ceiling', why: 'For the hardest reasoning, OpenAI points to Astra.' },
          { t: 'Needs more explicit guidance than Astra', why: 'OpenAI notes guidance that helps Sol or Luna may overconstrain Astra, which makes Sol the model that benefits from fuller guidance.' }
        ],
        dos: [
          { t: 'Write the outcome, the constraints and "done"', why: 'This is the same outcome-first shape as for the rest of the family.' },
          { t: 'Spell out the logic and data the task needs', why: 'It is a step below Astra, so missing context costs more.' },
          { t: 'Keep a stable prefix', why: 'Put fixed instructions first to hit the $0.10 cached rate.' }
        ],
        donts: [
          { t: 'Don’t request reasoning effort "none"', why: 'GPT-6.1 Sol does not support it. GPT-6 Sol does.' },
          { t: 'Don’t call tools through Chat Completions', why: 'Tool calling requires the Responses API.' }
        ],
        example: {
          label: 'Professional task',
          before: 'Make a summary of these contracts.',
          after: 'Goal: a one-page risk summary of the three attached vendor contracts for our CFO.\n\nSuccess criteria:\n- Flags auto-renewal, liability caps and termination notice periods, with the clause number for each.\n- Marks anything missing as "not found". No guessing.\n\nOutput: a table (contract × risk), then three sentences on which contract needs attention first.',
          why: 'It names the reader, makes the criteria checkable and fixes the output shape. Sol does better with the logic made explicit.'
        },
        settings: [
          { k: 'reasoning.effort', v: 'medium to start', why: 'Raise for hard multi-step work.' },
          { k: 'API', v: 'Responses (for tools)', why: 'Required for tool calling.' }
        ],
        dialect: 'markdown',
        venice: 'gpt-?6.*sol',
        sources: [SRC.oaiSol, SRC.oaiUsing6, SRC.oaiAstraBlog]
      },
      {
        id: 'gpt-6-luna',
        name: 'GPT-6 Luna',
        apiId: 'gpt-6-luna',
        tagline: 'The most efficient model, for focused work at scale',
        bestFor: ['Extracting fields from documents', 'Classifying requests', 'Structured summaries at volume'],
        specs: [
          { k: 'Context', v: '1.05M tokens' },
          { k: 'Max output', v: '128K' },
          { k: 'Price in / out', v: '$0.10 / $0.50 per MTok' },
          { k: 'Cached input', v: '$0.01 per MTok' },
          { k: 'Reasoning', v: 'supports none' },
          { k: 'Function calling', v: 'Chat Completions at none' }
        ],
        pros: [
          { t: 'A hundredth of Astra’s price', why: 'Built for repeated, everyday work with a clear goal.' },
          { t: 'Supports reasoning effort "none"', why: 'Gives the lowest latency for simple, high-volume calls.' }
        ],
        cons: [
          { t: 'Not for open-ended hard problems', why: 'OpenAI frames it for focused tasks with a clear goal.' },
          { t: 'Needs complete instructions', why: 'Smaller models benefit from the explicit guidance that would overconstrain Astra.' }
        ],
        dos: [
          { t: 'Give one clear goal and an exact schema', why: 'Field names, types and whether each field is required.' },
          { t: 'Set missing fields to null', why: 'OpenAI’s extraction guidance: return null instead of guessing, and re-scan the source before answering.' },
          { t: 'Show one or two examples of the format', why: 'Examples pin down format and edge cases cheaply.' }
        ],
        donts: [
          { t: 'Don’t bundle several goals into one call', why: 'Split the work, or route the hard part to Sol.' },
          { t: 'Don’t let it invent values', why: 'Ask for null when a value is absent.' }
        ],
        example: {
          label: 'Extraction',
          before: 'Get the invoice details out of this.',
          after: 'Extract these fields from the invoice text and return JSON only:\n{"invoice_number": string, "issue_date": "YYYY-MM-DD", "vendor": string, "total": number, "currency": "ISO 4217 code"}\n\nIf a field is not present, set it to null. Do not infer values. Re-read the invoice before answering to check for missed fields.',
          why: 'An exact schema, null for anything missing and a re-scan step are OpenAI’s extraction pattern.'
        },
        settings: [
          { k: 'reasoning.effort', v: 'none or low', why: 'Raise only if accuracy needs it.' },
          { k: 'output', v: 'structured outputs / JSON schema', why: 'Removes the need to parse free text.' }
        ],
        dialect: 'markdown',
        venice: 'gpt-?6.*luna',
        sources: [SRC.oaiLuna, SRC.oaiFamily, SRC.oai52]
      },
      {
        id: 'gpt-5-5',
        name: 'GPT-5.5',
        apiId: 'gpt-5.5',
        tagline: 'Previous-generation flagship, with its own prompt guidance',
        bestFor: ['Existing GPT-5.x integrations', 'Highly format-steerable output', 'Agentic tool use'],
        specs: [
          { k: 'Context', v: '1.05M tokens' },
          { k: 'Price in / out', v: '$5 / $30 per MTok' },
          { k: 'Long prompts', v: '>272K: 2× in, 1.5× out' },
          { k: 'Reasoning', v: 'none → xhigh · default medium' },
          { k: 'Verbosity', v: 'text.verbosity' }
        ],
        pros: [
          { t: 'Works from goals', why: 'It is better at working from a clear goal, keeping constraints, and turning intent into next steps.' },
          { t: 'Very steerable on format', why: 'Output shape and structure follow instructions closely.' },
          { t: 'Shorter prompts are enough', why: 'Outcome-oriented prompts often beat long procedural ones.' }
        ],
        cons: [
          { t: 'Not a drop-in for 5.2/5.4 prompts', why: 'OpenAI says to treat it as a new model family to tune for.' },
          { t: 'Long-context premium', why: 'Prompts over 272K input tokens are billed at 2× input and 1.5× output for the session.' }
        ],
        dos: [
          { t: 'Use Role → Personality → Goal → Success criteria → Constraints → Output → Stop rules', why: 'That is OpenAI’s suggested starting structure. Keep each section short.' },
          { t: 'Ask for a short preamble on tool-heavy tasks', why: 'A brief first update makes streamed responses feel faster without changing the work.' },
          { t: 'Confirm medium before reaching for high/xhigh', why: 'Medium is the default and is often enough.' }
        ],
        donts: [
          { t: 'Don’t port the old prompt stack wholesale', why: 'Start from a fresh baseline.' },
          { t: 'Don’t prescribe step-by-step unless the path matters', why: 'Let it choose the path.' },
          { t: 'Don’t add heavy structure by default', why: 'Use it only where it helps comprehension or your UI needs a stable artifact.' }
        ],
        example: {
          label: 'Outcome-first structure',
          before: 'You are a helpful assistant. First, read the ticket. Second, think step by step. Third, write a reply.',
          after: 'Role: support specialist for a B2B invoicing product.\nPersonality: steady, direct, assumes the customer is competent.\nGoal: resolve the customer’s ticket in one reply.\nSuccess criteria: answers the actual question, and links the one relevant help article if one exists.\nConstraints: never promise refunds. Escalate billing disputes.\nOutput: under 120 words, plain text.\nStop rules: if account access is required, ask for it and stop.',
          why: 'Every line of the procedure became a constraint or a success criterion.'
        },
        settings: [
          { k: 'reasoning.effort', v: 'medium (default)', why: 'low for speed, xhigh for the hardest async work.' },
          { k: 'text.verbosity', v: 'low for concise', why: 'Proportionally more concise than on 5.4.' }
        ],
        dialect: 'markdown',
        venice: 'gpt-5\\.5|gpt-55',
        sources: [SRC.oaiGuide55, SRC.oai55]
      }
    ]
  };

  /* ══ GOOGLE ═════════════════════════════════════════════════════════════ */

  const google = {
    id: 'google',
    name: 'Google',
    maker: 'Gemini',
    mark: 'G',
    hue: '#F0A93C',
    blurb: 'Gemini 3.x prefers direct, concise prompts and short answers. Prompt-engineering tricks written for older models can make it over-analyse, and Google recommends leaving temperature at its default.',
    chat: { label: 'Gemini', url: 'https://gemini.google.com' },
    principles: [
      { t: 'Be precise and direct', why: 'State the goal plainly. Verbose or persuasive prompt engineering written for older models can make Gemini 3.x over-analyse.' },
      { t: 'Pick one structure and keep it', why: 'Use XML-style tags or Markdown headings, consistently within a prompt.' },
      { t: 'Put role, rules and format in the system instruction', why: 'Essential constraints, persona and output requirements belong there or at the very top.' },
      { t: 'With big context: data first, question last', why: 'Supply all the context first and anchor the question with "Based on the preceding information…".' },
      { t: 'Ask for detail when you want it', why: 'Gemini 3.x is less verbose by default. Request a conversational or detailed style explicitly.' },
      { t: 'Leave temperature at 1.0', why: 'Lowering it can cause looping or degraded reasoning. Google recommends removing temperature, top_p and top_k from your config.' },
      { t: 'Control thinking with thinking_level', why: 'The numeric thinking_budget is no longer recommended on Gemini 3.x.' },
      { t: 'Use examples and define ambiguous terms', why: 'Few-shot examples regulate format and scope. Chain prompts for multi-step work.' }
    ],
    sources: [SRC.gStrategies, SRC.gGemini3, SRC.gVertex3],
    models: [
      {
        id: 'gemini-3-8-flash',
        name: 'Gemini 3.8 Flash',
        apiId: 'gemini-3.8-flash',
        tagline: 'The most intelligent Flash model, for long-horizon engineering and agents',
        bestFor: ['Multi-file refactors', 'Multi-step tool orchestration', 'Enterprise data pipelines'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '64K' },
          { k: 'Price in / out', v: '$0.75 / $3.75 intro' },
          { k: 'From Jan 1 2027', v: '$1.50 / $7.50' },
          { k: 'Thinking', v: 'low · medium (default) · high' }
        ],
        pros: [
          { t: 'Strong on long-horizon coding', why: 'Google built it for complex multi-file refactoring and deterministic tool execution.' },
          { t: 'Plans and checks its work', why: 'It takes smaller reasoning steps, calls tools iteratively and verifies along the way.' },
          { t: 'Recommended for new projects', why: 'Google recommends 3.8 Flash or 3.5 Flash-Lite for new work.' }
        ],
        cons: [
          { t: 'Spends more tokens on hard tasks', why: 'It uses more tokens on long, complex tasks by design. Lower the thinking level for everyday work.' },
          { t: 'No MINIMAL thinking level', why: 'Setting thinking_level=MINIMAL returns a validation error.' },
          { t: 'Price doubles in 2027', why: 'The introductory rate runs to December 31, 2026.' }
        ],
        dos: [
          { t: 'Write concise, direct instructions', why: 'Over-built prompts invite over-analysis.' },
          { t: 'For agents, include planning and persistence guidance', why: 'Google’s agentic template asks it to plan before acting and retry transient errors.' },
          { t: 'Re-test after the medium default', why: 'The default dropped from high to medium, so re-check quality, speed and cost.' }
        ],
        donts: [
          { t: 'Don’t lower temperature for "precision"', why: 'Below 1.0 risks looping and worse reasoning.' },
          { t: 'Don’t use thinking_budget', why: 'Use the thinking_level enum.' }
        ],
        example: {
          label: 'Large context, question last',
          before: 'Summarize the key risks. [then 200 pages of filings]',
          after: '<filings>\n{{FILINGS}}\n</filings>\n\nBased on the preceding filings, list the five most material risks to next year’s revenue. For each, cite the filing and section, and rate likelihood as high, medium or low.',
          why: 'The data goes first, the instruction last, and the phrase "Based on the preceding" anchors the answer to the documents.'
        },
        settings: [
          { k: 'thinking_level', v: 'medium (default)', why: 'low for simple steps, high for hard ones.' },
          { k: 'temperature', v: 'leave at 1.0', why: 'Or remove it from the config.' }
        ],
        dialect: 'markdown',
        venice: 'gemini-3[.-]8|gemini-3.*flash',
        sources: [SRC.g38, SRC.gGemini3, SRC.gVertex3, SRC.gModels]
      },
      {
        id: 'gemini-3-1-pro',
        name: 'Gemini 3.1 Pro',
        apiId: null,
        tagline: 'Google’s strongest model for multimodal understanding',
        bestFor: ['Images, video and audio together', 'Deep reasoning over mixed media', 'Long multimodal documents'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '64K' },
          { k: 'Price in / out', v: '$2 / $12 (≤200K)' },
          { k: 'Above 200K', v: '$4 / $18' }
        ],
        pros: [
          { t: 'Best multimodal understanding', why: 'Google describes it as its most intelligent model and the best in the world for multimodal understanding.' },
          { t: 'Large context window', why: 'Up to 1M input tokens.' }
        ],
        cons: [
          { t: 'More expensive than Flash', why: 'Prompts over 200K tokens cost more again.' },
          { t: 'Not the default for new builds', why: 'Google points new projects to 3.8 Flash or 3.5 Flash-Lite first.' }
        ],
        dos: [
          { t: 'Name what to look at in each input', why: 'Point it at the frame, region or page that matters. Define any ambiguous terms.' },
          { t: 'Keep instructions short and direct', why: 'Gemini 3.x guidance applies here too.' }
        ],
        donts: [
          { t: 'Don’t tune temperature down', why: 'Gemini 3 reasoning is optimised for 1.0.' },
          { t: 'Don’t bury the question above the media', why: 'Put the question after the data.' }
        ],
        example: {
          label: 'Multimodal',
          before: 'What’s in these?',
          after: 'The three images are photos of the same warehouse shelf on Monday, Wednesday and Friday. Based on the images, list each product whose stock visibly dropped, the day it dropped, and roughly how many units are left. Say "unclear" if a label is unreadable.',
          why: 'It explains what the images are, asks a precise question after them, and says what to do when it can’t tell.'
        },
        settings: [
          { k: 'thinking_level', v: 'per task', why: 'Use the enum, not a budget.' },
          { k: 'temperature', v: '1.0', why: 'Google’s recommendation for Gemini 3.' }
        ],
        dialect: 'markdown',
        venice: 'gemini-3[.-]1.*pro|gemini.*pro',
        sources: [SRC.g31Card, SRC.gGemini3, SRC.gPricing]
      },
      {
        id: 'gemini-3-5-flash-lite',
        name: 'Gemini 3.5 Flash-Lite',
        apiId: 'gemini-3.5-flash-lite',
        tagline: 'The budget model for high-volume work',
        bestFor: ['High-volume classification', 'Simple extraction and routing', 'Latency-sensitive features'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Max output', v: '65,536' },
          { k: 'Price in / out', v: '$0.30 / $2.50 per MTok' }
        ],
        pros: [
          { t: 'Lowest cost in the lineup', why: 'Google recommends it for new projects alongside 3.8 Flash.' },
          { t: 'Improved token efficiency', why: 'It shipped with better token efficiency than earlier Flash-Lite models.' }
        ],
        cons: [
          { t: 'Less depth', why: 'Route hard reasoning to 3.8 Flash or 3.1 Pro.' }
        ],
        dos: [
          { t: 'Use few-shot examples to pin the format', why: 'Examples are the cheapest way to get consistent output.' },
          { t: 'Keep the task narrow', why: 'Give it one job and one output shape.' }
        ],
        donts: [
          { t: 'Don’t pile on complex prompting tricks', why: 'Short, direct instructions work best on Gemini 3.x.' }
        ],
        example: {
          label: 'Router',
          before: 'Figure out where this email should go.',
          after: 'Route the email to one team: sales, support, or billing. Reply with the team name only.\n\nEmail: "Can I get a quote for 40 seats?" → sales\nEmail: "My card was declined" → billing\n\nEmail: "{{EMAIL}}" →',
          why: 'A closed label set and two examples make the output one word.'
        },
        settings: [
          { k: 'thinking_level', v: 'low', why: 'Default to cheap and fast.' },
          { k: 'temperature', v: '1.0', why: 'Keep the default.' }
        ],
        dialect: 'markdown',
        venice: 'gemini.*flash-?lite',
        sources: [SRC.g35, SRC.gModels, SRC.gStrategies]
      }
    ]
  };

  /* ══ DEEPSEEK ═══════════════════════════════════════════════════════════ */

  const deepseek = {
    id: 'deepseek',
    name: 'DeepSeek',
    maker: 'DeepSeek',
    mark: 'D',
    hue: '#6FA8D6',
    blurb: 'DeepSeek’s reasoning is built in. Its guidance: say clearly what you want and how you will judge the answer, keep examples to a minimum, and match temperature to the task when thinking is off.',
    chat: { label: 'DeepSeek', url: 'https://chat.deepseek.com' },
    principles: [
      { t: 'Say what you want, not how to think', why: 'Describe the task and its acceptance criteria. Reasoning is built in, so "think step by step" only makes outputs longer and more expensive.' },
      { t: 'Prefer zero-shot', why: 'DeepSeek found few-shot prompting degrades its reasoning models. If you need an example, give one and mark it as format only.' },
      { t: 'Keep instructions in the user turn', why: 'DeepSeek’s reasoning-model guidance puts instructions in the user prompt, and its own app runs without a system prompt.' },
      { t: 'For math, ask for a boxed answer', why: '"Please reason step by step, and put your final answer within \\boxed{}" is the official math directive.' },
      { t: 'Match temperature to the task when thinking is off', why: 'Coding/math 0.0 · data analysis 1.0 · conversation & translation 1.3 · creative 1.5.' },
      { t: 'In thinking mode, sampling parameters are ignored', why: 'temperature, top_p and the penalties are dropped. Use reasoning_effort instead.' }
    ],
    sources: [SRC.dsParams, SRC.dsV4Card, SRC.dsR1Card, SRC.dsPricing],
    models: [
      {
        id: 'deepseek-v4-1-flash',
        name: 'DeepSeek V4.1 Flash',
        apiId: 'deepseek-flash',
        tagline: 'The newest and smallest of the V4 family, with native vision',
        bestFor: ['Low-cost reasoning at scale', 'Coding and agent loops', 'Image + text inputs'],
        specs: [
          { k: 'Context', v: '1M tokens' },
          { k: 'Modes', v: 'Thinking / Non-thinking' },
          { k: 'Reasoning', v: 'low · high · max' },
          { k: 'Pricing', v: 'Peak / off-peak tiers' },
          { k: 'APIs', v: 'OpenAI & Anthropic formats' }
        ],
        pros: [
          { t: 'Beats V4-Pro, according to DeepSeek', why: 'DeepSeek cites tests putting V4.1-Flash ahead of V4-Pro on performance, cost and speed.' },
          { t: 'Very cheap cache hits', why: 'Cached input is billed at a small fraction of cache-miss input.' },
          { t: 'Drop-in APIs', why: 'It speaks both the OpenAI Chat Completions and Anthropic Messages formats.' }
        ],
        cons: [
          { t: 'Prices change with time of day', why: 'Peak hours cost double. Check the pricing page.' },
          { t: 'Examples can hurt', why: 'Few-shot prompting degrades its reasoning.' }
        ],
        dos: [
          { t: 'State the task and the acceptance criteria', why: 'That is DeepSeek’s core guidance for thinking models.' },
          { t: 'Pick a mode per request', why: 'Non-think for routine work, Think High for complex problems, Think Max for the hardest.' },
          { t: 'Keep a stable prefix', why: 'This maximises the cheap cache-hit rate.' }
        ],
        donts: [
          { t: 'Don’t add "think step by step"', why: 'It is redundant and costly.' },
          { t: 'Don’t set temperature in thinking mode', why: 'It is ignored there.' }
        ],
        example: {
          label: 'Criteria, not coaching',
          before: 'You are an expert. Think step by step carefully. Here are 4 examples… Now write a function to dedupe users.',
          after: 'Write a Python function dedupe_users(users: list[dict]) -> list[dict].\n\nAcceptance criteria:\n- Two users are duplicates if their emails match case-insensitively after trimming whitespace.\n- Keep the record with the most recent "updated_at".\n- Preserve the original order of the kept records.\n- Include three pytest tests that cover these rules.',
          why: 'It drops the coaching and the examples and adds checkable acceptance criteria.'
        },
        settings: [
          { k: 'reasoning_effort', v: 'high (complex) · low (routine)', why: 'max for the hardest problems.' },
          { k: 'temperature', v: 'non-thinking only, per task', why: 'Coding 0.0 → creative 1.5.' }
        ],
        dialect: 'plain',
        venice: 'deepseek',
        sources: [SRC.ds41, SRC.dsPricing, SRC.dsParams, SRC.dsV4Card]
      },
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        apiId: 'deepseek-v4-pro',
        tagline: 'The large V4 model (1.6T total, 49B active), with open weights',
        bestFor: ['Self-hosting a frontier-class open model', 'Long-context agents', 'Deep reasoning (Think Max)'],
        specs: [
          { k: 'Params', v: '1.6T total · 49B active' },
          { k: 'Context', v: '1M tokens' },
          { k: 'Think Max', v: '≥384K context advised' },
          { k: 'Sampling', v: 'temp 1.0 · top_p 1.0' }
        ],
        pros: [
          { t: 'Open weights', why: 'Published on Hugging Face for local or private deployment.' },
          { t: 'Built for long context', why: 'It supports 1M context in both thinking and non-thinking modes.' }
        ],
        cons: [
          { t: 'Superseded on the hosted API', why: 'DeepSeek reports that V4.1-Flash beats it on cost and speed. Check the pricing page for current routing.' },
          { t: 'Heavy to self-host', why: 'Think Max wants a context window of at least 384K.' }
        ],
        dos: [
          { t: 'Use temperature 1.0 and top_p 1.0 locally', why: 'These are the official sampling settings across reasoning modes.' },
          { t: 'Describe the deliverable precisely', why: 'Its thinking does the rest.' }
        ],
        donts: [
          { t: 'Don’t teach it how to reason', why: 'Say what you want, not how to think.' },
          { t: 'Don’t include several examples', why: 'Use one at most, labelled as format only.' }
        ],
        example: {
          label: 'Analysis',
          before: 'Let’s think step by step about whether we should expand to Germany. Example analysis: …',
          after: 'Decide whether we should launch in Germany in Q3.\n\nUse only the data below. The answer must state: go or no-go, the two numbers that drove the decision, and the one risk that would change it.\n\n<data>\n{{MARKET_DATA}}\n</data>',
          why: 'It defines the decision, the evidence boundary and the answer’s shape, with no reasoning script.'
        },
        settings: [
          { k: 'reasoning mode', v: 'Think High · Think Max', why: 'Non-think for routine work.' },
          { k: 'temperature / top_p', v: '1.0 / 1.0', why: 'For local deployment.' }
        ],
        dialect: 'plain',
        venice: 'deepseek-v4|deepseek',
        sources: [SRC.dsV4Card, SRC.dsPricing, SRC.dsR1Card]
      }
    ]
  };

  /* ══ QWEN ═══════════════════════════════════════════════════════════════ */

  const qwen = {
    id: 'qwen',
    name: 'Alibaba Qwen',
    maker: 'Qwen',
    mark: 'Q',
    hue: '#8FB4A8',
    blurb: 'Qwen publishes explicit best practices: sampling settings for each mode, plenty of output room for reasoning, and a fixed answer format so results are easy to parse.',
    chat: { label: 'Qwen Chat', url: 'https://chat.qwen.ai' },
    principles: [
      { t: 'Use the official sampling settings for each mode', why: 'Thinking: temp 1.0, top_p 0.95, top_k 20, presence 0.0. Non-thinking: temp 0.7, top_p 0.8, presence 1.5.' },
      { t: 'Never use greedy decoding', why: 'It degrades performance and causes endless repetition.' },
      { t: 'Allocate generous output length', why: 'Reasoning needs room, especially on agentic tasks.' },
      { t: 'Fix the answer format', why: 'Math: "reason step by step, and put your final answer within \\boxed{}". Multiple choice: put the answer in a JSON "answer" field.' },
      { t: 'Turn thinking on or off per request', why: 'Thinking is on by default and can be disabled per call with enable_thinking.' }
    ],
    sources: [SRC.qw27, SRC.qwBlog],
    models: [
      {
        id: 'qwen3-8-max',
        name: 'Qwen3.8-Max',
        apiId: null,
        tagline: 'Qwen’s largest and most capable flagship, for coding and cowork',
        bestFor: ['Agentic coding', 'Long-context "cowork" sessions', 'Deep analysis'],
        specs: [
          { k: 'Params', v: '2.4T' },
          { k: 'Context', v: '1M tokens' },
          { k: 'Reasoning', v: 'low · medium · xhigh (default)' },
          { k: 'Thinking history', v: 'preserved by default' }
        ],
        pros: [
          { t: 'Most capable Qwen to date', why: 'Alibaba’s flagship, aimed at coding and collaborative work.' },
          { t: 'Keeps its reasoning across turns', why: 'preserve_thinking keeps earlier reasoning in context, which helps agents stay consistent.' }
        ],
        cons: [
          { t: 'Expensive by default', why: 'xhigh is the default effort. Drop to medium or low for routine work.' },
          { t: 'Needs plenty of room to think', why: 'Qwen advises up to 262K tokens for reasoning and 131K for the final answer on agentic tasks.' }
        ],
        dos: [
          { t: 'Set reasoning_effort to match the task', why: 'xhigh for thorough analysis, medium for balance, low for speed and cost.' },
          { t: 'Give it a fixed output format', why: 'This makes results parseable and comparable.' }
        ],
        donts: [
          { t: 'Don’t use greedy decoding (temp 0)', why: 'It can repeat itself endlessly.' },
          { t: 'Don’t cap max tokens too low', why: 'The reasoning gets cut off.' }
        ],
        example: {
          label: 'Fixed answer format',
          before: 'Which option is right? A) … B) … C) …',
          after: 'Answer the multiple-choice question. Reason as needed, then end with a JSON object of the form {"answer": "B"} containing only the letter.\n\nQuestion: {{QUESTION}}\nA) …\nB) …\nC) …',
          why: 'Putting the answer in a JSON field is Qwen’s own recommended format for multiple choice.'
        },
        settings: [
          { k: 'reasoning_effort', v: 'medium for most work', why: 'xhigh is the default.' },
          { k: 'enable_thinking', v: 'true (default)', why: 'false for instant replies.' },
          { k: 'sampling (thinking)', v: 'T 1.0 · top_p 0.95 · top_k 20', why: 'presence_penalty 0.0.' }
        ],
        dialect: 'markdown',
        venice: 'qwen3?[.-]?8|qwen.*max',
        sources: [SRC.qwBlog, SRC.qwAli, SRC.qw27]
      },
      {
        id: 'qwen3-8-27b',
        name: 'Qwen3.8-27B',
        apiId: 'Qwen/Qwen3.8-27B',
        tagline: 'An open-weight dense model you can run yourself',
        bestFor: ['Local or private deployment', 'Fine-tuning', 'Cost-controlled reasoning'],
        specs: [
          { k: 'Params', v: '27B dense' },
          { k: 'Weights', v: 'Open (Hugging Face)' },
          { k: 'Modes', v: 'Thinking / Non-thinking' }
        ],
        pros: [
          { t: 'Open weights', why: 'You can run it on your own hardware, with no per-token API bill.' },
          { t: 'Two modes in one model', why: 'Switch thinking on or off per request.' }
        ],
        cons: [
          { t: 'Sensitive to sampling settings', why: 'Wrong settings cause repetition or language mixing.' },
          { t: 'Smaller than the flagship', why: 'Route the hardest work to Qwen3.8-Max.' }
        ],
        dos: [
          { t: 'Copy the model card’s sampling settings exactly', why: 'Thinking: T 1.0, top_p 0.95, top_k 20, presence 0.0. Non-thinking: T 0.7, top_p 0.8, presence 1.5.' },
          { t: 'Set a fixed final-answer format', why: 'For example, a \\boxed{} answer for math.' }
        ],
        donts: [
          { t: 'Don’t use greedy decoding', why: 'The model card warns of endless repetition.' },
          { t: 'Don’t add a presence penalty while thinking', why: 'Since 3.6, presence_penalty is 0.0 in thinking mode, because a non-zero value causes language mixing.' }
        ],
        example: {
          label: 'Math',
          before: 'What’s the probability of two sixes in three rolls?',
          after: 'What is the probability of rolling exactly two sixes in three rolls of a fair die?\n\nPlease reason step by step, and put your final answer within \\boxed{}.',
          why: 'This is the model card’s standard math format, which makes the answer easy to extract and grade.'
        },
        settings: [
          { k: 'temperature', v: '1.0 thinking · 0.7 non-thinking', why: 'Never 0.' },
          { k: 'presence_penalty', v: '0.0 thinking · 1.5 non-thinking', why: 'Prevents loops in non-thinking mode.' }
        ],
        dialect: 'markdown',
        venice: 'qwen3?[.-]?8.*27b|qwen.*27b',
        sources: [SRC.qw27]
      }
    ]
  };

  /* ══ MISTRAL ════════════════════════════════════════════════════════════ */

  const mistral = {
    id: 'mistral',
    name: 'Mistral AI',
    maker: 'Mistral',
    mark: 'M',
    hue: '#F79C6E',
    blurb: 'Mistral’s guide is about removing ambiguity: open with a role and a task, structure the prompt hierarchically, replace vague words with measures, and turn conflicting rules into a decision tree.',
    chat: { label: 'Le Chat', url: 'https://chat.mistral.ai' },
    principles: [
      { t: 'Open with a role and a task', why: '"You are a <role>, your task is to <task>." steers the model to the right domain fast.' },
      { t: 'Structure the prompt hierarchically', why: 'Use sections and subsections in Markdown or XML-style tags, which are readable, parsable and familiar to the model.' },
      { t: 'Write for a reader with no context', why: 'The prompt should be executable by reading it alone.' },
      { t: 'Replace vague words with measures', why: 'Not "too long", "many", "interesting" or "better". State the number or the exact meaning.' },
      { t: 'Turn conflicting rules into a decision tree', why: 'Ordered if/otherwise logic removes the contradictions that creep into long prompts.' },
      { t: 'Don’t make it count', why: 'Avoid "if longer than 100 characters". Compute the count and pass it in as input.' },
      { t: 'Use worded scales, not numbers', why: '"Very low … Good: worth considering … Very good" grades more consistently than 1–10.' }
    ],
    sources: [SRC.miPrompt],
    models: [
      {
        id: 'mistral-medium-3-5',
        name: 'Mistral Medium 3.5',
        apiId: null,
        tagline: 'Frontier-class multimodal model for agents and coding',
        bestFor: ['Agentic coding', 'Tool-using agents', 'Multimodal business tasks'],
        specs: [
          { k: 'Params', v: '128B dense' },
          { k: 'Context', v: '256K tokens' },
          { k: 'Price in / out', v: '$1.5 / $7.5 per MTok' },
          { k: 'SWE-Bench Verified', v: '77.6%' }
        ],
        pros: [
          { t: 'Strong agentic coding', why: 'Mistral reports 77.6% on SWE-Bench Verified, ahead of Devstral 2.' },
          { t: 'One set of weights does it all', why: 'It handles instruction following, reasoning and coding together.' }
        ],
        cons: [
          { t: 'Smaller context window than the 1M-token rivals', why: '256K tokens.' }
        ],
        dos: [
          { t: 'Start with "You are a <role>, your task is to <task>."', why: 'This is Mistral’s recommended opener.' },
          { t: 'Express branching rules as a decision tree', why: 'Long agent prompts tend to contradict themselves otherwise.' }
        ],
        donts: [
          { t: 'Don’t use vague quantities', why: '"Short" or "a few" leave it guessing.' },
          { t: 'Don’t ask it to count characters or words', why: 'Precompute counts and pass them in.' }
        ],
        example: {
          label: 'Decision tree',
          before: 'If the new data relates to an existing record, update it. If the data is new, create a record.',
          after: 'You are a CRM data steward. Your task is to file each incoming note.\n\nApply these rules in order and stop at the first match:\n1. If the note adds no new information, ignore it.\n2. Otherwise, if it relates to no existing record, create a new record.\n3. Otherwise, if it contradicts the existing record, replace that record.\n4. Otherwise, update the existing record.',
          why: 'Mistral’s own example: two overlapping rules become an ordered tree with no contradictions.'
        },
        settings: [
          { k: 'response_format', v: 'json_object when parsing', why: 'Mistral recommends JSON mode for structured output.' }
        ],
        dialect: 'markdown',
        venice: 'mistral.*medium',
        sources: [SRC.miMedium, SRC.miPrompt]
      },
      {
        id: 'mistral-small-4',
        name: 'Mistral Small 4',
        apiId: null,
        tagline: 'One efficient model for reasoning, vision and coding',
        bestFor: ['High-throughput apps', 'Cheap reasoning', 'Vision + text'],
        specs: [
          { k: 'Params', v: '119B MoE · 6B active' },
          { k: 'Price in / out', v: '$0.15 / $0.60 per MTok' },
          { k: 'Speed', v: '40% lower latency vs Small 3' }
        ],
        pros: [
          { t: 'Replaces three specialist models', why: 'It merges Magistral (reasoning), Pixtral (vision) and Devstral (coding) into one.' },
          { t: 'Fast and economical', why: 'Mistral reports 3× the requests per second of Small 3, and shorter outputs than GPT-OSS 120B at comparable scores.' }
        ],
        cons: [
          { t: 'Small active parameter count', why: '6B active parameters, so very hard reasoning belongs on Medium 3.5.' }
        ],
        dos: [
          { t: 'Be explicit and complete', why: 'Write the prompt for a reader with no context.' },
          { t: 'Use a worded scale for ratings', why: 'It grades more consistently than numbers.' }
        ],
        donts: [
          { t: 'Don’t leave terms undefined', why: 'Spell out what "interesting" or "better" means.' }
        ],
        example: {
          label: 'Worded scale',
          before: 'Rate each idea from 1 to 10.',
          after: 'You are a product reviewer. Your task is to rate each feature idea for next quarter.\n\nUse exactly one of: Very low, Low, Neutral, Good (worth considering), Very good (should be built). Give one sentence of justification per idea.',
          why: 'Each label carries its meaning, so ratings stay consistent across runs.'
        },
        settings: [
          { k: 'response_format', v: 'json_object when parsing', why: 'Gives predictable structure.' }
        ],
        dialect: 'markdown',
        venice: 'mistral.*small',
        sources: [SRC.miSmall4, SRC.miPrompt]
      }
    ]
  };

  /* ══ META ═══════════════════════════════════════════════════════════════ */

  const meta = {
    id: 'meta',
    name: 'Meta',
    maker: 'Llama',
    mark: 'L',
    hue: '#B98A5E',
    blurb: 'Llama 4 does not reason internally, so classic prompting still pays off: explicit rules, a role, examples, and chain-of-thought when the task needs steps. Meta also publishes a system prompt to cut false refusals.',
    chat: { label: 'Meta AI', url: 'https://www.meta.ai' },
    principles: [
      { t: 'Give explicit instructions', why: 'Rules and restrictions beat open-ended prompts on how the model should respond.' },
      { t: 'Assign a role', why: 'A role or perspective makes responses more relevant.' },
      { t: 'Show examples (few-shot)', why: 'Examples tell the model what kind of output you expect.' },
      { t: 'Use chain-of-thought for multi-step tasks', why: 'Llama 4 does not reason on its own, so guiding it through steps improves coherence.' },
      { t: 'Combine role, rules, instructions and an example', why: 'Meta’s recipe for limiting extraneous tokens in the output.' },
      { t: 'Ground it to cut hallucination', why: 'Supply the facts or retrieved context it needs instead of relying on memory.' }
    ],
    sources: [SRC.llPrompt, SRC.llCard],
    models: [
      {
        id: 'llama-4-maverick',
        name: 'Llama 4 Maverick',
        apiId: 'Llama-4-Maverick-17B-128E-Instruct',
        tagline: 'Natively multimodal open-weight model, 17B active parameters',
        bestFor: ['Self-hosted assistants', 'Image + text understanding', 'Customisable open deployments'],
        specs: [
          { k: 'Params', v: '17B active · 128 experts' },
          { k: 'Modality', v: 'Text + image in' },
          { k: 'Weights', v: 'Open (Llama licence)' }
        ],
        pros: [
          { t: 'Open weights', why: 'You can host it anywhere and fine-tune it to your domain.' },
          { t: 'Natively multimodal', why: 'It understands images and text together.' }
        ],
        cons: [
          { t: 'Not a reasoning model', why: 'It needs explicit chain-of-thought for multi-step problems.' },
          { t: 'Older generation (April 2025)', why: 'Newer closed models lead on hard reasoning.' }
        ],
        dos: [
          { t: 'Start from Meta’s suggested Llama 4 system prompt', why: 'It reduces false refusals and preachy language. Adapt it to your use case.' },
          { t: 'Ask for steps on multi-step problems', why: 'Guided thinking helps a model without built-in reasoning.' }
        ],
        donts: [
          { t: 'Don’t use jargon the model may misread', why: 'Meta advises clear, concise prompts.' },
          { t: 'Don’t let it answer from memory on facts', why: 'Ground it with context or retrieval.' }
        ],
        example: {
          label: 'Role + rules + example',
          before: 'Write a product description for these headphones.',
          after: 'You are a copywriter for an audio retailer.\n\nRules: 50–70 words. Mention battery life and weight. No exclamation marks. Output the description only.\n\nExample:\nProduct: Trail running earbuds, 9h battery, 6g\nDescription: Built for long miles, these earbuds weigh just 6 g and run nine hours on a charge…\n\nProduct: {{PRODUCT}}\nDescription:',
          why: 'Meta’s recipe is a role, explicit rules and one example, which keeps out extra tokens.'
        },
        settings: [
          { k: 'system prompt', v: 'Meta’s Llama 4 template', why: 'Then add your rules.' }
        ],
        dialect: 'markdown',
        venice: 'llama-?4.*maverick|maverick',
        sources: [SRC.llCard, SRC.llPrompt, SRC.llBlog]
      },
      {
        id: 'llama-4-scout',
        name: 'Llama 4 Scout',
        apiId: 'Llama-4-Scout-17B-16E-Instruct',
        tagline: 'Long-context multimodal model with a 10M-token window',
        bestFor: ['Very long documents', 'Codebase-wide questions', 'Single-GPU deployment'],
        specs: [
          { k: 'Params', v: '17B active · 16 experts' },
          { k: 'Context', v: '10M tokens' },
          { k: 'Weights', v: 'Open (Llama licence)' }
        ],
        pros: [
          { t: 'Huge context window', why: 'Its 10M-token window fits entire corpora or codebases.' },
          { t: 'Light to host', why: 'Meta designed it to fit on a single H100 GPU (with Int4 quantisation).' }
        ],
        cons: [
          { t: 'Not a reasoning model', why: 'Spell out the steps for complex tasks.' }
        ],
        dos: [
          { t: 'Point it to where the answer lives', why: 'With huge inputs, say which document or section to use.' },
          { t: 'Give rules and an output example', why: 'This keeps long-context answers tight.' }
        ],
        donts: [
          { t: 'Don’t dump context without a question', why: 'State exactly what to find and in what form.' }
        ],
        example: {
          label: 'Long context',
          before: 'Here is our whole codebase. Any problems?',
          after: 'You are a senior reviewer. Using only the code below, list every place an HTTP request is made without a timeout. For each, give the file path, line and function name, as a Markdown table. If there are none, say "none found".\n\n<code>\n{{REPO}}\n</code>',
          why: 'It gives a narrow target, an output format and an explicit "none" case.'
        },
        settings: [
          { k: 'system prompt', v: 'Meta’s Llama 4 template', why: 'Reduces false refusals.' }
        ],
        dialect: 'markdown',
        venice: 'llama-?4.*scout|scout',
        sources: [SRC.llBlog, SRC.llCard, SRC.llPrompt]
      }
    ]
  };

  window.ModelGuides = {
    verifiedOn: '2026-10-03',
    excluded: [
      { name: 'xAI Grok', why: 'xAI’s only text prompting guide covers grok-code-fast-1, which retired on May 15, 2026. No first-party guide exists for Grok 4.7.' },
      { name: 'Z.ai GLM', why: 'Z.ai documents sampling parameters but publishes no prompting guide.' }
    ],
    providers: [anthropic, openai, google, deepseek, qwen, mistral, meta]
  };
})();
