# Content Security Policy

If your site sends a `Content-Security-Policy` header, allow the domains used by the integration you chose. Replace `https://canardform.app` with the address of your forms if it differs (`publicUrl`).

| Directive                                             | Domains                                       | For                                                                            |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `script-src`                                          | `https://cdn.jsdelivr.net`                    | the SDK loaded from jsDelivr (HTML page without a build tool)                  |
| `connect-src`                                         | `https://canardform.app`                      | reading the published fields and sending answers (SDK, React, Vue, JavaScript) |
| `form-action`                                         | `https://canardform.app`                      | native HTML form sent directly to Canard Form                                  |
| `frame-src`                                           | `https://canardform.app`                      | CMS and iframe embedding                                                       |
| `script-src`, `frame-src`, `style-src`, `connect-src` | `https://hcaptcha.com https://*.hcaptcha.com` | bot verification, if the form requires it                                      |

Example for the SDK with bot verification:

```
script-src 'self' https://cdn.jsdelivr.net https://hcaptcha.com https://*.hcaptcha.com;
connect-src 'self' https://canardform.app https://hcaptcha.com https://*.hcaptcha.com;
frame-src https://hcaptcha.com https://*.hcaptcha.com;
style-src 'self' https://hcaptcha.com https://*.hcaptcha.com;
```

The SDK example is a `<script type="module">` written in the page: a policy without `'unsafe-inline'` blocks it. Move that code to a file on your site, or give it a nonce.
