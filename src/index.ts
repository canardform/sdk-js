import { matches } from './conditions.js';
import type { Answers, ConditionGroup } from './conditions.js';

export { matches } from './conditions.js';
export type { Answers, ConditionGroup } from './conditions.js';

/** Stable codes of a refused submission (see the error codes page of the docs). */
export type ErrorCode =
    | 'validation_failed'
    | 'form_closed'
    | 'rate_limited'
    | 'captcha_failed'
    | 'quota_exceeded'
    | 'storage_quota_exceeded'
    | 'spam_rejected'
    | 'idempotency_conflict'
    | 'idempotency_in_progress'
    | 'not_found'
    | 'http_error'
    | (string & {});

/** Refused submission or unreadable form, with its stable code. */
export class CanardFormError extends Error {
    constructor(
        readonly error: ErrorCode,
        readonly status: number,
        message: string,
        readonly errors: Record<string, string[]> = {},
    ) {
        super(message);
        this.name = 'CanardFormError';
    }
}

/** Error body of the public runtime. */
type ErrorBody = {
    error?: ErrorCode;
    message?: string;
    errors?: Record<string, string[]>;
};

/** Reads a JSON body, an empty object when there is none or it is not JSON. */
async function readJson<T>(response: Response): Promise<T & ErrorBody> {
    const body: unknown = await response.json().catch(() => ({}));
    return body as T & ErrorBody;
}

/**
 * Random id (UUID v4). crypto.randomUUID only exists over HTTPS and since Safari 15.4, so this falls
 * back to crypto.getRandomValues, available everywhere (including plain HTTP sites and older phones).
 */
function uuid(): string {
    if (
        typeof crypto.randomUUID === 'function' &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- undefined outside browsers (Node)
        globalThis.isSecureContext !== false
    ) {
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type SubmitOptions = {
    /** Public forms domain (defaults to https://canardform.app). */
    publicUrl?: string;
    /** Same key = same answer when retrying; generated at random if omitted. */
    idempotencyKey?: string;
    /** Visitor's language, for the acknowledgement sent after the answer. */
    lang?: string;
    fetch?: typeof fetch;
};

/**
 * Sends an answer to a public form, from a browser or a server, without an API key.
 * Accepts an object ({ email: '…' }) or a FormData (files included). Returns the submission id.
 */
export async function submitForm(
    formId: string,
    data: Record<string, unknown> | FormData,
    options: SubmitOptions = {},
): Promise<string> {
    const url = `${options.publicUrl ?? 'https://canardform.app'}/v1/f/${encodeURIComponent(formId)}`;
    const send = options.fetch ?? globalThis.fetch.bind(globalThis);
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Idempotency-Key': options.idempotencyKey ?? uuid(),
    };
    let body: BodyInit;

    if (data instanceof FormData) {
        if (options.lang) data.set('lang', options.lang);
        body = data;
    } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ answers: data, lang: options.lang });
    }

    const response = await send(url, { method: 'POST', headers, body });
    const json = await readJson<{ submission_id: string }>(response);

    if (!response.ok) {
        throw new CanardFormError(
            json.error ?? 'http_error',
            response.status,
            json.message ?? `HTTP ${String(response.status)}`,
            json.errors ?? {},
        );
    }

    return json.submission_id;
}

export type PublicField = {
    key: string;
    type: string;
    label: string;
    help?: string;
    placeholder?: string;
    required: boolean;
    options?: { value: string; label: string }[];
    /** The field is shown only when these conditions are met (see `visibleKeys`). */
    visible_if?: ConditionGroup;
};

/** A step of the form, in order (keys of its fields). */
export type PublicStep = {
    key: string;
    title: string | null;
    fields: string[];
};

/** First error of each rejected field, by key ("answers.email.0" becomes "email"). */
export function fieldErrors(
    errors: Record<string, string[]>,
): Record<string, string> {
    const byField: Record<string, string> = {};
    for (const [key, messages] of Object.entries(errors)) {
        const field = key.replace(/^(answers|files)\./, '').split('.')[0];
        byField[field] ??= messages[0];
    }
    return byField;
}

