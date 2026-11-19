import {
    createElement as h,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createFormController } from './controller.js';
import type { ControllerOptions } from './controller.js';
import { CLASSES, defaultMessages, fieldControl, fieldHint } from './index.js';
import type { PublicField } from './index.js';

/**
 * A Canard Form form in React, with no imposed rendering: you write your fields, the hook handles
 * submission, per-field errors and display conditions. Works with server-side rendering (Next.js): nothing
 * is fetched before mount, or pass a `definition` fetched on the server with getForm().
 */
export function useCanardForm(formId: string, options: ControllerOptions = {}) {
    const [controller] = useState(() => createFormController(formId, options));
    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

    useEffect(() => {
        void controller.load().catch(() => undefined);
    }, [controller]);

    return {
        ...state,
        // Anti-robot check to place inside the form: <div ref={form.captchaRef} />
        captchaRef: controller.captchaRef,
        isVisible: (key: string) => state.visible?.has(key) ?? true,
        handleChange: (event: { currentTarget: EventTarget | null }) =>
            controller.handleChange(event),
        handleSubmit: (event: {
            preventDefault(): void;
            currentTarget: EventTarget | null;
        }) => controller.handleSubmit(event),
        submit: controller.submit,
        // Steps: form.steps, form.step; next(element of the step) checks its fields before moving on
        next: controller.next,
        previous: controller.previous,
        showField: controller.showField,
        isStep: (key: string) => state.steps[state.step]?.key === key,
        reset: controller.reset,
    };
}

/**
 * A field's control (input, textarea, select, choices), without label: reusable in custom rendering. With
 * `error`, it is marked invalid and described by `cf-<key>-error` (give that id to your message).
 */
export function FieldInput({
    field,
    error,
}: {
    field: PublicField;
    error?: string | null;
}): ReactNode {
    const control = fieldControl(field, error);
    // React spells it autoComplete (lowercase works but warns in every visitor's console in development)
    const { value, autocomplete: autoComplete, ...rest } = control.attrs;
    const attrs: typeof rest = { ...rest, autoComplete };

    if (control.tag === 'select') {
        return h(
            'select',
            { ...attrs, defaultValue: '' },
            h('option', { value: '' }, ''),
            ...(field.options ?? []).map((option) =>
                h(
                    'option',
                    { key: option.value, value: option.value },
                    option.label,
                ),
            ),
        );
    }

    if (control.tag === 'choices') {
        return h(
            'div',
            attrs,
            ...control.choices.map((choice) =>
                h(
                    'label',
                    { key: choice.value },
                    h('input', {
                        type: choice.type,
                        name: choice.name,
                        value: choice.value,
                        required: choice.required,
                    }),
                    ` ${choice.label}`,
                ),
            ),
        );
    }

    return h(
        control.tag,
        value === undefined ? attrs : { ...attrs, defaultValue: value },
    );
}

export type CanardFormProps = ControllerOptions & {
    formId: string;
    /** Your CSS classes (defaults: cf-form, cf-field, cf-error, cf-success, cf-closed, cf-submit). */
    classes?: Partial<typeof CLASSES>;
    /**
     * Replaces a field's rendering: receives the field, its error and the default rendering; returning
     * `undefined` keeps the default rendering. <FieldInput field={field} /> gives the control alone.
     */
    renderField?: (props: {
        field: PublicField;
        error?: string;
        children: ReactNode;
    }) => ReactNode;
    /** After a successful submission (otherwise the form's thank-you message is shown). */
    onSubmitted?: (submissionId: string) => void;
    /** Shown while the fields are loading. */
    loading?: ReactNode;
    messages?: Partial<
        Record<
            | 'submit'
            | 'success'
            | 'closed'
            | 'unavailable'
            | 'next'
            | 'previous',
            string
        >
    >;
};

/**
 * The published form, built automatically: fields, display conditions, anti-robot check, errors and
 * thank-you message. Everything is configured through props; to write all the HTML yourself, see useCanardForm.
 */
