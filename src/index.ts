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
    | 'origin_not_allowed'
    | 'spam_rejected'
    | 'idempotency_conflict'
    | 'idempotency_in_progress'
    | 'technical_error'
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
    /** Sentence for the visitor, in the requested language, without technical detail. */
    message?: string;
    errors?: Record<string, string[]>;
    /** Short reference of a technical error, to quote to support. */
    reference?: string;
};

const DOCS = 'https://canardform.github.io/sdk-js/guide/errors';

/** What a developer can do about a refusal; never shown to the visitor, only in the console. */
const HINTS: Partial<Record<ErrorCode, string>> = {
    origin_not_allowed:
        "this website is not in the form's allowed websites: add it in the form settings (localhost too, for local tests).",
    captcha_failed:
        'the hCaptcha token is missing, invalid or already used (each token works once).',
    quota_exceeded: "the organization's monthly answer quota is reached.",
    storage_quota_exceeded: "the organization's file storage is full.",
    form_closed: 'the form is suspended, archived or outside its dates.',
    technical_error:
        'an error on our side, nothing was saved; quote the reference to support.',
};

/** Logs a refusal for the developer (code, status, reference, what to do): the visitor only sees `message`. */
function report(
    action: string,
    formId: string,
    status: number,
    json: ErrorBody,
): void {
    // An invalid answer is the visitor's business, not a bug to look into
    if (json.error === 'validation_failed' || typeof console === 'undefined') {
        return;
    }
    const code = json.error ?? 'http_error';
    console.warn(
        `[Canard Form] ${action} of form ${formId} refused: ${code} (HTTP ${String(status)})` +
            (typeof location === 'undefined'
                ? ''
                : ` from ${location.origin}`) +
            (HINTS[code] ? `, ${HINTS[code]}` : '.') +
            (json.reference ? ` Reference: ${json.reference}.` : '') +
            ` ${DOCS}`,
    );
}

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
    /**
     * Your own sentence for a refusal, by error code (`{ quota_exceeded: '…' }`), instead of the one sent
     * by the server in the form's language.
     */
    errorMessages?: Partial<Record<ErrorCode, string>>;
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
        report('Submission', formId, response.status, json);
        throw new CanardFormError(
            json.error ?? 'http_error',
            response.status,
            options.errorMessages?.[json.error ?? 'http_error'] ??
                json.message ??
                defaultMessages(options.lang).failure,
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
    /** Purpose of the field for browser autofill (WCAG 1.3.5): `name`, `email`, `postal-code`… */
    autocomplete?: string;
    /** Autofill turned off by the form's author: the control gets `autocomplete="off"`. */
    no_autofill?: boolean;
    /** File field limits: number of files, size of each file in MB, accepted extensions. */
    rules?: { max_files?: number; max_size?: number; accept?: string[] };
    /** Hidden field (`type: 'hidden'`): page address parameter that fills it, and its default value. */
    param?: string;
    default?: string;
};

/**
 * Adds the value of each hidden field the data does not already carry: the page address parameter
 * (`?utm_source=…`), otherwise the field's default. Never rendered, never blocking.
 */
