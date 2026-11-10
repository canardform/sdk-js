// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createApp, createSSRApp, h, nextTick } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { createFormController } from './controller';
import { CanardForm, FieldInput, useCanardForm as useReactForm } from './react';
import {
    CanardForm as VueCanardForm,
    useCanardForm as useVueForm,
} from './vue';

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const definition = {
    id: 'f1',
    locale: 'fr',
    open: true,
    fields: [
        { key: 'subject', type: 'select', label: 'Objet', required: true },
        {
            key: 'budget',
            type: 'number',
            label: 'Budget',
            required: true,
            visible_if: {
                match: 'all' as const,
                conditions: [
                    { field: 'subject', operator: 'equals', value: 'quote' },
                ],
            },
        },
    ],
};
const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('form controller', () => {
    it('follows conditions and maps field errors by key', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
            json(422, {
                error: 'validation_failed',
                errors: { 'answers.budget': ['Requis'] },
            }),
        );
        const form = createFormController('f1', { definition, fetch });

        expect(form.isVisible('budget')).toBe(false);
        form.setAnswers({ subject: 'quote' });
        expect(form.isVisible('budget')).toBe(true);

        expect(await form.submit({ subject: 'quote' })).toBeNull();
        expect(form.getState().errors).toEqual({ budget: 'Requis' });
        expect(form.getState().status).toBe('error');
    });
});

describe('React adapter', () => {
    it('renders on the server without fetching, then sends from the browser', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>();
        function Contact() {
            const form = useReactForm('f1', { definition, fetch });
            return createElement(
                'form',
                null,
                form.isVisible('budget') ? 'avec budget' : 'sans budget',
            );
        }

        expect(renderToString(createElement(Contact))).toContain('sans budget');
        expect(fetch).not.toHaveBeenCalled();

        fetch.mockReturnValue(json(201, { submission_id: 's1' }));
        const container = document.createElement('div');
        let api: ReturnType<typeof useReactForm> | undefined;
        function Probe() {
            api = useReactForm('f1', { definition, fetch });
            return null;
        }
        await act(async () =>
            createRoot(container).render(createElement(Probe)),
        );
        await act(async () => {
            await api!.submit({ subject: 'other' });
        });
        expect(api!.status).toBe('sent');
        expect(api!.submissionId).toBe('s1');
    });
});

describe('Vue adapter', () => {
    it('loads the fields on mount and exposes reactive state', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(json(200, definition))
            .mockReturnValueOnce(json(201, { submission_id: 's2' }));
        let api: ReturnType<typeof useVueForm> | undefined;
        createApp({
            setup() {
                api = useVueForm('f1', { fetch });
                return () => h('p', api!.status.value);
            },
        }).mount(document.createElement('div'));

        await vi.waitFor(() => expect(api!.definition.value?.id).toBe('f1'));
        expect(api!.isVisible('budget')).toBe(false);
        await api!.submit({ subject: 'other' });
        await nextTick();
        expect(api!.status.value).toBe('sent');
    });
});

