import { Transpiler } from '../src/transpiler';

const config: any = { 'verbose': false, 'csharp': { 'parser': { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } };
const emit = (body: string) => {
    const t: any = new Transpiler(config);
    return t.transpileCSharp('class Exchange {\n' + body + '\n}').content;
};

describe('csharp string slice result compared with a string literal', () => {
    test('a slice of a declared string compares natively', () => {
        const output = emit('lead (h: string, i: number) { if (h.slice (i, i + 1) === \'0\') { return true; } return false; }');
        expect(output).not.toContain('isEqual(');
        expect(output).toMatch(/\(slice\(h, i, .*\) == "0"\)/);
    });
    test('a not-equal compare on a string slice is native', () => {
        const output = emit('lead (h: string, i: number, n: number) { if (h.slice (i, n) !== \'0\') { return true; } return false; }');
        expect(output).not.toContain('isEqual(');
    });
    test('a slice of an any receiver keeps the helper', () => {
        const output = emit('lead (h: any, i: number) { if (h.slice (i, i + 1) === \'0\') { return true; } return false; }');
        expect(output).toContain('isEqual(');
    });
    test('a slice of a list keeps the helper', () => {
        const output = emit('lead (h: string[], i: number) { if (h.slice (i, i + 1) === \'0\') { return true; } return false; }');
        expect(output).toContain('isEqual(');
    });
});
