import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h57g05: a statement push onto a string-keyed slot of a map local', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (a, b, c?) { return \'\'; }',
        '    safeDict (a, b, c?): any { return {}; }',
        '    parseWsTrade (a): Dict { return {}; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h57g05-'));
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
    const method = (decl: string, push: string) => '    handleOrder (message: any, orders: any, k: string) {\n'
        + '        ' + decl + '\n'
        + '        const trade = this.parseWsTrade (message);\n'
        + '        ' + push + '\n'
        + '        return previousOrder;\n'
        + '    }\n';
    test ('a typed map local appends through the comma-ok slot read and stores the grown slice back', () => {
        const out = print (method ('const previousOrder: Dict = {};', 'previousOrder[\'trades\'].push (trade);'));
        expect (out).toContain ('\tif retRes68, ok := previousOrder["trades"].([]any); ok {\n\t\tpreviousOrder["trades"] = append(retRes68, trade)\n\t}\n');
        expect (out).not.toContain ('AppendToArray');
    });
    test ('a safeDict map local takes the same form', () => {
        const out = print (method ('const previousOrder = this.safeDict (orders, k);', 'previousOrder[\'trades\'].push (trade);'));
        expect (out).toContain ('var previousOrder map[string]any = SafeMapTyped(orders, k)');
        expect (out).toContain ('previousOrder["trades"] = append(retRes68, trade)');
        expect (out).not.toContain ('AppendToArray');
    });
    test ('a non-literal key keeps the helper', () => {
        const out = print (method ('const previousOrder: Dict = {};', 'previousOrder[k].push (trade);'));
        expect (out).toContain ('AppendToArray(&retRes68, trade)');
        expect (out).not.toContain ('.([]any); ok');
    });
    test ('an untyped receiver keeps the helper', () => {
        const out = print (method ('const previousOrder = message;', 'previousOrder[\'trades\'].push (trade);'));
        expect (out).toContain ('AppendToArray(&retRes68, trade)');
        expect (out).not.toContain ('.([]any); ok');
    });
    test ('a push whose result is read keeps the helper', () => {
        const out = print (method ('const previousOrder: Dict = {};', 'const n = previousOrder[\'trades\'].push (trade);'));
        expect (out).toContain ('AppendToArray(&');
        expect (out).not.toContain ('.([]any); ok');
    });
});