/**
 * The steps to go through for these visible fields: a step whose fields are all hidden by their
 * conditions is skipped, as on the Canard Form page. A form without steps has a single one.
 */
export function stepsOf(
    definition: PublicForm,
    visible: Set<string> | null = null,
): { key: string; title: string | null; fields: PublicField[] }[] {
    const byKey = new Map(definition.fields.map((field) => [field.key, field]));
    const steps = definition.steps?.length
        ? definition.steps
        : [
              {
                  key: 'main',
                  title: null,
                  fields: definition.fields.map((field) => field.key),
              },
          ];

    return steps
        .map((step) => ({
            key: step.key,
            title: step.title,
            fields: step.fields.flatMap((key) => byKey.get(key) ?? []),
        }))
        .filter((step) =>
            step.fields.some((field) => !visible || visible.has(field.key)),
        );
}

/** Are a step's controls valid? Reports the first invalid one to the visitor (browser validation). */
export function validateStep(container: HTMLElement): boolean {
    for (const control of container.querySelectorAll<HTMLInputElement>(
        'input, select, textarea',
    )) {
        if (!control.disabled && !control.checkValidity()) {
            control.reportValidity();
            return false;
        }
    }

    return true;
}

/**
 * The fields visible for these answers, in order, as the server computes them: a hidden field does not
 * count towards the conditions of the fields after it. Useful for custom rendering (React, Vue…).
 */
export function visibleKeys(
    fields: PublicField[],
    answers: Answers,
): Set<string> {
    const visible = new Set<string>();
    const effective: Answers = {};

    for (const field of fields) {
        if (field.visible_if && !matches(field.visible_if, effective)) {
            continue;
        }
        visible.add(field.key);
        effective[field.key] = answers[field.key] ?? null;
    }

    return visible;
}

/** The answers of an HTML form (multiple checkboxes as an array), for `visibleKeys`. */
export function answersOf(form: HTMLFormElement): Answers {
    const answers: Answers = {};
    for (const [name, value] of new FormData(form)) {
        if (typeof value !== 'string') continue;
        if (name.endsWith('[]')) {
            const key = name.slice(0, -2);
            answers[key] = [
                ...((answers[key] as string[] | undefined) ?? []),
                value,
            ];
        } else {
            answers[name] = value;
        }
    }
    return answers;
}

export type PublicForm = {
    id: string;
    locale: string;
    open: boolean;
    /** hCaptcha anti-robot check required: site key and widget script. */
    hcaptcha?: { sitekey: string; script: string } | null;
    submit_label?: string;
    success_message?: string;
    /** Shown instead of the form when it is not accepting answers (`open: false`). */
    closed_message?: string;
    fields: PublicField[];
    /** The form's steps, in order (with the field keys of each). */
    steps?: PublicStep[];
};

/** The published form's fields, translated (browser language or `lang`). */
export async function getForm(
    formId: string,
    options: SubmitOptions = {},
): Promise<PublicForm> {
    const base = options.publicUrl ?? 'https://canardform.app';
    const send = options.fetch ?? globalThis.fetch.bind(globalThis);
    const query = options.lang
        ? `?lang=${encodeURIComponent(options.lang)}`
        : '';
    const response = await send(
        `${base}/v1/f/${encodeURIComponent(formId)}${query}`,
        {
            headers: { Accept: 'application/json' },
        },
    );

    if (!response.ok) {
        throw new CanardFormError(
            'not_found',
            response.status,
            `HTTP ${String(response.status)}`,
        );
    }

    return (await response.json()) as PublicForm;
}

const MESSAGES = {
    en: {
        submit: 'Send',
        success: 'Thank you!',
        closed: 'This form is closed.',
        unavailable:
            'This form cannot be shown right now. Please try again later.',
        next: 'Next',
        previous: 'Previous',
        progress: (step: number, total: number) => `Step ${step} of ${total}`,
    },
    fr: {
        submit: 'Envoyer',
        success: 'Merci !',
        closed: 'Ce formulaire est fermé.',
        unavailable:
            "Ce formulaire ne peut pas s'afficher pour le moment. Réessayez plus tard.",
        next: 'Suivant',
        previous: 'Précédent',
        progress: (step: number, total: number) => `Étape ${step} sur ${total}`,
    },
};

