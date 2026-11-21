import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `xs[i] = v` on a `[]any` local prints the native store only when the index is proven in range
// (a length guard for 0 / n - 1, or the slice's own counting loop) and v is never a pointer box
describe ('h27g21 bounds-proven slice index store', () => {
    const BASE = [
        'export class Exchange {',
        '    safeDict (a, b, c?): any { return {}; }',
        '    safeList (a, b, c?): any { return []; }',
        '    safeString (a, b, c?): any { return \'\'; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\ntype List = any[];\ntype Str = string | undefined;\n';
    const tmpRoot = path.join (process.env.TMPDIR || os.tmpdir ());
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (tmpRoot, 'h27g21-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const GUARDED = (write: string, guard = 'dataLength > 0') => '    add (cursor: Str, response: Dict): List {\n'
        + '        const data: Dict[] = [];\n        data.push (response);\n'
        + '        const dataLength = data.length;\n'
        + '        if ((cursor !== undefined) && (' + guard + ')) {\n'
        + '            const first = this.safeDict (data, 0, {});\n'
        + '            const last = this.safeDict (data, dataLength - 1, {});\n'
        + '            first[\'c\'] = cursor;\n'
        + '            last[\'c\'] = cursor;\n'
        + write
        + '        }\n'
        + '        return data;\n'
        + '    }\n';
    const BOTH = '            data[0] = first;\n            data[dataLength - 1] = last;\n';
    test ('length-guarded first/last stores print native (fails on the base printer)', () => {
        const out = print (GUARDED (BOTH));
        expect (out).toContain ('data[0] = first');
        expect (out).toContain ('data[dataLength - 1] = last');
        expect (out).not.toContain ('AddElementToObject(data');
    });
    test ('counting-loop store of a string literal prints native (fails on the base printer)', () => {
        const out = print ('    blank (): List {\n        const keys: string[] = [];\n        keys.push (\'a\');\n'
            + '        for (let j = 0; j < keys.length; j++) {\n            keys[j] = \'\';\n        }\n        return keys;\n    }\n');
        expect (out).not.toContain ('AddElementToObject(keys');
    });
    test ('negative: an any element read back out of the same slice keeps the helper', () => {
        const out = print ('    add (cursor: Str, response: Dict): List {\n        const data: Dict[] = [];\n        data.push (response);\n'
            + '        const dataLength = data.length;\n        if (dataLength > 0) {\n            const first = data[0];\n'
            + '            first[\'c\'] = cursor;\n            data[0] = first;\n        }\n        return data;\n    }\n');
        expect (out).toContain ('AddElementToObject(data, 0, first)');
    });
    test ('negative: no length guard keeps the helper', () => {
        const out = print ('    add (cursor: Str, response: Dict): List {\n        const data: Dict[] = [];\n        data.push (response);\n        const first = this.safeDict (data, 0, {});\n'
            + '        data[0] = first;\n        return data;\n    }\n');
        expect (out).toContain ('AddElementToObject(data, 0, first)');
    });
    test ('negative: a guard on another length keeps the helper', () => {
        const out = print (GUARDED (BOTH, 'cursor.length > 0'));
        expect (out).toContain ('AddElementToObject(data, 0, first)');
    });
    test ('negative: a slice shrunk by pop keeps the helper', () => {
        const out = print (GUARDED ('            data.pop ();\n' + BOTH));
        expect (out).toContain ('AddElementToObject(data, 0, first)');
    });
    test ('negative: a value that can be a nil *string keeps the helper', () => {
        const out = print (GUARDED ('            const s = this.safeString (first, \'x\');\n            data[0] = s;\n'));
        expect (out).toContain ('AddElementToObject(data, 0, s)');
    });
    test ('negative: an index outside the counting loop bound keeps the helper', () => {
        const out = print ('    blank (other: List): List {\n        const keys: string[] = [];\n        keys.push (\'a\');\n'
            + '        for (let j = 0; j < other.length; j++) {\n            keys[j] = \'\';\n        }\n        return keys;\n    }\n');
        expect (out).toContain ('AddElementToObject(keys, j, "")');
    });
});
