# Testing

Three layers, from fastest and narrowest to slowest and widest. All use
[Vitest](https://vitest.dev).

| Layer | What it covers | Run it | Time |
|---|---|---|---|
| **Unit** (`test/*.test.js`) | Pure logic and the database: filters, parsers, sync rules, migrations, the YouTube and Supabase helpers | `npm test` | seconds |
| **Component** (`test/components/*.test.jsx`) | One React component at a time in a simulated browser (jsdom) with [Testing Library](https://testing-library.com/): the status wheel, the sync banner, the server setup form… | `npm test` (same run) | seconds |
| **End to end** (`e2e/*.e2e.js`) | The real built app in a real Electron window, through the screens, the preload bridge and the database | `npm run test:e2e` | under a minute |

`npm test` runs the first two together (about 5 seconds). The end-to-end suite
is separate because it opens windows; it builds the app first
(`npm run build-renderer`), so it always tests what you would ship.

## Writing a component test

- Put it in `test/components/` and start the file with
  `// @vitest-environment jsdom`.
- Import `render`, `screen`, `cleanup` from `@testing-library/react`,
  `userEvent` from `@testing-library/user-event`, and
  `import "@testing-library/jest-dom/vitest"` for the `toBeInTheDocument()`
  style matchers. Call `afterEach(cleanup)`.
- The renderer only talks to the main process through `window.vault`. Give the
  test a fake: `window.vault = { cloudSync: { getConfig: vi.fn()… } }` (see
  `serverSetupSection.test.jsx`).
- jsdom has no layout engine and no `ResizeObserver`; stub the latter if the
  component measures itself (see `posterCard.test.jsx`).
- Find things the way a person would — by role and visible name
  (`getByRole("button", { name: "Retry now" })`) — not by CSS class.

## Writing an end-to-end test

`e2e/helpers.js` launches the built app with its **own throwaway data folder**
(`--user-data-dir`), so it never touches your library, and it runs even while
your normal copy of the app is open. `launchApp(dir)` returns
`{ app, page, errors }`, where `page` is a [Playwright](https://playwright.dev)
page and `errors` collects anything the page throws. `menuAction(app, "settings",
"Cloud Sync")` sends the same message the File menu does, to open a screen
without clicking through the operating system's menu.

Keep this suite small: each test should walk a whole path that the other layers
can't (the window, the database and the screens together). Anything that can be
checked on one component or one function belongs in the faster layers.

## What is deliberately not tested automatically

- **The phone app.** Its pure logic is covered by unit tests (`test/mobile*.test.js`)
  and every change is checked with a Metro bundle, but the screens have never been
  driven by a test — that needs a device or emulator.
- **Anything that talks to a real service** (TMDB, Steam, YouTube, a Supabase
  project). Those are exercised with fakes; the real thing is checked by hand.
