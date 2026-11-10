import {
    Comment,
    computed,
    defineComponent,
    h,
    onMounted,
    onScopeDispose,
    ref,
    shallowRef,
} from 'vue';
import type { PropType, VNode } from 'vue';
import { createFormController } from './controller.js';
import type { ControllerOptions } from './controller.js';
import { CLASSES, defaultMessages, fieldControl } from './index.js';
import type { PublicField } from './index.js';

/**
 * A Canard Form form in Vue, with no imposed rendering: you write your fields, the composable handles
 * submission, per-field errors and display conditions. Works with server-side rendering (Nuxt): nothing is
 * fetched before mount, or pass a `definition` fetched on the server with getForm().
 */
export function useCanardForm(formId: string, options: ControllerOptions = {}) {
    const controller = createFormController(formId, options);
    const state = shallowRef(controller.getState());
    onScopeDispose(
        controller.subscribe(() => (state.value = controller.getState())),
    );
    onMounted(() => void controller.load().catch(() => undefined));

    return {
        definition: computed(() => state.value.definition),
        status: computed(() => state.value.status),
        errors: computed(() => state.value.errors),
        error: computed(() => state.value.error),
        unavailable: computed(() => state.value.unavailable),
        submissionId: computed(() => state.value.submissionId),
        // Steps: form.steps, form.step; next(element of the step) checks its fields before moving on
        steps: computed(() => state.value.steps),
        step: computed(() => state.value.step),
        // Anti-robot check to place inside the form: <div :ref="form.captchaRef" />
        captchaRef: controller.captchaRef,
        isVisible: (key: string) => state.value.visible?.has(key) ?? true,
        handleChange: controller.handleChange,
        handleSubmit: controller.handleSubmit,
        submit: controller.submit,
        next: controller.next,
        previous: controller.previous,
        isStep: (key: string) =>
            state.value.steps[state.value.step]?.key === key,
        reset: controller.reset,
    };
}

/** A field's control (input, textarea, select, choices), without label: reusable in a slot. */
export function fieldInput(field: PublicField): VNode {
    const control = fieldControl(field);

    if (control.tag === 'select') {
        return h('select', control.attrs, [
            h('option', { value: '' }, ''),
            ...(field.options ?? []).map((option) =>
                h(
                    'option',
                    { key: option.value, value: option.value },
                    option.label,
                ),
            ),
        ]);
    }

    if (control.tag === 'choices') {
        return h(
            'div',
            control.attrs,
            control.choices.map((choice) =>
                h('label', { key: choice.value }, [
                    h('input', {
                        type: choice.type,
                        name: choice.name,
                        value: choice.value,
                    }),
                    ` ${choice.label}`,
                ]),
            ),
        );
    }

    return h(control.tag, control.attrs);
}

/**
 * The published form, built automatically: fields, display conditions, anti-robot check, errors and
 * thank-you message. Slots to take over: `field` (one field: { field, error, input }), `success`,
 * `closed`, `loading`. To write all the HTML yourself, see useCanardForm.
 */
