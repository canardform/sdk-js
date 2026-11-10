import {
    CanardFormError,
    getForm,
    submitForm,
    visibleKeys,
    answersOf,
    renderCaptcha,
    resetCaptcha,
    stepsOf,
    fieldErrors,
    validateStep,
} from './index.js';
import type {
    Answers,
    PublicField,
    PublicForm,
    SubmitOptions,
} from './index.js';

// Core of the React, Vue… adapters: a form's state (published fields, conditions, submission, errors)
// with no rendering and no dependencies. Nothing touches the DOM on creation: safe for server-side rendering.

export type FormStatus = 'idle' | 'sending' | 'sent' | 'error';

export type FormState = {
    /** Published fields (null until loaded). */
    definition: PublicForm | null;
    /** Keys of the fields to show given the current answers (all of them until anything is loaded). */
    visible: Set<string> | null;
    status: FormStatus;
    /** First error of each rejected field, by key: errors.email */
    errors: Record<string, string>;
    /** General message (closed form, network…). */
    error: string | null;
    submissionId: string | null;
    /** The form could not be loaded (unknown form, server unreachable): show a fallback message. */
    unavailable: boolean;
    /** Steps to go through (those with at least one visible field), and the current step. */
    steps: { key: string; title: string | null; fields: PublicField[] }[];
    step: number;
};

export type ControllerOptions = SubmitOptions & {
    /** Fields already fetched on the server (getForm), for a first render without waiting. */
    definition?: PublicForm;
};

export type FormController = ReturnType<typeof createFormController>;

export function createFormController(
    formId: string,
    options: ControllerOptions = {},
) {
    let answers: Answers = {};
    let state: FormState = {
        definition: options.definition ?? null,
        visible: null,
        status: 'idle',
        errors: {},
        error: null,
        submissionId: null,
        unavailable: false,
        steps: [],
        step: 0,
    };
    const listeners = new Set<() => void>();
    // Element to render hCaptcha in (set by captchaRef), rendered as soon as the fields are known
    let captchaElement: HTMLElement | null = null;
    const showCaptcha = () => {
        if (captchaElement && state.definition) {
            void renderCaptcha(captchaElement, state.definition).catch(
                (exception: unknown) => {
                    set({ error: (exception as Error).message });
                },
            );
        }
    };

    const set = (patch: Partial<FormState>) => {
        state = { ...state, ...patch };
        state.visible = state.definition
            ? visibleKeys(state.definition.fields, answers)
            : null;
        state.steps = state.definition
            ? stepsOf(state.definition, state.visible)
            : [];
        state.step = Math.max(0, Math.min(state.step, state.steps.length - 1));
        listeners.forEach((listener) => listener());
    };
    set({});

    const getState = () => state;
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    /** Fetches the published fields (once). */
    const load = async () => {
        if (!state.definition) {
            try {
                set({
                    definition: await getForm(formId, options),
                    unavailable: false,
                });
            } catch (exception) {
                set({ unavailable: true, error: (exception as Error).message });
                throw exception;
            }
            showCaptcha();
        }
        return state.definition;
    };
    const isVisible = (key: string) => state.visible?.has(key) ?? true;
    /** Current answers, for the display conditions. */
    const setAnswers = (next: Answers) => {
        answers = next;
        set({});
    };
    /** Wire to the <form>'s onChange / @input: updates the conditions. */
    const handleChange = (event: { currentTarget: EventTarget | null }) => {
        const form = event.currentTarget as HTMLFormElement | null;
        if (form) setAnswers(answersOf(form));
    };
    /** Sends a FormData or an object; returns the submission id, or null if rejected. */
    const submit = async (data: FormData | Record<string, unknown>) => {
        set({ status: 'sending', errors: {}, error: null });
        try {
            const id = await submitForm(formId, data, {
                ...options,
                lang: state.definition?.locale ?? options.lang,
            });
            set({ status: 'sent', submissionId: id });
            return id;
        } catch (exception) {
            const errors =
                exception instanceof CanardFormError
                    ? fieldErrors(exception.errors)
                    : {};
            // Back to the step of the first rejected field
            const step = state.steps.findIndex((candidate) =>
                candidate.fields.some((field) => field.key in errors),
            );
            set({
                step: step >= 0 ? step : state.step,
                status: 'error',
                errors,
                error: Object.keys(errors).length
                    ? null
                    : (exception as Error).message,
            });
            return null;
        }
    };
    /**
     * Wire to the <form>'s onSubmit: prevents the page reload and sends the form. On an intermediate
     * step (Enter key), moves to the next step instead of sending.
     */
    const handleSubmit = async (event: {
        preventDefault(): void;
        currentTarget: EventTarget | null;
    }) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        if (state.step < state.steps.length - 1) {
            next(form);
            return null;
        }
        const id = await submit(new FormData(form));
        if (id) form.reset();
        else resetCaptcha(form);
        return id;
    };
    /**
     * Ref to set on an empty element inside the <form>: renders the hCaptcha anti-robot check there if the form
     * requires it (React: ref={form.captchaRef}, Vue: :ref="form.captchaRef").
     */
    const captchaRef = (element: unknown) => {
        captchaElement = element instanceof HTMLElement ? element : null;
        showCaptcha();
    };
    /**
     * Next step. Given an element of the form (the Next button, the <form>, the section), the fields of the
     * current step (data-step="key") are first checked by the browser; returns false if it stays put.
     */
    const next = (from?: EventTarget | null) => {
        const element = from instanceof HTMLElement ? from : null;
        const container =
            element
                ?.closest('form')
                ?.querySelector<HTMLElement>(
                    `[data-step="${state.steps[state.step]?.key}"]`,
                ) ?? element;
        if (container && !validateStep(container)) return false;
        set({ step: state.step + 1 });
        return true;
    };
    const previous = () => set({ step: state.step - 1 });
    /** Is the step with this key the one shown? (<section data-step="key" hidden={!form.isStep('key')}>) */
    const isStep = (key: string) => state.steps[state.step]?.key === key;
    const reset = () => {
        answers = {};
        set({
            status: 'idle',
            errors: {},
            error: null,
            submissionId: null,
            step: 0,
        });
    };

    return {
        getState,
        subscribe,
        load,
        isVisible,
        setAnswers,
        handleChange,
        submit,
        handleSubmit,
        captchaRef,
        next,
        previous,
        isStep,
        reset,
    };
}
