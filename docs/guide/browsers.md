# Supported browsers

The package is compiled to ES2019 and only uses features available everywhere for several years: `fetch`, `FormData`, `URL`, `crypto.getRandomValues` (`crypto.randomUUID` when available).

- Chrome, Edge, Firefox, Samsung Internet and Chrome Android: the last two major versions, plus Firefox ESR.
- Safari and Safari iOS: from version 15 (2021).
- Sites over HTTP: the idempotency key is generated without `crypto.randomUUID`, which is reserved to HTTPS.
- Server-side rendering (Next.js, Nuxt, Node 22+): `getForm`, `submitForm` and the React and Vue adapters touch nothing in the DOM before mount; only `mountForm` requires a browser.

The plain HTML form works in every browser, even without JavaScript.