/**
 * Built-in texts in the form's language (French or English, English otherwise), used when neither the
 * form nor the `messages` option provides one.
 */
export function defaultMessages(locale?: string | null) {
    // Form not loaded yet (or unreachable): the visitor's browser language
    locale ??= typeof navigator === 'undefined' ? null : navigator.language;
    return locale?.toLowerCase().startsWith('fr') ? MESSAGES.fr : MESSAGES.en;
}

type HCaptchaApi = {
    render: (
        container: HTMLElement,
        options: Record<string, unknown>,
    ) => string;
    reset: (widget?: string) => void;
};

let hcaptchaLoading: Promise<HCaptchaApi> | null = null;

/** Loads the hCaptcha script once (explicit rendering). */
function loadHcaptcha(script: string): Promise<HCaptchaApi> {
    const scope = window as unknown as {
        hcaptcha?: HCaptchaApi;
        canardHcaptchaLoad?: () => void;
    };

    if (scope.hcaptcha?.render) {
        return Promise.resolve(scope.hcaptcha);
    }

    hcaptchaLoading ??= new Promise((resolve, reject) => {
        scope.canardHcaptchaLoad = () => resolve(scope.hcaptcha as HCaptchaApi);
        const tag = document.createElement('script');
        tag.src = `${script}?render=explicit&onload=canardHcaptchaLoad`;
        tag.async = true;
        tag.onerror = () => {
            hcaptchaLoading = null;
            reject(new Error('Canard Form: hCaptcha could not load'));
        };
        document.head.append(tag);
    });

    return hcaptchaLoading;
}

/**
 * Renders the hCaptcha anti-robot check in `container` (place it inside the <form>): the widget adds
 * the hidden "h-captcha-response" field, sent with the answer. Does nothing if the form does not
 * require the check. Browser only.
 */
export async function renderCaptcha(
    container: HTMLElement,
    definition: PublicForm,
): Promise<void> {
    if (
        !definition.hcaptcha ||
        typeof document === 'undefined' ||
        container.dataset.hcaptchaWidgetId
    ) {
        return;
    }

    // Only hCaptcha's own script is ever loaded, whatever the response says
    const script = new URL(definition.hcaptcha.script);
    if (
        script.protocol !== 'https:' ||
        !/(^|\.)hcaptcha\.com$/.test(script.hostname)
    ) {
        throw new Error('Canard Form: unexpected hCaptcha script');
    }

    container.dataset.hcaptchaWidgetId = 'pending';
    const api = await loadHcaptcha(`${script.origin}${script.pathname}`);
    container.dataset.hcaptchaWidgetId = api.render(container, {
        sitekey: definition.hcaptcha.sitekey,
        hl: definition.locale,
    });
}

/** Resets a form's hCaptcha widget after a submission (a token can only be used once). */
export function resetCaptcha(form: HTMLFormElement): void {
    const container = form.querySelector<HTMLElement>(
        '[data-hcaptcha-widget-id]',
    );
    const id = container?.dataset.hcaptchaWidgetId;
    const api = (window as unknown as { hcaptcha?: HCaptchaApi }).hcaptcha;

    if (api && id && id !== 'pending') {
        api.reset(id);
    }
}

