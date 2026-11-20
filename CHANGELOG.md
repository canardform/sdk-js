# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-20

First stable release: the API now follows [Semantic Versioning](https://semver.org/), a breaking change
only comes with a version 2. No change since 1.0.0-alpha.6.

- Install with `npm install @canardform/sdk` (no more `@alpha`); from jsDelivr, `@canardform/sdk@1/+esm`
  gets the bug fixes on its own.

## [1.0.0-alpha.6] - 2026-11-20

### Added

- `errorMessages` option (`mountForm`, `submitForm`, React and Vue): your own sentence for a refusal, by
  error code, e.g. `{ quota_exceeded: 'Come back tomorrow.' }`.
- A refusal is logged for the developer with `console.warn`: code, HTTP status, what to do, reference of a
  technical error and a link to the error codes page. The visitor never sees these details.

### Fixed

- Vue: a refused submission no longer empties the text fields the visitor typed in.
- React: no more `Invalid DOM property autocomplete` warning in the console in development.
- Every refusal is shown in the form's language with the short sentence sent by the server, instead of
  `HTTP 403` / `HTTP 422`; a network failure no longer shows the browser's English message.
  `CanardFormError.message` is this sentence; `errorMessage(error, locale)` gives it for any error.

## [1.0.0-alpha.5] - 2026-11-19

### Added

- Error code `origin_not_allowed` (403): the form lists its allowed websites and this one is not among them.
  `getForm` now reports it instead of `not_found`; add the website (and `localhost` for local tests) in the
  form settings.

## [1.0.0-alpha.4] - 2026-11-18

### Fixed

- `mountForm`: `classes.field` accepts several classes (`'grid gap-2'`), like the other `classes` options;
  it used to throw and leave the form empty.

## [1.0.0-alpha.3] - 2026-11-17

### Added

- Hidden fields (`type: 'hidden'`, with `param` and `default` on `PublicField`): never rendered, sent on
  submission with the page address parameter (`?utm_source=…`, the field key by default), otherwise
  their default. A value already in the data (`beforeSubmit`, your own input) wins.
  `withHiddenValues(definition, data)` does it for your own rendering.

### Changed

- `stepsOf` leaves hidden fields out, and skips a step that only has hidden fields.

## [1.0.0-alpha.2] - 2026-11-17

### Added

- `autocomplete`, `no_autofill` and file `rules` on `PublicField`; controls get an `autocomplete` attribute
  (`off`, the field's value, or `email` / `tel` / `url` from the type). `fieldHint()` writes out the
  constraints of a file field.
- Accessibility (WCAG 2.2 AA / RGAA 4.1) in `mountForm` and the React and Vue components: `lang` on the
  form, required fields marked with an asterisk and explained, groups of choices named by
  `aria-labelledby` (`radiogroup`, `aria-required`), help and file constraints linked by
  `aria-describedby`, errors linked to their field with `aria-invalid`, an error summary that takes the
  focus, steps named by a focused `<h2>` ("Step x of y"), focused thank-you message.
- Bot check not done or expired: a message next to the widget instead of sending (`captchaError`).
- `showField(key)` on the controller, hook and composable.

### Changed

- The step progress (`cf-progress`) is now inside each step's `<h2 class="cf-step-title">`, with the
  title in `cf-step-name`.
- A group of radios or checkboxes is labelled by a `<span id="cf-<key>-label">` instead of a
  `<label for>` pointing to no control.
- A file field accepting several files is named `<key>[]` and has `multiple`.

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

[Unreleased]: https://github.com/canardform/sdk-js/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.6...v1.0.0
[1.0.0-alpha.6]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.5...v1.0.0-alpha.6
[1.0.0-alpha.5]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.4...v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.3...v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.2...v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/canardform/sdk-js/compare/v1.0.0-alpha.1...v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/canardform/sdk-js/releases/tag/v1.0.0-alpha.1
