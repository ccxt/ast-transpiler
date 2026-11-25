import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict read of a const literal table local (read only by safe readers) prints the comma-ok read
describe ('h45g36: safeDict of a read-only literal table local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h45g36-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const TABLE = '        const byType: Dict = {\n            \'deposit\': { \'0\': \'pending\', \'1\': \'ok\' },\n            \'withdrawal\': { \'6\': \'ok\' },\n        };\n';
    const fn = (sig: string, pre: string, read: string, post = '') => '    f (' + sig + '): Str {\n' + pre + TABLE + post
        + '        const statuses = ' + read + ';\n        return this.safeString (statuses, status, status);\n    }\n';
    test ('unguarded *string key: nil-guarded comma-ok read (fails on the base printer)', () => {
        const out = print (fn ('status: Str, type: Str = undefined', '', 'this.safeDict (byType, type, {})'));
        expect (out).toContain ('var statuses map[string]any\n\tif typeVar != nil {\n\t\tstatuses, _ = byType[*typeVar].(map[string]any)\n\t}');
        expect (out).not.toContain ('SafeMapTyped(byType');
    });
    test ('two-argument read after an exiting nil test: comma-ok read, nil answer kept', () => {
        const out = print (fn ('status: Str, type: Str = undefined', '        if (type === undefined) {\n            return status;\n        }\n', 'this.safeDict (byType, type)'));
        expect (out).toContain ('statuses, _ = byType[*typeVar].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(byType');
    });
    test ('negative: an untyped (any) key keeps the wrap', () => {
        const out = print (fn ('status: Str, type: any', '', 'this.safeDict (byType, type)'));
        expect (out).toContain ('SafeMapTyped(byType, typeVar)');
    });
    test ('negative: a table written into keeps the wrap', () => {
        const out = print (fn ('status: Str, type: Str = undefined', '', 'this.safeDict (byType, type, {})', '        byType[\'x\'] = this.keep (status);\n'));
        expect (out).not.toContain ('byType[*typeVar].(');
    });
    test ('negative: a table handed to a callee keeps the wrap', () => {
        const out = print (fn ('status: Str, type: Str = undefined', '', 'this.safeDict (byType, type, {})', '        this.keep (byType);\n'));
        expect (out).not.toContain ('byType[*typeVar].(');
    });
    test ('negative: a table holding a non-literal value keeps the wrap', () => {
        const body = '    f (status: Str, type: Str = undefined): Str {\n        const byType: Dict = { \'deposit\': this.keep (status) };\n'
            + '        const statuses = this.safeDict (byType, type, {});\n        return this.safeString (statuses, status, status);\n    }\n';
        expect (print (body)).not.toContain ('byType[*typeVar].(');
    });
});
