# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-alpha.1] - 2026-11-10

First public pre-release.

### Added

- `mountForm()`: builds a published form in any page, with steps, display conditions, anti-robot
  check (hCaptcha), field errors and thank-you message.
- `submitForm()` and `getForm()` for your own markup, from a browser or a server.
- React and Vue adapters (`@canardform/sdk/react`, `@canardform/sdk/vue`): ready-made `<CanardForm>`
  component and `useCanardForm()` hook / composable, server-side rendering included (Next.js, Nuxt).
- Framework-agnostic controller (`@canardform/sdk/controller`).
- Built-in texts in English or French, following the form's language (`defaultMessages()`).
- Closed form: the message set on the form (`closed_message`) is shown; an unknown form or an unreachable
  server shows a fallback (`cf-unavailable`, `messages.unavailable`, Vue `#unavailable` slot) instead of
  an empty spot or an endless loading state.

[Unreleased]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.1...HEAD
[1.0.0-alpha.1]: https://github.com/canardform/sdk-js/releases/tag/v1.0.0-alpha.1
