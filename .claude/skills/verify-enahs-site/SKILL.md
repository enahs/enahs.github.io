---
name: verify-enahs-site
description: Drive the enahs.github.io static site for real and capture proof. Builds the Go generator, starts the dev server, exercises pages in headless Chrome, and checks build output. Use before claiming any change to pages, templates, CSS, the generator, or the dev server works.
---

# Verify enahs.github.io

This repo is a Go static site generator. `internal/build` renders `pages/*.html` through
`templates/*.tmpl` into `static/`. Two commands sit on top: `cmd/build` renders once and exits,
`cmd/serve` renders, watches the sources, and pushes a WebSocket reload to the open browser.

The surface a user touches is the rendered website. The surface an author touches is the dev
server's edit-and-see-it loop. Prove both against a real browser, never against the template
source.

## Hard constraints, read before launching

- **One instance at a time.** `cmd/serve` hardcodes port 3000 and `internal/build` hardcodes
  `./static`. Two runs cannot coexist. `control-site up` refuses to start when port 3000 belongs
  to a process it did not start, and it never kills a foreign process.
- **A build wipes `static/`.** That directory is gitignored build output, so overwriting it is
  expected and safe. Never treat a file under `static/` as a source you may edit.
- **Every closed WebSocket leaves a goroutine that eats one future reload.** This governs the
  whole hot-reload recipe. See `features/hot-reload.md` before driving it.

## Launch

```bash
.claude/skills/verify-enahs-site/control-site up
```

Ready when it prints `up: pid <n> on http://localhost:3000`. It waits for both the `Listening on`
log line and a successful request, so a printed pid means the site is actually answering.

`up` compiles `cmd/serve` to a binary in the state directory rather than using `go run`, because
`go run` spawns a grandchild that survives a kill of the pid you hold.

The server starts in dev mode with `BUILD_ENV` unset and `EMAIL=verify@example.com`. Override
`EMAIL` or `GA_KEY` in the environment when a recipe needs them.

Use `control-site restart` to get a clean server. Any hot-reload drive requires it.

## Doctor

```bash
.claude/skills/verify-enahs-site/control-site doctor
```

Run this first whenever anything looks off. It checks that the process is alive, that port 3000
belongs to that pid and not a stranger, that the home page, a clean URL and the stylesheet all
answer, that the dev reload script is injected, and that the log holds no build errors.

Its last check is the one that matters most. It opens a WebSocket and listens for three seconds.
A healthy server sends `connection successful` and goes quiet. A wedged server immediately sends
an unsolicited `reload`, which means the watch loop was blocked on a queued signal. Doctor reports
that as a failure and tells you to restart, because the probe itself drained the block and left a
ghost receiver behind.

Exit code is the number of failed checks.

## Drive

Read `features/README.md`, then the file for the feature you are proving. Use the exact commands
there. Three ways to drive the app:

```bash
control-site get /about                       # HTTP request, prints status line and body
control-site browser inspect --url http://localhost:3000/about --screenshot about.png
control-site browser watch-reload --url http://localhost:3000/about \
    --create-page pages/verify-probe-<id>.html --marker <Marker>
```

`browser inspect` returns JSON with the document title, first heading, visible text, every link
href, image load state, script sources, and the computed body font and alignment. Assert against
those fields, not against a template file.

It also returns `mainDocTop` and `contentReachable`, which say whether the page's content begins
at or below the scroll origin. A false `contentReachable` means part of the page cannot be
scrolled to. Check it on the longest article after any layout change.

Prefer stable handles. Match on rendered text, `href` values and route paths. The site has no
test ids and almost no interactive elements, so text and routes are the handles.

## Evidence

Everything lands in `$TMPDIR/verify-enahs-site/artifacts`. Print the path with
`control-site artifacts`. Cleanup never touches it.

Proof standards for this repo:

- Drive the running site over HTTP or in the browser. Reading `pages/` or `templates/` proves
  nothing, and reading `static/` only proves the generator ran.
- Capture the action and the result. For hot reload that means the load event count before and
  after the edit, not just a final screenshot.
- Prove the side effect too. A rebuild is proven by fetching the newly generated URL, not by the
  server logging `Build successful`.
- Screenshot with the page identity visible, so the artifact names which page it is.
- Never assert a build-time value from the environment you set. Fetch the rendered page and read
  the value out of the served HTML.

## Cleanup

```bash
.claude/skills/verify-enahs-site/control-site down
```

Kills only the pid recorded at launch, removes the run file and the compiled binary, deletes any
`pages/verify-probe-*.html` a drive created, and rebuilds `static/` so the working tree is back to
a plain dev build. Evidence survives. Run it after a failed attempt too, or the next `up` will
refuse on a port it thinks a stranger owns.

Confirm with `git status --short` that no `pages/verify-probe-*.html` remains.

## Helpers

All three live in this directory and are executable.

- `control-site` is the entry point. Run it with no arguments for the command list.
- `cdp.mjs` drives headless Chrome over the DevTools Protocol. It has no npm dependencies and
  uses Node's built-in WebSocket, so there is nothing to install. Set `CHROME_BIN` if Chrome is
  not at the default macOS path.
- `ws-probe.mjs` connects to `/ws` and reports what the server sends. `--expect quiet` detects a
  wedged watch loop, `--expect reload` waits for a reload signal.
