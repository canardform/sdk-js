import {
    Comment,
    computed,
    defineComponent,
    h,
    nextTick,
    onMounted,
    onScopeDispose,
    ref,
    shallowRef,
} from 'vue';
import type { PropType, VNode } from 'vue';
import { createFormController } from './controller.js';
import type { ControllerOptions } from './controller.js';
import { CLASSES, defaultMessages, fieldControl, fieldHint } from './index.js';
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
        captchaError: computed(() => state.value.captchaError),
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
        showField: controller.showField,
        isStep: (key: string) =>
            state.value.steps[state.value.step]?.key === key,
        reset: controller.reset,
    };
}

/**
 * A field's control (input, textarea, select, choices), without label: reusable in a slot. With `error`, it
 * is marked invalid and described by `cf-<key>-error` (give that id to your message).
 */
export function fieldInput(field: PublicField, error?: string | null): VNode {
    const control = fieldControl(field, error);

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
                        required: choice.required,
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
        const root = ref<HTMLFormElement | null>(null);
        const success = ref<HTMLElement | null>(null);
        const stepTitle = 'section:not([hidden]) > .cf-step-title';
        // Once rendered: focuses the element (the first choice of a group), so that it is read out
        const focusLater = (selector: string) =>
            nextTick(() => {
                const target =
                    root.value?.querySelector<HTMLElement>(selector) ?? null;
                (target?.querySelector('input') ?? target)?.focus();
            });
        const next = () => {
            if (form.next(current.value)) void focusLater(stepTitle);
        };

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
                        { class: css.value.closed, lang: definition.locale },
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
                        {
                            ref: success,
                            class: css.value.success,
                            role: 'status',
                            tabindex: -1,
                            lang: definition.locale,
                        },
                        definition.success_message ??
                            props.messages.success ??
                            ui.success,
                    )
                );
            }

            const render = (field: PublicField) => {
                const error = form.errors.value[field.key];
                const input = () => fieldInput(field, error);
                const id = `cf-${field.key}`;
                // A group of choices is named by aria-labelledby: a <label for> would point to no control
                const group =
                    field.type === 'radio' || field.type === 'checkboxes';
                const hint = fieldHint(field, definition.locale);

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
                                group ? 'span' : 'label',
                                {
                                    id: `${id}-label`,
                                    for: group ? undefined : id,
                                },
                                [
                                    field.label,
                                    field.required
                                        ? [
                                              ' ',
                                              h(
                                                  'span',
                                                  {
                                                      class: 'cf-required',
                                                      'aria-hidden': 'true',
                                                  },
                                                  '*',
                                              ),
                                          ]
                                        : null,
                                ],
                            ),
                            input(),
                            field.help
                                ? h('small', { id: `${id}-help` }, field.help)
                                : null,
                            hint
                                ? h(
                                      'small',
                                      { id: `${id}-hint`, class: 'cf-hint' },
                                      hint,
                                  )
                                : null,
                            error
                                ? h(
                                      'p',
                                      {
                                          id: `${id}-error`,
                                          class: css.value.error,
                                      },
                                      error,
                                  )
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
                        'aria-labelledby': multiStep
                            ? `cf-step-${step.key}`
                            : undefined,
                        ref: index === form.step.value ? current : undefined,
                    },
                    [
                        // Named by its title, with "Step x of y", focused when moving between steps
                        multiStep
                            ? h(
                                  'h2',
                                  {
                                      id: `cf-step-${step.key}`,
                                      class: 'cf-step-title',
                                      tabindex: -1,
                                  },
                                  [
                                      h(
                                          'span',
                                          { class: 'cf-progress' },
                                          ui.progress(index + 1, steps.length),
                                      ),
                                      step.title
                                          ? [
                                                ' ',
                                                h(
                                                    'span',
                                                    { class: 'cf-step-name' },
                                                    step.title,
                                                ),
                                            ]
                                          : null,
                                  ],
                              )
                            : null,
                        ...step.fields
                            .filter((field) => form.isVisible(field.key))
                            .flatMap(render),
                    ],
                ),
            );
            const errors = form.errors.value;
            const invalid = steps
                .flatMap((step) => step.fields)
                .filter(
                    (field) => form.isVisible(field.key) && field.key in errors,
                );

            return h(
                'form',
                {
                    ref: root,
                    class: css.value.form,
                    lang: definition.locale,
                    onInput: form.handleChange,
                    onChange: form.handleChange,
                    onSubmit: async (event: Event) => {
                        // Enter on an intermediate step: move on instead of sending
                        if (!last) {
                            event.preventDefault();
                            next();
                            return;
                        }
                        const id = await form.handleSubmit(event);
                        if (id) {
                            emit('submitted', id);
                            await nextTick();
                            success.value?.focus();
                        } else {
                            // The error summary, or the only invalid field
                            await focusLater(
                                '.cf-error-summary, [aria-invalid="true"]',
                            );
                        }
                    },
                },
                [
                    invalid.length > 1
                        ? h(
                              'div',
                              { class: 'cf-error-summary', tabindex: -1 },
                              [
                                  h('p', ui.errors(invalid.length)),
                                  h(
                                      'ul',
                                      invalid.map((field) =>
                                          h('li', { key: field.key }, [
                                              h(
                                                  'a',
                                                  {
                                                      href: `#cf-${field.key}`,
                                                      onClick: (
                                                          event: Event,
                                                      ) => {
                                                          event.preventDefault();
                                                          form.showField(
                                                              field.key,
                                                          );
                                                          void focusLater(
                                                              `[data-key="${field.key}"] :is(input, select, textarea)`,
                                                          );
                                                      },
                                                  },
                                                  ui.errorItem(
                                                      field.label,
                                                      errors[field.key],
                                                  ),
                                              ),
                                          ]),
                                      ),
                                  ),
                              ],
                          )
                        : null,
                    definition.fields.some((field) => field.required)
                        ? h('p', { class: 'cf-required-notice' }, ui.required)
                        : null,
                    ...sections,
                    form.captchaError.value
                        ? h(
                              'p',
                              {
                                  id: 'cf-captcha-error',
                                  class: css.value.error,
                                  role: 'alert',
                              },
                              form.captchaError.value,
                          )
                        : null,
                    definition.hcaptcha
                        ? h('div', {
                              ref: form.captchaRef,
                              class: 'cf-captcha',
                              hidden: !last,
                              'aria-describedby': form.captchaError.value
                                  ? 'cf-captcha-error'
                                  : undefined,
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
                                  onClick: () => {
                                      form.previous();
                                      void focusLater(stepTitle);
                                  },
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
                                  onClick: next,
                              },
                              props.messages.next ?? ui.next,
                          ),
                ],
            );
        };
    },
});
