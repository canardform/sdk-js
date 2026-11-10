# Vue

```bash
npm install @canardform/sdk@alpha
```

## The form builds itself

```vue
<script setup lang="ts">
import { CanardForm } from '@canardform/sdk/vue';
</script>

<template>
  <CanardForm form-id="ID" :classes="{ form: 'contact' }" @submitted="track" />
</template>
```

Like [`mountForm`](./sdk), but as a native component: fields, labels, languages, display conditions, bot protection, per-field errors and the thank-you message come from the published form. Server-side rendering included (Nuxt): pass `definition` read with `getForm` to show the fields from the first render. See [Server-side rendering](./ssr).

| Prop / event                  | Description                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `form-id`                     | The form id                                                                                                  |
| `classes`                     | `form`, `field`, `error`, `success`, `closed`, `unavailable`, `submit`                                       |
| `messages`                    | `submit`, `success`, `closed`, `unavailable`, `next`, `previous`; see [Built-in texts](./sdk#built-in-texts) |
| `definition`                  | The form read on the server with `getForm`                                                                   |
| `lang`, `public-url`, `fetch` | Same as [`submitForm`](./sdk#submitform)                                                                     |
| `@submitted`                  | `(submissionId) => void`, after a successful submission (the thank-you message or `#success` is still shown) |

### Taking control of the HTML

Three levels:

1. **Classes**: `classes` (`form`, `field`, `error`, `success`, `closed`, `unavailable`, `submit`), without touching the markup.
2. **One field**: `<template #field="{ field, error, input }">…</template>`; `<component :is="input" />` gives the control alone (`fieldInput(field)` is also exported). Also the `#success` (receives `{ submissionId }`), `#closed`, `#unavailable` and `#loading` slots.
3. **All the HTML**: the `useCanardForm` composable below, with your own fields.

```vue
<CanardForm form-id="ID">
  <template #field="{ field, error, input }">
    <label>
      {{ field.label }}
      <component :is="input" />
    </label>
    <p v-if="error">{{ error }}</p>
  </template>
  <template #success>Thank you!</template>
</CanardForm>
```

## Your fields, the SDK does the rest

```vue
<script setup lang="ts">
import { useCanardForm } from '@canardform/sdk/vue';

const form = useCanardForm('ID');
</script>

<template>
  <p v-if="form.status.value === 'sent'">Thank you!</p>
  <form v-else @submit="form.handleSubmit" @input="form.handleChange">
    <input type="email" name="email" required />
    <input v-if="form.isVisible('budget')" type="number" name="budget" />
    <p v-if="form.errors.value.email">{{ form.errors.value.email }}</p>
    <div :ref="form.captchaRef" />
    <button :disabled="form.status.value === 'sending'">Send</button>
  </form>
</template>
```

The composable returns the same API as the [React hook](./react#your-fields-the-sdk-does-the-rest): `status`, `errors`, `error`, `submissionId`, `definition`, `unavailable`, `steps` and `step` as computed refs, plus `isVisible(key)`, `handleSubmit`, `handleChange`, `submit(data)`, `reset()`, `captchaRef`, `isStep(key)`, `next(element)` and `previous()`.

No rendering is imposed. With server-side rendering, nothing is read before mount; pass `definition` (read with `getForm` on the server) to know the conditions from the first render.
