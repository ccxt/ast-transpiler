import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// hx11 RFM-X4 JSONSTR (moved from ccxt build/hx11w8-json-string.ts): a `this.<m>(..)` call whose checker
// type is exactly TS `string` and whose Go signature returns `string` is not boxed with SafeStringPtr
// when it is stored in a *string slot; its value is kept in a typed local and the pointer takes the
// local's address (`jsonText := this.Json(x)` + `name = &jsonText`).

const PRELUDE = 'type Dict = { [key: string]: any };\n'
    + 'type Str = string | undefined;\n'
    + 'class Exchange {\n'
    + '    json (data: any, params = {}): string { return \'\'; }\n'
    + '    hmac (data: any): string { return \'\'; }\n'
    + '    safeString (o: any, k: string): string | undefined { return undefined; }\n'
    + '}\n';

const print = (body: string, hooks = true): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (hooks) { installCcxtGoHooks (t.goTranspiler); }
    return t.transpileGo (PRELUDE + 'class Foo extends Exchange {\n' + body + '}\n').content;
};

describe('hx11 string-returning call stored in a *string slot', () => {
    test('statement assignment keeps the string in a typed local (fails on the boxed form)', () => {
        const out = print (
            '    sign (params: Dict, method: string): any {\n'
            + '        let bodyJson = undefined;\n'
            + '        if (method !== \'GET\') {\n'
            + '            bodyJson = this.json (params);\n'
            + '        }\n'
            + '        return { \'b\': bodyJson };\n'
            + '    }\n');
        expect (out).toContain ('var bodyJson *string = nil');
        expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\tbodyJson = &jsonText\n');
        expect (out).not.toContain ('SafeStringPtr(this.Json');
    });
    test('ternary arm returns the address of a numbered local; names count in source order per function', () => {
        const out = print (
            '    sign (params: Dict, query: Dict, method: string): any {\n'
            + '        let a = undefined;\n'
            + '        if (method !== \'GET\') {\n'
            + '            a = this.json (params);\n'
            + '        }\n'
            + '        const b = (method === \'POST\') ? this.json (query) : undefined;\n'
            + '        return { \'a\': a, \'b\': b };\n'
            + '    }\n');
        expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\ta = &jsonText\n');
        expect (out).toContain ('\t\t\tjsonText2 := this.Json(query)\n\t\t\treturn &jsonText2\n');
        expect (out).not.toContain ('SafeStringPtr(this.Json');
    });
    test('keyed on the callee type, not the name: hmac gets its own hmacText local', () => {
        const out = print (
            '    sign (params: Dict): any {\n'
            + '        let h = undefined;\n'
            + '        if (params) {\n'
            + '            h = this.json (params);\n'
            + '        }\n'
            + '        return { \'h\': h };\n'
            + '    }\n'
            + '    other (data: any): any {\n'
            + '        let s = undefined;\n'
            + '        if (data) {\n'
            + '            s = this.hmac (data);\n'
            + '        }\n'
            + '        return { \'s\': s };\n'
            + '    }\n');
        expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\th = &jsonText\n');
        expect (out).toContain ('\t\thmacText := this.Hmac(data)\n\t\ts = &hmacText\n');
        expect (out).not.toContain ('SafeStringPtr(');
    });
    test('a call typed string | undefined keeps the SafeStringPtr box', () => {
        const out = print (
            '    sign (o: Dict): any {\n'
            + '        let s = undefined;\n'
            + '        if (o) {\n'
            + '            s = this.safeString (o, \'k\');\n'
            + '        }\n'
            + '        return { \'s\': s };\n'
            + '    }\n');
        expect (out).not.toContain ('Text :=');
    });
    test('a local already spelled jsonText keeps the box', () => {
        const out = print (
            '    sign (params: Dict): any {\n'
            + '        const jsonText = 1;\n'
            + '        let b = undefined;\n'
            + '        if (params) {\n'
            + '            b = this.json (params);\n'
            + '        }\n'
            + '        return { \'b\': b, \'t\': jsonText };\n'
            + '    }\n');
        expect (out).not.toContain ('jsonText := this.Json');
        expect (out).not.toContain ('&jsonText');
    });
    test('a wider expression around the call keeps the box', () => {
        const out = print (
            '    sign (params: Dict): any {\n'
            + '        let b = undefined;\n'
            + '        if (params) {\n'
            + '            b = this.json (params) + \'x\';\n'
            + '        }\n'
            + '        return { \'b\': b };\n'
            + '    }\n');
        expect (out).not.toContain ('jsonText');
    });
});
