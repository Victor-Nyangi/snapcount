# resources

Planning and design inputs for Snapcount. Not application code — nothing here is
imported by `backend/` or `frontend/`.

## Tracked (these are the spec — do not delete)

| File | What it is |
|---|---|
| `nfl-implemnentation2.md` | **The implementation plan.** Milestones M0–M6, task-by-task. The findings report (§0), the divergence/judgment-call record (§1), and the explicit out-of-scope list (§2) live here. This is the document the SDD loop executes. |
| `nfl-analysis-design-plan.md` | The original design brief the mockups were made from — constraints, screen list, chart conventions. |
| `nfl-handoff-original.md` | The first handoff prompt, superseded by the plan above. Kept because it is where several constraints were first stated verbatim. |

## Untracked (gitignored)

| File | Why |
|---|---|
| `design-v1-three-screens.html` | First design export — Week, Standings, Leaders. |
| `design-v2-seven-screens.html` | Second export, adds Team, Player, Analytics Explorer, Champions. **This is the current design.** |

Both are ~1 MB single-file bundles of compiled JS, not source, so they are kept out
of git. They are re-importable at any time and the bundle is *not* the authority —
the authority is `NFL Analysis Platform.dc.html` in the Claude Design project:

- Project: `602fdce0-a466-4323-b590-7205741e19a2` ("NFL Analysis Platform Design")
- Design system: `victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477`
- Re-import with the `claude_design` MCP (`DesignSync`, `get_file`), auth via `/design-login`

The design system's four token files were exported to
`.superpowers/sdd/nfl-implemnentation2/design-tokens/` so Task 1.2 can copy them
verbatim without network access. Those are also gitignored (the whole
`.superpowers/` tree is), so re-export them if that directory is cleaned.

## Reading order

Brief → plan §0 (what the design actually contains) → plan §1 (where we knowingly
diverge from it) → plan §2 (what is deliberately not built) → the milestones.