export function withHiddenValues<T extends FormData | Record<string, unknown>>(
    definition: PublicForm,
    data: T,
): T {
    const query = new URLSearchParams(
        // No address on the server (SSR): the default only
        typeof location === 'undefined' ? '' : location.search,
    );
    for (const field of definition.fields) {
        if (field.type !== 'hidden') continue;
        const value = query.get(field.param ?? field.key) || field.default;
        if (!value) continue;
        if (data instanceof FormData) {
            if (!data.get(field.key)) data.set(field.key, value);
        } else if (!data[field.key]) {
            data[field.key] = value;
        }
    }
    return data;
}

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
            // Hidden fields are never shown: sent on submission by withHiddenValues
            fields: step.fields
                .flatMap((key) => byKey.get(key) ?? [])
                .filter((field) => field.type !== 'hidden'),
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
        // origin_not_allowed (403): this website is not in the form's allowed websites
        const json =
            response.status === 403 ? await readJson<object>(response) : {};
        const error = json.error ?? 'not_found';
        report('Loading', formId, response.status, { ...json, error });
        throw new CanardFormError(
            error,
            response.status,
            defaultMessages(options.lang).unavailable,
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
        required: 'Fields marked with an asterisk (*) are required.',
        errors: (count: number) =>
            count > 1
                ? `The form contains ${count} errors.`
                : 'The form contains 1 error.',
        errorItem: (label: string, message: string) => `${label}: ${message}`,
        captcha: 'Check the verification box before sending.',
        files: (count: number, size?: number) =>
            `Up to ${count} file${count > 1 ? 's' : ''}${size ? ` of ${size} MB${count > 1 ? ' each' : ''}` : ''}.`,
        formats: (list: string) => `Accepted formats: ${list}.`,
        failure: 'Something went wrong. Please try again in a moment.',
        network:
            'Unable to connect. Check your network and try again: your answers are kept.',
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
        required: "Les champs marqués d'un astérisque (*) sont obligatoires.",
        errors: (count: number) =>
            count > 1
                ? `Le formulaire contient ${count} erreurs.`
                : 'Le formulaire contient 1 erreur.',
        errorItem: (label: string, message: string) => `${label} : ${message}`,
        captcha: "Cochez la case de vérification avant d'envoyer.",
        files: (count: number, size?: number) =>
            `Jusqu'à ${count} fichier${count > 1 ? 's' : ''}${size ? ` de ${size} Mo${count > 1 ? ' chacun' : ''}` : ''}.`,
        formats: (list: string) => `Formats acceptés : ${list}.`,
        failure: 'Une erreur est survenue. Réessayez dans un instant.',
        network:
            'Connexion impossible. Vérifiez votre réseau puis réessayez : vos réponses sont conservées.',
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

/**
 * Text to show the visitor for a failure: the refusal already translated, or for anything else (server
 * unreachable, hCaptcha script blocked…) the network message rather than the browser's English one.
 */
export function errorMessage(exception: unknown, locale?: string | null) {
    return exception instanceof CanardFormError
        ? exception.message
        : defaultMessages(locale).network;
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

/** Autofill purpose deduced from the field type when the form does not set one. */
const AUTOCOMPLETE: Record<string, string | undefined> = {
    email: 'email',
    tel: 'tel',
    url: 'url',
};

/**
 * The constraints of a file field written out ("Up to 3 files of 10 MB each. Accepted formats: PDF, JPG."),
 * in the form's language; undefined for other fields or a file field without limits.
 */
export function fieldHint(
    field: PublicField,
    locale?: string | null,
): string | undefined {
    const {
        max_files: count = 1,
        max_size: size,
        accept = [],
    } = field.rules ?? {};
    if (field.type !== 'file' || (count <= 1 && !size && !accept.length)) {
        return undefined;
    }
    const ui = defaultMessages(locale);
    return [
        count > 1 || size ? ui.files(count, size) : '',
        accept.length
            ? ui.formats(accept.map((ext) => ext.toUpperCase()).join(', '))
            : '',
    ]
        .filter(Boolean)
        .join(' ');
}

/**
 * A field's control described without DOM or framework (tag, attributes, choices): the shared basis for
 * rendering in mountForm and the React and Vue components. With `error`, the control is marked invalid
 * and described by its message (id `cf-<key>-error`), as well as by its help (`cf-<key>-help`) and, for a
 * file, its constraints (`cf-<key>-hint`).
 */
export type FieldControl = {
    tag: 'input' | 'textarea' | 'select' | 'choices';
    attrs: Record<string, string | boolean | undefined>;
    choices: {
        type: 'radio' | 'checkbox';
        name: string;
        value: string;
        label: string;
        required: boolean;
    }[];
};

export function fieldControl(
    field: PublicField,
    error?: string | null,
): FieldControl {
    const id = `cf-${field.key}`;
    const describedBy = [
        field.help && `${id}-help`,
        fieldHint(field) && `${id}-hint`,
        error && `${id}-error`,
    ]
        .filter(Boolean)
        .join(' ');
    const a11y = {
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? 'true' : undefined,
    };
    const base = {
        id,
        name: field.key,
        required: field.required,
        autocomplete: field.no_autofill
            ? 'off'
            : (field.autocomplete ?? AUTOCOMPLETE[field.type]),
        ...a11y,
    };
    const options = field.options ?? [];

    switch (field.type) {
        case 'textarea':
            return {
                tag: 'textarea',
                attrs: { ...base, placeholder: field.placeholder },
                choices: [],
            };
        case 'select':
            return { tag: 'select', attrs: base, choices: [] };
        case 'radio':
        case 'checkboxes': {
            const radio = field.type === 'radio';
            // The group is named by the field's label (an element with id cf-<key>-label, not a <label for>)
            return {
                tag: 'choices',
                attrs: {
                    id,
                    role: radio ? 'radiogroup' : 'group',
                    'aria-labelledby': `${id}-label`,
                    'aria-required': field.required ? 'true' : undefined,
                    ...a11y,
                },
                choices: options.map((option) => ({
                    type: radio ? 'radio' : 'checkbox',
                    name: radio ? field.key : `${field.key}[]`,
                    value: option.value,
                    label: option.label,
                    required: radio && field.required,
                })),
            };
        }
        case 'file': {
            const { max_files = 1, accept = [] } = field.rules ?? {};
            return {
                tag: 'input',
                attrs: {
                    ...base,
                    autocomplete: undefined,
                    type: 'file',
                    name: max_files > 1 ? `${field.key}[]` : field.key,
                    multiple: max_files > 1,
                    accept: accept.length
                        ? accept.map((ext) => `.${ext}`).join(',')
                        : undefined,
                },
                choices: [],
            };
        }
        default: {
            const types = ['email', 'url', 'tel', 'number', 'date', 'checkbox'];
            return {
                tag: 'input',
                attrs: {
                    ...base,
                    placeholder: field.placeholder,
                    type: types.includes(field.type) ? field.type : 'text',
                    // Never `value: undefined`: Vue would empty what the visitor typed at each render
                    ...(field.type === 'checkbox' ? { value: '1' } : {}),
                },
                choices: [],
            };
        }
    }
}

/** Builds a DOM element from attributes (true = empty attribute, false / undefined = absent). */
function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Record<string, string | boolean | undefined> = {},
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
        if (value === true) node.setAttribute(name, '');
        else if (typeof value === 'string') node.setAttribute(name, value);
    }
    if (text) node.textContent = text;
    return node;
}

