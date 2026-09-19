# U63 [AST] — ast-side integration: cs90-U54 … U60 → `cs90-integration`

Worktree `/root/worktrees/cs90-ast/U63`, branch **`cs90-integration`**, base pin
`404e9daa7f0ab58d085ed04aaa61a19546dfeda2` (carlotestor/ast-transpiler#87). ccxt pair worktree
`/root/worktrees/cs90/U63` (branch `cs90-U63`, base `d847892a6fcf5699640862316303b6344a3e4daf`).
**No pin bump** (U64 owns it).

## Branches merged (7/7, none skipped)

| unit | ast branch | sha | diff vs base (src+tests) |
|---|---|---|---|
| U54 | cs90-U54 | `003c49891a2b183f3a55d2ee99e17a2ac54d91a3` | +103 / −5 |
| U55 | cs90-U55 | `978697f0d35378ed89d47e367be60a41b3f33e7c` | +160 / −0 |
| U56 | cs90-U56 | `a0c4cd3c5bfbfd5818bf098024b3cb42c04e0f54` | +141 / −20 |
| U57 | cs90-U57 | `ceb8a83b8591fe8b276a9c184d09b939e4ef98ec` | +109 / −0 |
| U58 | cs90-U58 | `d4cf00563d4f23c072dbb915f399e62aafcffc76` | +146 / −1 |
| U59 | cs90-U59 | `040b8173b3a2d2ba21e730ae2f93dd7d1fa24069` | +326 / −0 |
| U60 | cs90-U60 | `b74ddeb909e99c51104e1827fe5669e4c7816769` | +135 / −8 |

No unit REPORT.md declares an empty ast branch (U60 reports `typed_declarations = 0` / `casts_removed = 0`
but its ast branch does replace 84 `inOp` calls, so it is a real merge — the "0 changes" skip applies to
no branch here).

Merge order U54 → U55 → U56 → U57 → U58 → U59 → U60 (merge commits `501d36a`, `382804d`, `2b2aada`,
`7c844a5`, `46708da`, `5fc60a3`, `e920210`), then one `npx tsup` dist rebuild (`94c38ec`), then this
report commit.

## Conflict resolution (sequential per-step merge-file; never union-concat)

Driver: `campaigns/cs90/tools/U63/merge-step.sh` — one `git merge --no-commit --no-ff` per unit, then a
per-step resolver over the conflicted files only; every step asserts no `<<<<<<<` survives before the
next merge starts (no unresolved block ever becomes the next step's `ours`).

- **src/csharpTranspiler.ts — 3 conflicts, all mechanical**: U55, U57, U60 each had exactly one
  empty-base add/add block at its own anchor; resolved ours+theirs verbatim at that anchor (the shared
  trailing `}`/blank tail stayed as context). U54, U56, U58, U59 auto-merged. No genuine 3-way block
  needed hand reconciliation — the seven families are disjoint call sites (`getArrayLength`→`.Count`,
  `isEqual(x,null)`, `isTrue`/ternary bool?, `add`→`+`, dict-receiver casts, loop-bounded `getValue`,
  `inOp`→`ContainsKey`).
- **tests/csharpTranspiler.test.ts — 0 conflicts** (each unit appends its own `describe` at EOF; git
  aligned the tails).
- **dist/ — conflicts in 6 of 7 merges** (every branch ships its own rebuilt bundle): take the incoming
  side per file, rebuild once at the end with `npx tsup` (the committed dist is that rebuild, so no
  branch's stale bundle ships).

Fidelity of the union, three independent checks:
1. each merge commit's `git diff <parent> -- src tests` equals the unit's own `git diff 404e9da <branch>`
   (stats match per unit, e.g. U59 `+194/+132`, U60 `+59/-8`);
2. union completeness: every `function`/`const`/method symbol added by any of the 7 branches is present
   in the merged `src/csharpTranspiler.ts` (0 missing of 63);
3. Σ unit numstat = merged numstat exactly: **+1120 / −34** on src+tests.

## Gates (merged tree)

| gate | result |
|---|---|
| `npx tsup` | build success (CJS + DTS) |
| `npx tsc -p tsconfig.json --noEmit` | clean |
| duplicate top-level/method names in `src/` | none |
| conflict markers in `src/`, `tests/` | none |
| `npx jest tests/csharpTranspiler.test.ts` | **166 passed** (base 116; +50 unit tests) |
| `npx jest` (full suite) | **13 suites / 829 tests passed** (base 779) |

## Emission parity of the merged printer (integration-specific)

Merged `dist` vs base-pin `dist` (`/root/worktrees/cs90-ast/pin`, 404e9da), **no ccxt hooks installed**,
`transpileCSharp(fileContent)` over 16 real `ts/src` files (14 random REST + `pro/binance.ts` +
`prediction/binance.ts`): 13 byte-identical, 3 differ by 1–2 lines, **all 4 differing lines are the U56
family** (source parens unwrapped around a printer-typed `bool` ternary condition, e.g.
`(isOptionMarkPrice) ? …` → `isOptionMarkPrice ? …`; semantically identical C#). 0 unclassified lines.
Script: `campaigns/cs90/tools/U63/parity-classify.cjs` (also `content-parity.cjs`).

Scoped ccxt regen through the merged printer on the **base** ccxt tree (hooks = the cs-strict S60/S61 set
only): `ccxt-perf-slot.sh --local npx tsx build/csharpTranspiler.ts --noTests binance bybit okx kraken gate`
→ 6 files / 13 lines changed, all U56 family (`isTrue(x) ? a : b` → `x == true ? a : b` ×8,
`!(x == true)` → `x != true` ×1, ternary-paren drop ×4 — incl. 4 lines in `Exchange.BaseMethods.cs`).
That diff is the
intended win of the U56 printer rule on printer-side type knowledge, not drift; the regen was reverted
(`git checkout -- cs/`), the ccxt worktree carries only REPORT.md. Rules of the other six units need
their own ccxt-side hook installers (they land with the U64 merge).

## Residual risk

- The 7 families are disjoint by construction but the merged printer has never run against the merged
  ccxt classifier (unit hook installers are on the unit ccxt branches): U64's full regen + farm build is
  the compile gate that proves the composed emission.
- `dist/` in this branch is a local rebuild of the merged src; the farm/pin consumer must rebuild once
  more in the merged worktree before `push-generator` if it re-merges anything on top.

## hotspot

`/root/worktrees/cs90-ast/U63/src/csharpTranspiler.ts` (+494/−21 vs base) and
`tests/csharpTranspiler.test.ts` (+626/−13) — the only files merged by hand.

## Shas

- merged code sha (src+tests+dist): **`94c38ec`** (dist rebuild on top of `e920210`)
- branch tip incl. this report: reported in the final summary / `git rev-parse cs90-integration`