export type MountOptions = SubmitOptions & {
    /** After a successful submission. By default the form is replaced by the thank-you message. */
    onSubmitted?: (submissionId: string, form: HTMLFormElement) => void;
    /** Submission rejected (invalid field, closed form…). By default the message is shown below the form. */
    onError?: (error: CanardFormError | Error, form: HTMLFormElement) => void;
    /** Add or adjust the data just before sending (hidden field, campaign id…). */
    beforeSubmit?: (
        data: FormData,
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- a callback may return nothing
    ) => FormData | void | Promise<FormData | void>;
    /** Replaces a field's rendering; returning `undefined` keeps the default rendering. */
    renderField?: (
        field: PublicField,
        element: HTMLElement,
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- a callback may return nothing
    ) => HTMLElement | void;
    /** CSS classes set on each element (defaults: cf-form, cf-field, cf-error, cf-success, cf-closed). */
    classes?: Partial<
        Record<
            | 'form'
            | 'field'
            | 'error'
            | 'success'
            | 'closed'
            | 'unavailable'
            | 'submit',
            string
        >
    >;
    /** Fallback texts when the form does not provide them. */
    messages?: Partial<
        Record<
            | 'submit'
            | 'success'
            | 'closed'
            | 'unavailable'
            | 'error'
            | 'next'
            | 'previous',
            string
        >
    >;
};

export type MountedForm = {
    /** The published form as fetched (fields, language, texts). */
    definition: PublicForm;
    /** The <form> element that was built. */
    element: HTMLFormElement;
    /** Removes the form from the page. */
    destroy: () => void;
};

/** Default CSS classes (mountForm and the React / Vue components). */
export const CLASSES = {
    form: 'cf-form',
    field: 'cf-field',
    error: 'cf-error',
    success: 'cf-success',
    closed: 'cf-closed',
    unavailable: 'cf-unavailable',
    submit: 'cf-submit',
};

/**
 * A field's control described without DOM or framework (tag, attributes, choices): the shared basis for
 * rendering in mountForm and the React and Vue components.
 */
export type FieldControl = {
    tag: 'input' | 'textarea' | 'select' | 'choices';
    attrs: Record<string, string | boolean | undefined>;
    choices: {
        type: 'radio' | 'checkbox';
        name: string;
        value: string;
        label: string;
    }[];
};

export function fieldControl(field: PublicField): FieldControl {
    const id = `cf-${field.key}`;
    const base = {
        id,
        name: field.key,
        required: field.required,
        placeholder: field.placeholder,
    };
    const options = field.options ?? [];

    switch (field.type) {
        case 'textarea':
            return { tag: 'textarea', attrs: base, choices: [] };
        case 'select':
            return {
                tag: 'select',
                attrs: { id, name: field.key, required: field.required },
                choices: [],
            };
        case 'radio':
        case 'checkboxes':
            return {
                tag: 'choices',
                attrs: { role: 'group', 'aria-labelledby': `${id}-label` },
                choices: options.map((option) => ({
                    type: field.type === 'radio' ? 'radio' : 'checkbox',
                    name: field.type === 'radio' ? field.key : `${field.key}[]`,
                    value: option.value,
                    label: option.label,
                })),
            };
        default: {
            const types = [
                'email',
                'url',
                'tel',
                'number',
                'date',
                'file',
                'checkbox',
            ];
            return {
                tag: 'input',
                attrs: {
                    ...base,
                    type: types.includes(field.type) ? field.type : 'text',
                    value: field.type === 'checkbox' ? '1' : undefined,
                },
                choices: [],
            };
        }
    }
}

/** A field as unstyled HTML: label, control, help text. Exported to compose your own rendering. */
export function renderField(field: PublicField): HTMLElement {
    const el = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        props: Record<string, string | boolean | undefined> = {},
        text?: string,
    ) => {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(props)) {
            if (value === true) node.setAttribute(name, '');
            else if (typeof value === 'string') node.setAttribute(name, value);
        }
        if (text) node.textContent = text;
        return node;
    };
    const id = `cf-${field.key}`;
    const common = {
        id,
        name: field.key,
        required: field.required,
        placeholder: field.placeholder,
    };
    let control: HTMLElement;

    if (field.type === 'textarea') {
        control = el('textarea', common);
    } else if (field.type === 'select') {
        control = el('select', {
            id,
            name: field.key,
            required: field.required,
        });
        control.append(el('option', { value: '' }, ''));
        for (const option of field.options ?? []) {
            control.append(el('option', { value: option.value }, option.label));
        }
    } else if (field.type === 'radio' || field.type === 'checkboxes') {
        control = el('div', {
            role: 'group',
            'aria-labelledby': `${id}-label`,
        });
        for (const option of field.options ?? []) {
            const choice = el('label');
            choice.append(
                el('input', {
                    type: field.type === 'radio' ? 'radio' : 'checkbox',
                    name: field.type === 'radio' ? field.key : `${field.key}[]`,
                    value: option.value,
                }),
                ` ${option.label}`,
            );
            control.append(choice);
        }
    } else {
        const types = [
            'email',
            'url',
            'tel',
            'number',
            'date',
            'file',
            'checkbox',
        ];
        control = el('input', {
            ...common,
            type: types.includes(field.type) ? field.type : 'text',
            value: field.type === 'checkbox' ? '1' : undefined,
        });
    }

    const wrapper = el('div', {
        'data-key': field.key,
        'data-type': field.type,
    });
    wrapper.append(
        el('label', { id: `${id}-label`, for: id }, field.label),
        control,
    );
    if (field.help) wrapper.append(el('small', {}, field.help));

    return wrapper;
}

