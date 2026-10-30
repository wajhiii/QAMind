# React: notes for QA

Load this when the project depends on `react` (plain Vite or webpack app, Create React App, React Router or Remix,
Gatsby, or React underneath Next.js). React is only the browser half of the product: read it for UI defects, and test
every permission or validation rule against the API as well. For Next.js also load `nextjs.md`.

## Detect it
- `package.json` dependencies `react` and `react-dom`. The major version matters: 18 added concurrent rendering, and
  19 added form Actions (`useActionState`, `useOptimistic`, `use`).
- Entry file calling `createRoot(...)` (client-only app) or `hydrateRoot(...)` (server-rendered app), usually
  `src/main.tsx`, `src/index.tsx` or `src/index.js`.
- Build tool markers: `vite.config.*` plus `@vitejs/plugin-react`; `react-scripts` (Create React App, now
  unmaintained); `webpack.config.*`; `next` (see `nextjs.md`); `react-router` framework mode or `@remix-run/*`;
  `gatsby`.
- Companion libraries worth noting because they hold the logic: `react-router`, `@tanstack/react-query` or `swr`
  (server-state cache), Redux Toolkit, Zustand, React Hook Form or Formik, Zod or Yup (schemas).

## Where to look in the source
- Routes: `createBrowserRouter([...])`, `<Route path=...>`, or a file-based `src/routes` / `src/pages` folder.
  Pattern: `grep -rnE "path:|<Route |createBrowserRouter" src`.
- Backend calls: `grep -rnE "fetch\(|axios|useQuery|useMutation|apiClient" src` gives the endpoint list the UI
  actually uses. Diff it against the API spec or route files to find endpoints the UI never calls (often the least
  tested).
- Guards: components named `ProtectedRoute`, `RequireAuth`, `PrivateRoute`, hooks like `useAuth` or `usePermission`.
  These only hide UI. Treat every one as a lead for a direct API probe as a lower role.
- Pages and components live in `src/pages`, `src/views`, `src/components`; shared state in `src/store`, `src/context`,
  `src/hooks/use*.ts`.
- Forms: `grep -rnE "onSubmit|handleSubmit|useForm|<form" src`. For each, find the client schema and ask whether the
  server enforces the same rules (it often does not).
- Dangerous sinks: `grep -rnE "dangerouslySetInnerHTML|href=\{|innerHTML|target=\"_blank\"" src`. User-controlled data
  in `href` can carry a `javascript:` URL; `_blank` links want `rel="noopener"`.
- Config: `.env*` files. Vite exposes variables starting `VITE_` and Create React App exposes `REACT_APP_` to everyone
  who loads the bundle. Flag secret-looking values behind those prefixes.
- Effects: `grep -rn "useEffect(" src`, then check each dependency array and each cleanup function by eye.

## Run it and its tests
- Read the `scripts` block first. Typical: `npm run dev` (Vite, port 5173), `npm start` (Create React App, port 3000),
  `npm run build` then `npm run preview` (Vite) or a static server over `build/`.
- Test the production build as well as the dev server. In development, Strict Mode deliberately mounts, unmounts and
  remounts components, so duplicate requests and logs seen only in dev are not bugs by themselves.
- Unit and component tests: Jest or Vitest with React Testing Library (`@testing-library/react`, `user-event`), files
  named `*.test.tsx` / `*.spec.tsx` beside the component or under `__tests__/`. One test:
  `npx vitest run path/to/file.test.tsx -t "name"` or `npx jest path/to/file -t "name"`. End to end: Playwright
  (`playwright.config.*`, `e2e/` or `tests/`) or Cypress (`cypress/`).
- Regression test in the project's style: put it next to the component, render it the way sibling tests do (same
  providers, router and query client wrappers), query by role and label as a user would, drive it with `user-event`,
  mock the network at the layer the other tests mock (MSW handlers or a mocked client), then assert on what the user
  sees. For a race, make the first response slower than the second.
- Frontend tests normally need no database. If an end-to-end suite does, check which environment its config points at
  before running it, and never run it against shared data.

## Common bug patterns
- Fetch race in effects: change the selection or search text quickly; a slow earlier response can overwrite a newer
  one, so the page shows results that do not match the control. A cleanup flag or request abort in the effect is the
  usual fix.
- Effect cleanup missing: navigate away and back several times; look for growing numbers of timers, listeners, polling
  requests or sockets in the network and console tools.
- Side effects in the wrong place: a purchase, submit or delete fired from an effect repeats on every visit or Back
  navigation. User actions belong in event handlers.
- Stale closures: a timer, listener or async callback keeps an old value. Symptom: counters skip, or a save sends the
  value from a few keystrokes ago. Click or type several times in a row and compare.
- Wrong or missing dependency array: a filter change does not refetch, or an effect that sets state without limits
  causes a render loop and a request storm. Stop the page quickly if the network tab floods.
- Keys: index keys or random keys in lists that reorder, filter, insert or delete. Type into a row, then delete or
  reorder another row; text jumping to a different row, lost focus, or inputs resetting means bad keys. Keying a form
  by record id is how a component resets when the record changes; if switching records keeps the old values, state is
  not keyed.
- Double submit: click twice fast, press Enter then click, or submit and refresh. The button must be disabled or
  ignored while pending; confirm on the server side with the API runner's `repeat` option.
- Controlled and uncontrolled inputs: a `value` without `onChange` gives a field nobody can type in; a value that
  starts `undefined` or `null` and later becomes a string triggers a console warning and odd resets. Check the console
  after opening every edit form.
- Hydration mismatches (server-rendered React): console warnings, flashes of different text, wrong time zone or locale
  on first paint, or buttons that do nothing until a later render. Usual causes are dates, `Math.random`, `window`
  checks and browser-only storage read during render.
- Missing loading, empty and error states: spinner that never ends after a failed call, an empty list shown as a blank
  page, or a `catch` that swallows the error and shows success. Compare the console and network tabs with what the
  user is told.
- Render crashes: a white screen after valid but unusual data (empty arrays, null optional fields, very long strings,
  RTL text) means no error boundary or an unguarded property access.
- Server-state cache across users: after sign-out and sign-in as another role, previous data flashing in lists means
  the query cache or store was not cleared. Always check this when switching roles.
- Client-only authorization: a hidden menu item with an open API behind it. Call the endpoint directly as a lower role
  (see `permissions-and-data-isolation.md`).

## Environment gotchas
- Dev proxy settings (`proxy` in Create React App, `server.proxy` in Vite) hide cross-origin errors that appear once
  the frontend and API sit on different hosts. If staging is cross-origin, test there and watch for CORS failures.
- Environment variables are baked into the bundle at build time. A changed `.env` needs a rebuild or restart; a
  deployed bundle can point at the wrong API base URL.
- A service worker (PWA templates) can keep serving an old bundle. Use a fresh browser profile or clear site data
  before reporting "fixed" or "not fixed".
- Source maps in production reveal original source; note it if reachable, without bulk copying.
- Browser extensions inject DOM and can trigger false hydration warnings; the browser tools start from a clean
  profile.

## See also
`forms.md`, `permissions-and-data-isolation.md`, `api-testing.md`, `nextjs.md`, `test-design.md`.
