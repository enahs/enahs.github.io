# Published pages

Every file under `pages/` becomes a page on the site with its own title, the shared navigation,
the Source Code Pro typeface, and any images it references. A reader lands on one of five routes
and sees finished content, not a template.

## Sub-features

- `pages-home` renders the hero image at `/`.
- `pages-about` renders the About heading and biography.
- `pages-projects` renders the Projects heading and all three outbound project links.
- `pages-writing` renders the article index and the article itself.
- `pages-nav` shows `About` in the navigation on the homepage and `Home` everywhere else.
- `pages-typography` applies Source Code Pro to body text on every route.
- `pages-reachable` starts every page's content at or below the scroll origin, so a long
  article opens on its heading rather than mid-body.

## How to get to it (user POV)

- Open `http://localhost:3000/` in a browser.
- Choose `About`, `Projects` or `Writing` in the navigation on any page.
- Choose `Home` in the navigation from any page other than the homepage.
- Choose the article link inside the writing index.

## Driving it with control-site

Preconditions:

- `control-site doctor` reports zero failures.
- `EMAIL` is `verify@example.com`, the launch default.

- **Homepage.** Open the site root. Run
  `control-site browser inspect --url http://localhost:3000/ --screenshot home.png`.
  The title is `ENAHS | Home`, `images` holds one entry whose `src` is `/assets/img/ghibli.jpg`
  with `loaded` true and alt text `a handsome guy in an armchair`.
- **Homepage navigation.** Read `links` from the same result. It contains `/about` and does not
  contain `/`, because the homepage offers About in place of Home.
- **About page.** Choose `About`. Run
  `control-site browser inspect --url http://localhost:3000/about --screenshot about.png`.
  The title is `ENAHS | About Me`, the heading is `About Me`, and the text mentions Judo.
- **Navigation on an inner page.** Read `links` from the About result. It contains `/`,
  `/projects`, `/writing` and a `mailto:` entry, and does not contain `/about`.
- **Projects page.** Choose `Projects`. Run
  `control-site browser inspect --url http://localhost:3000/projects --screenshot projects.png`.
  The heading is `Projects` and `links` contains `https://www.playcrossle.com`,
  `https://www.interviewquery.com` and `https://www.skada.io`, in that order. Crossle is
  listed first.
- **Writing index.** Choose `Writing`. Run
  `control-site browser inspect --url http://localhost:3000/writing/ --screenshot writing.png`.
  The heading is `Writing` and `links` contains
  `/writing/github-site-with-go-templates`.
- **Article.** Choose the article link. Run
  `control-site browser inspect --url http://localhost:3000/writing/github-site-with-go-templates`.
  The page loads and its title begins `ENAHS | `.
- **Typography.** Read `fontFamily` from any result. It is `"Source Code Pro", monospace`, which
  proves the Google Fonts stylesheet resolved rather than falling back.
- **Nothing stranded above the scroll origin.** Inspect the longest page. Run
  `control-site browser inspect --url http://localhost:3000/writing/github-site-with-go-templates`.
  `contentReachable` is true and `mainDocTop` is `8`, the body margin. Repeat on every route.
  A negative `mainDocTop` means content sits above scroll position zero and no amount of
  scrolling will reveal it.
- **Centering still applies where it fits.** Read `mainDocTop` on `/about`, which reports well
  above `8` at every viewport. That gap is the centering, and `8` is the body margin, the value a
  page takes when it top-aligns. Do not read `8` as a failure on its own. A page taller than the
  viewport is supposed to top-align, so `/` at `1280x720` and `/projects` at `390x844` both report
  `8` while behaving correctly. Judge centering only on a page that fits its viewport.
- **Proof.** Keep the five screenshots and the five JSON results. Each names its route and shows
  the navigation.

## Gotchas

- Use `/writing/` with the trailing slash when inspecting in the browser. Without it the server
  answers `301` and the redirect adds a load event that confuses a reload count.
- `fontFamily` reports the declared stack even when the network font failed. Confirm the
  screenshot renders monospace rather than trusting the string alone.
- The homepage is the only page whose template data carries a `name` key, and that key is what
  drives the navigation swap. A new page will show `Home`, never `About`.
- The `mailto:` link reflects whatever `EMAIL` was set at build time, so its value differs between
  a verification run and production. Assert the scheme and shape, not a fixed address.
- **The body uses `align-items: safe center` and the `safe` keyword must stay.** Plain
  `align-items: center` centers a flex item taller than the viewport by pushing its top above the
  scroll origin, which strands the heading and the opening paragraphs where nothing can scroll to
  them. This shipped once. `contentReachable` is the check that catches it, so run it on the
  longest article after any change to layout CSS.
- A browser too old to understand `safe` drops the whole declaration and falls back to top
  alignment. That loses the centering but never strands content, so it degrades safely.
