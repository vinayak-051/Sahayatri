# CLAUDE.md

## Goal

Optimize for minimal token usage, minimal context consumption, and fast task completion.

Prioritize correctness with the least amount of repository exploration necessary.

---

## Communication

* Be concise.
* Do not explain reasoning unless explicitly requested.
* Do not provide chain-of-thought.
* Do not restate requirements.
* Do not generate lengthy plans.
* Keep responses short and actionable.
* Return results, code changes, and required commands only.

---

## Repository Exploration

* Start with the most likely files.
* Read the minimum number of files required.
* Expand investigation only when evidence requires it.
* Avoid repository-wide scans unless explicitly requested.
* Avoid architecture reviews unless explicitly requested.
* Do not attempt to understand the entire codebase before acting.

---

## Search Strategy

Prefer:

* Exact file paths
* Exact symbol searches
* Specific component names
* Specific function names
* Targeted directory searches

Avoid:

* Full repository searches
* Recursive scans of unrelated directories
* Broad pattern matching across the project
* Repeated searches for the same information

---

## Editing Rules

* Make the smallest effective change.
* Modify only relevant files.
* Preserve existing architecture.
* Preserve existing coding patterns.
* Avoid unnecessary refactoring.
* Avoid formatting-only changes.
* Avoid rewriting working code.
* Do not touch unrelated files.

---

## Debugging Workflow

1. Identify the most probable source of the issue.
2. Read only relevant files.
3. Implement the fix.
4. Verify the fix.
5. Stop.

Do not perform broad investigations without evidence.

---

## Refactoring

Only refactor when explicitly requested.

When refactoring:

* Keep scope limited.
* Preserve APIs when possible.
* Avoid touching unrelated modules.
* Minimize file changes.

---

## Context Management

* Reuse previously gathered context.
* Avoid rereading files unnecessarily.
* Avoid collecting information that is not required for the current task.
* Assume unrelated code is correct unless evidence suggests otherwise.

---

## Large Repository Rules

For monorepos:

* Work only within affected packages.
* Ignore unrelated applications and services.

For Next.js:

* Focus on affected routes, components, hooks, API handlers, and services.

For React:

* Follow the affected component path only.

For Node.js:

* Inspect only affected modules and dependencies.

---

## Output Format

Default response:

* Files changed
* What changed
* Commands to run (if needed)

No additional explanation unless requested.

---

## Clarifications

If requirements are ambiguous:

* Ask one concise question.
* Do not ask multiple questions at once.
* Do not generate speculative implementation plans.

---

## Efficiency Rules

* Prefer direct fixes over analysis.
* Prefer implementation over discussion.
* Prefer targeted inspection over exploration.
* Stop once the task is completed.
* Do not continue investigating after a valid solution is found.

---

## Forbidden Behaviors

* Full repository analysis
* Full architecture analysis
* Large documentation generation
* Reading large numbers of files without justification
* Excessive explanations
* Unnecessary refactoring
* Rewriting unrelated code
* Repeated repository scans

---

## Preferred Workflow

Locate → Read Minimal Files → Implement → Verify → Stop
