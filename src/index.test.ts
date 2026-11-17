// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
    CanardFormError,
    defaultMessages,
    fieldControl,
    getForm,
    mountForm,
    renderCaptcha,
    renderField,
    stepsOf,
    submitForm,
    withHiddenValues,
} from './index';

const reply = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('submitForm', () => {
    it('raises the stable error code with the errors per field', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
            reply(422, {
                error: 'validation_failed',
                message: 'Invalid answers.',
                errors: { 'answers.email': ['Invalid address.'] },
            }),
        );

        const error = await submitForm(
            'f1',
            { email: 'x' },
            { publicUrl: 'https://forms.test', fetch },
        ).catch((exception: unknown) => exception);

        expect(error).toBeInstanceOf(CanardFormError);
        expect(error).toMatchObject({
            error: 'validation_failed',
            status: 422,
            errors: { 'answers.email': ['Invalid address.'] },
        });
    });

    it('posts an object as JSON answers with a generated idempotency key', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValue(reply(201, { submission_id: 's1' }));

        const id = await submitForm(
            'f1',
            { email: 'a@b.fr' },
            { publicUrl: 'https://forms.test', fetch },
        );

        expect(id).toBe('s1');
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('https://forms.test/v1/f/f1');
        expect(JSON.parse(init!.body as string)).toEqual({
            answers: { email: 'a@b.fr' },
        });
        expect(
            (init!.headers as Record<string, string>)['Idempotency-Key'],
        ).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('sends a FormData as is and surfaces validation errors', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
            reply(422, {
                error: 'validation_failed',
                errors: { 'answers.email': ['Required'] },
            }),
        );
        const data = new FormData();
        data.set('name', 'Jean');

        await expect(submitForm('f1', data, { fetch })).rejects.toMatchObject({
            error: 'validation_failed',
            status: 422,
        });
        expect(fetch.mock.calls[0][1]!.body).toBe(data);
    });
});

describe('mountForm', () => {
    it('builds the published fields and sends them', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(
                reply(200, {
                    id: 'f1',
                    locale: 'fr',
                    open: true,
                    submit_label: 'Envoyer la demande',
                    success_message: 'Merci !',
                    fields: [
                        {
                            key: 'email',
                            type: 'email',
                            label: 'E-mail',
                            required: true,
                        },
                        {
                            key: 'topic',
                            type: 'select',
                            label: 'Sujet',
                            required: false,
                            options: [{ value: 'a', label: 'A' }],
                        },
                    ],
                }),
            )
            .mockReturnValueOnce(reply(201, { submission_id: 's1' }));
        await mountForm('#slot', 'f1', {
            publicUrl: 'https://forms.test',
            fetch,
        });

        const form = document.querySelector('form')!;
        expect(form.querySelector('input[name="email"]')).not.toBeNull();
        expect(
            form.querySelector('select[name="topic"] option[value="a"]'),
        ).not.toBeNull();
        expect(form.querySelector('button')!.textContent).toBe(
            'Envoyer la demande',
        );

        (form.querySelector('input[name="email"]') as HTMLInputElement).value =
            'a@b.fr';
        form.dispatchEvent(new Event('submit'));
        await vi.waitFor(() =>
            expect(document.querySelector('.cf-success')?.textContent).toBe(
                'Merci !',
            ),
        );
        expect((fetch.mock.calls[1][1]!.body as FormData).get('email')).toBe(
            'a@b.fr',
        );
    });
});

describe('mountForm options', () => {
    it('lets the site add data, wrap a field and handle the result', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(
                reply(200, {
                    id: 'f1',
                    locale: 'fr',
                    open: true,
                    fields: [
                        {
                            key: 'email',
                            type: 'email',
                            label: 'E-mail',
                            required: true,
                        },
                    ],
                }),
            )
            .mockReturnValueOnce(reply(201, { submission_id: 's9' }));
        const onSubmitted = vi.fn();

        const mounted = await mountForm('#slot', 'f1', {
            fetch,
            classes: { form: 'contact' },
            renderField: (field, element) => {
                element.classList.add(`is-${field.type}`);
                return element;
            },
            beforeSubmit: (data) => {
                data.set('campaign', 'printemps');
            },
            onSubmitted,
        });

        expect(mounted.element.className).toBe('contact');
        expect(document.querySelector('.is-email')).not.toBeNull();
        mounted.element.dispatchEvent(new Event('submit'));
        await vi.waitFor(() =>
            expect(onSubmitted).toHaveBeenCalledWith('s9', mounted.element),
        );
        expect((fetch.mock.calls[1][1]!.body as FormData).get('campaign')).toBe(
            'printemps',
        );

        mounted.destroy();
        expect(document.querySelector('#slot')!.childElementCount).toBe(0);
    });
});

