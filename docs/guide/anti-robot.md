# Bot protection

If the form is set to **Bot verification**, each answer must carry an **hCaptcha** token, the same widget on the Canard Form page and on your site. The widget adds the `h-captcha-response` field to the form on its own; a token can only be used once.

```html
<form action="https://canardform.app/v1/f/ID" method="POST">
  …
  <div class="h-captcha" data-sitekey="PUBLIC_KEY"></div>
  <button type="submit">Send</button>
</form>
<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
```

The public key is in the generated example of the Integrations tab and in `getForm()` (`hcaptcha.sitekey`).

- `mountForm` and `<CanardForm>` add it on their own.
- React: `<div ref={form.captchaRef} />` in your form. Vue: `<div :ref="form.captchaRef" />`. The SDK loads the script, shows the widget and resets it after a refusal.
- Other frameworks: `renderCaptcha(element, definition)` and `resetCaptcha(form)`.

The SDK only ever loads hCaptcha's own script, over HTTPS from `hcaptcha.com` or one of its subdomains, whatever the server response says.

## Honeypot

Whatever the bot protection setting of the form, in your own HTML also add the bot trap, an invisible field left empty (`mountForm` and the components don't need it):

```html
<input
  type="text"
  name="_hp"
  tabindex="-1"
  autocomplete="off"
  style="display:none"
/>
```

A submission with this field filled is refused with `spam_rejected`.
