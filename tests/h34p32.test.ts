import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler ({ 'verbose': false });
const java = (body: string, params = 'k: any, v: any, p: Dict') => transpiler.transpileJava (
    "type Dict = { [key: string]: any };\nclass T {\n    other (): any { return {}; }\n    test (" + params + "): any {\n" + body + "\n    }\n}").content;

describe ('declared Map local holding only fresh HashMaps: any-key write is the raw Map put', () => {
    test ('positive: an any key on a `const r: Dict = {}` local prints the put', () => {
        const out = java ("        const r: Dict = {};\n        r[k] = v;\n        return r;");
        expect (out).toContain ('((java.util.Map<Object, Object>) (java.util.Map<?, ?>) r).put(k, v)');
        expect (out).not.toContain ('Helpers.addElementToObject(r');
    });
    test ('positive: a nil value and a nil key still go through the HashMap put (same as the helper)', () => {
        const out = java ("        const r: Dict = {};\n        r[k] = undefined;\n        return r;");
        expect (out).toContain ('((java.util.Map<Object, Object>) (java.util.Map<?, ?>) r).put(k, null)');
    });
    test ('negative: a parameter receiver (maybe a ConcurrentHashMap) keeps the helper', () => {
        const out = java ("        p[k] = v;\n        return p;");
        expect (out).toContain ('Helpers.addElementToObject(p, k, v)');
    });
    test ('negative: a local reassigned from a non-fresh value keeps the helper', () => {
        const out = java ("        let r: Dict = {};\n        r = this.other ();\n        r[k] = v;\n        return r;");
        expect (out).toContain ('Helpers.addElementToObject(r, k, v)');
    });
    test ('negative: an untyped (any) local keeps the helper', () => {
        const out = java ("        const r: any = this.other ();\n        r[k] = v;\n        return r;");
        expect (out).toContain ('Helpers.addElementToObject(r, k, v)');
    });
    test ('negative: a two-key write keeps the helper', () => {
        const out = java ("        const r: Dict = {};\n        r['a'][k] = v;\n        return r;");
        expect (out).not.toContain ('(java.util.Map<?, ?>) r).put(');
    });
});
