# Agent Skills Complete Reference Guide

> **Use this document as context when instructing Claude Code to build a Skill Creator app or when creating your own Agent Skills.**

---

## What Are Agent Skills?

Agent Skills are modular, self-contained packages that extend Claude's capabilities by providing specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains—they transform Claude from a general-purpose agent into a specialized agent equipped with procedural knowledge.

**Key Principle**: Skills are **model-invoked**—Claude autonomously decides when to use them based on the request and the Skill's description.

---

## Skill Anatomy

### Required Structure

```
skill-name/
├── SKILL.md          (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Optional Resources
    ├── scripts/        - Executable code (Python/Bash/etc.)
    ├── references/     - Documentation loaded as needed
    └── assets/         - Templates, icons, fonts, sample files
```

### SKILL.md Format

```markdown
---
name: skill-name-here
description: What it does + when to use it (max 1024 chars)
---

# Skill Title

## Instructions
Clear, step-by-step guidance for Claude.

## Examples
Concrete examples of using this Skill.

## Guidelines
Rules and constraints to follow.
```

### Field Requirements

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Lowercase letters, numbers, hyphens only (max 64 chars) |
| `description` | Yes | What it does + when to trigger (max 1024 chars) |
| `allowed-tools` | No | Restricts Claude to specific tools (e.g., `Read, Grep, Glob`) |

---

## Description Best Practices

The `description` is the **primary triggering mechanism**. Claude reads descriptions to decide when to invoke a skill.

### Good Description Pattern

```yaml
description: [WHAT it does - capabilities]. Use when [TRIGGERS - specific contexts, keywords, file types, or scenarios that should activate this skill].
```

### Examples

❌ **Bad (too vague)**:
```yaml
description: Helps with documents
```

✅ **Good (specific)**:
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files, forms, document extraction, or when user mentions PDFs.
```

❌ **Bad (no triggers)**:
```yaml
description: Creates presentations for meetings
```

✅ **Good (clear triggers)**:
```yaml
description: Create professional PowerPoint presentations with slides, charts, and speaker notes. Use when building presentations, pitch decks, slide decks, or .pptx files.
```

---

## Anthropic's Official Example Skills

### Creative & Design

| Skill | Description |
|-------|-------------|
| `algorithmic-art` | Create generative art using p5.js with seeded randomness, flow fields, and particle systems |
| `canvas-design` | Design beautiful visual art in .png and .pdf formats using design philosophies |
| `slack-gif-creator` | Create animated GIFs optimized for Slack's size constraints |
| `theme-factory` | Style artifacts with 10 pre-set professional themes or generate custom themes |

### Development & Technical

| Skill | Description |
|-------|-------------|
| `mcp-builder` | Guide for creating high-quality MCP servers to integrate external APIs and services |
| `webapp-testing` | Test local web applications using Playwright for UI verification and debugging |
| `artifacts-builder` | Build complex claude.ai HTML artifacts using React, Tailwind CSS, and shadcn/ui |

### Enterprise & Communication

| Skill | Description |
|-------|-------------|
| `internal-comms` | Write internal communications like status reports, newsletters, and FAQs |
| `brand-guidelines` | Apply official brand colors and typography to artifacts |
| `skill-creator` | Guide for creating effective skills |

### Document Skills (Pre-built)

| Skill | Description |
|-------|-------------|
| `pptx` | Create/edit PowerPoint presentations |
| `xlsx` | Create/edit Excel spreadsheets with formulas |
| `docx` | Create/edit Word documents with formatting |
| `pdf` | Extract text, fill forms, merge PDFs |

---

## Complete Skill Examples

### Example 1: Simple Single-File Skill

```markdown
---
name: commit-message-helper
description: Generate clear, conventional commit messages from git diffs. Use when writing commit messages, reviewing staged changes, or preparing git commits.
---

# Commit Message Helper

## Instructions

