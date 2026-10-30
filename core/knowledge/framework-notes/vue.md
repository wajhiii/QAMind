# Vue: notes for QA

Load this when the project depends on `vue` (Vue 3 with Vite, a legacy Vue 2 or Vue CLI app, Quasar, or Nuxt). Vue is
the browser half of the product; verify permissions and validation against the API too. Nuxt adds its own server
routes, which this file only points at.

## Detect it
- `package.json` dependency `vue`. Version 3 uses `createApp(...)` in `src/main.ts` / `main.js`; version 2 uses
  `new Vue(...)` and usually Vuex, and is out of support.
- Single-file components (`*.vue`); `vite.config.*` with `@vitejs/plugin-vue`; `vue.config.js` and `@vue/cli-service`
  for the older Vue CLI.
- Router and state libraries: `vue-router`, `pinia` (`defineStore`), `vuex` (older), `@tanstack/vue-query`.
- Nuxt: `nuxt` dependency, `nuxt.config.ts`, `app.vue`, `pages/` (file-based routes), and `server/api/` for backend
  handlers. Treat `server/` as backend code and audit it like an Express or Next.js route.
- Style of component code: Options API (`export default { data() {...} }`) or Composition API (`<script setup>`,
  `ref`, `reactive`).

## Where to look in the source
- Routes: `src/router/index.ts` (`createRouter`, `routes: [...]`), with `meta` fields such as `requiresAuth` or
  `roles`, `beforeEnter` hooks and a global `router.beforeEach`. Pattern:
  `grep -rnE "beforeEach|beforeEnter|beforeResolve|requiresAuth|meta:" src`.
- Views and components: `src/views`, `src/pages`, `src/components`; stores in `src/stores` (Pinia) or `src/store`;
  shared logic in `src/composables/use*.ts`.
- Backend calls: `grep -rnE 'axios|fetch\(|\$fetch|useFetch|apiClient' src`. This is the endpoint list the UI really
  uses; compare with the API spec.
- Forms: `grep -rnE "v-model|@submit|vee-validate|FormKit|useForm" src`. Check the client rule against the server
  rule.
- Risky template features: `grep -rn "v-html" src`; `:href` bound to user data; `v-for` without `:key`
  (`grep -rn "v-for" src` and look for missing keys).
- Config: `.env*` with `VITE_` variables (shipped to the browser) or `VUE_APP_` in Vue CLI. Report secret-looking
  names, not values.

## Run it and its tests
- Read `scripts` in `package.json`. Typical: `npm run dev` (Vite, port 5173), `npm run serve` (Vue CLI, port 8080),
  `npm run dev` (Nuxt, port 3000), then `npm run build` and `npm run preview` for the production bundle.
- Test tools recommended by the Vue team: Vitest for unit and component tests, `@vue/test-utils` for mounting, Testing
  Library for user-style queries, Playwright or Cypress for end to end. Files are `*.spec.ts` or `*.test.ts` beside
  the component or in a `tests/` folder; Vitest finds them by name.
- Run: `npm test` (watch mode by default for `vitest`), `npx vitest run path/to/file.spec.ts -t "name"`; end to end
  `npx playwright test -g "name"`.
- Regression test in the project's style: mount the component with the same helper and plugins sibling tests use
  (router, store, i18n), set up the failing input, trigger the user action, wait for the DOM update (`await` the
  trigger call or `nextTick`), then assert on the rendered text or emitted event. For a route guard, create the router
  with the project's routes and navigate to the protected path as a signed-out user.
- Tests that touch an API should mock it or point at a disposable environment; never at shared data.

## Common bug patterns
- Lost reactivity: destructuring a reactive object into plain variables, replacing a whole reactive variable, using
  `reactive()` for a primitive, or reading a nested ref in a template without unwrapping. Symptom: the screen stops
  updating after a certain action while the data is clearly changing in the network response.
- Update timing: the DOM changes on the next tick, not immediately, so code that reads the DOM right after setting
  state sees old content. In the UI this shows as focus, scroll or measurement glitches after an action.
- `v-for` keys: missing keys or index keys in lists that reorder or delete rows. Type in a row's input, then delete or
  reorder others; text appearing in the wrong row means in-place patching reused the element.
- `v-if` plus `v-for` on one element and mutating `sort()` or `reverse()` inside computed values (these reorder the
  source array); look for lists that change order on their own after unrelated actions.
- Same component, new route params: moving from `/items/1` to `/items/2` normally reuses the component instance, so a
  fetch placed only in a mount hook does not rerun and the old record stays. Navigate between two records via a link
  and compare titles with a hard reload.
- Watchers: a `watch` that is not immediate misses the initial value; a watcher that updates its own source loops.
  Look for first-load states that differ from later ones.
- Shared debounce or throttle created at module level is shared by every component instance, so two search boxes
  interfere. Type in two instances close together.
- Router guards versus API auth: a guard that redirects signed-out users does nothing for the API. Call each endpoint
  behind a guarded page directly as anonymous and as a lower role. Guards that call the `next` callback twice,
  redirect in a loop, or run before the stored session has been restored cause flashes of the login page or of
  protected content on hard reload; test each guarded URL by opening it fresh.
- Guards that look only at the leaf route's `meta`: nested routes inherit protection only if the guard checks every
  matched record. Test child paths of a protected parent.
- Pinia or Vuex state not reset on sign-out: next user sees the previous user's lists, filters or drafts. Sign out and
  in as another role in the same tab and look for leftovers. Persisted stores (saved to local storage) also survive
  reloads.
- Nuxt or other server rendering: module-level state shared between requests can leak one visitor's data to another;
  hydration warnings in the console point to server/client differences.
- Numeric inputs: `v-model` on a number field yields strings unless `.number` is used, and an empty field can become
  an empty string where the API expects null. Send blank, zero and negative values.
- Double submit: forms without a pending flag send twice on double click or Enter plus click.

## Environment gotchas
- Hot reload keeps component state across edits; reload the page fully before judging a behaviour.
- `VITE_` and `VUE_APP_` variables are fixed at build time; a stale build points at the wrong API.
- A dev proxy (`server.proxy`, `devServer.proxy`) masks cross-origin errors that appear on staging.
- Vue Devtools and development warnings are stripped from production builds; judge against the production bundle for
  performance and for missing-key issues that only warn in development.
- Nuxt keeps a build cache (`.nuxt`, `.output`); if behaviour contradicts the source, rebuild.

## See also
`forms.md`, `permissions-and-data-isolation.md`, `auth-and-sessions.md`, `api-testing.md`, `react.md` (similar client
patterns).
