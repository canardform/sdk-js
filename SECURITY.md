# Security policy

## Supported versions

Only the latest release of each dist-tag (`latest`, `alpha`) receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub private vulnerability reporting](https://github.com/canardform/sdk-js/security/advisories/new),
or by e-mail at **contact@deville-computing.net**.
We acknowledge reports within 3 business days and keep you informed until a fix is released; we are
happy to credit you in the advisory.

Vulnerabilities in the Canard Form service itself (not this SDK) can be reported the same way.

## What we do to keep the SDK safe

- **Zero runtime dependencies**: nothing but this code ends up in your bundle.
- **No HTML injection**: the SDK builds the DOM with `textContent` and element APIs, never `innerHTML`.
- **No secret in your pages**: sending answers needs no API key.
- **Only hCaptcha's script** (`https://*.hcaptcha.com`) is ever loaded, whatever a response says.
- **Verifiable releases**: every version is published from GitHub Actions with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements) through trusted publishing
  (no long-lived npm token). Check it with `npm audit signatures`.
- **Hardened CI**: actions pinned by commit SHA, least-privilege permissions, CodeQL, zizmor,
  dependency review, Dependabot and [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/canardform/sdk-js).
