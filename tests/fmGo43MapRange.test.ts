import { Transpiler } from '../src/transpiler';

// FM-GO4-3: `const xs = Object.keys/values(m)` on a declared map[string]any prints the nil-preserving
// range collection (what ccxt's hx10w2-G06 text pass rewrote the helper call into).

let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});

const go = (body: string) => transpiler.transpileGo(
    'class E {\n    groupBy(a, b): any { return a; }\n    safeDict(a, b): any { return a; }\n    keep(a): any { return a; }\n'
    + '    m(symbol: string, params = {}) {\n' + body + '\n    }\n}').content;

describe('go Object.keys / Object.values on a declared map', () => {
    test('values on a map local collect by range', () => {
        const out = go("const g = this.groupBy(params, 'x'); const vs = Object.values (g); return this.keep (vs);");
        expect(out).toContain('var vs []any = nil\n');
        expect(out).toContain('if g != nil {');
        expect(out).toContain('vs = make([]any, 0, len(g))');
        expect(out).toContain('for _, objectValue := range g {');
        expect(out).toContain('vs = append(vs, objectValue)');
        expect(out).not.toContain('ObjectValues(');
    });
    test('keys on a map local collect by range', () => {
        const out = go("const g = {}; const ks = Object.keys (g); return this.keep (ks);");
        expect(out).toContain('var ks []string = nil\n');
        expect(out).toContain('ks = make([]string, 0, len(g))');
        expect(out).toContain('for objectKey := range g {');
        expect(out).not.toContain('ObjectKeys(');
    });
    test('the GetArg params bag is a declared map too', () => {
        const out = go('const ks = Object.keys (params); return this.keep (ks);');
        expect(out).toContain('for objectKey := range params {');
    });
    test('an any-boxed receiver keeps the helper', () => {
        const out = go("const g = this.safeDict(params, 'x'); const vs = Object.values (g); const ks = Object.keys (g); return [vs, ks];");
        expect(out).toContain('ObjectValues(g)');
        expect(out).toContain('ObjectKeys(g)');
        expect(out).not.toContain('range g');
    });
    test('a receiver that is rebound keeps the helper', () => {
        const out = go("let g = {}; g = this.groupBy(params, 'x'); const vs = Object.values (g); return this.keep (vs);");
        expect(out).toContain('ObjectValues(g)');
    });
    test('a values local the body nil-tests keeps the helper (the box is never nil)', () => {
        const out = go("const g = {}; const vs = Object.values (g); if (vs === undefined) { return 1; } return this.keep (vs);");
        expect(out).toContain('ObjectValues(g)');
    });
    test('a second collection reusing the loop variable name keeps the helper', () => {
        const out = go("const g = {}; const ks = Object.keys (g); const objectKey = 1; return [ks, objectKey];");
        expect(out).toContain('ObjectKeys(g)');
    });
    test('a call-expression receiver keeps the helper', () => {
        const out = go("const ks = Object.keys (this.groupBy(params, 'x')); return this.keep (ks);");
        expect(out).toContain('ObjectKeys(this.GroupBy(');
    });
});

describe('go Object.keys range keeps the loop-bounded element read native', () => {
    const loop = (body: string) => transpiler.transpileGo(
        'class E {\n    groupBy(a, b): any { return a; }\n    keep(a): any { return a; }\n'
        + '    m(symbol: string, params = {}) {\n' + body + '\n    }\n}').content;
    test('a string element of the collected keys reads as the slice index', () => {
        const out = loop("const g = {}; const ks = Object.keys (g); const out = {}; for (let i = 0; i < ks.length; i++) { const k = ks[i]; out[k] = this.keep (k); } return out;");
        expect(out).toContain('for objectKey := range g {');
        expect(out).toContain('var k string = ks[i]');
        expect(out).not.toContain('GetValue(ks, i)');
    });
});
