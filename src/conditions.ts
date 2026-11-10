// Standalone evaluation of display conditions; the Canard Form server is the source of truth.
// The shared cases live in test/fixtures/conditions.json.

export type Condition = { field: string; operator: string; value?: unknown };
export type ConditionGroup = {
    match: 'all' | 'any';
    /** Absent from a malformed definition: matches nothing rather than throwing. */
    conditions?: Array<Condition | ConditionGroup>;
};
export type Answers = Record<string, unknown>;

const isGroup = (item: Condition | ConditionGroup): item is ConditionGroup =>
    'conditions' in item;

const scalar = (value: unknown): string => {
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }

    return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
};

const isBlank = (value: unknown): boolean =>
    value === null ||
    value === undefined ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0);

const isNumeric = (value: unknown): boolean =>
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' &&
    !Number.isNaN(Number(value));

const compare = (actual: unknown, expected: unknown): number => {
    if (isNumeric(actual) && isNumeric(expected)) {
        return Math.sign(Number(actual) - Number(expected));
    }

    const [a, b] = [scalar(actual), scalar(expected)];

    return a === b ? 0 : a > b ? 1 : -1;
};

function test(condition: Condition, answers: Answers): boolean {
    const actual = answers[condition.field];
    const expected = condition.value;

    switch (condition.operator) {
        case 'equals':
            return (
                !Array.isArray(actual) && scalar(actual) === scalar(expected)
            );
        case 'not_equals':
            return Array.isArray(actual) || scalar(actual) !== scalar(expected);
        case 'contains':
            if (Array.isArray(actual)) {
                return actual.map(scalar).includes(scalar(expected));
            }

            return (
                scalar(expected) !== '' &&
                scalar(actual)
                    .toLowerCase()
                    .includes(scalar(expected).toLowerCase())
            );
        case 'in':
            return (
                !Array.isArray(actual) &&
                (Array.isArray(expected) ? expected : [expected])
                    .map(scalar)
                    .includes(scalar(actual))
            );
        case 'filled':
            return !isBlank(actual);
        case 'empty':
            return isBlank(actual);
        case 'gt':
            return !isBlank(actual) && compare(actual, expected) > 0;
        case 'lt':
            return !isBlank(actual) && compare(actual, expected) < 0;
        default:
            return false;
    }
}

export function matches(group: ConditionGroup, answers: Answers): boolean {
    const results = (group.conditions ?? []).map((item) =>
        isGroup(item) ? matches(item, answers) : test(item, answers),
    );

    return group.match === 'any'
        ? results.includes(true)
        : !results.includes(false);
}