1. Run `git diff --staged` to analyze changes
2. Identify the type of change (feat, fix, docs, refactor, test, chore)
3. Generate a commit message following this format:
   - Subject line: type(scope): description (max 50 chars)
   - Body: Detailed explanation of what and why (not how)

## Format

```
type(scope): short description

- Bullet point explaining change
- Another explanation if needed

Closes #issue-number (if applicable)
```

## Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests
- `chore`: Changes to build process or auxiliary tools

## Examples

Input: Changed login validation logic
Output: `fix(auth): validate email format before submission`

Input: Added user profile page
Output: `feat(profile): add user profile page with avatar upload`
```

---

### Example 2: Skill with Tool Restrictions

```markdown
---
name: code-reviewer
description: Review code for best practices, security issues, and potential bugs. Use when reviewing code, checking PRs, analyzing code quality, or auditing codebases.
allowed-tools: Read, Grep, Glob
---

# Code Reviewer

This skill provides read-only code analysis without making modifications.

## Review Checklist

1. **Code Organization**
   - Single responsibility principle
   - Appropriate file/function sizes
   - Clear naming conventions

2. **Error Handling**
   - Try-catch blocks where needed
   - Meaningful error messages
   - Graceful degradation

3. **Security**
   - Input validation
   - SQL injection prevention
   - XSS protection
   - Secrets not hardcoded

4. **Performance**
   - Unnecessary loops or recursion
   - Memory leaks
   - N+1 query problems

## Instructions

1. Use `Glob` to find relevant files
2. Use `Read` to examine file contents
3. Use `Grep` to search for patterns (e.g., `TODO`, `FIXME`, hardcoded secrets)
4. Provide categorized feedback with severity levels (Critical, Warning, Suggestion)

## Output Format

```markdown
## Code Review: [filename]

### Critical Issues
- [Issue description with line number]

### Warnings
- [Issue description with line number]

### Suggestions
- [Improvement suggestion]

### Positive Observations
- [What's done well]
```
```

---

### Example 3: Multi-File Skill with Scripts

```
data-analyzer/
├── SKILL.md
├── references/
│   └── chart-types.md
└── scripts/
    └── generate_summary.py
```

**SKILL.md:**
```markdown
---
name: data-analyzer
description: Analyze CSV and Excel data files, generate statistical summaries, and create visualizations. Use when analyzing data, creating charts, generating reports from spreadsheets, or performing statistical analysis.
---

# Data Analyzer

## Quick Start

For basic analysis:
```python
import pandas as pd
df = pd.read_csv("data.csv")
print(df.describe())
```

## Instructions

1. Load the data file using pandas
2. Generate basic statistics (mean, median, std, quartiles)
3. Identify missing values and outliers
4. Create appropriate visualizations

## Visualization Guide

See [chart-types.md](references/chart-types.md) for choosing the right chart.

## Automated Summary

Run the summary script:
```bash
python scripts/generate_summary.py input.csv output_report.md
```

## Output Requirements

- Always include sample data preview (first 5 rows)
- Include missing value counts
- Provide correlation matrix for numeric columns
- Generate at least one visualization
```

---

### Example 4: Medical Affairs / Pharma Skill

```markdown
---
name: msl-congress-prep
description: Prepare Medical Science Liaisons for scientific congress attendance including KOL engagement, booth coverage, and scientific session planning. Use when planning congress coverage, preparing for medical conferences, creating KOL engagement strategies, or organizing MSL congress activities.
---

# MSL Congress Preparation

## Pre-Congress Planning

### 1. Session Analysis
- Review scientific agenda and identify high-priority sessions
- Map sessions to therapeutic areas and pipeline products
- Identify presenting KOLs and their affiliations

### 2. KOL Engagement Planning
- Cross-reference attendee list with KOL tier list
- Prepare personalized talking points per KOL
- Schedule booth appointments where possible

### 3. Booth Coverage Schedule
- Create rotation schedule ensuring therapeutic area coverage
- Assign primary and backup MSLs per time slot
- Include break times and session attendance windows

