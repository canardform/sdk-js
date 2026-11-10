# mountForm

`mountForm` builds the published form in your page. It is the plain JavaScript entry point; with React or Vue, see [React](./react) and [Vue](./vue).

```js
import { mountForm } from '@canardform/sdk';

mountForm('#contact', 'ID');
```

Fields, labels, languages and display conditions come from the published version: what you change in Canard Form shows up on your site without touching it. The markup is simple and unstyled (`cf-form`, `cf-field`, `cf-error`, `cf-field-error`, `cf-captcha`, `cf-success`, `cf-closed`, `cf-unavailable`, `cf-submit`), ready for your CSS. The default class names are exported as `CLASSES`.

## Options

Everything is set with options:

```js
const { element, definition, destroy } = await mountForm('#contact', 'ID', {
  lang: 'en', // otherwise the browser's language
  classes: { form: 'contact', submit: 'btn' }, // your CSS classes
  messages: { success: 'Thanks, talk soon!' }, // fallback texts
  renderField: (field, el) => {
    // adjust or replace a field
    if (field.type === 'email') el.classList.add('col-span-2');
    return el;
  },
  beforeSubmit: (data) => data.set('source', 'pricing-page'), // `source`: a question of your form
  onSubmitted: (id) => plausible('Form sent'),
  onError: (error) => console.warn(error.error, error.errors),
});
```

- Without `onSubmitted`, the form is replaced by the thank-you message.
- A refused field gets its message under it (`cf-field-error`) and the form goes back to that field's step; any other error (closed form, network…) is shown under the form (`cf-error`), with `messages.error` instead of the server's text when set. `onError` is called in both cases.
- `beforeSubmit` can only add answers to questions of the form (a hidden question, for instance): any other key is ignored by the server.
- `renderField` receives the default rendering; returning `undefined` keeps it. The default rendering is also exported: `renderField(field)` returns a field as unstyled HTML (label, control, help text), and `fieldControl(field)` only describes its control (tag, attributes, choices).

| Option           | Type                                                              | Description                                                         |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lang`           | `string`                                                          | Language of the form, otherwise the visitor's browser language      |
| `publicUrl`      | `string`                                                          | Domain of the public forms, `https://canardform.app` by default     |
| `classes`        | `{ form, field, error, success, closed, unavailable, submit }`    | CSS classes set on each element, replacing the `cf-*` defaults      |
| `messages`       | `{ submit, success, closed, unavailable, error, next, previous }` | Fallback texts, see [Built-in texts](#built-in-texts)               |
| `renderField`    | `(field, element) => HTMLElement \| void`                         | Replace or adjust the rendering of a field                          |
| `beforeSubmit`   | `(data: FormData) => FormData \| void \| Promise<…>`              | Add or adjust data just before sending (hidden field, campaign id…) |
| `onSubmitted`    | `(submissionId, form) => void`                                    | After a successful submission                                       |
| `onError`        | `(error, form) => void`                                           | Submission refused (invalid field, closed form…)                    |
| `idempotencyKey` | `string`                                                          | Same key = same submission when retried, random when missing        |
| `fetch`          | `typeof fetch`                                                    | Your own `fetch` implementation                                     |

`mountForm` resolves to:

| Property     | Description                                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| `definition` | The published form as read (fields, language, texts)                           |
| `element`    | The `<form>` element built (empty and not in the page when the form is closed) |
| `destroy()`  | Removes the form from the page                                                 |

## Built-in texts

The built-in texts ("Send", "Next", "Previous", "Step 1 of 2", "This form is closed.", "This form cannot be shown right now. Please try again later.", "Thank you!") follow the form's language (before it is loaded: the `lang` option, then the visitor's browser): French for a `fr*` locale, English otherwise. They are exported as `defaultMessages(locale)`:

```js
import { defaultMessages } from '@canardform/sdk';

defaultMessages('fr-FR').submit; // 'Envoyer'
defaultMessages('de').submit; // 'Send'
```

A text set on the form in Canard Form (submit label, thank-you message, closed message) comes first, then the `messages` option, then the built-in text. One exception, for `mountForm` only: `messages.error` replaces the server's message for an error that is not about a field.

## Closed or unavailable form

Nothing breaks on your site when a form cannot take answers:

| Situation                                                                | What the visitor sees                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form suspended, archived or outside its opening dates (`open: false`)    | `<p class="cf-closed">` with the **message when closed** set on the form in Canard Form, else `messages.closed`, else the built-in text. Reopen the form and it shows again. |
| Form unknown or never published (404), server unreachable, network error | `<p class="cf-unavailable" role="alert">` with `messages.unavailable`, else the built-in text, instead of an empty spot.                                                     |

