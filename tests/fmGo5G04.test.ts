import { Transpiler, installFmGo5G04 } from '../src/transpiler';

// FM-GO5 G04: nil tests of base fields and pointer-vs-negative-literal compares print native Go, keyed on the
// checker-resolved declaration (no printed-text pass in ccxt).
const t = (install = true) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (install) { installFmGo5G04 (x.goTranspiler); }
    return x;
};
const SRC = [
    'class BaseExchange {',
    '    features: any = undefined;',
    '    proxyUrl: any = undefined;',
    '    other: any = undefined;',
    '    safeInteger (o: any, k: string): number | undefined { return undefined; }',
    '    m (x: any) {',
    '        if (this.features === undefined) { return 1; }',
    '        if (this.proxyUrl !== undefined) { return 2; }',
    '        if (this.other === undefined) { return 3; }',
    '        const maker = this.safeInteger (x, "m");',
    '        if (maker === -1) { return 4; }',
    '        if (maker !== -1) { return 5; }',
    '        return 0;',
    '    }',
    '}',
    '',
].join ('\n');

describe('FM-GO5 G04 typed IsEqual nil / negative literal', () => {
    test('base fields and *int64 locals compare natively', () => {
        const out = t ().transpileGo (SRC).content;
        expect (out).toContain ('if this.Features == nil {');
        expect (out).toContain ('if this.ProxyUrl != nil {');
        expect (out).toContain ('IsEqual(this.Other, nil)');
        expect (out).toContain ('maker != nil && *maker == int64(-1)');
        expect (out).toContain ('maker == nil || *maker != int64(-1)');
    });
    test('fails without the hook', () => {
        const out = t (false).transpileGo (SRC).content;
        expect (out).toContain ('IsEqual(this.Features, nil)');
        expect (out).not.toContain ('*maker == int64(-1)');
    });
    test('same field names on an unrelated class are untouched', () => {
        const src = 'class Other {\n    features: any;\n    m () {\n        if (this.features === undefined) { return 1; }\n        return 0;\n    }\n}\n';
        const out = t ().transpileGo (src).content;
        expect (out).not.toContain ('this.Features == nil');
    });
});
