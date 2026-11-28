import { Transpiler } from '../src/transpiler';
import { describe, test, expect } from '@jest/globals';
jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('ordered comparisons with a nullable numeric side', () => {
    let transpiler: any;
    beforeAll(() => {
        transpiler = new Transpiler({ verbose: false, csharp: { parser: { NUM_LINES_END_FILE: 0 } } });
    });
    const run = (kinds: { [name: string]: string }, body: string): string => {
        const p = transpiler.csharpTranspiler;
        p.csharpExpressionTypeResolver = (node) => (node?.kind === 80 || node?.text !== undefined) && Object.prototype.hasOwnProperty.call(kinds, node?.text) ? kinds[node.text] : undefined;
        try {
            return transpiler.transpileCSharp('class T {\n    f(a: number, b: number): boolean {\n' + body + '    }\n}').content;
        } finally {
            p.csharpExpressionTypeResolver = undefined;
        }
    };
    test('a nullable right operand under < prints the lifted operator', () => {
        const out = run({ a: 'Int64', b: 'Int64?' }, '        return a < b;\n');
        expect(out).toContain('(a < b)');
        expect(out).not.toContain('isLessThan');
    });
    test('a nullable left operand under >= prints the lifted operator', () => {
        const out = run({ a: 'Int64?', b: 'int' }, '        return a >= b;\n');
        expect(out).toContain('(a >= b)');
        expect(out).not.toContain('isGreaterThanOrEqual');
    });
    test('a nullable left operand under < keeps the helper (null < x is true there)', () => {
        const out = run({ a: 'Int64?', b: 'Int64' }, '        return a < b;\n');
        expect(out).toContain('isLessThan(a, b)');
    });
    test('a nullable right operand under > keeps the helper (x > null is true there)', () => {
        const out = run({ a: 'Int64', b: 'Int64?' }, '        return a > b;\n');
        expect(out).toContain('isGreaterThan(a, b)');
    });
    test('two nullable operands unwrap only under a null test', () => {
        const guarded = run({ a: 'double?', b: 'double?' }, '        if ((a !== undefined) && (b !== undefined)) {\n            return a >= b;\n        }\n        return false;\n');
        expect(guarded).toContain('a.Value >= b.Value');
        expect(guarded).not.toContain('isGreaterThanOrEqual');
        const bare = run({ a: 'double?', b: 'double?' }, '        return a >= b;\n');
        expect(bare).toContain('isGreaterThanOrEqual(a, b)');
    });
    test('a double pair under < and a mixed double/integer pair keep the helper', () => {
        expect(run({ a: 'double', b: 'double?' }, '        return a < b;\n')).toContain('isLessThan(a, b)');
        expect(run({ a: 'Int64?', b: 'double' }, '        return a > b;\n')).toContain('isGreaterThan(a, b)');
    });
    test('a binding null-tested twice keeps the helper (C# resets its flow state at the second test)', () => {
        const out = run({ a: 'Int64?', b: 'Int64?' }, '        if ((a === undefined) || (b === undefined)) {\n            return false;\n        }\n        if ((a !== undefined) && (b === 1)) {\n            return true;\n        }\n        return b >= a;\n');
        expect(out).toContain('isGreaterThanOrEqual(b, a)');
    });
});
