# Steps and conditions

## Multi-step forms

`mountForm` and `<CanardForm>` show one step at a time: "Step 2 of 3", Previous and Next buttons (texts set by `messages.previous` / `messages.next`), required fields of the step checked before moving on, a step emptied by the conditions skipped. All steps stay in the `<form>`: the submission leaves from the last one with every answer. If the server refuses a field, the form goes back to the step of that field and shows the message under it (the hook's `step` and `errors` do the same). Classes: `cf-step`, `cf-step-title`, `cf-progress`, `cf-previous`, `cf-next`.

### With your own HTML

The hook / composable gives `steps` (visible steps and their fields), `step` (current index), `isStep(key)`, `next(element)` and `previous()`. Put each step in a `<section data-step="key">` of the same `<form>`: `next` (called with the Next button) checks the fields of the current step before moving on, and `handleSubmit` moves forward instead of sending until the last step is reached (Enter key).

```tsx
<form onSubmit={form.handleSubmit} onChange={form.handleChange}>
  <section data-step="you" hidden={!form.isStep('you')}>
    …
  </section>
  <section data-step="project" hidden={!form.isStep('project')}>
    …
  </section>
  {form.step > 0 && (
    <button type="button" onClick={form.previous}>
      Previous
    </button>
  )}
  {form.step < form.steps.length - 1 ? (
    <button type="button" onClick={(event) => form.next(event.currentTarget)}>
      Next
    </button>
  ) : (
    <button type="submit">Send</button>
  )}
</form>
```

With server-side rendering, pass `definition` (read with `getForm`): the first step and the conditions are in the HTML. With HTML and JavaScript without the SDK, steps are shown on a single page.

## Display conditions in your own rendering

```js
import { answersOf, getForm, visibleKeys } from '@canardform/sdk';

const definition = await getForm('ID');
form.addEventListener('input', () => {
  const visible = visibleKeys(definition.fields, answersOf(form));
  // hide the fields whose key is not in `visible`
});
```

`visibleKeys` applies the same rules as the server, in the same order. Without JavaScript, leave conditional fields optional: the server only requires them when their condition is met and ignores their answer otherwise.
