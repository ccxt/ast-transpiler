import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `Object.keys (this.safeDict (m, k, {}))` on a declared map local prints a comma-ok entry read and a key range
describe ('h50g38 keys of a defaulted dict entry', () => {
    const BASE = [
        'type Dict = {[key: string]: any};',
        'export class Exchange {',
        '    safeDict (d: any, k: any, def: Dict): Dict;',
        '    safeDict (d: any, k: any, def?: Dict): Dict | undefined;',
        '    safeDict (d: any, k: any, def: Dict = undefined): Dict | undefined { return def; }',
        '    take (d: any): any { return d; }',
        '}',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h50g38-'));
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

    test ('a literal key on a map local ranges the entry', () => {
        const out = print ('    run (message: Dict) {\n        const updates: Dict = {};\n        updates[\'a\'] = {};\n        const ks = Object.keys (this.safeDict (updates, \'a\', {}));\n        return ks.length;\n    }\n');
        expect (out).toContain ('if objectEntry, ok := updates["a"].(map[string]any); ok {');
        expect (out).toContain ('for objectKey := range objectEntry {');
        expect (out).not.toContain ('ObjectKeys(');
    });

    test ('negatives keep the helper', () => {
        // no default: the answer for a missing entry is nil, not an empty list
        const noDefault = print ('    run (message: Dict) {\n        const updates: Dict = {};\n        const ks = Object.keys (this.safeDict (updates, \'a\'));\n        return ks.length;\n    }\n');
        expect (noDefault).toContain ('ObjectKeys(');
        // an untyped receiver (nil, a list or another kind)
        const boxed = print ('    run (message: Dict) {\n        const updates = this.take (message);\n        const ks = Object.keys (this.safeDict (updates, \'a\', {}));\n        return ks.length;\n    }\n');
        expect (boxed).toContain ('ObjectKeys(');
        expect (boxed).not.toContain ('objectEntry');
        // a key of unknown kind
        const anyKey = print ('    run (message: Dict, k: any) {\n        const updates: Dict = {};\n        const ks = Object.keys (this.safeDict (updates, k, {}));\n        return ks.length;\n    }\n');
        expect (anyKey).not.toContain ('objectEntry');
    });
});