## Templates

### Talking Points Template
```
KOL: [Name, Institution]
Tier: [1/2/3]
Therapeutic Focus: [Area]
Recent Publications: [List 2-3]
Engagement Goals:
1. [Primary objective]
2. [Secondary objective]
Questions to Ask:
- [Question 1]
- [Question 2]
```

### Session Report Template
```
Session: [Title]
Presenter: [Name]
Key Findings:
- [Finding 1]
- [Finding 2]
Competitive Intelligence:
- [Observation]
Follow-up Actions:
- [Action item]
```

## Post-Congress Deliverables

1. Congress summary report (within 48 hours)
2. KOL interaction summaries in CRM
3. Competitive intelligence brief
4. Follow-up action tracker

## Compliance Reminders

- Document all KOL interactions per company policy
- No off-label discussions
- Adverse events must be reported within 24 hours
- All materials must be MLR-approved
```

---

### Example 5: Training Content Skill (ADD/Dyslexia Accommodations)

```markdown
---
name: accessible-learning-content
description: Design educational content optimized for learners with ADD/ADHD and dyslexia using evidence-based multisensory, chunked, and structured approaches. Use when creating training materials, courses, study guides, or educational content for neurodivergent learners.
---

# Accessible Learning Content Creator

## Core Principles

### Chunking
- Break content into 3-5 minute learning segments
- One concept per chunk
- Clear visual separation between sections

### Visual Structure
- Use icons and color coding consistently
- Left-align text (no justified text)
- Generous white space (1.5-2x line spacing)
- Sans-serif fonts (OpenDyslexic, Arial, Verdana)

### Multisensory Elements
- Pair text with visuals/diagrams
- Include audio narration options
- Add interactive elements where possible

## Content Structure Template

```
[ICON] Module Title
━━━━━━━━━━━━━━━━━━

⏱️ Time: X minutes
🎯 Objective: [Single, clear goal]

┌─────────────────────────┐
│  KEY CONCEPT BOX        │
│  [Main idea in 1-2      │
│   sentences]            │
└─────────────────────────┘

[Visual/Diagram Here]

📝 TRY IT:
[Hands-on activity]

✅ CHECKPOINT:
□ I understand [concept]
□ I can [skill]

→ NEXT: [Preview of next chunk]
```

## Formatting Rules

1. **Headings**: Bold, larger font, consistent hierarchy
2. **Lists**: Max 5 items, use bullets not numbers unless order matters
3. **Paragraphs**: Max 3-4 sentences
4. **Highlighting**: Use sparingly, one color for key terms
5. **Navigation**: Always show progress and allow easy jumping

## Avoid

- Dense paragraphs
- Walls of text
- Complex sentence structures
- Centered or justified text
- Decorative fonts
- Red/green color coding (colorblind accessibility)
- Timed assessments without accommodations
```

---

### Example 6: AI Training Prompt Library Skill

```markdown
---
name: medical-affairs-prompts
description: Library of optimized prompts for Medical Affairs AI use cases including congress management, advisory boards, medical information, and MSL workflows. Use when needing prompt templates for pharma Medical Affairs tasks or when building AI tools for medical teams.
---

# Medical Affairs Prompt Library

## Congress Management Prompts

### Pre-Congress Research
```
Analyze the [CONGRESS NAME] scientific program and identify:
1. Sessions relevant to [THERAPEUTIC AREA]
2. Presenting investigators from our clinical trials
3. Competitor presentations on [MECHANISM/INDICATION]
4. Potential KOL engagement opportunities

Format as a prioritized table with session times, speakers, and relevance scores.
```

### Competitive Intelligence Summary
```
Based on the following congress abstracts, create a competitive intelligence summary:

[PASTE ABSTRACTS]

Structure the summary as:
1. Key efficacy findings (vs. our data)
2. Safety signals
3. Differentiation opportunities
4. Recommended follow-up actions
```

## Advisory Board Prompts

