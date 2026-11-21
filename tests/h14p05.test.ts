import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust venue string-list parameters lent as slices', () => {
    const root = path.join (__dirname, 'files', 'tmp-h14p05', 'ts', 'src');
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), 'export class Exchange {\n    split (s: string): string[] { return [ s ]; }\n}\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h14p05'), { recursive: true, force: true }));

    test ('an indexed string list handed by a held local prints a lent slice', () => {
        const out = print ('    countIn (names: string[]): number {\n        let n = 0;\n        for (let i = 0; i < names.length; i++) {\n            if (names[i] === \'a\') {\n                n = n + 1;\n            }\n        }\n        return n;\n    }\n' +
            '    run (s: string) {\n        const names = this.split (s);\n        return this.countIn (names);\n    }\n');
        expect (out).toContain ('names: &[crate::Value]');
        expect (out).not.toContain ('__names_empty');
    });

    test ('negatives keep the box', () => {
        // an array literal at a caller: nothing is held to lend
        const literal = print ('    countIn (names: string[]): number {\n        return names.length;\n    }\n    run () {\n        return this.countIn ([ \'a\' ]);\n    }\n');
        expect (literal).not.toContain ('&[crate::Value]');
        // a body that hands the list on whole to a plain slot
        const handOff = print ('    keep (x: any) {\n        return x;\n    }\n    countIn (names: string[]): number {\n        this.keep (names);\n        return names.length;\n    }\n    run (s: string) {\n        const names = this.split (s);\n        return this.countIn (names);\n    }\n');
        expect (handOff).not.toContain ('names: &[crate::Value]');
    });
});
