# Contributing

Thanks for helping! Bug reports, documentation fixes and pull requests are welcome. Please follow the
[code of conduct](CODE_OF_CONDUCT.md).

## Setup

Node.js 22 or later.

```sh
npm ci
npm test          # Vitest (happy-dom)
npm run lint      # ESLint (strict, type-checked) + Prettier
npm run typecheck
npm run build && npm run check:package   # publint + Are The Types Wrong
npm run docs:dev  # documentation at http://localhost:5173/sdk-js/
```

## Pull requests

- One topic per pull request, with a test for any behaviour change.
- Keep the SDK free of runtime dependencies and compatible with the browsers listed in `package.json`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`…).
- Add a line to `CHANGELOG.md` under _Unreleased_.

## Releasing (maintainers)

1. Move the _Unreleased_ entries of `CHANGELOG.md` under the new version.
2. `npm version <version>` (e.g. `1.0.0-alpha.2`), then push the commit and the tag.
3. The **Release** workflow checks, publishes to npm with provenance (pre-releases under their own
   dist-tag, e.g. `alpha`) and creates the GitHub release.
