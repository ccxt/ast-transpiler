import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a guarded `.slice` on a `string` local that is rebound only outside the guarding `if` prints a native subscript
describe ('go guarded string slice on a rebound string local', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h54g42');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n" +
        "    safeString (o: any, k: any, d: any = undefined): string | undefined {\n        return d;\n    }\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n" +
        "    strip (o: any): string {\n        let r: string = this.safeString (o, 'r', '');\n        if (r.startsWith ('C')) {\n            r = r.slice (1);\n        }\n        if (r.endsWith ('%')) {\n            r = r.slice (0, r.length - 1);\n        }\n        return r;\n    }\n" +
        "    inside (o: any): string {\n        let s: string = this.safeString (o, 's', '');\n        if (s.endsWith ('%')) {\n            s = 'x';\n            return s.slice (0, s.length - 1);\n        }\n        return s;\n    }\n" +
        "    looped (o: any): string {\n        let t: string = this.safeString (o, 't', '');\n        while (t.endsWith ('%')) {\n            if (t.endsWith ('%')) {\n                t = t.slice (0, t.length - 1);\n            }\n        }\n        return t;\n    }\n" +
        "    unguarded (o: any): string {\n        let u: string = this.safeString (o, 'u', '');\n        u = u + 'q';\n        return u.slice (0, u.length - 1);\n    }\n}\n";
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
    test ('endsWith guard proves the trim of a local rebound outside the guard', () => {
        expect (fn ('strip')).toMatch (/r = r\[:len\(r\)-1\]/);
        expect (fn ('strip')).not.toContain ('Slice(');
    });
    test ('a rebind inside the guarding if keeps the helper', () => {
        expect (fn ('inside')).toContain ('Slice(s, 0, ');
    });
    test ('a slice inside a loop keeps the helper', () => {
        expect (fn ('looped')).toContain ('Slice(t, 0, ');
    });
    test ('no guard keeps the helper', () => {
        expect (fn ('unguarded')).toContain ('Slice(u, 0, ');
    });
});
