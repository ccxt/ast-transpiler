import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoHooks } from '../src/go/index';

// FOLD3 G03 (build/hx10w2-G03.ts folded): a native `m[k] = v` store on a map local the printer declares itself,
// behind the nil test the helper applied; `(k as string)` keys; Trade / TransferEntry rows boxed to their map;
// the params slot of a base tuple helper.
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'type NullableDict = Dict | undefined;\n' +
    'type Str = string | undefined;\n' +
    'export interface Trade { id: string }\n' +
    'export interface TransferEntry { id: string }\n' +
    'export default class Exchange {\n' +
    '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n' +
    '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n' +
    '    parseTrade (t: any): Trade { return t; }\n' +
    '    parseTransfer (t: any): TransferEntry { return t; }\n' +
    '    handlePostOnly (a: any, b: any, p: Dict = {}): [ boolean, Dict ] { return [ false, p ]; }\n' +
    '    omit (a: any, b: any): Dict { return a; }\n';

const run = (members: string, dir = 'ts/src', derived = false): string => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f3g03-'));
    try {
        const src = path.join(tmp, dir);
        fs.mkdirSync(path.join(tmp, 'ts/src/base'), { recursive: true });
        fs.mkdirSync(src, { recursive: true });
        fs.writeFileSync(path.join(tmp, 'ts/src/base/Exchange.ts'), BASE + '}\n');
        const file = path.join(src, 'x.ts');
        fs.writeFileSync(file, (derived ? "import Exchange, { Dict, Trade, TransferEntry } from './base/Exchange.js';\nclass X extends Exchange {\n" : BASE) + members + '}\n');
        const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
        installCcxtGoHooks(t.goTranspiler);
        return t.transpileGoByPath(file).content;
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
};
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('FOLD3 G03: native stores on printed map locals', () => {
    test('a no-default safeDict local: the store sits behind the nil test the helper applied', () => {
        const out = run(
            '    f (orders: Dict, id: string, fee: Dict): any {\n' +
            '        const order = this.safeDict (orders, id);\n' +
            '        if (order !== undefined) {\n' +
            "            order['fee'] = fee;\n" +
            '            order[\'n\'] = 1;\n' +
            '        }\n' +
            '        return this.safeString (order, \'x\');\n' +
            '    }\n');
        expect(out).toContain('var order map[string]any = this.SafeDictMap(orders, id)');
        expect(flat(out)).toContain('if order != nil { order["n"] = 1 }');
        expect(out).not.toContain('AddElementToObject(order, "n"');
    });
    test('a never-nil safeDict default needs no nil test, and a pointer value keeps the helper', () => {
        const out = run(
            '    f (o: Dict, id: string): any {\n' +
            "        const d = this.safeDict (o, id, {});\n" +
            "        d['a'] = 1;\n" +
            "        d['b'] = this.safeString (o, 'b');\n" +
            '        return d;\n' +
            '    }\n');
        expect(out).toContain('d["a"] = 1');
    });
    test('an `as string` key is read through to the *string local it asserts', () => {
        const out = run(
            '    f (entries: any[]): any {\n' +
            '        const result: Dict = {};\n' +
            '        for (let i = 0; i < entries.length; i++) {\n' +
            "            const code = this.safeString (entries[i], 'c');\n" +
            "            result[code as string] = { 'a': 1 };\n" +
            '        }\n' +
            '        return result;\n' +
            '    }\n');
        expect(flat(out)).toContain('if code != nil { result[*code] = map[string]any{ "a": 1, } }');
        expect(out).not.toContain('AddElementToObject(result, code');
    });
    test('a nil-initialised NullableDict: the store keeps the nil test, the returned literal keeps the local typed', () => {
        const out = run(
            '    sign (hasKey: boolean): any {\n' +
            '        let requestHeaders: NullableDict = undefined;\n' +
            '        if (hasKey) {\n' +
            "            requestHeaders = { 'K': 'v' };\n" +
            "            requestHeaders['Content-Type'] = 'application/json';\n" +
            '        }\n' +
            "        return { 'headers': requestHeaders };\n" +
            '    }\n');
        expect(out).toContain('var requestHeaders map[string]any = nil');
        expect(flat(out)).toContain('if requestHeaders != nil { requestHeaders["Content-Type"] = "application/json" }');
    });
    test('a parsed Trade row is boxed where it is declared, and its stores are native', () => {
        const out = run(
            '    parseTrade (t: any): Trade {\n' +
            '        const parsed = super.parseTrade (t);\n' +
            "        parsed['takerOrMaker'] = 'maker';\n" +
            '        return parsed;\n' +
            '    }\n', 'ts/src/pro', true);
        expect(out).toContain('var parsed map[string]any = TradeToMap(base.ParseTrade(t))');
        expect(flat(out)).toContain('if parsed != nil { parsed["takerOrMaker"] = "maker" }');
    });
    test('a nil-initialised TransferEntry local boxes its writes and takes native stores', () => {
        const out = run(
            '    f (t: any, from: string): any {\n' +
            '        let transfer: TransferEntry | undefined = undefined;\n' +
            '        transfer = this.parseTransfer (t);\n' +
            "        if (this.safeString (transfer, 'from') === undefined) {\n" +
            "            transfer['from'] = 'spot';\n" +
            '        }\n' +
            '        return transfer;\n' +
            '    }\n', 'ts/src', true);
        expect(out).toContain('var transfer map[string]any = nil');
        expect(out).toContain('transfer = TransferEntryToMap(this.ParseTransfer(t))');
        expect(out).not.toContain('AddElementToObject(transfer,');
    });
    test('the params slot of a base tuple helper takes the guarded native store', () => {
        const out = run(
            '    f (p: Dict = {}): any {\n' +
            '        const [ postOnly, paramsPostOnly ] = this.handlePostOnly (false, false, p);\n' +
            "        paramsPostOnly['postOnly'] = true;\n" +
            '        return paramsPostOnly;\n' +
            '    }\n', 'ts/src', true);
        expect(flat(out)).toContain('if paramsPostOnly != nil { paramsPostOnly["postOnly"] = true }');
    });
    test('a receiver the printer does not type keeps the helper', () => {
        const out = run(
            '    f (o: any, id: string): any {\n' +
            "        o[id] = 1;\n" +
            '        const q = this.parseTrade (o);\n' +
            "        q['a'] = 1;\n" +
            '        return q;\n' +
            '    }\n', 'ts/src', true);
        expect(out).toContain('AddElementToObject(o, id, 1)');
    });
});
