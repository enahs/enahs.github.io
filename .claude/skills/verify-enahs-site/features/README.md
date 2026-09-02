# enahs.github.io verification map

This directory is the maintained source for verifying the user-facing behavior of the site and its
generator. Read this index before driving the app, then follow the matching feature file.

## Baseline preconditions

- Launch with `control-site up`. The site answers at `http://localhost:3000`.
- Only one instance can exist. Port 3000 and the `./static` output path are both hardcoded.
- `control-site up` refuses a port held by a foreign process and never kills one.
- `EMAIL` defaults to `verify@example.com` and `GA_KEY` defaults to empty. Set them explicitly
  when a recipe names a different value.
- `BUILD_ENV` is unset at launch, which is dev mode. Production is `BUILD_ENV=PROD`.
- `control-site doctor` must report zero failures before you trust any result.
- Never drive an instance this verification run did not start.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Run `control-site restart` before any recipe that depends on a reload signal.
- Prefer rendered text, `href` values and route paths as handles. The site has no test ids.
- Treat every command as literal. Keep quoted markers, paths and flags unchanged.
- Fetch pages with `control-site get <path>` and drive the browser with `control-site browser`.
- Name every probe page `pages/verify-probe-<id>.html` so cleanup can find it.
- Restore the working tree with `control-site down`. Do not delete evidence.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Page proof is the `browser inspect` JSON plus a screenshot naming the page.
- Routing proof is the HTTP status code, the content type, and the served title.
- Reload proof is the load event count before and after the edit, plus a fetch of the URL the
  rebuild created.
- Build proof reads the value out of the served HTML, never out of the environment you set.
- Record the feature ID and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each file opens with an H1 title and one paragraph of user-visible behavior, then uses exactly
four H2 sections in this order.

1. `Sub-features` lists short IDs with one line each.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-site` starts with `Preconditions:` and pairs each user action with an
   exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

Keep implementation detail out of the map. Name user paths, stable handles, required state,
commands, and observable proof.

## Features

- [Published pages](./published-pages.md) covers every route rendering with its title, navigation,
  content and assets.
- [Clean URLs](./clean-urls.md) covers extensionless routing, asset serving, the writing
  subdirectory redirect, and the 404 path.
- [Hot reload](./hot-reload.md) covers the author's edit-and-see-it loop. Read its gotchas first,
  they govern how the whole recipe must be sequenced.
- [Build configuration](./build-config.md) covers dev versus production output, the analytics
  snippet, and the contact address.
- [Web vitals](./web-vitals.md) covers the homepage's Largest Contentful Paint, its layout
  stability, and the AVIF hero with its JPEG fallback.
