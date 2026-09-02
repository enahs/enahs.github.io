# Web vitals

A reader on a phone sees the hero image finish painting well inside the Core Web Vitals budget,
and nothing on the page jumps while it loads. The homepage hero is the Largest Contentful Paint
element on the site, so its bytes and its reserved box are what these numbers measure.

## Sub-features

- `vitals-lcp` keeps Largest Contentful Paint at or under 2500ms on an emulated mobile network.
- `vitals-cls` keeps Cumulative Layout Shift at 0 by reserving the hero's box before it loads.
- `vitals-avif` serves the AVIF hero to browsers that accept it, and the JPEG to those that do not.
- `vitals-weight` keeps the homepage transfer under 200KB.

## How to get to it (user POV)

- Open `http://localhost:3000/` on a slow connection and watch the hero paint.
- Watch the navigation under the image while the page loads. It must not move.
- Open any other route. None of them carries an image, so none of them is affected.

## Driving it with control-site

Preconditions:

- `control-site doctor` reports zero failures.
- `assets/img/ghibli.avif` and `assets/img/ghibli.jpg` both exist. Run `make images` if not.

- **Measure the homepage.** Run
  `control-site browser vitals --url http://localhost:3000/ --runs 3 --throttle slow4g --screenshot home-vitals.png`.
  `median.lcp_ms` is at or under 2500, `median.cls` is 0, `verdict.lcp` and `verdict.cls` are both
  `good`, and the command exits 0. It exits 1 when either verdict is not `good`.
- **Confirm the LCP element.** Read `median.lcp_element` from the same result. It is `IMG.hero`.
  Any other value means the hero stopped being the largest paint and the measurement is aimed at
  the wrong thing.
- **Confirm AVIF is what actually shipped.** Read `samples[0].resources` from the same result. The
  single `Image` entry ends in `.avif`, near 154000 bytes. A `.jpg` entry there means the
  `<source>` was not honored.
- **Confirm the JPEG fallback is real.** Run
  `control-site get /assets/img/ghibli.jpg`. It answers 200 with `image/jpeg`. Chrome always picks
  the AVIF, so this is the only check that covers the fallback path.
- **Compare against a baseline.** Save the JSON from two runs and diff `median` between them. The
  `config` block must match across both or the comparison is meaningless.
- **Proof.** Keep both vitals JSON files and the screenshot. The JSON names its own throttle
  profile and run count.

## Gotchas

- **Never measure without `--throttle`.** On unthrottled localhost every asset arrives in about a
  millisecond, LCP collapses to a few hundred ms regardless of file size, and a byte regression
  measures as no change at all. `slow4g` is the default for that reason.
- Run-to-run spread is normally under 30ms. A spread in the hundreds means something else was
  loading the machine, so rerun before believing a delta.
- `--runs 1` reports a single sample as the median. Use at least 3 for any before/after claim.
- The command disables the HTTP cache for every run. Do not "fix" a slow number by warming it.
- `cls` is summed only over shifts with `hadRecentInput` false, and the driver never interacts
  with the page, so every shift counts. A nonzero value is real.
- `width` and `height` on the hero tag are what hold CLS at 0. Removing them reintroduces a shift
  of about 0.086 that this recipe will catch.
- `.hero` needs `height: auto` in the stylesheet. Without it the `width` and `height` attributes
  force a 1380px tall image once `max-width` shrinks the width, and the hero renders stretched.
  The vitals numbers stay green while it happens, so judge this one on the screenshot.
- The verdict thresholds are the public Core Web Vitals ones, 2500ms for LCP and 0.1 for CLS.
  INP is reported as not applicable because no route has an interactive element.