### Discussion Guide Generator
```
Create an advisory board discussion guide for [TOPIC].

Objectives:
- [OBJECTIVE 1]
- [OBJECTIVE 2]

Include:
- Opening context (2-3 minutes)
- 4-5 discussion questions with probes
- Anticipated perspectives
- Time allocations
- Facilitation tips
```

## Medical Information Prompts

### Standard Response Letter
```
Draft a medical information response letter for the following inquiry:

HCP Question: [QUESTION]
Product: [PRODUCT]
Approved Indications: [INDICATIONS]

Requirements:
- On-label information only
- Include relevant clinical trial data
- Cite package insert and published literature
- Professional, balanced tone
- Include standard medical information disclaimer
```

## ISS (Investigator-Sponsored Studies) Prompts

### Protocol Review
```
Review this ISS protocol and provide feedback on:

1. Scientific rationale alignment with product profile
2. Endpoint selection appropriateness
3. Sample size considerations
4. Safety monitoring adequacy
5. Publication strategy

Protocol: [PASTE PROTOCOL SUMMARY]

Format feedback as: Strength / Concern / Recommendation
```

## Usage Guidelines

- Always verify outputs against approved materials
- Include appropriate disclaimers
- Route through MLR when required
- Document AI-assisted content per SOP
```

---

## Progressive Disclosure Pattern

Skills use a three-level loading system:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words recommended)
3. **Bundled resources** - Loaded as needed by Claude

### When to Split Content

```markdown
# In SKILL.md - Keep it lean

## Quick Start
[Essential 3-step process]

## Advanced Features
- **Form filling**: See [FORMS.md](references/FORMS.md)
- **API reference**: See [REFERENCE.md](references/REFERENCE.md)
- **Examples**: See [EXAMPLES.md](references/EXAMPLES.md)
```

---

## Installing & Using Skills

### Personal Skills
```bash
mkdir -p ~/.claude/skills/my-skill-name
# Add SKILL.md here
```

### Project Skills (shared via git)
```bash
mkdir -p .claude/skills/my-skill-name
git add .claude/skills/
git commit -m "Add team skill"
```

### Via Plugins
```bash
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

---

## Validation Checklist

Before deploying a skill:

- [ ] `name` is lowercase with hyphens only
- [ ] `description` includes WHAT + WHEN triggers
- [ ] YAML frontmatter has opening and closing `---`
- [ ] No tabs in YAML (use spaces)
- [ ] Instructions are clear and actionable
- [ ] Examples demonstrate real usage
- [ ] Scripts are tested and executable
- [ ] File paths use forward slashes
- [ ] Total SKILL.md body < 500 lines (split if larger)

---

## Resources

- **Anthropic Skills Repo**: https://github.com/anthropics/skills
- **Skills Documentation**: https://code.claude.com/docs/en/skills
- **Agent Skills Overview**: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview
- **Engineering Blog**: https://anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

---

## Prompt for Claude Code: Skill Creator App

Use this prompt to instruct Claude Code to build an app that creates Agent Skills:

```
Build a web app that helps users create Claude Agent Skills.

Core Features:
1. SKILL.md Generator with form inputs:
   - name (lowercase, hyphens, max 64 chars)
   - description (max 1024 chars - WHAT + WHEN)
   - Optional allowed-tools selector
   - Rich markdown editor for instructions
   - Live preview of generated SKILL.md

2. Validation:
   - YAML syntax validation
   - Name format checker
   - Character limits
   - Required field validation

3. Templates Library:
   - Code review skills
   - Documentation generators
   - Data analysis workflows
   - Medical Affairs skills (congress prep, MSL tools, prompt libraries)

4. Export:
   - Download as .zip with folder structure
   - Copy to clipboard
   - Placement instructions for personal/project skills

5. Multi-file support:
   - Visual file tree builder
   - Add references/, scripts/, assets/ folders
   - Reference file linking

Tech: React + Tailwind CSS
```

---

*Last updated: January 2026*
