# Error codes

A refused submission returns a stable `error` code. The SDK throws it as a `CanardFormError` with `error`, `status`, `errors` (details per field) and `message` (a sentence for the visitor).

```js
import { CanardFormError, submitForm } from '@canardform/sdk';

try {
  await submitForm('ID', { email: 'jane@example.com' });
} catch (error) {
  if (error instanceof CanardFormError && error.error === 'validation_failed') {
    console.log(error.errors); // { 'answers.email': ['…'] }
  }
}
```

| Code                      | Meaning                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation_failed`       | an answer is invalid, details in `errors`                                                                                                          |
| `form_closed`             | the form is suspended, archived or outside its dates; see [Closed or unavailable form](./sdk#closed-or-unavailable-form)                           |
| `rate_limited`            | too many submissions from the same connection                                                                                                      |
| `captcha_failed`          | the hCaptcha token is missing, invalid or already used                                                                                             |
| `quota_exceeded`          | the organization's monthly answer quota is reached                                                                                                 |
| `storage_quota_exceeded`  | the file storage space is full                                                                                                                     |
| `origin_not_allowed`      | this website is not in the form's allowed websites; add it in the form settings. `localhost` is not allowed by default: add it too for local tests |
| `spam_rejected`           | the bot trap was filled                                                                                                                            |
| `idempotency_conflict`    | same idempotency key, different content                                                                                                            |
| `idempotency_in_progress` | the same submission is already in progress                                                                                                         |
| `not_found`               | `getForm` could not read the form (unknown, unpublished, server error)                                                                             |
| `technical_error`         | an error on our side (500), nothing was saved; `reference` to quote to support                                                                     |
| `http_error`              | an error response without a code                                                                                                                   |

`error.message` is a short sentence for the visitor, sent by the server in the form's language, without technical detail: `mountForm` and the React and Vue components show it as is. Replace it for a code with the `errorMessages` option:

```js
mountForm('#contact', 'ID', {
  errorMessages: {
    quota_exceeded: 'Come back tomorrow, or write to hello@example.com.',
  },
});
```

The details for you (code, HTTP status, what to do, `reference` of a `technical_error`) are written to the browser console. A network failure (server unreachable, offline visitor) throws the browser's own error (`TypeError`), not a `CanardFormError`: `errorMessage(error, locale)` turns any error into the text to show. `fieldErrors(error.errors)` gives the first message of each refused field, by key.