describe('hidden fields', () => {
    const definition = {
        id: 'f1',
        locale: 'fr',
        open: true,
        steps: [
            { key: 'main', title: null, fields: ['email', 'source'] },
            { key: 'tracking', title: null, fields: ['campaign'] },
        ],
        fields: [
            { key: 'email', type: 'email', label: 'E-mail', required: true },
            {
                key: 'source',
                type: 'hidden',
                label: 'Source',
                required: false,
                param: 'utm_source',
                default: 'site',
            },
            {
                key: 'campaign',
                type: 'hidden',
                label: 'Campagne',
                required: false,
            },
        ],
    };

    it('are never shown, nor make a step of their own', () => {
        const steps = stepsOf(definition);

        expect(steps).toHaveLength(1);
        expect(steps[0].fields.map((field) => field.key)).toEqual(['email']);
    });

    it('take the page address parameter, then the default, without overriding the site', () => {
        window.history.replaceState(
            null,
            '',
            '/?utm_source=newsletter&campaign=noel',
        );
        expect(withHiddenValues(definition as never, {})).toEqual({
            source: 'newsletter',
            campaign: 'noel',
        });

        window.history.replaceState(null, '', '/');
        const data = new FormData();
        data.set('campaign', 'printemps');
        withHiddenValues(definition as never, data);
        expect([data.get('source'), data.get('campaign')]).toEqual([
            'site',
            'printemps',
        ]);
    });

    it('are sent by mountForm', async () => {
        window.history.replaceState(null, '', '/?campaign=noel');
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(reply(200, definition))
            .mockReturnValueOnce(reply(201, { submission_id: 's1' }));
        const onSubmitted = vi.fn();
        const mounted = await mountForm('#slot', 'f1', { fetch, onSubmitted });

        expect(document.querySelector('[data-key="source"]')).toBeNull();
        (
            document.querySelector('input[name="email"]') as HTMLInputElement
        ).value = 'jean@example.com';
        mounted.element.dispatchEvent(new Event('submit'));
        await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled());
        const body = fetch.mock.calls[1][1]!.body as FormData;
        expect([body.get('source'), body.get('campaign')]).toEqual([
            'site',
            'noel',
        ]);
        window.history.replaceState(null, '', '/');
    });
});

describe('conditional fields', () => {
    it('hides and disables a field until its condition is met', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(
            reply(200, {
                id: 'f1',
                locale: 'fr',
                open: true,
                fields: [
                    {
                        key: 'subject',
                        type: 'select',
                        label: 'Objet',
                        required: true,
                        options: [
                            { value: 'quote', label: 'Devis' },
                            { value: 'other', label: 'Autre' },
                        ],
                    },
                    {
                        key: 'budget',
                        type: 'number',
                        label: 'Budget',
                        required: true,
                        visible_if: {
                            match: 'all',
                            conditions: [
                                {
                                    field: 'subject',
                                    operator: 'equals',
                                    value: 'quote',
                                },
                            ],
                        },
                    },
                ],
            }),
        );

        const { element } = await mountForm('#slot', 'f1', { fetch });
        const budget = element.querySelector<HTMLElement>(
            '[data-key="budget"]',
        )!;
        expect(budget.hidden).toBe(true);
        expect(budget.querySelector('input')!.disabled).toBe(true);

        const subject = element.querySelector('select')!;
        subject.value = 'quote';
        subject.dispatchEvent(new Event('change', { bubbles: true }));
        expect(budget.hidden).toBe(false);
        expect(budget.querySelector('input')!.disabled).toBe(false);
    });
});

