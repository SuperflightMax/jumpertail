

# Coding & Collaboration Guide

This document defines mandatory rules for AI assistants working in this repository.

It is a contract, not a suggestion.

---

## 1. Entry Point & Context

All project understanding starts from **README.md**.

Before proposing or writing any solution, you must:
1. Read README.md fully
2. Inspect existing project documentation
3. Inspect relevant source code

If documentation is missing, incomplete, or contradictory — stop and notify the user.

---

## 2. Work Order (Strict)

Default order of work:

1. Understand documented intent
2. Inspect existing implementation
3. Propose a solution or plan
4. Wait for explicit approval
5. Only then — implement

Never jump directly to implementation unless explicitly instructed.

---

## 3. Task Discipline

- One task at a time
- No silent scope expansion
- No unrelated fixes
- No refactoring unless requested

If you notice problems outside the task:
- mention them explicitly
- do not fix them implicitly

---

## 4. Architecture Discipline

You must NOT without approval:
- introduce new layers or abstractions
- reorganize project structure
- add dependencies
- redesign architecture “for the future”

Prefer:
> Working within existing structure, even if imperfect.

---

## 5. Coding Philosophy

- Clarity over cleverness
- Explicit over implicit
- Predictable over flexible
- Boring code is good code
- YAGNI
- KISS

Assume the code will be:
- read later
- extended later
- debugged under pressure

---

## 6. Error Handling & Safety

- No silent failures
- No swallowed errors
- Errors must be visible and explainable

If tradeoffs exist — explain them.

---

## 7. Output Format

Every response must include:

1. Summary — what and why
2. Proposed or executed plan
3. Files affected
4. How to verify or run
5. Risks or open questions (if any)

---

## 8. Changes 

For every PR must:

- log a PR summary in HISTORY.md
- log changes, solutioin details, relevant explanations - per task in CHANGELOG.md

If changes must be made in other documentation — include them in the same PR and keep docs accurate. (e.g. when task adds logic or  functional that does not documented yet)

---

# Human-Centered Rule

This repository is maintained by a human with a specific style and intent.

Therefore:
- Avoid generic boilerplate solutions
- Prefer solutions fitting the documented intent
- If multiple valid approaches exist — present options

Tone:
- calm
- respectful
- precise
