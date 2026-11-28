import { Transpiler } from '../src/transpiler';

const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
const go = (ts: string) => new Transpiler(config).transpileGo(ts).content;
const HEAD = 'type Str = string | undefined;\nclass Exchange {\n    safeString (d: any, k: any, def: any = undefined): Str { return def; }\n';

describe('h30g27 indexOf compare on nilable string operands', () => {
    test('a nilable *string needle prints strings.Index under a nil guard', () => {
        const out = go(HEAD + '    f (o: any): boolean {\n        const key = \'a:b\';\n        const sym = this.safeString (o, \'s\');\n        if (key.indexOf (sym) >= 0) {\n            return true;\n        }\n        return false;\n    }\n}\n');
        expect(out).toContain('sym != nil && strings.Index(key, *sym) >= 0');
        expect(out).not.toContain('GetIndexOf(');
    });
    test('a nilable *string receiver compared with < 0 keeps the nil answer true', () => {
        const out = go(HEAD + '    f (o: any): boolean {\n        const v = this.safeString (o, \'v\');\n        return v.indexOf (\'.\') < 0;\n    }\n}\n');
        expect(out).toContain('(v == nil || strings.Index(*v, ".") < 0)');
    });
    test('an any operand keeps the helper', () => {
        const out = go(HEAD + '    f (s: any): boolean {\n        return s.indexOf (\'/\') > -1;\n    }\n}\n');
        expect(out).toContain('GetIndexOf(s, "/")');
        expect(out).not.toContain('strings.Index(');
    });
    test('a local whose writes are not all strings keeps the helper', () => {
        const out = go(HEAD + '    f (o: any): boolean {\n        let v = this.safeString (o, \'v\');\n        v = o[\'x\'];\n        return v.indexOf (\'.\') >= 0;\n    }\n}\n');
        expect(out).not.toContain('strings.Index(*v');
    });
    test('an indexOf compared with a non-literal is left to the helper', () => {
        const out = go(HEAD + '    f (o: any, n: number): boolean {\n        const v = this.safeString (o, \'v\');\n        return v.indexOf (\'.\') >= n;\n    }\n}\n');
        expect(out).not.toContain('v == nil ||');
        expect(out).not.toContain('v != nil &&');
    });
});
