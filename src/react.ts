import {
    createElement as h,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { createFormController } from './controller.js';
import type { ControllerOptions } from './controller.js';
import { CLASSES, defaultMessages, fieldControl } from './index.js';
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
        isStep: (key: string) => state.steps[state.step]?.key === key,
        reset: controller.reset,
    };
}

/** A field's control (input, textarea, select, choices), without label: reusable in custom rendering. */
export function FieldInput({ field }: { field: PublicField }): ReactNode {
    const control = fieldControl(field);
    const { value, ...attrs } = control.attrs;

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
            { className: css.closed },
            definition.closed_message ?? messages?.closed ?? ui.closed,
        );
    if (form.status === 'sent' && !onSubmitted) {
        return h(
            'p',
            { className: css.success, role: 'status' },
            definition.success_message ?? messages?.success ?? ui.success,
        );
    }

    const field = (item: PublicField) => {
        const error = form.errors[item.key];
        const children = h(
            'div',
            { key: item.key, className: css.field, 'data-key': item.key },
            h(
                'label',
                { id: `cf-${item.key}-label`, htmlFor: `cf-${item.key}` },
                item.label,
            ),
            h(FieldInput, { field: item }),
            item.help ? h('small', null, item.help) : null,
            error ? h('p', { className: css.error }, error) : null,
        );

        return renderField?.({ field: item, error, children }) ?? children;
    };
    // All steps stay in the form (their answers are sent on submission), only one is visible
    const multiStep = form.steps.length > 1;
    const last = form.step >= form.steps.length - 1;
    const sections = form.steps.map((step, index) =>
        h(
            'section',
            {
                key: step.key,
                className: 'cf-step',
                'data-step': step.key,
                hidden: index !== form.step,
            },
            multiStep && step.title
                ? h('p', { className: 'cf-step-title' }, step.title)
                : null,
            ...step.fields
                .filter((item) => form.isVisible(item.key))
                .map(field),
        ),
    );

    return h(
        'form',
        {
            className: css.form,
            onChange: form.handleChange,
            onSubmit: async (event: {
                preventDefault(): void;
                currentTarget: EventTarget | null;
            }) => {
                // Enter on an intermediate step: move on instead of sending
                if (!last) {
                    event.preventDefault();
                    form.next(event.currentTarget);
                    return;
                }
                const id = await form.handleSubmit(event);
                if (id) onSubmitted?.(id);
            },
        },
        multiStep
            ? h(
                  'p',
                  { className: 'cf-progress' },
                  ui.progress(form.step + 1, form.steps.length),
              )
            : null,
        ...sections,
        definition.hcaptcha
            ? h('div', {
                  ref: form.captchaRef,
                  className: 'cf-captcha',
                  hidden: !last,
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
                      onClick: form.previous,
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
                          form.next(event.currentTarget),
                  },
                  messages?.next ?? ui.next,
              ),
    );
}
