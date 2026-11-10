# React

```bash
npm install @canardform/sdk@alpha
```

## The form builds itself

```tsx
import { CanardForm } from '@canardform/sdk/react';

<CanardForm
  formId="ID"
  classes={{ form: 'contact', submit: 'btn' }}
  onSubmitted={(id) => track(id)}
/>;
```

Like [`mountForm`](./sdk), but as a native component: fields, labels, languages, display conditions, bot protection, per-field errors and the thank-you message come from the published form. Server-side rendering included (Next.js): pass `definition` read with `getForm` to show the fields from the first render. See [Server-side rendering](./ssr).

| Prop                                           | Description                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `formId`                                       | The form id                                                                                                  |
| `classes`                                      | `form`, `field`, `error`, `success`, `closed`, `unavailable`, `submit`                                       |
| `renderField`                                  | `({ field, error, children }) => ReactNode`, see below                                                       |
| `onSubmitted`                                  | `(submissionId) => void`; without it, the thank-you message is shown                                         |
| `loading`                                      | Shown while the fields load                                                                                  |
| `messages`                                     | `submit`, `success`, `closed`, `unavailable`, `next`, `previous`; see [Built-in texts](./sdk#built-in-texts) |
| `definition`                                   | The form read on the server with `getForm`                                                                   |
| `lang`, `publicUrl`, `idempotencyKey`, `fetch` | Same as [`submitForm`](./sdk#submitform)                                                                     |

### Taking control of the HTML

Three levels:

1. **Classes**: `classes` (`form`, `field`, `error`, `success`, `closed`, `unavailable`, `submit`), without touching the markup.
2. **One field**: `renderField={({ field, error, children }) => …}`. Return `children` to keep the default rendering; `<FieldInput field={field} />` gives the control alone. The `loading` prop sets what shows while loading.
3. **All the HTML**: the `useCanardForm` hook below, with your own fields.

## Your fields, the SDK does the rest

```tsx
import { useCanardForm } from '@canardform/sdk/react';

export default function Contact() {
  const form = useCanardForm('ID');
  if (form.status === 'sent') return <p>Thank you!</p>;

  return (
    <form onSubmit={form.handleSubmit} onChange={form.handleChange}>
      <input type="email" name="email" required />
      {form.isVisible('budget') && <input type="number" name="budget" />}
      {form.errors.email && <p>{form.errors.email}</p>}
      <div ref={form.captchaRef} />
      <button disabled={form.status === 'sending'}>Send</button>
    </form>
  );
}
```

The hook returns:

| Name                                                          | Description                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `status`                                                      | `idle`, `sending`, `sent` or `error`                                        |
| `errors`                                                      | First error of each refused field, by key: `errors.email`                   |
| `error`                                                       | General message (closed form, network…)                                     |
| `submissionId`                                                | Id of the submission once sent                                              |
| `definition`                                                  | The published form, `null` until loaded                                     |
| `unavailable`                                                 | `true` when the form could not be loaded (unknown form, server unreachable) |
| `isVisible(key)`                                              | Display conditions                                                          |
| `handleSubmit`                                                | For `onSubmit` of the `<form>`                                              |
| `handleChange`                                                | For `onChange` of the `<form>`, updates the conditions                      |
| `submit(data)`                                                | Sends a `FormData` or an object, resolves to the id or `null`               |
| `reset()`                                                     | Back to the initial state                                                   |
| `captchaRef`                                                  | Ref for an empty element of the form, see [Bot protection](./anti-robot)    |
| `steps`, `step`, `isStep(key)`, `next(element)`, `previous()` | See [Steps and conditions](./steps-and-conditions)                          |

No rendering is imposed. With server-side rendering, nothing is read before mount; pass `definition` (read with `getForm` on the server) to know the conditions from the first render.
