# Canard Form SDK

[![npm](https://img.shields.io/npm/v/@canardform/sdk/alpha)](https://www.npmjs.com/package/@canardform/sdk)
[![CI](https://github.com/canardform/sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/canardform/sdk-js/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/canardform/sdk-js/badge)](https://scorecard.dev/viewer/?uri=github.com/canardform/sdk-js)

Send answers to [Canard Form](https://canardform.com) from your own website: plain HTML, JavaScript, React, Vue and server-side rendering. Zero dependencies, about 5 KB gzip from a CDN.

> [!WARNING]
> Alpha: the API may change before 1.0.0.

## Install

```bash
npm install @canardform/sdk@alpha
```

Or without a build tool, from jsDelivr (pin the exact version during the alpha: semver ranges such as `@1` never match pre-releases, they will once 1.0.0 is stable):

```html
<script type="module">
  import { mountForm } from 'https://cdn.jsdelivr.net/npm/@canardform/sdk@1.0.0-alpha.1/+esm';
  mountForm('#contact', 'ID');
</script>
```

## Quick start

```js
import { mountForm } from '@canardform/sdk';

// Builds the published form (fields, steps, conditions, bot protection) in #contact
await mountForm('#contact', 'ID', {
  classes: { form: 'contact', submit: 'btn' },
  onSubmitted: (id) => console.log('Sent', id),
});
```

The form id and generated examples are in the **Integrations** tab of your form. No API key is needed to send answers.

React and Vue:

```tsx
import { CanardForm } from '@canardform/sdk/react';
<CanardForm formId="ID" />;
```

```vue
<script setup>
import { CanardForm } from '@canardform/sdk/vue';
</script>

<template><CanardForm form-id="ID" /></template>
```

## Documentation

Full guide (HTML, fetch, hooks, SSR with Next.js and Nuxt, steps and conditions, bot protection, CSP, error codes): **https://canardform.github.io/sdk-js/**

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
