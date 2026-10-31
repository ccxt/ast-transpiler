import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// hx10w2 G08 (was ccxt build/hx10w2-G08.js): a destructured tuple slot reads natively when the
// producer's own `return [ .. ]` paths prove what the slot holds.

const BASE = 'type Dict = any; type Bool = boolean | undefined;\n'
    + 'class Exchange {\n'
    + '    omit (o: any, k: any): any { return o; }\n'
    + '    safeDict (o: any, k: string): any { return undefined; }\n'
    + '    popOnly (isMarket: boolean, params: Dict = {}): [any, Dict] {\n'
    + '        if (isMarket) { return [ true, this.omit (params, [ \'k\' ]) ]; }\n'
    + '        return [ false, params ];\n'
    + '    }\n'
    + '    nilable (params: Dict = {}): [any, Dict] {\n'
    + '        return [ true, this.safeDict (params, \'k\') ];\n'
    + '    }\n'
    + '    flag (params: Dict = {}): [any, Dict] {\n'
    + '        let f: any = undefined;\n'
    + '        return [ f, params ];\n'
    + '    }\n'
    + '    twice (params: Dict = {}): [any, Dict] {\n'
    + '        return [ true, params ];\n'
    + '    }\n';

const go = (body: string, hooked = true): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (hooked) { installCcxtGoHooks ((t as any).goTranspiler); }
    return t.transpileGo (BASE + body + '}\n').content;
};

const USE = '    use (params = {}) {\n'
    + '        const [ po, paramsPo ] = this.popOnly (false, params);\n'
    + '        return [ po, paramsPo ];\n'
    + '    }\n';

describe('hx10w2 G08 tuple slot reads', () => {
    test('a plain bool slot and a map slot read natively', () => {
        const out = go (USE);
        expect (out).toContain ('po := poparamsPoVariable[0]');
        expect (out).toContain ('paramsPo := poparamsPoVariable[1]');
    });
    test('the base printer keeps GetValue for the same source', () => {
        const base = go (USE, false);
        expect (base).toContain ('po := GetValue(poparamsPoVariable, 0)');
        expect (base).toContain ('paramsPo := GetValue(poparamsPoVariable, 1)');
    });
    test('a producer slot that may hold a typed nil keeps the helper', () => {
        const out = go ('    use (params = {}) {\n        const [ a, p ] = this.nilable (params);\n        return [ a, p ];\n    }\n');
        expect (out).toContain ('a := apVariable[0]');
        expect (out).toContain ('p := GetValue(apVariable, 1)');
    });
    test('a slot the producer leaves undefined keeps the helper', () => {
        const out = go ('    use (params = {}) {\n        const [ f, p ] = this.flag (params);\n        return [ f, p ];\n    }\n');
        expect (out).toContain ('f := GetValue(fpVariable, 0)');
    });
    test('a holder name printed by two destructurings keeps the helper', () => {
        const out = go ('    use (params = {}) {\n        const [ a, p ] = this.twice (params);\n        if (a) {\n            const [ a1, p1 ] = this.twice (params);\n        }\n        [ a, p ] = this.twice (params);\n        return [ a, p ];\n    }\n');
        expect (out).toContain ('GetValue(apVariable, 1)');
    });
});