describe('CanardForm components', () => {
    const published = {
        id: 'f1',
        locale: 'fr',
        open: true,
        submit_label: 'Envoyer la demande',
        success_message: 'Merci !',
        fields: [
            { key: 'email', type: 'email', label: 'E-mail', required: true },
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
                    match: 'all' as const,
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
    };

    it('React: builds the published form, follows conditions, lets you replace a field', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValue(json(201, { submission_id: 's1' }));
        const container = document.createElement('div');
        document.body.append(container);

        await act(async () =>
            createRoot(container).render(
                createElement(CanardForm, {
                    formId: 'f1',
                    definition: published,
                    fetch,
                    classes: { form: 'contact' },
                    renderField: ({ field, children }) =>
                        field.key === 'email'
                            ? createElement(
                                  'div',
                                  { className: 'my-email' },
                                  createElement(FieldInput, { field }),
                              )
                            : children,
                }),
            ),
        );

        const form = container.querySelector('form')!;
        expect(form.className).toBe('contact');
        expect(
            form.querySelector('.my-email input[name="email"]'),
        ).not.toBeNull();
        expect(form.querySelector('[data-key="budget"]')).toBeNull();
        expect(form.querySelector('button')!.textContent).toBe(
            'Envoyer la demande',
        );

        const subject = form.querySelector('select')!;
        await act(async () => {
            subject.value = 'quote';
            subject.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(
            form.querySelector('[data-key="budget"] input[name="budget"]'),
        ).not.toBeNull();

        (form.querySelector('input[name="email"]') as HTMLInputElement).value =
            'a@b.fr';
        await act(async () => {
            form.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
        });
        await vi.waitFor(() =>
            expect(container.textContent).toContain('Merci !'),
        );
        container.remove();
    });

    it('Vue: builds the form and exposes a field slot', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockReturnValueOnce(json(200, published));
        const root = document.createElement('div');
        createApp({
            render: () =>
                h(VueCanardForm, { formId: 'f1', fetch } as never, {
                    field: ({
                        field,
                        input,
                    }: {
                        field: { key: string };
                        input: () => unknown;
                    }) =>
                        field.key === 'email'
                            ? h('div', { class: 'my-email' }, [
                                  input() as never,
                              ])
                            : undefined,
                }),
        }).mount(root);

        await vi.waitFor(() =>
            expect(root.querySelector('form')).not.toBeNull(),
        );
        expect(
            root.querySelector('.my-email input[name="email"]'),
        ).not.toBeNull();
        expect(
            root.querySelector('[data-key="subject"] select'),
        ).not.toBeNull();
        expect(root.querySelector('[data-key="budget"]')).toBeNull();
    });

    const stepped = {
        ...published,
        steps: [
            { key: 'who', title: 'Vous', fields: ['email'] },
            {
                key: 'what',
                title: 'Votre demande',
                fields: ['subject', 'budget'],
            },
        ],
    };

    it('React: shows one step at a time and checks it before moving on', async () => {
        const container = document.createElement('div');
        document.body.append(container);
        await act(async () =>
            createRoot(container).render(
                createElement(CanardForm, {
                    formId: 'f1',
                    definition: stepped,
                    fetch: vi.fn(),
                }),
            ),
        );
        const visibleStep = () =>
            container.querySelector<HTMLElement>('section:not([hidden])')!;
        const click = (selector: string) =>
            act(async () =>
                container.querySelector<HTMLButtonElement>(selector)!.click(),
            );

        expect(container.querySelector('.cf-progress')!.textContent).toBe(
            'Étape 1 sur 2',
        );
        expect(visibleStep().dataset.step).toBe('who');
        expect(container.querySelector('button[type="submit"]')).toBeNull();

        await click('.cf-next');
        expect(visibleStep().dataset.step).toBe('who');

        container.querySelector<HTMLInputElement>(
            'input[name="email"]',
        )!.value = 'a@b.fr';
        await click('.cf-next');
        expect(visibleStep().dataset.step).toBe('what');
        expect(container.querySelector('button[type="submit"]')).not.toBeNull();

        await click('.cf-previous');
        expect(visibleStep().dataset.step).toBe('who');
        container.remove();
    });

    it('Your HTML: Next from a button checks the current section, Enter moves on', async () => {
        const form = createFormController('f1', {
            definition: stepped,
            fetch: vi.fn(),
        });
        const element = document.createElement('form');
        element.innerHTML =
            '<section data-step="who"><input name="email" required></section>' +
            '<section data-step="what"><select name="subject"></select></section><button type="button">Suivant</button>';
        const button = element.querySelector('button')!;

        expect(form.next(button)).toBe(false);
        element.querySelector('input')!.value = 'a@b.fr';
        expect(
            await form.handleSubmit({
                preventDefault() {},
                currentTarget: element,
            }),
        ).toBeNull();
        expect(form.isStep('what')).toBe(true);
    });

    it('goes back to the step of a field refused by the server', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(
            json(422, {
                error: 'validation_failed',
                errors: { 'answers.email': ['Adresse refusée'] },
            }),
        );
        const form = createFormController('f1', { definition: stepped, fetch });
        form.next();
        expect(form.getState().step).toBe(1);

        await form.submit({ email: 'a@b.fr', subject: 'other' });
        expect(form.getState().step).toBe(0);
        expect(form.getState().errors).toEqual({ email: 'Adresse refusée' });
    });

    it('Vue: shows one step at a time', async () => {
        const root = document.createElement('div');
        createApp({
            render: () =>
                h(VueCanardForm, {
                    formId: 'f1',
                    definition: stepped,
                    fetch: vi.fn(),
                } as never),
        }).mount(root);
        await nextTick();
        const visibleStep = () =>
            root.querySelector<HTMLElement>('section:not([hidden])')!;

        expect(visibleStep().dataset.step).toBe('who');
        root.querySelector<HTMLInputElement>('input[name="email"]')!.value =
            'a@b.fr';
        root.querySelector<HTMLButtonElement>('.cf-next')!.click();
        await nextTick();
        expect(visibleStep().dataset.step).toBe('what');
        expect(root.querySelector('.cf-progress')!.textContent).toBe(
            'Étape 2 sur 2',
        );
    });

    it('renders the whole form on the server when the fields are passed (Next.js, Nuxt)', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>();
        const react = renderToString(
            createElement(CanardForm, {
                formId: 'f1',
                definition: stepped,
                fetch,
            }),
        );
        expect(react).toContain('Étape 1 sur 2');
        expect(react).toContain('name="email"');

        const vue = await renderVue(
            createSSRApp({
                render: () =>
                    h(VueCanardForm, {
                        formId: 'f1',
                        definition: stepped,
                        fetch,
                    } as never),
            }),
        );
        expect(vue).toContain('Étape 1 sur 2');
        expect(vue).toContain('name="email"');
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('closed or unavailable form', () => {
    const closed = {
        id: 'f1',
        locale: 'en',
        open: false,
        closed_message: 'Registrations are closed, see you in March.',
        fields: [],
    };

    it('React and Vue show the message set on the form', async () => {
        const container = document.createElement('div');
        await act(async () =>
            createRoot(container).render(
                createElement(CanardForm, { formId: 'f1', definition: closed }),
            ),
        );
        expect(container.querySelector('.cf-closed')!.textContent).toBe(
            closed.closed_message,
        );

        const vue = document.createElement('div');
        createApp({
            render: () =>
                h(VueCanardForm, { formId: 'f1', definition: closed }),
        }).mount(vue);
        expect(vue.querySelector('.cf-closed')!.textContent).toBe(
            closed.closed_message,
        );
    });

    it('React and Vue show a fallback when the form cannot be loaded', async () => {
        const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockRejectedValue(new TypeError('Failed to fetch'));
        const container = document.createElement('div');
        await act(async () =>
            createRoot(container).render(
                createElement(CanardForm, {
                    formId: 'f1',
                    lang: 'fr',
                    fetch,
                    loading: 'Loading…',
                }),
            ),
        );
        await vi.waitFor(() =>
            expect(
                container.querySelector('.cf-unavailable')!.textContent,
            ).toBe(
                "Ce formulaire ne peut pas s'afficher pour le moment. Réessayez plus tard.",
            ),
        );

        const vue = document.createElement('div');
        createApp({
            render: () =>
                h(VueCanardForm, {
                    formId: 'f1',
                    fetch,
                    messages: { unavailable: 'Try again tomorrow.' },
                } as never),
        }).mount(vue);
        await vi.waitFor(() =>
            expect(vue.querySelector('.cf-unavailable')!.textContent).toBe(
                'Try again tomorrow.',
            ),
        );
    });
});
