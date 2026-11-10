# Error codes

A refused submission returns a stable `error` code. The SDK throws it as a `CanardFormError` with `error`, `status` and `errors` (details per field).

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

| Code                      | Meaning                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `validation_failed`       | an answer is invalid, details in `errors`                                                                                |
| `form_closed`             | the form is suspended, archived or outside its dates; see [Closed or unavailable form](./sdk#closed-or-unavailable-form) |
| `rate_limited`            | too many submissions from the same connection                                                                            |
| `captcha_failed`          | the hCaptcha token is missing, invalid or already used                                                                   |
| `quota_exceeded`          | the organization's monthly answer quota is reached                                                                       |
| `storage_quota_exceeded`  | the file storage space is full                                                                                           |
| `spam_rejected`           | the bot trap was filled                                                                                                  |
| `idempotency_conflict`    | same idempotency key, different content                                                                                  |
| `idempotency_in_progress` | the same submission is already in progress                                                                               |
| `not_found`               | `getForm` could not read the form (unknown, unpublished, server error)                                                   |
| `http_error`              | an error response without a code                                                                                         |

A network failure (server unreachable, offline visitor) throws the browser's own error (`TypeError`), not a `CanardFormError`. `fieldErrors(error.errors)` gives the first message of each refused field, by key.
