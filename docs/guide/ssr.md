# Server-side rendering

Read the fields on the server with `getForm` and pass them as `definition`: the full form (steps, conditions) is in the HTML, then the browser takes over.

`getForm`, `submitForm` and the React and Vue adapters touch nothing in the DOM before mount; only `mountForm` requires a browser.

## Next.js

```tsx
// app/contact/page.tsx
import { getForm } from '@canardform/sdk';
import ContactForm from './contact-form';

export default async function Page() {
  // Unknown form or server unreachable: the browser retries, then shows the fallback message
  const definition = await getForm('ID').catch(() => undefined);
  return <ContactForm definition={definition} />;
}
```

```tsx
// app/contact/contact-form.tsx
'use client';

import type { PublicForm } from '@canardform/sdk';
import { CanardForm } from '@canardform/sdk/react';

export default function ContactForm({
  definition,
}: {
  definition?: PublicForm;
}) {
  return <CanardForm formId="ID" definition={definition} />;
}
```

The same applies to `useCanardForm('ID', { definition })`.

## Nuxt

```vue
<script setup lang="ts">
import { getForm } from '@canardform/sdk';
import { CanardForm } from '@canardform/sdk/vue';

const { data } = await useAsyncData(() => getForm('ID'));
</script>

<template>
  <CanardForm form-id="ID" :definition="data" />
</template>
```

Without `definition`, nothing is read on the server: the fields load in the browser after mount.
