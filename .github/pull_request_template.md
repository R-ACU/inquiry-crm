## What changes

<!-- One or two sentences. Link the issue if there is one. -->

## How it was checked

- [ ] `npm test` (unit, API, RLS) passes
- [ ] `npm run test:e2e` passes, or the change does not touch the UI
- [ ] New or changed tables have RLS enabled and policies per command
- [ ] New SQL functions pin `search_path = ''`; `security definer` only with a reason in a comment
- [ ] No secrets, no real customer data, `grep -rn TESTCODE` is empty

## AI involvement

<!-- What was generated with an agent, what did you change or reject, and why. -->
