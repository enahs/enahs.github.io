# Clean URLs

A reader reaches every page without typing `.html`. The dev server resolves an extensionless path
to the matching HTML file, serves real assets untouched, and returns a plain 404 for anything that
does not exist.

## Sub-features

- `urls-extensionless` serves `/about` from `about.html`.
- `urls-nested` serves a nested article without its extension.
- `urls-directory` redirects `/writing` to `/writing/` and then serves its index.
- `urls-assets` serves CSS, images and JavaScript with correct content types.
- `urls-missing` returns 404 for an unknown path.

## How to get to it (user POV)

- Type an extensionless address such as `http://localhost:3000/about`.
- Choose any navigation link, all of which are extensionless.
- Load any page, which pulls the stylesheet and the reload script by path.

## Driving it with control-site

Preconditions:

- `control-site doctor` reports zero failures.

- **Extensionless page.** Request the About route. Run `control-site get /about`. The status line
  is `200` and the body contains `<title>ENAHS | About Me</title>`.
- **Nested article.** Request the article without an extension. Run
  `control-site get /writing/github-site-with-go-templates`. The status line is `200`.
- **Directory redirect.** Request the writing index without a trailing slash. Run
  `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/writing`. The result is `301`.
  Then run `curl -sSL http://localhost:3000/writing | grep -o '<title>[^<]*</title>'` and confirm
  `ENAHS | Writing`.
- **Stylesheet.** Run
  `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3000/assets/css/main.css`.
  The result is `200 text/css; charset=utf-8`.
- **Image.** Run the same command against `/assets/img/ghibli.jpg`. The result is `200 image/jpeg`.
- **Reload script.** Run the same command against `/assets/js/ws.js`. The result is
  `200 text/javascript; charset=utf-8`.
- **Missing page.** Run `control-site get /nope`. The status line is `404` and the content type is
  `text/plain`.
- **Proof.** Save the status line and content type for every path above in one table, and keep a
  `browser inspect` result showing `images[0].loaded` true, which proves an asset path resolved in
  a real browser rather than only under curl.

## Gotchas

- The resolver tries the literal path first and only then appends `.html`. A source file named
  `foo` with no extension would shadow `foo.html`.
- `/writing` is a redirect, not a page. Any check that forbids redirects must request `/writing/`.
- A 404 body is plain text from the Go file server, not a styled site page. Do not assert site
  navigation on it.
- The published GitHub Pages site resolves clean URLs through its own rules, not this server's.
  A routing result here is evidence about local development only.
