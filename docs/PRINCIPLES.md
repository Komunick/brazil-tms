# Engineering Principles

**Apply KISS, DRY, and YAGNI in every change.**

- **KISS:** Prefer straightforward solutions; avoid speculative complexity.  
- **DRY:** Extract duplication only after **≥ 3** real repetitions; prefer the right abstraction over premature abstractions.  
- **YAGNI:** Build only what’s necessary now; avoid options/indirection “just in case.”

**Decision Criteria (must be explicit in PRs):**
- State which principle(s) you are applying.
- Show before/after snippets for relevant refactors.
- Make trade-offs explicit (duplication vs. abstraction, etc.).
- Prefer minimal diffs; small PRs are safer and easier to review.
- Justify new abstractions with concrete duplication or near-term use.

### When to Abstract
- A pattern repeats **≥ 3** times with identical logic.
- Clear single responsibility.
- Short-term roadmap will reuse it.
- Benefits outweigh the added indirection.

### When Not to Abstract
- Only 1–2 occurrences.
- Slightly different logic.
- “We might need it later.”
- It hurts code clarity.