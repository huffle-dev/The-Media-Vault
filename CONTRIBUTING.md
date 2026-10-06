# Contributing

Thanks for looking. This is a personal project shared openly, so please keep expectations modest: I read everything but
may be slow, and I may say no to things that don't fit.

## Before you start

- **Bugs and ideas:** open an issue first (there are templates). For anything bigger than a small fix, say what you
  want to do before writing it, so we don't waste your time.
- **Security problems:** see [SECURITY.md](SECURITY.md); don't post them publicly.

## Running it

```bash
npm install
npm start          # the desktop app
npm test           # unit and component tests (must pass)
npm run test:e2e   # end-to-end tests on the real app
```

The phone app is in `mobile/`; its pure logic is tested by the same `npm test`. Running it on a phone needs an Expo
development build (see the README).

## What a good change looks like

- **Small and focused,** with the reason in the description.
- **Tested.** Logic goes in a pure function or module and gets a test (look at `test/` for the style: plain functions
  with fakes for the network and the database). A bug fix comes with a test that fails without it.
- **Matches what is there.** Same naming, comments that explain *why*, no new dependency unless it earns its place.
- **Doesn't break existing data.** A database change is a new migration (never edit an old one) and
  `test/schemaParity.test.js` must still pass; see [docs/database-migrations.md](docs/database-migrations.md).
- **Honest about privacy.** Anything that sends data somewhere new needs to be in [docs/privacy.html](docs/privacy.html)
  and the in-app notices.

By contributing you agree your work is released under the project's [MIT licence](LICENSE).
