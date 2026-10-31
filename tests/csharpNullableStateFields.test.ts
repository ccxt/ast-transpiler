import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// Hand-written BaseExchange fields declared in cs/ccxt/base/Exchange.Options.cs as
// `IDictionary<string, object> fees|requiredCredentials` and `List<object> accounts` stay null until
// initializeProperties stores the describe() row, so a native read carries the helper's null test.
const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

// the build layer (build/csharp-local-types.js) answers the declared C# type of a local through
// csharpLocalTypeOf; this stands in for it: the loop counter `i` is an int, `key` a string?
function printed(lines: string): string {
    const source = 'class T {\n    f () {\n' + lines + '\n    }\n}';
    const transpiler = new Transpiler(config);
    (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => ({ 'i': 'int', 'key': 'string?' } as any)[node.text];
    return transpiler.transpileCSharp(source).content;
}

describe('csharp nullable hand-written state fields', () => {
    test('a literal key on a dictionary field is a guarded ContainsKey read', () => {
        const out = printed('        const a = this.fees[\'trading\'];\n        const b = this.requiredCredentials[\'apiKey\'];\n        return [ a, b ];');
        expect(out).toContain('(this.fees != null && this.fees.ContainsKey(\"trading\") ? this.fees[\"trading\"] : null)');
        expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey(\"apiKey\") ? this.requiredCredentials[\"apiKey\"] : null)');
    });

    test('a literal index on the list field is a guarded Count read', () => {
        const out = printed('        return this.accounts[0];');
        expect(out).toContain('(this.accounts != null && 0 < this.accounts.Count ? this.accounts[0] : null)');
    });

    test('an int loop counter indexes the list field, the length is the null-conditional count', () => {
        const out = printed('        for (let i = 0; i < this.accounts.length; i++) {\n            const account = this.accounts[i];\n        }');
        expect(out).toContain('(this.accounts?.Count ?? 0)');
        expect(out).toContain('(this.accounts != null && i < this.accounts.Count ? this.accounts[i] : null)');
    });

    test('a string-typed key on the dictionary field carries the key null test', () => {
        const out = printed('        const key = this.safeString ({}, \'k\');\n        return this.requiredCredentials[key];');
        expect(out).toContain('this.requiredCredentials != null && key != null && this.requiredCredentials.ContainsKey(key) ? this.requiredCredentials[key] : null');
    });

    test('`in` on a dictionary field tests the receiver for null', () => {
        const out = printed('        return \'BTC\' in this.requiredCredentials;');
        expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey(\"BTC\"))');
    });

    test('shapes with no native twin keep the helper', () => {
        const out = printed('        const a = this.accounts[\'x\'];\n        const b = this.fees[0];\n        const c = this.positions[\'x\'];\n        return [ a, b, c ];');
        expect(out).toContain('getValue(this.accounts, \"x\")');
        expect(out).toContain('getValue(this.fees, 0)');
        expect(out).not.toContain('this.accounts.ContainsKey');
        expect(out).not.toContain('this.fees.Count');
    });
});
