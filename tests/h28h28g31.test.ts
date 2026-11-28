import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a map store whose value is a base safeList / safeDict read with a literal-container default is native:
// that read never yields a scalar pointer, so the helper's derefScalar stores the same value
describe ('h28g31 map store of a base safe container read', () => {
    const BASE = [
        'export class Exchange {',
        '    options: any = {};',
        '    safeDict (a, b, c?): any { return {}; }',
        '    safeList (a, b, c?): any { return []; }',
        '    safeString (a, b, c?): any { return \'\'; }',
        '}',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28g31-'));
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
    const W = (value: string, pre = '') => '    w (r: Dict) {\n        const d = this.safeDict (this.options, \'o\', {});\n' + pre
        + '        d[\'v\'] = ' + value + ';\n        return d;\n    }\n';
    test ('positive: a defaulted safeList read is stored natively', () => {
        const out = print (W ('this.safeList (r, \'t\', [])'));
        expect (out).toContain ('d["v"] = this.SafeList(r, "t", []any{})');
        expect (out).not.toContain ('AddElementToObject(d,');
    });
    test ('negative: a safeString read (a *string) keeps the helper', () => {
        // the never-nil map takes the nil-guarded store: the pointer never reaches the slot
        const out = print (W ('this.safeString (r, \'t\')'));
        expect (out).toContain ('if ptrValue := this.SafeString(r, "t"); ptrValue != nil {\n\t\td["v"] = *ptrValue\n\t} else {\n\t\td["v"] = nil\n\t}');
        expect (out).not.toContain ('d["v"] = this.SafeString');
    });
    test ('negative: a non-literal default that may be nil keeps the helper', () => {
        const out = print (W ('this.safeList (r, \'t\', dflt)', '        const dflt = this.safeList (r, \'x\');\n'));
        expect (out).not.toContain ('d["v"] = this.SafeList(r, "t", dflt)');
    });
});