describe('older browsers', () => {
    it('still sends an idempotency key on a plain HTTP page (no crypto.randomUUID)', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValue(reply(201, { submission_id: 's1' }));
        const secure = Object.getOwnPropertyDescriptor(
            globalThis,
            'isSecureContext',
        );
        Object.defineProperty(globalThis, 'isSecureContext', {
            value: false,
            configurable: true,
        });

        await submitForm('f1', { email: 'a@b.fr' }, { fetch });

        const key = (fetch.mock.calls[0][1]!.headers as Record<string, string>)[
            'Idempotency-Key'
        ];
        expect(key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        if (secure)
            Object.defineProperty(globalThis, 'isSecureContext', secure);
        else
            delete (globalThis as { isSecureContext?: boolean })
                .isSecureContext;
    });
});

describe('anti-robot check on your own site (hCaptcha)', () => {
    it('renders the widget, asks for it when unchecked, then resets it after a refused answer', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const rendered: Array<{ sitekey: string; hl: string }> = [];
        const reset = vi.fn();
        (window as unknown as { hcaptcha: unknown }).hcaptcha = {
            render: (
                container: HTMLElement,
                options: { sitekey: string; hl: string },
            ) => {
                rendered.push(options);
                // Like the widget: the token field stays empty until the box is checked
                container.innerHTML =
                    '<textarea name="h-captcha-response"></textarea>';
                return 'w1';
            },
            reset,
        };
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(
                reply(200, {
                    id: 'f1',
                    locale: 'fr',
                    open: true,
                    hcaptcha: {
                        sitekey: 'site-key',
                        script: 'https://js.hcaptcha.com/1/api.js',
                    },
                    fields: [
                        {
                            key: 'email',
                            type: 'email',
                            label: 'E-mail',
                            required: true,
                        },
                    ],
                }),
            )
            .mockReturnValueOnce(reply(422, { error: 'captcha_failed' }));

        const { element } = await mountForm('#slot', 'f1', { fetch });
        await vi.waitFor(() =>
            expect(rendered).toEqual([{ sitekey: 'site-key', hl: 'fr' }]),
        );
        expect(
            element.querySelector<HTMLElement>('.cf-captcha')!.dataset
                .hcaptchaWidgetId,
        ).toBe('w1');

        // Not checked: the button stays usable, the message says what to do, nothing is sent
        element.dispatchEvent(new Event('submit'));
        const message =
            element.querySelector<HTMLElement>('#cf-captcha-error')!;
        expect(message.hidden).toBe(false);
        expect(message.textContent).toBe(
            "Cochez la case de vérification avant d'envoyer.",
        );
        expect(
            element
                .querySelector('.cf-captcha')!
                .getAttribute('aria-describedby'),
        ).toBe('cf-captcha-error');
        expect(
            element.querySelector('.cf-submit')!.hasAttribute('disabled'),
        ).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);

        element.querySelector('textarea')!.value = 'token';
        element.dispatchEvent(new Event('submit'));
        expect(message.hidden).toBe(true);
        expect(
            element
                .querySelector('.cf-captcha')!
                .hasAttribute('aria-describedby'),
        ).toBe(false);
        await vi.waitFor(() => expect(reset).toHaveBeenCalledWith('w1'));
        delete (window as unknown as { hcaptcha?: unknown }).hcaptcha;
    });
});

