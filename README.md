<p>
  <img src="https://canardform.github.io/sdk-js/mascot.webp" alt="The Canard Form duck, in pilot goggles and scarf" width="120" align="right">
  <a href="https://canardform.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://canardform.github.io/sdk-js/logo-dark.svg">
      <img src="https://canardform.github.io/sdk-js/logo-light.svg" alt="Canard Form" width="320">
    </picture>
  </a>
</p>

# Canard Form SDK

[![npm](https://img.shields.io/npm/v/@canardform/sdk)](https://www.npmjs.com/package/@canardform/sdk)
[![CI](https://github.com/canardform/sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/canardform/sdk-js/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/canardform/sdk-js/badge)](https://scorecard.dev/viewer/?uri=github.com/canardform/sdk-js)

Send answers to [Canard Form](https://canardform.com) from your own website: plain HTML, JavaScript, React, Vue and server-side rendering. Zero dependencies, about 5 KB gzip from a CDN.

## Install

```bash
npm install @canardform/sdk
```

Or without a build tool, from jsDelivr (`@1`: bug fixes arrive on their own, a version 2 changes nothing on your site; pin an exact version such as `@1.0.0` to control updates yourself):

```html
<script type="module">
  import { mountForm } from 'https://cdn.jsdelivr.net/npm/@canardform/sdk@1/+esm';
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