export function CanardForm({
    formId,
    classes,
    renderField,
    onSubmitted,
    loading = null,
    messages,
    ...options
}: CanardFormProps): ReactNode {
    const form = useCanardForm(formId, options);
    const css = { ...CLASSES, ...classes };
    const definition = form.definition;
    const ui = defaultMessages(definition?.locale ?? options.lang);
    const [element, setElement] = useState<HTMLFormElement | null>(null);
    const [success, setSuccess] = useState<HTMLElement | null>(null);
    // Element to focus once rendered: the title of the new step, or a field reached from the error summary
    const [focus, setFocus] = useState<{ selector: string } | null>(null);

    useEffect(() => {
        if (focus) element?.querySelector<HTMLElement>(focus.selector)?.focus();
    }, [element, focus]);
    // The thank-you message is read out as soon as it replaces the form
    useEffect(() => success?.focus(), [success]);
    // After a refusal: the error summary, or the only invalid field (first choice of a group)
    useEffect(() => {
        if (form.status !== 'error') return;
        const target = element?.querySelector<HTMLElement>(
            '.cf-error-summary, [aria-invalid="true"]',
        );
        (target?.querySelector('input') ?? target)?.focus();
    }, [element, form.status, form.errors]);

    if (!definition)
        return form.unavailable
            ? h(
                  'p',
                  { className: css.unavailable, role: 'alert' },
                  messages?.unavailable ?? ui.unavailable,
              )
            : loading;
    if (!definition.open)
        return h(
            'p',
            { className: css.closed, lang: definition.locale },
            definition.closed_message ?? messages?.closed ?? ui.closed,
        );
    if (form.status === 'sent' && !onSubmitted) {
        return h(
            'p',
            {
                ref: setSuccess,
                className: css.success,
                role: 'status',
                tabIndex: -1,
                lang: definition.locale,
            },
            definition.success_message ?? messages?.success ?? ui.success,
        );
    }

    const field = (item: PublicField) => {
        const error = form.errors[item.key];
        const id = `cf-${item.key}`;
        // A group of choices is named by aria-labelledby: a <label for> would point to no control
        const group = item.type === 'radio' || item.type === 'checkboxes';
        const hint = fieldHint(item, definition.locale);
        const children = h(
            'div',
            { key: item.key, className: css.field, 'data-key': item.key },
            h(
                group ? 'span' : 'label',
                { id: `${id}-label`, htmlFor: group ? undefined : id },
                item.label,
                item.required ? ' ' : null,
                item.required
                    ? h(
                          'span',
                          { className: 'cf-required', 'aria-hidden': true },
                          '*',
                      )
                    : null,
            ),
            h(FieldInput, { field: item, error }),
            item.help ? h('small', { id: `${id}-help` }, item.help) : null,
            hint
                ? h('small', { id: `${id}-hint`, className: 'cf-hint' }, hint)
                : null,
            error
                ? h('p', { id: `${id}-error`, className: css.error }, error)
                : null,
        );

        return renderField?.({ field: item, error, children }) ?? children;
    };
    // All steps stay in the form (their answers are sent on submission), only one is visible
    const multiStep = form.steps.length > 1;
    const last = form.step >= form.steps.length - 1;
    const stepTitle = 'section:not([hidden]) > .cf-step-title';
    const sections = form.steps.map((step, index) =>
        h(
            'section',
            {
                key: step.key,
                className: 'cf-step',
                'data-step': step.key,
                hidden: index !== form.step,
                'aria-labelledby': multiStep
                    ? `cf-step-${step.key}`
                    : undefined,
            },
            // Named by its title, with "Step x of y", focused when moving between steps
            multiStep
                ? h(
                      'h2',
                      {
                          id: `cf-step-${step.key}`,
                          className: 'cf-step-title',
                          tabIndex: -1,
                      },
                      h(
                          'span',
                          { className: 'cf-progress' },
                          ui.progress(index + 1, form.steps.length),
                      ),
                      step.title ? ' ' : null,
                      step.title
                          ? h('span', { className: 'cf-step-name' }, step.title)
                          : null,
                  )
                : null,
            ...step.fields
                .filter((item) => form.isVisible(item.key))
                .map(field),
        ),
    );
    const invalid = form.steps
        .flatMap((step) => step.fields)
        .filter((item) => form.isVisible(item.key) && item.key in form.errors);
    const next = (from: EventTarget | null) => {
        if (form.next(from)) setFocus({ selector: stepTitle });
    };

    return h(
        'form',
        {
            ref: setElement,
            className: css.form,
            lang: definition.locale,
            onChange: form.handleChange,
            onSubmit: async (event: {
                preventDefault(): void;
                currentTarget: EventTarget | null;
            }) => {
                // Enter on an intermediate step: move on instead of sending
                if (!last) {
                    event.preventDefault();
                    next(event.currentTarget);
                    return;
                }
                const id = await form.handleSubmit(event);
                if (id) onSubmitted?.(id);
            },
        },
        invalid.length > 1
            ? h(
                  'div',
                  { className: 'cf-error-summary', tabIndex: -1 },
                  h('p', null, ui.errors(invalid.length)),
                  h(
                      'ul',
                      null,
                      ...invalid.map((item) =>
                          h(
                              'li',
                              { key: item.key },
                              h(
                                  'a',
                                  {
                                      href: `#cf-${item.key}`,
                                      onClick: (event: {
                                          preventDefault(): void;
                                      }) => {
                                          event.preventDefault();
                                          setFocus({
                                              selector: `[data-key="${item.key}"] :is(input, select, textarea)`,
                                          });
                                          form.showField(item.key);
                                      },
                                  },
                                  ui.errorItem(
                                      item.label,
                                      form.errors[item.key],
                                  ),
                              ),
                          ),
                      ),
                  ),
              )
            : null,
        definition.fields.some((item) => item.required)
            ? h('p', { className: 'cf-required-notice' }, ui.required)
            : null,
        ...sections,
        form.captchaError
            ? h(
                  'p',
                  {
                      id: 'cf-captcha-error',
                      className: css.error,
                      role: 'alert',
                  },
                  form.captchaError,
              )
            : null,
        definition.hcaptcha
            ? h('div', {
                  ref: form.captchaRef,
                  className: 'cf-captcha',
                  hidden: !last,
                  'aria-describedby': form.captchaError
                      ? 'cf-captcha-error'
                      : undefined,
              })
            : null,
        form.error
            ? h('p', { className: css.error, role: 'alert' }, form.error)
            : null,
        multiStep && form.step > 0
            ? h(
                  'button',
                  {
                      type: 'button',
                      className: 'cf-previous',
                      onClick: () => {
                          setFocus({ selector: stepTitle });
                          form.previous();
                      },
                  },
                  messages?.previous ?? ui.previous,
              )
            : null,
        last
            ? h(
                  'button',
                  {
                      type: 'submit',
                      className: css.submit,
                      disabled: form.status === 'sending',
                  },
                  definition.submit_label ?? messages?.submit ?? ui.submit,
              )
            : h(
                  'button',
                  {
                      type: 'button',
                      className: 'cf-next',
                      onClick: (event: { currentTarget: EventTarget | null }) =>
                          next(event.currentTarget),
                  },
                  messages?.next ?? ui.next,
              ),
    );
}
