import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a bare local handed as an object-literal value inside a `return` moves: no read after the return runs
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    early (c: boolean): Dict {\n        const row = this.hold (1);\n        if (c) {\n            return { 'info': row, 'n': 1 };\n        }\n        this.hold (row);\n        return { 'info': row };\n    }\n" +
    "    inLoop (n: number): Dict {\n        const row = this.hold (1);\n        for (let i = 0; i < n; i++) {\n            if (i > 2) {\n                return { 'info': row };\n            }\n        }\n        return { 'k': this.hold (row) };\n    }\n" +
    "    sameReturn (c: boolean): Dict {\n        const row = this.hold (1);\n        if (c) {\n            return { 'info': row, 'again': this.hold (row) };\n        }\n        return { 'info': row };\n    }\n" +
    "    inTry (c: boolean): Dict {\n        const row = this.hold (1);\n        try {\n            if (c) {\n                return { 'info': row };\n            }\n        } catch (e) {\n            this.hold (row);\n        }\n        return { 'k': this.hold (row) };\n    }\n" +
    "    captured (c: boolean): Dict {\n        const row = this.hold (1);\n        const f = () => this.hold (row);\n        if (c) {\n            return { 'info': row };\n        }\n        return { 'k': f () };\n    }\n" +
    "    arms (c: boolean): Dict {\n        const row = this.hold (1);\n        let out: Dict = {};\n        if (c) {\n            out = { 'info': row };\n        } else {\n            this.hold (row);\n        }\n        return out;\n    }\n" +
    "    armsThenRead (c: boolean): Dict {\n        const row = this.hold (1);\n        let out: Dict = {};\n        if (c) {\n            out = { 'info': row };\n        } else {\n            this.hold (row);\n        }\n        this.hold (row);\n        return out;\n    }\n" +
    "    notReturned (c: boolean): Dict {\n        const row = this.hold (1);\n        const out = { 'info': row };\n        this.hold (row);\n        return out;\n    }\n}\n";

describe ('rust object-literal value in a return moves the local', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r62-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    const fn = (name: string, next: string): string => output.slice (output.indexOf ('fn ' + name + '('), next === '' ? undefined : output.indexOf ('fn ' + next + '('));

    test ('an early return moves, though the name is read later in the text', () => {
        const f = fn ('early', 'inLoop');
        expect (f).toMatch (/"info"\.to_string\(\), row\);/);
        expect (f).not.toMatch (/"info"\.to_string\(\), row\.clone\(\)\)/);
    });
    test ('a return inside a loop moves too (it leaves the loop)', () => {
        expect (fn ('inLoop', 'sameReturn')).toMatch (/"info"\.to_string\(\), row\);/);
    });
    test ('a later read only in the other if arm moves', () => {
        expect (fn ('arms', 'armsThenRead')).toMatch (/"info"\.to_string\(\), row\);/);
    });
    test ('negatives keep the clone', () => {
        // a read after the if statement
        expect (fn ('armsThenRead', 'notReturned')).toMatch (/"info"\.to_string\(\), row\.clone\(\)\)/);
        // a second read in the same return statement
        expect (fn ('sameReturn', 'inTry')).toMatch (/if c \{[\s\S]*"info"\.to_string\(\), row\.clone\(\)\)/);
        // a return under a try (the catch path reads the local again)
        expect (fn ('inTry', 'captured')).toMatch (/"info"\.to_string\(\), row\.clone\(\)\)/);
        // a closure holds the local
        expect (fn ('captured', 'arms')).toMatch (/"info"\.to_string\(\), row\.clone\(\)\)/);
        // not a return: a later read runs
        expect (fn ('notReturned', '')).toMatch (/"info"\.to_string\(\), row\.clone\(\)\)/);
    });
});
