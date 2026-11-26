import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h54g30 guarded last-element store on a safeList local', () => {
    const BASE = [
        'export class Exchange {',
        '    safeDict (a, b, c?): any { return {}; }',
        '    safeList (a, b, c?): any { return []; }',
        '    safeString (a, b, c?): any { return \'\'; }',
        '    extend (...a): any { return {}; }',
        '    async publicGetX (p = {}): Promise<any> { return {}; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\ntype List = any[];\ntype Str = string | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54g30-'));
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
    test ('a length-guarded last-element store types the list local (fails on the base printer)', () => {
        const out = print ('    add (result: Dict): List {\n'
            + '        const cursor = this.safeString (result, \'c\');\n'
            + '        const data = this.safeList (result, \'w\', []);\n'
            + '        const dataLength = data.length;\n'
            + '        if (cursor !== undefined && dataLength > 0) {\n'
            + '            const last: Dict = this.extend ({}, data[dataLength - 1]);\n'
            + '            last[\'c\'] = cursor;\n'
            + '            data[dataLength - 1] = last;\n'
            + '        }\n'
            + '        return data;\n'
            + '    }\n');
        expect (out).toContain ('var data []any = SafeListTyped(result, "w")');
        expect (out).toContain ('this.Extend(map[string]any{}, data[dataLength-1])');
        expect (out).toContain ('data[dataLength - 1] = last');
        expect (out).not.toContain ('AddElementToObject(data');
        expect (out).not.toContain ('GetValue(data');
    });
    test ('negative: no length guard keeps the box and the helpers', () => {
        const out = print ('    add (result: Dict): List {\n'
            + '        const cursor = this.safeString (result, \'c\');\n'
            + '        const data = this.safeList (result, \'w\', []);\n'
            + '        const dataLength = data.length;\n'
            + '        if (cursor !== undefined) {\n'
            + '            const last: Dict = this.extend ({}, data[dataLength - 1]);\n'
            + '            last[\'c\'] = cursor;\n'
            + '            data[dataLength - 1] = last;\n'
            + '        }\n'
            + '        return data;\n'
            + '    }\n');
        expect (out).toContain ('var data any = this.SafeList(result, "w", []any{})');
        expect (out).toContain ('AddElementToObject(data');
    });
    test ('negative: a store value that is not a fresh extend keeps the helper', () => {
        const out = print ('    add (result: Dict): List {\n'
            + '        const cursor = this.safeString (result, \'c\');\n'
            + '        const data = this.safeList (result, \'w\', []);\n'
            + '        const dataLength = data.length;\n'
            + '        if (cursor !== undefined && dataLength > 0) {\n'
            + '            const last: Dict = this.safeDict (result, \'x\');\n'
            + '            last[\'c\'] = cursor;\n'
            + '            data[dataLength - 1] = last;\n'
            + '        }\n'
            + '        return data;\n'
            + '    }\n');
        expect (out).toContain ('AddElementToObject(data');
    });
    test ('negative: a slice shrunk by pop keeps the box', () => {
        const out = print (('    add (result: Dict): List {\n'
            + '        const cursor = this.safeString (result, \'c\');\n'
            + '        const data = this.safeList (result, \'w\', []);\n'
            + '        const dataLength = data.length;\n'
            + '        if (cursor !== undefined && dataLength > 0) {\n'
            + '            const last: Dict = this.extend ({}, data[dataLength - 1]);\n'
            + '            last[\'c\'] = cursor;\n'
            + '            data[dataLength - 1] = last;\n'
            + '        }\n'
            + '        return data;\n'
            + '    }\n').replace ('return data;', 'data.pop ();\n        return data;'));
        expect (out).toContain ('AddElementToObject(data');
    });
});