`mountForm` shows the fallback, then rejects with the error so that your page can log or report it. React and Vue components render the same paragraphs (Vue also has `#closed` and `#unavailable` slots); with your own HTML, check `form.definition?.open` and `form.unavailable` (in Vue, computed refs: `form.definition.value?.open`, `form.unavailable.value`); the form's own text is in `definition.closed_message`.

```js
mountForm('#contact', 'ID', {
  messages: {
    unavailable: 'Write to us at hello@example.com in the meantime.',
  },
}).catch((error) => console.warn('Contact form unavailable', error));
```

## submitForm

To keep your own rendering without an adapter (Svelte, Angular…):

```js
import { submitForm } from '@canardform/sdk';

await submitForm('ID', new FormData(form)); // or an object: { email: 'jane@example.com' }
await submitForm('ID', data, { idempotencyKey: order.id }); // retry without duplicates
```

`submitForm` sends files too, and throws a `CanardFormError` (`error`, `status`, `errors`) when the submission is refused. It resolves to the submission id. Options: `publicUrl`, `idempotencyKey` (random when missing), `lang` (the visitor's language, for the acknowledgement sent after the answer) and `fetch`.

## getForm

`getForm('ID', { lang })` reads the published form without a key, as a `PublicForm`: `id`, `locale`, `open`, `fields` (with their display conditions `visible_if`), `steps`, `submit_label`, `success_message`, `closed_message` and `hcaptcha`. It throws a `CanardFormError` with `not_found` when the form cannot be read. It works in the browser and on the server, which is how [server-side rendering](./ssr) gets its `definition`.

## Other frameworks

`createFormController` (from `@canardform/sdk/controller`) holds the same state as the React and Vue adapters and touches nothing in the DOM when created (server-side rendering friendly):

```js
import { createFormController } from '@canardform/sdk/controller';

const form = createFormController('ID', { lang: 'en' }); // or { definition } read on the server
form.subscribe(() => render(form.getState())); // re-render on every change
form.load().catch(() => {}); // reads the fields; on failure, getState().unavailable is true

// <form onchange=form.handleChange onsubmit=form.handleSubmit>
```

| Member                                       | Description                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getState()`                                 | `{ definition, visible, status, errors, error, submissionId, unavailable, steps, step }` (`FormState`) |
| `subscribe(listener)`                        | Called on every change; returns the unsubscribe function                                               |
| `load()`                                     | Reads the published form once (not needed with `definition`)                                           |
| `isVisible(key)`, `setAnswers(answers)`      | Display conditions, from the current answers                                                           |
| `handleChange(event)`, `handleSubmit(event)` | To wire on the `<form>`: conditions on change; submit, or next step on an intermediate one             |
| `submit(data)`                               | Sends a `FormData` or an object; resolves to the submission id, or `null` when refused                 |
| `next(element)`, `previous()`, `isStep(key)` | Steps (see [Steps and conditions](./steps-and-conditions))                                             |
| `captchaRef(element)`                        | Shows the anti-robot check in this element                                                             |
| `reset()`                                    | Back to an empty form at the first step                                                                |

See [Steps and conditions](./steps-and-conditions) for `visibleKeys`, and [Bot protection](./anti-robot) for `renderCaptcha` / `resetCaptcha`.

## Helpers and types

Also exported by `@canardform/sdk`, for your own rendering:

| Export                                            | Description                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `fieldErrors(errors)`                             | First message of each refused field, by key (`answers.email.0` becomes `email`)    |
| `stepsOf(definition, visible?)`                   | The steps to go through, a step whose fields are all hidden being skipped          |
| `validateStep(element)`                           | Browser validation of the controls inside `element`; reports the first invalid one |
| `visibleKeys(fields, answers)`, `answersOf(form)` | Display conditions (see [Steps and conditions](./steps-and-conditions))            |
| `matches(group, answers)`                         | Evaluates one condition group                                                      |
| `fieldControl(field)`, `CLASSES`                  | A field's control without DOM (tag, attributes, choices), default class names      |
| `renderField(field)`                              | A field as unstyled HTML (label, control, help text), as `mountForm` builds it     |
| `defaultMessages(locale)`                         | Built-in texts                                                                     |

Types: `PublicForm`, `PublicField`, `PublicStep`, `ErrorCode`, `SubmitOptions`, `MountOptions`, `MountedForm`, `FieldControl`, `Answers`, `ConditionGroup`; from `@canardform/sdk/controller`: `FormState`, `FormStatus`, `ControllerOptions`, `FormController`.
