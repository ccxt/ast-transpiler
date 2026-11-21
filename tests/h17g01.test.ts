import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go ternary with an omit-of-map arm joins as map[string]any', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h17g01');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export default class Exchange {\n    omit (x: any, ...args: any[]): any { return x; }\n    safeString (x: any, k: any): any { return x; }\n    extend (...args: any[]): any { return {}; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n" +
        "    joined (params = {}) {\n        const userref = this.safeString (params, 'userref');\n        const paramsOmitted = (userref !== undefined) ? this.omit (params, 'userref') : params;\n        return this.extend ({}, paramsOmitted);\n    }\n" +
        "    boxedArg (params: any) {\n        const u = this.safeString (params, 'u');\n        const boxedOmitted = (u !== undefined) ? this.omit (params, 'u') : params;\n        return this.extend ({}, boxedOmitted);\n    }\n" +
        "    letRebind (params = {}) {\n        const userref = this.safeString (params, 'userref');\n        let letOmitted = (userref !== undefined) ? this.omit (params, 'userref') : params;\n        const c = this.safeString (letOmitted, 'c');\n        if (c !== undefined) {\n            letOmitted = this.omit (letOmitted, 'c');\n        }\n        return this.extend ({}, letOmitted);\n    }\n" +
        "    otherWrite (params = {}) {\n        const w = this.safeString (params, 'w');\n        let otherOmitted = (w !== undefined) ? this.omit (params, 'w') : params;\n        otherOmitted = this.safeString (params, 'x');\n        return otherOmitted;\n    }\n" +
        "    nilArm (params = {}) {\n        const v = this.safeString (params, 'v');\n        const nilOmitted = (v !== undefined) ? this.omit (params, 'v') : undefined;\n        if (nilOmitted === undefined) {\n            return undefined;\n        }\n        return nilOmitted;\n    }\n}\n";
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue);
    const t = new Transpiler ({ verbose: false, go: {} });
    installCcxtGoLocalTypes (t.goTranspiler);
    const out = t.transpileGoByPath (path.join (dir, 'ts/src/venue.ts')).content;
    test ('an omit-of-map arm beside its map joins as a typed local storing OmitDict', () => {
        expect (out).toMatch (/var paramsOmitted map\[string\]any\n\s*if userref != nil \{\n\s*paramsOmitted = this\.OmitDict\(params, "userref"\)\n\s*\} else \{\n\s*paramsOmitted = params\n\s*\}/);
    });
    test ('a self-omit rebind keeps the typed local', () => {
        expect (out).toMatch (/var letOmitted map\[string\]any\n/);
        expect (out).not.toContain ('var letOmitted any');
    });
    test ('an omit of an any parameter keeps the literal', () => {
        expect (out).toMatch (/var boxedOmitted any\n/);
    });
    test ('a nil arm read by a nil test keeps the literal', () => {
        expect (out).toMatch (/var nilOmitted any = func\(\) any \{/);
        expect (out).not.toMatch (/\n\s*nilOmitted = nil\n/);
    });
    test ('a write of another type keeps the literal', () => {
        expect (out).toMatch (/var otherOmitted any = func\(\) any \{/);
    });
});
