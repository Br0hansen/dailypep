# DailyPep PWA – implementation plan

## Status

Implemented on `codex/product-ux-improvements` on 12 November 2026. All four workstreams below are complete for this milestone. The deferred items remain intentionally out of scope.

## Objective

Implement the highest-value, locally deliverable recommendations from the product review without adding dose recommendations, changing the fixed-schedule rule, or risking existing user data.

## Scope for this milestone

### Workstream A – First-run setup (P1)

- Let the user choose powder vial, premixed pen, or schedule-only setup.
- Show only fields relevant to the selected setup.
- Keep the quick path short and preserve the advanced wizard.
- State next to the time field that the time is displayed but does not send a notification.
- Add unit tests for all three setup variants and their data relationships.

Acceptance criteria:

- Powder setup still creates a peptide, vial and linked protocol.
- Pen setup creates a pen with volume/click metadata and a linked protocol.
- Schedule-only setup creates no vial and still creates a valid protocol.
- Existing blend behavior remains valid.
- No copy recommends a peptide, amount or protocol.

### Workstream B – Data safety and account transition (P1)

- Use the existing persistent-storage API and expose a clear storage result.
- Never silently replace the visible local workspace with an empty account workspace when local records exist.
- Before completing that transition, offer explicit choices that preserve both sources.
- Keep cloud backup revision protection unchanged.
- Add focused tests for storage/account transition helpers.

Acceptance criteria:

- Local records remain recoverable after sign-in and sign-out.
- The user sees record counts and makes an explicit choice before copying/replacing data.
- No automatic destructive merge or overwrite occurs.
- Unsupported persistent-storage APIs degrade safely.

### Workstream C – Accessibility and mobile ergonomics (P2)

- Implement complete keyboard navigation for the custom suggestion combobox.
- Add stable ARIA relationships and active-option state.
- Increase small interactive targets to at least 44×44 CSS pixels on touch layouts.
- Prevent sticky modal actions from obscuring the preceding control.
- Preserve reduced-motion behavior.

Acceptance criteria:

- Arrow keys, Enter, Escape and pointer selection work in peptide suggestions.
- Screen readers can associate the input, listbox and active option.
- Existing suggestion ordering remains prefix-first.
- Mobile primary and icon actions remain usable at 390 px width.

### Workstream D – Context and integration (P1/P2)

- Replace the global “Add plan” action with a context-appropriate primary action where practical.
- Add a direct route from an unlinked Today entry to container management/linking.
- Surface install/data-safety guidance after value has been created, without blocking daily use.
- Integrate workstreams, resolve conflicts, and verify the production PWA.

Acceptance criteria:

- Today and Plans retain a clear new-plan action.
- Inventory and Journal prioritize their own tasks.
- An unlinked dose offers a direct, understandable next step.
- All automated tests, production build and PWA checks pass.
- Chromium mobile and WebKit iPhone smoke flows pass.

## Deferred

- Web Push scheduling and delivery backend.
- Automatic two-way cloud sync.
- Native biometric lock.
- Large-image migration to object storage.
- Full analytics infrastructure.

These need additional product, infrastructure and privacy decisions. The current milestone must not imply that they already exist.

## Verification

1. `npm test`
2. `npm run build`
3. `npm run check:pwa`
4. Mobile smoke flow at 390×844.
5. WebKit iPhone-emulated first-run and offline reload.
6. Review all new Norwegian and English copy.
7. Confirm the diff does not add dose or protocol recommendations.

Completed verification:

- 70 unit tests passed.
- Production TypeScript/Vite build passed.
- PWA worker checks passed, including offline navigation and update handling.
- WebKit with iPhone 15 emulation passed first-run, schedule-only, keyboard suggestion, contextual inventory routing and offline reload.
- Chromium at 390×844 passed the first-run modal and touch-target smoke check.