/**
 * A field as unstyled HTML: label (with `*` when required), control, help text and file constraints.
 * Exported to compose your own rendering; `locale` is the form's language (texts of the constraints).
 */
export function renderField(
    field: PublicField,
    locale?: string | null,
): HTMLElement {
    const id = `cf-${field.key}`;
    const control = fieldControl(field);
    const input = el(
        control.tag === 'choices' ? 'div' : control.tag,
        control.attrs,
    );

    if (control.tag === 'select') {
        input.append(el('option', { value: '' }, ''));
        for (const option of field.options ?? []) {
            input.append(el('option', { value: option.value }, option.label));
        }
    }
    for (const choice of control.choices) {
        const label = el('label');
        label.append(
            el('input', {
                type: choice.type,
                name: choice.name,
                value: choice.value,
                required: choice.required,
            }),
            ` ${choice.label}`,
        );
        input.append(label);
    }

    // A group of choices is named by aria-labelledby: a <label for> would point to no control
    const label = el(
        control.tag === 'choices' ? 'span' : 'label',
        { id: `${id}-label`, for: control.tag === 'choices' ? undefined : id },
        field.label,
    );
    if (field.required) {
        label.append(
            ' ',
            el('span', { class: 'cf-required', 'aria-hidden': 'true' }, '*'),
        );
    }
    const wrapper = el('div', {
        'data-key': field.key,
        'data-type': field.type,
    });
    wrapper.append(label, input);
    if (field.help)
        wrapper.append(el('small', { id: `${id}-help` }, field.help));
    const hint = fieldHint(field, locale);
    if (hint) {
        wrapper.append(
            el('small', { id: `${id}-hint`, class: 'cf-hint' }, hint),
        );
    }

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
    const text = (
        tag: 'p' | 'button' | 'span' | 'h2',
        className: string,
        content: string,
    ) => el(tag, { class: className }, content);
    const element = document.createElement('form');
    element.className = classes.form;
    element.lang = definition.locale;
    const destroy = () => root.replaceChildren();

    if (!definition.open) {
        const closed = text(
            'p',
            classes.closed,
            definition.closed_message ?? options.messages?.closed ?? ui.closed,
        );
        closed.lang = definition.locale;
        root.replaceChildren(closed);
        return { definition, element, destroy };
    }

    // Summary of the errors refused by the server, focused after a failed submission
    const summary = el('div', {
        class: 'cf-error-summary',
        tabindex: '-1',
        hidden: true,
    });
    element.append(summary);
    if (definition.fields.some((field) => field.required)) {
        element.append(text('p', 'cf-required-notice', ui.required));
    }

    // One section per step, named by its title (with "Step x of y"); only one visible at a time
    const allSteps = stepsOf(definition);
    const multiStep = allSteps.length > 1;
    for (const step of allSteps) {
        const section = el('section', {
            class: 'cf-step',
            'data-step': step.key,
        });
        if (multiStep) {
            const heading = el('h2', {
                class: 'cf-step-title',
                id: `cf-step-${step.key}`,
                tabindex: '-1',
            });
            heading.append(text('span', 'cf-progress', ''));
            if (step.title) {
                heading.append(' ', text('span', 'cf-step-name', step.title));
            }
            section.setAttribute('aria-labelledby', heading.id);
            section.append(heading);
        }
        for (const field of step.fields) {
            const fallback = renderField(field, definition.locale);
            // Several classes allowed ("grid gap-2"), like the other `classes` options
            fallback.classList.add(
                ...classes.field.split(/\s+/).filter(Boolean),
            );
            section.append(options.renderField?.(field, fallback) ?? fallback);
        }
        element.append(section);
    }
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
        visibleSteps.forEach((step, index) => {
            const progress = element.querySelector(
                `[data-step="${step.key}"] .cf-progress`,
            );
            if (progress) {
                progress.textContent = ui.progress(
                    index + 1,
                    visibleSteps.length,
                );
            }
        });
        const last = current === visibleSteps.length - 1;
        previous.hidden = current === 0;
        next.hidden = last;
        button.hidden = !last;
        captchaSlot.hidden = !last;
    };
    const activeSection = () =>
        element.querySelector<HTMLElement>(
            `[data-step="${visibleSteps[current]?.key}"]`,
        );
    const stepOf = (key: string) =>
        visibleSteps.findIndex((step) =>
            step.fields.some((field) => field.key === key),
        );
    /** Shows the step of a field and focuses its control (first choice of a group). */
    const focusField = (key: string) => {
        const step = stepOf(key);
        if (step >= 0) current = step;
        applyConditions();
        element
            .querySelector<HTMLElement>(
                `[data-key="${key}"] :is(input, select, textarea)`,
            )
            ?.focus();
    };
    // Moving between steps focuses the step's title, so that "Step x of y" is read out
    const go = (offset: number) => {
        current = Math.max(
            0,
            Math.min(visibleSteps.length - 1, current + offset),
        );
        applyConditions();
        activeSection()?.querySelector<HTMLElement>('.cf-step-title')?.focus();
    };

    const captchaError = text('p', classes.error, ui.captcha);
    captchaError.id = 'cf-captcha-error';
    captchaError.setAttribute('role', 'alert');
    captchaError.hidden = true;
    const captchaSlot = el('div', { class: 'cf-captcha' });
    if (definition.hcaptcha) {
        element.append(captchaError, captchaSlot);
        void renderCaptcha(captchaSlot, definition).catch(
            (exception: unknown) => {
                error.textContent = errorMessage(exception, definition.locale);
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

    /** Removes the messages of the previous attempt and the invalid state of the controls. */
    const clearErrors = () => {
        error.hidden = true;
        summary.hidden = true;
        summary.replaceChildren();
        element
            .querySelectorAll('.cf-field-error')
            .forEach((node) => node.remove());
        for (const control of element.querySelectorAll('[aria-invalid]')) {
            control.removeAttribute('aria-invalid');
            const ids = (control.getAttribute('aria-describedby') ?? '')
                .split(' ')
                .filter((id) => id && !id.endsWith('-error'))
                .join(' ');
            if (ids) control.setAttribute('aria-describedby', ids);
            else control.removeAttribute('aria-describedby');
        }
    };
    /** Message below each rejected field, linked to its control, then a summary or the field focused. */
    const showErrors = (byField: Record<string, string>) => {
        const shown = definition.fields.filter(
            (field) =>
                field.key in byField &&
                element.querySelector(`[data-key="${field.key}"]`),
        );
        for (const field of shown) {
            const id = `cf-${field.key}`;
            element.querySelector(`[data-key="${field.key}"]`)?.append(
                el(
                    'p',
                    {
                        id: `${id}-error`,
                        class: `${classes.error} cf-field-error`,
                    },
                    byField[field.key],
                ),
            );
            const control = element.querySelector(`[id="${id}"]`);
            control?.setAttribute('aria-invalid', 'true');
            control?.setAttribute(
                'aria-describedby',
                `${control.getAttribute('aria-describedby') ?? ''} ${id}-error`.trim(),
            );
        }
        if (shown.length > 1) {
            const list = el('ul');
            for (const field of shown) {
                const link = el(
                    'a',
                    { href: `#cf-${field.key}` },
                    ui.errorItem(field.label, byField[field.key]),
                );
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    focusField(field.key);
                });
                const item = el('li');
                item.append(link);
                list.append(item);
            }
            summary.append(el('p', {}, ui.errors(shown.length)), list);
            summary.hidden = false;
            const step = stepOf(shown[0].key);
            if (step >= 0) current = step;
            applyConditions();
            summary.focus();
        } else if (shown.length) {
            focusField(shown[0].key);
        }
        return shown.length > 0;
    };

    const submit = async (event: Event) => {
        event.preventDefault();
        // Enter on an intermediate step: move to the next one instead of sending
        if (current < visibleSteps.length - 1) {
            next.click();
            return;
        }
        clearErrors();
        // Anti-robot check not done (or expired): say so next to it instead of sending
        captchaError.hidden =
            !definition.hcaptcha ||
            Boolean(new FormData(element).get('h-captcha-response'));
        // Described by the message only while it shows (a hidden description is still read out)
        if (!captchaError.hidden) {
            captchaSlot.setAttribute('aria-describedby', captchaError.id);
            return;
        }
        captchaSlot.removeAttribute('aria-describedby');
        button.toggleAttribute('disabled', true);
        try {
            const data = withHiddenValues(definition, new FormData(element));
            const prepared = (await options.beforeSubmit?.(data)) ?? data;
            const id = await submitForm(formId, prepared, {
                ...options,
                lang: definition.locale,
            });

            if (options.onSubmitted) {
                options.onSubmitted(id, element);
            } else {
                // The thank-you message replaces the form and takes the focus, so that it is read out
                const success = el(
                    'p',
                    {
                        class: classes.success,
                        role: 'status',
                        tabindex: '-1',
                        lang: definition.locale,
                    },
                    definition.success_message ??
                        options.messages?.success ??
                        ui.success,
                );
                root.replaceChildren(success);
                success.focus();
            }
        } catch (exception) {
            const failure = exception as CanardFormError | Error;
            if (options.onError) {
                options.onError(failure, element);
            } else if (
                !showErrors(
                    failure instanceof CanardFormError
                        ? fieldErrors(failure.errors)
                        : {},
                )
            ) {
                error.textContent =
                    options.messages?.error ??
                    errorMessage(failure, definition.locale);
                error.hidden = false;
            }
            button.toggleAttribute('disabled', false);
            resetCaptcha(element);
        }
    };
    element.addEventListener('submit', (event) => void submit(event));

    root.replaceChildren(element);

    return { definition, element, destroy };
}
