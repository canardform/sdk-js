# JavaScript without the SDK

Send the form with `fetch`, the visitor stays on the page:

```js
const response = await fetch('https://canardform.app/v1/f/ID', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: new FormData(form),
});
// 201: { submission_id }   422: { error: 'validation_failed', errors: { 'answers.email': ['…'] } }
```

Submissions are accepted from any website (CORS), without cookies.

The `Idempotency-Key` header makes a retry safe: the same key with the same content counts once. Error bodies carry a stable `error` code, listed in [Error codes](./errors).

::: tip
`crypto.randomUUID` is only available over HTTPS. The SDK's [`submitForm`](./sdk#submitform) generates the key without it, and sends files too.
:::
