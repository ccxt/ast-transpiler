import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a bare local whose next mention is a plain overwrite in the same block is dead after this use: the use moves it
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    swap (): any[] {\n        let row = this.hold (1);\n        const out = row;\n        row = this.hold (2);\n        return [ out, row ];\n    }\n' +
    '    callThenWrite (): any {\n        let row = this.hold (1);\n        const out = this.hold (row);\n        row = this.hold (2);\n        return [ out, row ];\n    }\n' +
    '    readBetween (): any[] {\n        let row = this.hold (1);\n        const out = row;\n        this.hold (row);\n        row = this.hold (2);\n        return [ out, row ];\n    }\n' +
    '    selfWrite (): any[] {\n        let row = this.hold (1);\n        const out = row;\n        row = this.hold (row);\n        return [ out, row ];\n    }\n' +
    '    writeInBranch (c: boolean): any[] {\n        let row = this.hold (1);\n        const out = row;\n        if (c) {\n            row = this.hold (2);\n        }\n        return [ out, row ];\n    }\n' +
    '    jumpBetween (n: number): any[] {\n        let row = this.hold (1);\n        let out = undefined;\n        for (let i = 0; i < n; i++) {\n            out = row;\n            if (i > 1) {\n                continue;\n            }\n            row = this.hold (2);\n        }\n        return [ out, row ];\n    }\n' +
    '    inTry (): any[] {\n        let row = this.hold (1);\n        let out = undefined;\n        try {\n            out = row;\n            row = this.hold (2);\n        } catch (e) {\n            out = undefined;\n        }\n        return [ out, row ];\n    }\n}\n';

describe ('rust use before a plain overwrite moves the local', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r62-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    const fn = (name: string, next: string): string => output.slice (output.indexOf ('fn ' + name + '('), next === '' ? undefined : output.indexOf ('fn ' + next + '('));

    test ('an alias before the overwrite moves', () => {
        const f = fn ('swap', 'callThenWrite');
        expect (f).toMatch (/= row;/);
        expect (f).not.toMatch (/row\.clone\(\)/);
    });
    test ('a call argument before the overwrite moves', () => {
        const f = fn ('callThenWrite', 'readBetween');
        expect (f).toMatch (/hold\(row\)/);
        expect (f).not.toMatch (/row\.clone\(\)/);
    });
    test ('negatives keep the clone', () => {
        // a read between the use and the write
        expect (fn ('readBetween', 'selfWrite')).toMatch (/= row\.clone\(\);/);
        // the write reads the old value
        expect (fn ('selfWrite', 'writeInBranch')).toMatch (/= row\.clone\(\);/);
        // the write only runs on one path
        expect (fn ('writeInBranch', 'jumpBetween')).toMatch (/= row\.clone\(\);/);
        // a continue skips the write, the next pass reads the old value
        expect (fn ('jumpBetween', 'inTry')).toMatch (/= row\.clone\(\);/);
        // a throw between the use and the write lands in a catch
        expect (fn ('inTry', '')).toMatch (/= row\.clone\(\);/);
    });
});
