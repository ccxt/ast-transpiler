import { Transpiler } from '../src/transpiler';
import { describe, test, expect } from '@jest/globals';

// the hand-written C# toFixed returns string (as JavaScript's), so a toFixed value is a typed string
const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } } as any);
const out = (body: string) => transpiler.transpileCSharp('class T {\n' + body + '\n}').content;

describe('C# toFixed returns string', () => {
    test('a string return of toFixed prints no object cast', () => {
        const cs = out('    f (n: number): string {\n        return n.toFixed (8);\n    }');
        expect(cs).toContain('return toFixed(n, 8);');
        expect(cs).not.toContain('(string?)((object)(toFixed(');
    });
    test('a local seeded by toFixed is declared string', () => {
        const cs = out('    f (n: number) {\n        const q = n.toFixed (2);\n        return q;\n    }');
        expect(cs).toContain('string q = toFixed(n, 2);');
    });
    test('an any operand still goes through the helper (nil / wrong kind answered by the runtime)', () => {
        const cs = out('    f (n) {\n        const r: Dict = { \'q\': n.toFixed (10) };\n        return r;\n    }');
        expect(cs).toContain('{ "q", toFixed(n, 10) }');
    });
    test('a dict entry seeded by toFixed is not retyped', () => {
        const cs = out('    f (n: number) {\n        const r = { \'q\': n.toFixed (10) };\n        return r;\n    }');
        expect(cs).not.toContain('string r');
    });
});
