# Getting started

Canard Form receives the answers of a form on your own website. There are three ways to send them, from the simplest to the most flexible. None of them needs a key: the address of a published form is enough.

|                                       | Nothing to install | Fields follow Canard Form | Visitor stays on the page | Works without JavaScript |
| ------------------------------------- | ------------------ | ------------------------- | ------------------------- | ------------------------ |
| [HTML form](./html)                   | yes                | no                        | no                        | yes                      |
| [`fetch` in JavaScript](./javascript) | yes                | no                        | yes                       | no                       |
| [SDK `@canardform/sdk`](./sdk)        | no                 | yes with `mountForm`      | yes                       | no                       |

The form id (`ID` in the examples) and examples generated with your real fields are in the **Integrations** tab of the form in Canard Form.

::: warning Alpha
The SDK is a pre-release: the API may change before 1.0.0.
:::

## Install

```bash
npm install @canardform/sdk@alpha
```

Without a build tool (a plain HTML page), load the SDK from jsDelivr, minified (about 5 KB gzip):

```html
<div id="contact"></div>
<script type="module">
  import { mountForm } from 'https://cdn.jsdelivr.net/npm/@canardform/sdk@1.0.0-alpha.1/+esm';
  mountForm('#contact', 'ID');
</script>
```

::: info Pin the exact version during the alpha
Semver ranges never match pre-releases, so `@1` does not resolve to `1.0.0-alpha.1`. Once 1.0.0 is stable, use `@canardform/sdk@1/+esm`: bug fixes arrive on their own, and a version 2 changes nothing on your site.
:::

The same code works with or without server-side rendering: without it, the fields are read in the browser; with it, pass `definition` (read by `getForm` on the server) so the form is already in the HTML. See [Server-side rendering](./ssr).

## Entry points

| Import                       | Contents                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| `@canardform/sdk`            | `mountForm`, `submitForm`, `getForm`, conditions, captcha helpers        |
| `@canardform/sdk/react`      | `<CanardForm>`, `useCanardForm`, `<FieldInput>`                          |
| `@canardform/sdk/vue`        | `<CanardForm>`, `useCanardForm`, `fieldInput`                            |
| `@canardform/sdk/controller` | `createFormController`, the framework-agnostic state behind the adapters |

## Default domain

- Public forms: `https://canardform.app` (runtime under `/v1/f/{id}`). Change it with the `publicUrl` option.

The form id is URL-encoded by the SDK.