describe('steps', () => {
    it('shows one step at a time, checks required fields before moving on, and skips an empty step', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(
            reply(200, {
                id: 'f1',
                locale: 'fr',
                open: true,
                steps: [
                    { key: 's1', title: 'Vous', fields: ['email', 'subject'] },
                    { key: 's2', title: 'Budget', fields: ['budget'] },
                    { key: 's3', title: 'Message', fields: ['message'] },
                ],
                fields: [
                    {
                        key: 'email',
                        type: 'email',
                        label: 'E-mail',
                        required: true,
                    },
                    {
                        key: 'subject',
                        type: 'select',
                        label: 'Objet',
                        required: false,
                        options: [
                            { value: 'quote', label: 'Devis' },
                            { value: 'other', label: 'Autre' },
                        ],
                    },
                    {
                        key: 'budget',
                        type: 'number',
                        label: 'Budget',
                        required: true,
                        visible_if: {
                            match: 'all',
                            conditions: [
                                {
                                    field: 'subject',
                                    operator: 'equals',
                                    value: 'quote',
                                },
                            ],
                        },
                    },
                    {
                        key: 'message',
                        type: 'textarea',
                        label: 'Message',
                        required: false,
                    },
                ],
            }),
        );

        const { element } = await mountForm('#slot', 'f1', { fetch });
        const section = (key: string) =>
            element.querySelector<HTMLElement>(`[data-step="${key}"]`)!;
        const next = element.querySelector<HTMLButtonElement>('.cf-next')!;

        expect(section('s1').hidden).toBe(false);
        expect(element.querySelector('.cf-progress')!.textContent).toBe(
            'Étape 1 sur 2',
        );

        next.click();
        expect(section('s1').hidden).toBe(false); // required e-mail empty: stays put

        (
            element.querySelector('input[name="email"]') as HTMLInputElement
        ).value = 'a@b.fr';
        next.click();
        expect(section('s3').hidden).toBe(false); // the Budget step is skipped (condition not met)
        expect(element.querySelector<HTMLElement>('.cf-submit')!.hidden).toBe(
            false,
        );

        // Server rejects a field of step 1: back to that step, message below the field
        fetch.mockReturnValueOnce(
            reply(422, {
                error: 'validation_failed',
                errors: { 'answers.email': ['Adresse refusée'] },
            }),
        );
        element.dispatchEvent(new Event('submit', { cancelable: true }));
        await vi.waitFor(() => expect(section('s1').hidden).toBe(false));
        expect(
            element.querySelector('[data-key="email"] .cf-field-error')!
                .textContent,
        ).toBe('Adresse refusée');
    });
});

describe('security', () => {
    it('encodes ids in every URL', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValue(reply(200, { data: {} }));
        await getForm('../api?x', { publicUrl: 'https://forms.test', fetch });
        await submitForm('a/b', {}, { publicUrl: 'https://forms.test', fetch });

        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            'https://forms.test/v1/f/..%2Fapi%3Fx',
            'https://forms.test/v1/f/a%2Fb',
        ]);
    });

    it.each([
        'https://evil.example/api.js',
        'http://js.hcaptcha.com/1/api.js',
        'https://hcaptcha.com.evil.example/1/api.js',
    ])('refuses to load any other script than hCaptcha: %s', async (script) => {
        const definition = {
            id: 'f1',
            locale: 'en',
            open: true,
            hcaptcha: { sitekey: 'k', script },
            fields: [],
        };

        await expect(
            renderCaptcha(document.createElement('div'), definition),
        ).rejects.toThrow(/unexpected hCaptcha script/);
        expect(document.querySelector(`script[src^="${script}"]`)).toBeNull();
    });
});

describe('built-in texts', () => {
    it('follow the form language, English by default', () => {
        expect(defaultMessages('fr-FR').progress(1, 2)).toBe('Étape 1 sur 2');
        expect(defaultMessages('de').next).toBe('Next');
        expect(defaultMessages(null).submit).toBe('Send');
    });
});

describe('mountForm when the form cannot be shown', () => {
    it('shows the closed message set on the form', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
            reply(200, {
                id: 'f1',
                locale: 'en',
                open: false,
                closed_message: 'See you in March.',
                fields: [],
            }),
        );

        await mountForm('#slot', 'f1', { fetch });
        expect(document.querySelector('.cf-closed')!.textContent).toBe(
            'See you in March.',
        );
    });

    it('shows a fallback, then rejects, when the form is unknown or the server unreachable', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValue(reply(404, {}));

        await expect(
            mountForm('#slot', 'f1', { fetch, lang: 'en' }),
        ).rejects.toBeInstanceOf(CanardFormError);
        const fallback = document.querySelector('.cf-unavailable')!;
        expect(fallback.textContent).toBe(
            'This form cannot be shown right now. Please try again later.',
        );
        expect(fallback.getAttribute('role')).toBe('alert');
    });
});

