# HTML form

The simplest integration: nothing to install, and it works without JavaScript.

```html
<form action="https://canardform.app/v1/f/ID" method="POST">
  <input type="email" name="email" required />
  <textarea name="message"></textarea>
  <input type="hidden" name="_redirect" value="https://your-site.com/thanks" />
  <button type="submit">Send</button>
</form>
```

- **Field names**: each `name` is the key of the field in Canard Form. An unknown field is ignored.
- **Multiple checkboxes**: `name="interests[]"`. A single checkbox: `value="1"`.
- **Files**: add `enctype="multipart/form-data"` to the `<form>`.
- **After sending**: Canard Form sends the visitor to `_redirect` (http or https). Without `_redirect`, they see the Canard Form "Answer sent" page.
- **Invalid input**: the visitor lands on the Canard Form page of the form, with their answers and the errors.
- **Double click**: two identical submissions within the same minute only count once.

Multi-step forms are shown on a single page here. Conditional fields: leave them optional; the server only requires them when their condition is met and ignores their answer otherwise.

To protect the form against bots, see [Bot protection](./anti-robot).
