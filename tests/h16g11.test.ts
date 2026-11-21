import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go typed ternary declaration prints var x T plus if/else', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h16g11');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n" +
        "    typed (inverse: boolean, o: any) {\n        const volumeIndex = inverse ? 7 : 5;\n        return [ o, volumeIndex ];\n    }\n" +
        "    mixed (flag: boolean, a: any) {\n        const mixedValue = flag ? a : 2;\n        return mixedValue;\n    }\n" +
        "    nilable (top: any) {\n        const bid = (top !== undefined) ? this.safeNumber (top, 'px') : undefined;\n" +
        "        if (bid !== undefined) {\n            return bid;\n        }\n        return undefined;\n    }\n}\n";
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue);
    const t = new Transpiler ({ verbose: false, go: {} });
    installCcxtGoLocalTypes (t.goTranspiler);
    const out = t.transpileGoByPath (path.join (dir, 'ts/src/venue.ts')).content;
    test ('same-typed arms declare the typed local and store per branch', () => {
        expect (out).toMatch (/var volumeIndex int\n\s*if (?:EvalTruthy\(inverse\)|inverse) \{\n\s*volumeIndex = 7\n\s*\} else \{\n\s*volumeIndex = 5\n\s*\}/);
        expect (out).not.toContain ('func() int {');
    });
    test ('a boxed arm keeps the literal', () => {
        expect (out).toMatch (/var mixedValue any\n/);
        expect (out).toMatch (/\n\s*mixedValue = a\n\s*\} else \{\n\s*mixedValue = 2\n/);
    });
    test ('a nil arm read by a nil test keeps its literal', () => {
        expect (out).toMatch (/var bid any\n\s*if [^\n]*\{\n[^\n]*\n\s*\} else \{\n\s*bid = nil\n/);
    });
});
