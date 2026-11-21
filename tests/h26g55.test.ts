import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a non-literal `.slice` bound on a proven string prints a native subscript only when an enclosing `if` proves the range
describe ('go guarded string slice with a length-relative bound', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h26g55');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n" +
        "    safeString (o: any, k: any, d: any = undefined): string | undefined {\n        return d;\n    }\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n" +
        "    ends (o: any): string {\n        const u = this.safeString (o, 'u', '');\n        if (u.endsWith ('/ws')) {\n            const p = u.slice (0, u.length - 3);\n            return p + '/x';\n        }\n        return u;\n    }\n" +
        "    longer (o: any) {\n        const v = this.safeString (o, 'v');\n        if (v === undefined) {\n            return undefined;\n        }\n        if (v.length > 13) {\n            return v.slice (0, v.length - 6);\n        }\n        return v;\n    }\n" +
        "    tail (o: any) {\n        const w = this.safeString (o, 'w', '');\n        const n = w.length;\n        if (n > 6) {\n            return w.slice (n - 6);\n        }\n        return w;\n    }\n" +
        "    side (o: any) {\n        const s = this.safeString (o, 's', '');\n        const i = s.indexOf (':');\n        if (i > -1 && i < s.length - 1) {\n            return s.slice (i + 1);\n        }\n        return undefined;\n    }\n" +
        "    unguarded (o: any) {\n        const a = this.safeString (o, 'a', '');\n        return a.slice (0, a.length - 3);\n    }\n" +
        "    shortSuffix (o: any) {\n        const b = this.safeString (o, 'b', '');\n        if (b.endsWith ('/')) {\n            return b.slice (0, b.length - 3);\n        }\n        return b;\n    }\n" +
        "    nilable (o: any) {\n        const c = this.safeString (o, 'c');\n        if (c.length > 13) {\n            return c.slice (0, c.length - 6);\n        }\n        return c;\n    }\n" +
        "    rebound (o: any) {\n        let d = this.safeString (o, 'd', '');\n        if (d.endsWith ('/ws')) {\n            d = d + 'q';\n            return d.slice (0, d.length - 3);\n        }\n        return d;\n    }\n}\n";
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue);
    const t = new Transpiler ({ verbose: false, go: {} });
    installCcxtGoLocalTypes (t.goTranspiler);
    const out = t.transpileGoByPath (path.join (dir, 'ts/src/venue.ts')).content;
    const fn = (name: string) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    test ('endsWith guard proves the trimmed suffix', () => {
        expect (fn ('ends')).toMatch (/\(\*u\)\[:len\(\(\*u\)\)-3\]/);
        expect (fn ('ends')).not.toContain ('Slice(');
    });
    test ('length guard proves the trimmed suffix', () => {
        expect (fn ('longer')).toMatch (/\(\*v\)\[:len\(\(\*v\)\)-6\]/);
    });
    test ('length local guard proves the tail start', () => {
        expect (fn ('tail')).toMatch (/\(\*w\)\[n-6:\]/);
    });
    test ('index range guard proves the rest after the separator', () => {
        expect (fn ('side')).toMatch (/\[i\+1:\]/);
        expect (fn ('side')).not.toContain ('Slice(');
    });
    test ('no guard keeps the helper', () => {
        expect (fn ('unguarded')).toContain ('Slice(a, 0, ');
    });
    test ('a guard too short for the bound keeps the helper', () => {
        expect (fn ('shortSuffix')).toContain ('Slice(b, 0, ');
    });
    test ('a nilable receiver keeps the helper', () => {
        expect (fn ('nilable')).toContain ('Slice(c, 0, ');
    });
    test ('a rebound receiver keeps the helper', () => {
        expect (fn ('rebound')).toMatch (/Slice\(d, 0, /);
    });
});
