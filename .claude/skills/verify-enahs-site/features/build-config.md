# Build configuration

The same source tree produces a development build and a production build. Development injects the
live reload script. Production leaves it out and, when an analytics key is supplied, adds the
Google Analytics snippet. The contact address in the navigation comes from the environment too.

## Sub-features

- `config-dev-script` includes the reload script when `BUILD_ENV` is unset.
- `config-prod-script` excludes the reload script when `BUILD_ENV` is `PROD`.
- `config-analytics-on` emits the analytics snippet when `GA_KEY` is set.
- `config-analytics-off` emits no analytics markup when `GA_KEY` is empty.
- `config-email` renders `EMAIL` into the navigation contact link.
- `config-escaping` should neutralize markup in an injected value. This one is currently broken.

## How to get to it (user POV)

- A reader loads the published site and is measured by analytics, or is not.
- A reader chooses `Contact` in the navigation and their mail client opens.
- An author runs `make build` locally, or the release workflow builds with `BUILD_ENV: "PROD"`.

## Driving it with control-site

Preconditions:

- Stop the dev server first with `control-site down`. These recipes rebuild `static/` directly and
  a running watcher only adds noise.
- `static/` may be overwritten freely. It is gitignored build output.

- **Production build.** Build the way the release workflow does. Run
  `GA_KEY="G-VERIFY123" EMAIL="prod@example.com" control-site build prod`.
- **Reload script excluded.** Run `grep -c 'assets/js/ws.js' static/index.html`. The count is `0`.
  This is the check that keeps a development-only script out of the published site.
- **Analytics present.** Run `grep -o 'gtag/js?id=[^"]*' static/index.html`. The output contains
  `G-VERIFY123`. Run `grep -o 'gtag("config", "[^"]*")' static/index.html` and confirm the same key.
- **Contact address.** Run `grep -o 'mailto:[^"]*' static/index.html`. The output is
  `mailto:prod@example.com`.
- **Development build.** Rebuild without the production flag. Run
  `EMAIL="verify@example.com" control-site build dev`.
- **Reload script included.** Run `grep -c 'assets/js/ws.js' static/index.html`. The count is `1`.
- **Analytics absent.** Run `grep -c 'googletagmanager' static/index.html`. The count is `0`,
  because an empty key suppresses the whole block.
- **Escaping.** Build with a value that contains markup. Run
  `GA_KEY='G-X"); alert(1); //' BUILD_ENV=PROD go run ./cmd/build`, then
  `grep -n 'gtag("config"' static/index.html`. The rendered line currently reads
  `gtag("config", "G-X"); alert(1); //");`, which means the value escaped its string literal and
  became executable code. Record this sub-feature as failing.
- **Restore.** Run `EMAIL="verify@example.com" control-site build dev` so the tree is left on a
  plain development build.
- **Proof.** Keep the grep output for both builds side by side, and the rendered escaping line.

## Gotchas

- **The gate is inverted.** The template asks whether `BUILD_ENV` is empty, so any environment that
  forgets to set it ships the development reload script. Only `BUILD_ENV=PROD` in the release
  workflow keeps it out. Treat an unset variable as a production defect, not a default.
- **The generator uses `text/template`, not `html/template`,** so no value is contextually escaped.
  That is what the escaping check above demonstrates. Every environment value lands in the output
  verbatim.
- **Verify from the rendered file, never from the variable you exported.** Asserting on your own
  environment proves nothing about the template.
- **`control-site build` wipes `static/` first,** so a grep that finds nothing may mean the build
  failed rather than that the markup was correctly omitted. Confirm the file exists and has
  content before reading a zero count as a pass.
- **Every page carries the head template,** so these checks hold on any route. `index.html` is
  chosen only because it is the shortest.
- **The published site is built by the GitHub Actions workflow,** which sets `BUILD_ENV`, `EMAIL`
  and `GA_KEY` from repository variables. A local production build proves the template logic, not
  the deployed values.