describe('accessibility', () => {
    const definition = (fields: unknown[], extra: object = {}) =>
        reply(200, { id: 'f1', locale: 'fr', open: true, fields, ...extra });

    it('fills the autocomplete attribute from the form, the type, or turns it off', () => {
        const field = (extra: object) =>
            fieldControl({
                key: 'k',
                type: 'text',
                label: 'K',
                required: false,
                ...extra,
            }).attrs.autocomplete;

        expect(field({ autocomplete: 'postal-code' })).toBe('postal-code');
        expect(field({ type: 'email' })).toBe('email');
        expect(field({ type: 'tel' })).toBe('tel');
        expect(field({ type: 'url' })).toBe('url');
        expect(field({})).toBeUndefined();
        expect(
            field({ type: 'email', autocomplete: 'email', no_autofill: true }),
        ).toBe('off');
        expect(
            renderField({
                key: 'zip',
                type: 'text',
                label: 'CP',
                required: false,
                autocomplete: 'postal-code',
            })
                .querySelector('input')!
                .getAttribute('autocomplete'),
        ).toBe('postal-code');
    });

    it('marks required fields, names groups and links help and file constraints', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(
            definition([
                {
                    key: 'name',
                    type: 'text',
                    label: 'Nom',
                    help: 'Tel qu’écrit sur la facture',
                    required: true,
                },
                {
                    key: 'size',
                    type: 'radio',
                    label: 'Taille',
                    required: true,
                    options: [
                        { value: 's', label: 'S' },
                        { value: 'm', label: 'M' },
                    ],
                },
                {
                    key: 'days',
                    type: 'checkboxes',
                    label: 'Jours',
                    required: false,
                    options: [{ value: 'mon', label: 'Lundi' }],
                },
                {
                    key: 'docs',
                    type: 'file',
                    label: 'Documents',
                    required: false,
                    rules: {
                        max_files: 3,
                        max_size: 10,
                        accept: ['pdf', 'jpg'],
                    },
                },
            ]),
        );

        const { element } = await mountForm('#slot', 'f1', { fetch });

        expect(element.lang).toBe('fr');
        expect(element.querySelector('.cf-required-notice')!.textContent).toBe(
            "Les champs marqués d'un astérisque (*) sont obligatoires.",
        );
        const label = element.querySelector('label[for="cf-name"]')!;
        expect(label.querySelector('[aria-hidden="true"]')!.textContent).toBe(
            '*',
        );
        expect(
            element.querySelector('#cf-name')!.getAttribute('aria-describedby'),
        ).toBe('cf-name-help');
        expect(element.querySelector('#cf-name-help')!.textContent).toBe(
            'Tel qu’écrit sur la facture',
        );

        // Groups: named by aria-labelledby, no <label for> pointing nowhere
        const size = element.querySelector('#cf-size')!;
        expect(size.getAttribute('role')).toBe('radiogroup');
        expect(size.getAttribute('aria-required')).toBe('true');
        expect(element.querySelector('#cf-size-label')!.tagName).toBe('SPAN');
        expect(
            [
                ...element.querySelectorAll<HTMLInputElement>('[name="size"]'),
            ].every((radio) => radio.required),
        ).toBe(true);
        expect(element.querySelector('#cf-days')!.getAttribute('role')).toBe(
            'group',
        );
        for (const node of element.querySelectorAll('label[for]')) {
            expect(
                element.querySelector(`[id="${node.getAttribute('for')!}"]`),
            ).not.toBeNull();
        }

        const docs = element.querySelector<HTMLInputElement>('#cf-docs')!;
        expect(docs.getAttribute('aria-describedby')).toBe('cf-docs-hint');
        expect(docs.multiple).toBe(true);
        expect(docs.accept).toBe('.pdf,.jpg');
        expect(element.querySelector('#cf-docs-hint')!.textContent).toBe(
            "Jusqu'à 3 fichiers de 10 Mo chacun. Formats acceptés : PDF, JPG.",
        );
    });

    it('focuses the step title on Next, then the thank-you message', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(
                definition(
                    [
                        { key: 'a', type: 'text', label: 'A', required: false },
                        { key: 'b', type: 'text', label: 'B', required: false },
                    ],
                    {
                        steps: [
                            { key: 's1', title: 'Vous', fields: ['a'] },
                            { key: 's2', title: 'Projet', fields: ['b'] },
                        ],
                    },
                ),
            )
            .mockReturnValueOnce(reply(201, { submission_id: 's1' }));

        const { element } = await mountForm('#slot', 'f1', { fetch });
        expect(element.querySelector('.cf-required-notice')).toBeNull();
        const second = element.querySelector('[data-step="s2"]')!;
        expect(second.tagName).toBe('SECTION');
        expect(second.getAttribute('aria-labelledby')).toBe('cf-step-s2');

        element.querySelector<HTMLButtonElement>('.cf-next')!.click();
        expect(document.activeElement).toBe(
            element.querySelector('#cf-step-s2'),
        );
        expect(document.activeElement!.textContent).toBe(
            'Étape 2 sur 2 Projet',
        );

        element.dispatchEvent(new Event('submit'));
        await vi.waitFor(() =>
            expect(document.activeElement?.className).toBe('cf-success'),
        );
        expect(document.activeElement!.getAttribute('role')).toBe('status');
    });

    it('links each refused field to its message, sums them up, and clears them', async () => {
        document.body.innerHTML = '<div id="slot"></div>';
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(
                definition([
                    {
                        key: 'email',
                        type: 'email',
                        label: 'E-mail',
                        required: false,
                        help: 'Pro',
                    },
                    {
                        key: 'size',
                        type: 'radio',
                        label: 'Taille',
                        required: false,
                        options: [{ value: 's', label: 'S' }],
                    },
                ]),
            )
            .mockReturnValueOnce(
                reply(422, {
                    error: 'validation_failed',
                    errors: {
                        'answers.email': ['Adresse refusée'],
                        'answers.size': ['Choisissez une taille'],
                    },
                }),
            )
            .mockReturnValueOnce(
                reply(422, {
                    error: 'validation_failed',
                    errors: { 'answers.size': ['Choisissez une taille'] },
                }),
            );

        const { element } = await mountForm('#slot', 'f1', { fetch });
        const email = element.querySelector('#cf-email')!;
        const size = element.querySelector('#cf-size')!;

        element.dispatchEvent(new Event('submit'));
        const summary =
            element.querySelector<HTMLElement>('.cf-error-summary')!;
        await vi.waitFor(() => expect(document.activeElement).toBe(summary));
        expect(summary.querySelector('p')!.textContent).toBe(
            'Le formulaire contient 2 erreurs.',
        );
        const links = [...summary.querySelectorAll('a')];
        expect(
            links.map((link) => [link.getAttribute('href'), link.textContent]),
        ).toEqual([
            ['#cf-email', 'E-mail : Adresse refusée'],
            ['#cf-size', 'Taille : Choisissez une taille'],
        ]);
        expect(email.getAttribute('aria-invalid')).toBe('true');
        expect(email.getAttribute('aria-describedby')).toBe(
            'cf-email-help cf-email-error',
        );
        expect(element.querySelector('#cf-email-error')!.textContent).toBe(
            'Adresse refusée',
        );
        expect(size.getAttribute('aria-invalid')).toBe('true');
        expect(size.getAttribute('aria-describedby')).toBe('cf-size-error');

        links[1].click();
        expect(document.activeElement).toBe(size.querySelector('input'));

        // A single error: no summary, the field gets the focus; the fixed field is valid again
        (document.activeElement as HTMLElement).blur();
        element.dispatchEvent(new Event('submit'));
        await vi.waitFor(() =>
            expect(document.activeElement).toBe(size.querySelector('input')),
        );
        expect(summary.hidden).toBe(true);
        expect(email.hasAttribute('aria-invalid')).toBe(false);
        expect(email.getAttribute('aria-describedby')).toBe('cf-email-help');
        expect(element.querySelector('#cf-email-error')).toBeNull();
        expect(element.querySelectorAll('#cf-size-error')).toHaveLength(1);
    });
});