/**
 * Builds the form in `target` from its published version (the fields follow what you change in
 * Canard Form, without touching the site) and handles submission. Everything is configured through
 * options: classes, texts, field rendering, extra data, submission callbacks.
 */
export async function mountForm(
    target: string | HTMLElement,
    formId: string,
    options: MountOptions = {},
): Promise<MountedForm> {
    // mountForm builds DOM: for server-side rendering, use getForm / submitForm or the React and Vue adapters
    if (typeof document === 'undefined') {
        throw new Error('Canard Form: mountForm runs in the browser only');
    }

    const root =
        typeof target === 'string'
            ? document.querySelector<HTMLElement>(target)
            : target;

    if (!root) {
        throw new Error(
            `Canard Form: ${typeof target === 'string' ? target : 'element'} not found`,
        );
    }

    const classes = { ...CLASSES, ...options.classes };
    let definition: PublicForm;
    try {
        definition = await getForm(formId, options);
    } catch (exception) {
        // Unknown form, server unreachable…: a message instead of an empty spot, then the error for the page
        const unavailable = document.createElement('p');
        unavailable.className = classes.unavailable;
        unavailable.setAttribute('role', 'alert');
        unavailable.textContent =
            options.messages?.unavailable ??
            defaultMessages(options.lang).unavailable;
        root.replaceChildren(unavailable);
        throw exception;
    }
    const ui = defaultMessages(definition.locale);
    const text = (tag: 'p' | 'button', className: string, content: string) => {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = content;
        return node;
    };
    const element = document.createElement('form');
    element.className = classes.form;
    const destroy = () => root.replaceChildren();

    if (!definition.open) {
        const closed = text(
            'p',
            classes.closed,
            definition.closed_message ?? options.messages?.closed ?? ui.closed,
        );
        root.replaceChildren(closed);
        return { definition, element, destroy };
    }

    // One section per step; only one visible at a time
    const allSteps = stepsOf(definition);
    const multiStep = allSteps.length > 1;
    for (const step of allSteps) {
        const section = document.createElement('section');
        section.className = 'cf-step';
        section.dataset.step = step.key;
        if (multiStep && step.title)
            section.append(text('p', 'cf-step-title', step.title));
        for (const field of step.fields) {
            const fallback = renderField(field);
            fallback.classList.add(classes.field);
            section.append(options.renderField?.(field, fallback) ?? fallback);
        }
        element.append(section);
    }
    const progress = text('p', 'cf-progress', '');
    if (multiStep) element.prepend(progress);
    let current = 0;
    let visibleSteps = allSteps;

    // Conditional fields and steps: a hidden field is also disabled (neither sent nor required)
    const applyConditions = () => {
        const visible = visibleKeys(definition.fields, answersOf(element));
        for (const wrapper of element.querySelectorAll<HTMLElement>(
            '[data-key]',
        )) {
            const shown = visible.has(wrapper.dataset.key ?? '');
            wrapper.hidden = !shown;
            for (const control of wrapper.querySelectorAll<HTMLInputElement>(
                'input, select, textarea',
            )) {
                control.disabled = !shown;
            }
        }
        visibleSteps = stepsOf(definition, visible);
        current = Math.min(current, visibleSteps.length - 1);
        const active = visibleSteps[current]?.key;
        for (const section of element.querySelectorAll<HTMLElement>(
            '[data-step]',
        )) {
            section.hidden = section.dataset.step !== active;
        }
        const last = current === visibleSteps.length - 1;
        progress.textContent = ui.progress(current + 1, visibleSteps.length);
        previous.hidden = current === 0;
        next.hidden = last;
        button.hidden = !last;
        captchaSlot.hidden = !last;
    };
    const activeSection = () =>
        element.querySelector<HTMLElement>(
            `[data-step="${visibleSteps[current]?.key}"]`,
        );
    const go = (offset: number) => {
        current = Math.max(
            0,
            Math.min(visibleSteps.length - 1, current + offset),
        );
        applyConditions();
        activeSection()
            ?.querySelector<HTMLElement>('input, select, textarea')
            ?.focus();
    };

    const captchaSlot = document.createElement('div');
    captchaSlot.className = 'cf-captcha';
    if (definition.hcaptcha) {
        element.append(captchaSlot);
        void renderCaptcha(captchaSlot, definition).catch(
            (exception: unknown) => {
                error.textContent = (exception as Error).message;
                error.hidden = false;
            },
        );
    }

    const error = text('p', classes.error, '');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const button = text(
        'button',
        classes.submit,
        definition.submit_label ?? options.messages?.submit ?? ui.submit,
    );
    button.setAttribute('type', 'submit');
    const previous = text(
        'button',
        'cf-previous',
        options.messages?.previous ?? ui.previous,
    );
    previous.setAttribute('type', 'button');
    previous.addEventListener('click', () => go(-1));
    const next = text('button', 'cf-next', options.messages?.next ?? ui.next);
    next.setAttribute('type', 'button');
    next.addEventListener('click', () => {
        const section = activeSection();
        if (!section || validateStep(section)) go(1);
    });
    // Previous / Next only when there are several steps
    element.append(error, ...(multiStep ? [previous, next] : []), button);
    element.addEventListener('input', applyConditions);
    element.addEventListener('change', applyConditions);
    applyConditions();

    const submit = async (event: Event) => {
        event.preventDefault();
        // Enter on an intermediate step: move to the next one instead of sending
        if (current < visibleSteps.length - 1) {
            next.click();
            return;
        }
        button.toggleAttribute('disabled', true);
        error.hidden = true;
        element
            .querySelectorAll('.cf-field-error')
            .forEach((node) => node.remove());
        try {
            const data = new FormData(element);
            const prepared = (await options.beforeSubmit?.(data)) ?? data;
            const id = await submitForm(formId, prepared, {
                ...options,
                lang: definition.locale,
            });

            if (options.onSubmitted) {
                options.onSubmitted(id, element);
            } else {
                root.replaceChildren(
                    text(
                        'p',
                        classes.success,
                        definition.success_message ??
                            options.messages?.success ??
                            ui.success,
                    ),
                );
            }
        } catch (exception) {
            const failure = exception as CanardFormError | Error;
            if (options.onError) {
                options.onError(failure, element);
            } else {
                const byField =
                    failure instanceof CanardFormError
                        ? fieldErrors(failure.errors)
                        : {};
                // Error below each rejected field, and back to the step of the first one
                for (const [key, message] of Object.entries(byField)) {
                    element
                        .querySelector(`[data-key="${key}"]`)
                        ?.append(
                            text(
                                'p',
                                `${classes.error} cf-field-error`,
                                message,
                            ),
                        );
                }
                const step = visibleSteps.findIndex((candidate) =>
                    candidate.fields.some((field) => field.key in byField),
                );
                if (step >= 0) {
                    go(step - current);
                } else {
                    error.textContent =
                        options.messages?.error ?? failure.message;
                    error.hidden = false;
                }
            }
            button.toggleAttribute('disabled', false);
            resetCaptcha(element);
        }
    };
    element.addEventListener('submit', (event) => void submit(event));

    root.replaceChildren(element);

    return { definition, element, destroy };
}