export const CanardForm = defineComponent({
    name: 'CanardForm',
    props: {
        formId: { type: String, required: true },
        lang: String,
        publicUrl: String,
        /** Fields already fetched on the server (getForm), for a first render without waiting (Nuxt). */
        definition: Object as PropType<ControllerOptions['definition']>,
        fetch: Function as PropType<typeof fetch>,
        classes: {
            type: Object as PropType<Partial<typeof CLASSES>>,
            default: () => ({}),
        },
        messages: {
            type: Object as PropType<
                Partial<
                    Record<
                        | 'submit'
                        | 'success'
                        | 'closed'
                        | 'unavailable'
                        | 'next'
                        | 'previous',
                        string
                    >
                >
            >,
            default: () => ({}),
        },
    },
    emits: { submitted: (id: string) => typeof id === 'string' },
    setup(props, { slots, emit }) {
        const form = useCanardForm(props.formId, {
            lang: props.lang,
            publicUrl: props.publicUrl,
            definition: props.definition,
            fetch: props.fetch,
        });
        const css = computed(() => ({ ...CLASSES, ...props.classes }));
        const current = ref<HTMLElement | null>(null);

        return () => {
            const definition = form.definition.value;
            const ui = defaultMessages(definition?.locale ?? props.lang);

            if (!definition) {
                return form.unavailable.value
                    ? (slots.unavailable?.() ??
                          h(
                              'p',
                              { class: css.value.unavailable, role: 'alert' },
                              props.messages.unavailable ?? ui.unavailable,
                          ))
                    : (slots.loading?.() ?? null);
            }
            if (!definition.open) {
                return (
                    slots.closed?.() ??
                    h(
                        'p',
                        { class: css.value.closed },
                        definition.closed_message ??
                            props.messages.closed ??
                            ui.closed,
                    )
                );
            }
            if (form.status.value === 'sent') {
                return (
                    slots.success?.({
                        submissionId: form.submissionId.value,
                    }) ??
                    h(
                        'p',
                        { class: css.value.success, role: 'status' },
                        definition.success_message ??
                            props.messages.success ??
                            ui.success,
                    )
                );
            }

            const render = (field: PublicField) => {
                const error = form.errors.value[field.key];
                const input = () => fieldInput(field);

                // A slot that renders nothing for this field (Vue then returns a comment) keeps the default rendering
                const custom = slots.field?.({ field, error, input });

                return (
                    (custom?.some((node) => node.type !== Comment)
                        ? custom
                        : undefined) ??
                    h(
                        'div',
                        {
                            key: field.key,
                            class: css.value.field,
                            'data-key': field.key,
                        },
                        [
                            h(
                                'label',
                                {
                                    id: `cf-${field.key}-label`,
                                    for: `cf-${field.key}`,
                                },
                                field.label,
                            ),
                            input(),
                            field.help ? h('small', field.help) : null,
                            error
                                ? h('p', { class: css.value.error }, error)
                                : null,
                        ],
                    )
                );
            };
            // All steps stay in the form (their answers are sent on submission), only one is visible
            const steps = form.steps.value;
            const multiStep = steps.length > 1;
            const last = form.step.value >= steps.length - 1;
            const sections = steps.map((step, index) =>
                h(
                    'section',
                    {
                        key: step.key,
                        class: 'cf-step',
                        'data-step': step.key,
                        hidden: index !== form.step.value,
                        ref: index === form.step.value ? current : undefined,
                    },
                    [
                        multiStep && step.title
                            ? h('p', { class: 'cf-step-title' }, step.title)
                            : null,
                        ...step.fields
                            .filter((field) => form.isVisible(field.key))
                            .flatMap(render),
                    ],
                ),
            );

            return h(
                'form',
                {
                    class: css.value.form,
                    onInput: form.handleChange,
                    onChange: form.handleChange,
                    onSubmit: async (event: Event) => {
                        // Enter on an intermediate step: move on instead of sending
                        if (!last) {
                            event.preventDefault();
                            form.next(current.value);
                            return;
                        }
                        const id = await form.handleSubmit(event);
                        if (id) emit('submitted', id);
                    },
                },
                [
                    multiStep
                        ? h(
                              'p',
                              { class: 'cf-progress' },
                              ui.progress(form.step.value + 1, steps.length),
                          )
                        : null,
                    ...sections,
                    definition.hcaptcha
                        ? h('div', {
                              ref: form.captchaRef,
                              class: 'cf-captcha',
                              hidden: !last,
                          })
                        : null,
                    form.error.value
                        ? h(
                              'p',
                              { class: css.value.error, role: 'alert' },
                              form.error.value,
                          )
                        : null,
                    multiStep && form.step.value > 0
                        ? h(
                              'button',
                              {
                                  type: 'button',
                                  class: 'cf-previous',
                                  onClick: form.previous,
                              },
                              props.messages.previous ?? ui.previous,
                          )
                        : null,
                    last
                        ? h(
                              'button',
                              {
                                  type: 'submit',
                                  class: css.value.submit,
                                  disabled: form.status.value === 'sending',
                              },
                              definition.submit_label ??
                                  props.messages.submit ??
                                  ui.submit,
                          )
                        : h(
                              'button',
                              {
                                  type: 'button',
                                  class: 'cf-next',
                                  onClick: () => form.next(current.value),
                              },
                              props.messages.next ?? ui.next,
                          ),
                ],
            );
        };
    },
});
