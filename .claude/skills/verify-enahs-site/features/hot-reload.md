# Hot reload

An author edits a page, a template or a stylesheet and the open browser tab refreshes itself with
the rebuilt site. The dev server watches the source directories, rebuilds on every change, and
pushes a reload over a WebSocket that a script in every dev page listens on.

## Sub-features

- `reload-connect` opens the WebSocket from every dev page and logs the greeting.
- `reload-rebuild` rebuilds the whole site when a watched source file changes.
- `reload-refresh` refreshes the open tab after a successful rebuild.
- `reload-newpage` makes a newly created page reachable without restarting the server.
- `reload-reconnect` restores the connection after it drops. This one is currently broken.

## How to get to it (user POV)

- Start the dev server and open any page in a browser.
- Save a change to a file under `pages/`, `assets/` or `templates/`.
- Create a new file under `pages/` and open its route.

## Driving it with control-site

Preconditions:

- Run `control-site restart` immediately before this recipe. Not `up`, and not `doctor` followed
  by a drive. A restart is the only way to guarantee no stale WebSocket goroutine is waiting to
  swallow the reload signal.
- Exactly one browser drives the server at a time.
- No file matching `pages/verify-probe-*.html` exists.

- **Connect.** Open any dev page. Run
  `control-site browser inspect --url http://localhost:3000/about`. The `scripts` array contains
  `/assets/js/ws.js` and `console` contains `new websocket connection opened!`.
- **Edit, rebuild and refresh.** Create a page while the tab is open. Run
  `control-site browser watch-reload --url http://localhost:3000/about --create-page pages/verify-probe-r1.html --marker VerifyProbeR1`.
  The result has `reloaded` true and `loadEvents` holds two entries, the second roughly half a
  second after the first. That second load event is the refresh.
- **New page reachable.** Fetch the route the rebuild created. Run
  `control-site get /verify-probe-r1`. The status line is `200`, the title is
  `ENAHS | VerifyProbeR1` and the body contains `<h1>VerifyProbeR1</h1>`. Fetching this proves the
  generator really reran, which a log line alone does not.
- **Server saw it.** Run `control-site log 6`. It contains `Change detected in
  'pages/verify-probe-r1.html'` followed by `Build successful. Site is updated.`
- **Reconnect after a drop.** Read `pageErrors` from the `watch-reload` result. It currently
  contains `TypeError: Assignment to constant variable.` thrown from `ws.onclose` in
  `assets/js/ws.js`. Record this sub-feature as failing. The reload still worked because the page
  navigation opened a fresh socket, not because the retry ran.
- **Proof.** Keep `hot-reload-before.png` and `hot-reload-after.png`, the load event timings, the
  fetched body of the new route, and the server log excerpt. The two screenshots are expected to
  look identical, because the refreshed tab stays on `/about` while the change landed on a new
  route. They evidence a transparent refresh, so the load event count and the fetched new route
  carry the actual proof.

## Gotchas

- **A closed WebSocket leaves a goroutine that consumes one future reload.** Each connection
  spawns a receiver that never learns the socket died. After a browser exits, that ghost is still
  first in line for the next reload signal, writes to a dead socket, logs `broken pipe`, and the
  live tab never refreshes. One ghost is enough to make a healthy feature look broken. Restart
  before every reload drive.
- **`doctor` creates a ghost of its own.** Its liveness probe opens and closes a WebSocket. Running
  `doctor` and then a reload drive without a restart in between will fail, and the failure is the
  probe's fault, not the app's.
- **A change with no listener wedges the watch loop permanently.** The reload send is unbuffered
  with no timeout, so a rebuild that finds no receiver blocks the loop forever. The HTTP server
  runs on its own goroutine and keeps serving the last build, so the site looks healthy while
  every later edit is silently ignored. `doctor` detects this and reports `WEDGED`.
- **Detecting the wedge also clears it.** Connecting drains the queued signal, so the next thing
  to connect receives a reload it did not ask for. Treat a `WEDGED` verdict as requiring a restart
  before any further proof.
- **Prefer creating a probe page over editing a real one.** Creating is non-destructive and its
  new route is directly fetchable, which gives you a second independent proof of the rebuild.
- **`touch` alone may not trigger a rebuild.** macOS reports a bare timestamp update as a chmod
  event, which the watcher ignores. Write real content.
- **New subdirectories are not watched.** The watcher registers directories once at startup, so a
  page created inside a brand new folder will not be picked up until a restart.
- **`static/` is not watched,** which is what stops the rebuild from triggering itself. Do not add
  it to the watch list.
