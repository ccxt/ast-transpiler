import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil test on a const local initialised by parseInt / this.parseToInt that Go types int64 is constant
// false (those helpers never return nil in Go): the guard prints away; other nil tests keep their answer.
describe ('h28t03: int64 parseInt / parseToInt local, nil test prints away', () => {
    const BASE =
        "import { Str } from './types.js';\n" +
        'export default class Exchange {\n' +
        '    parseToInt (number: any): number {\n        return parseInt (number);\n    }\n' +
        '    safeInteger (o: any, k: any): any {\n        return o;\n    }\n' +
        '    pos (precision: string): Str {\n        const precisionNumber = parseInt (precision);\n        if (precisionNumber === undefined) {\n            return undefined;\n        }\n        if (precisionNumber === 0) {\n            return \'1\';\n        }\n        return \'x\';\n    }\n' +
        '    rlp (hex: string): string {\n        const byteLength = this.parseToInt (hex.length / 2);\n        if (byteLength === undefined) {\n            return \'\';\n        }\n        return \'a\' + byteLength;\n    }\n' +
        '    letLocal (precision: string): Str {\n        let n = parseInt (precision);\n        if (precision === \'x\') {\n            n = undefined;\n        }\n        if (n === undefined) {\n            return undefined;\n        }\n        return \'x\';\n    }\n' +
        '    other (v: any): Str {\n        const n = this.safeInteger (v, \'k\');\n        if (n === undefined) {\n            return undefined;\n        }\n        return \'x\';\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *Exchange) ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28t03-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), 'export type Str = string | undefined;\n');
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'base', 'Exchange.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: parseInt int64 local, the dead guard is gone (fails on the base printer)', () => {
        expect (fn ('Pos')).toContain ('var precisionNumber int64 = ParseInt(precision)');
        expect (fn ('Pos')).not.toContain ('IsEqual(precisionNumber, nil)');
        expect (fn ('Pos')).not.toContain ('precisionNumber == nil');
        expect (fn ('Pos')).toContain ('if precisionNumber == 0 {');
    });
    test ('positive: this.parseToInt int64 local, the dead guard is gone', () => {
        expect (fn ('Rlp')).toContain ('var byteLength int64 = this.ParseToInt(');
        expect (fn ('Rlp')).not.toContain ('IsEqual(byteLength, nil)');
        expect (fn ('Rlp')).not.toContain ('return ""');
    });
    test ('negative: a reassigned local that can be nil keeps its nil test', () => {
        expect (fn ('LetLocal')).toContain ('IsEqual(n, nil)');
    });
    test ('negative: a nilable *int64 from another reader keeps its nil test', () => {
        expect (fn ('Other')).toContain ('if n == nil {');
    });
});
