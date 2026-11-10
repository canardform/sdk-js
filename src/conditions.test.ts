import { describe, expect, it } from 'vitest';
import cases from '../test/fixtures/conditions.json';
import { matches } from './conditions';
import type { Answers, ConditionGroup } from './conditions';

describe('SDK conditions (cases shared with the Canard Form server)', () => {
    it.each(cases)('$name', ({ answers, group, expected }) => {
        expect(matches(group as ConditionGroup, answers as Answers)).toBe(
            expected,
        );
    });
});
