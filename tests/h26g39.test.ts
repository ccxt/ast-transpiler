import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    checkAddress (a: Str): Str { return a; }\n'
    + '    extend (a: Dict, b: Dict = {}): Dict { return a; }\n'
    + '    build (a: string): string { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g39-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const cwd = process.cwd ();
        process.chdir (dir);
        try {
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};


const PAIR = (ret0: string) => '    createOrderRequest (symbol: string, params: Dict = {}): [string, Dict] {\n'
    + '        const orderId: string = \'id\';\n'
    + '        return [ ' + ret0 + ', this.extend (params) ];\n'
    + '    }\n';
const CALLER = '    f (symbol: string) {\n'
    + '        const res = this.createOrderRequest (symbol, {});\n'
    + '        const orderId = res[0];\n'
    + '        const request = res[1];\n'
    + '        return { \'id\': orderId, \'request\': request };\n'
    + '    }\n';

describe ('go venue [ string, Dict ] methods with a plain-string slot 0 print (string, map[string]any)', () => {
    test ('every slot 0 is a Go string: typed pair, holder reads bind two locals', () => {
        const out = print (PAIR ('orderId') + CALLER);
        expect (out).toContain ('CreateOrderRequest(symbol any, optionalArgs ...any) (string, map[string]any) {');
        expect (out).toContain ('return orderId, this.Extend(params)\n');
        expect (out).toContain ('resSlot0, resSlot1 := this.CreateOrderRequest(symbol, map[string]any{})');
        expect (out).toContain ('request := resSlot1');
        expect (out).not.toContain ('ArrayTyped(');
        expect (out).not.toContain ('var request any');
    });
    test ('a nullable slot 0 (Str local) keeps the []any return', () => {
        const out = print (PAIR ('orderId').replace ('const orderId: string = \'id\';', 'const orderId: Str = this.safeString ({}, \'k\');') + CALLER);
        expect (out).not.toContain ('(string, map[string]any)');
    });
    test ('an undefined slot 0 keeps the []any return', () => {
        const out = print (PAIR ('undefined') + CALLER);
        expect (out).not.toContain ('(string, map[string]any)');
    });
    test ('a holder that escapes (returned whole) keeps the []any return', () => {
        const out = print (PAIR ('orderId') + '    g (s: string) {\n        const h = this.createOrderRequest (s, {});\n        return h;\n    }\n');
        expect (out).not.toContain ('(string, map[string]any)');
    });
});
