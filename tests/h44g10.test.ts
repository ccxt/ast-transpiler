import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoDictParams, installCcxtGoGb11HandleErrorsCode } from '../src/transpiler';

let run = 0;
const BASE = (ret: string) =>
    'export type Bool = boolean | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export type NullableDict = Dict | undefined;\n' +
    'export type Str = string | undefined;\n' +
    'export type int = number;\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: NullableDict, requestBody: Str): ' + ret + ' {\n' +
    '        return undefined;\n' +
    '    }\n' +
    '    otherBool (v: any): Bool {\n' +
    '        return undefined;\n' +
    '    }\n' +
    '}\n';
const SIG = '    handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: NullableDict, requestBody: Str): Bool {\n';
const printVenue = (members: string, ret = 'Bool', iface = true): string => {
    run += 1;
    const top = path.join (__dirname, 'files', 'tmp-h44g10-' + process.pid, 'r' + run);
    const root = path.join (top, 'ts', 'src');
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.mkdirSync (path.join (top, 'go', 'v4'), { recursive: true });
    if (iface) {
        fs.writeFileSync (path.join (top, 'go', 'v4', 'exchange_interface.go'), 'package ccxt\n\ntype IExchange interface {\n\tHandleErrors(statusCode int64) *bool\n}\n');
    }
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (ret) + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Bool, NullableDict, Str, int } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoDictParams, installCcxtGoGb11HandleErrorsCode ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};
const B = (...xs: string[]) => xs.map ((x) => '        ' + x + '\n').join ('') + '    }\n';

describe ('h44g10: an interface Bool method returning undefined or a literal prints *bool', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h44g10-' + process.pid), { recursive: true, force: true }));
    test ('undefined and true returns: *bool signature, nil and a literal address', () => {
        const out = printVenue (SIG + B ('if (response === undefined) {', '    return undefined;', '}', 'return true;'));
        expect (out).toMatch (/\) HandleErrors\([^\n]*\) \*bool \{/);
        expect (out).toContain ('return nil');
        expect (out).toContain ('retBoolVal := true\n');
        expect (out).toContain ('return &retBoolVal');
        expect (out).not.toContain ('return true');
    });
    test ('only undefined returns: *bool signature', () => {
        const out = printVenue (SIG + B ('return undefined;'));
        expect (out).toMatch (/\) HandleErrors\([^\n]*\) \*bool \{/);
    });
    test ('a non-literal return keeps the box', () => {
        const out = printVenue (SIG + B ('return response;'));
        expect (out).not.toMatch (/HandleErrors\([^\n]*\) \*bool/);
    });
    test ('a return inside try keeps the box', () => {
        const out = printVenue (SIG + B ('try {', '    return undefined;', '} catch (e) {', '}', 'return undefined;'));
        expect (out).not.toMatch (/HandleErrors\([^\n]*\) \*bool/);
    });
    test ('a Bool method that is not on the interface keeps the box', () => {
        const out = printVenue ('    otherBool (v: any): Bool {\n' + B ('return true;'));
        expect (out).not.toMatch (/OtherBool\([^\n]*\) \*bool/);
        expect (out).toContain ('return true');
    });
    test ('without the interface files the method keeps the box', () => {
        const out = printVenue (SIG + B ('return undefined;'), 'Bool', false);
        expect (out).not.toMatch (/HandleErrors\([^\n]*\) \*bool/);
    });
    test ('a caller local takes *bool and compares the pointer', () => {
        const user = '    user (r: any) {\n' + B ('const skip = this.handleErrors (406, \'\', \'\', \'\', {}, \'\', r, {}, undefined);', 'return skip === undefined;');
        const out = printVenue (SIG + B ('return undefined;') + user);
        expect (out).toContain ('var skip *bool = this.HandleErrors(');
        expect (out).not.toContain ('var skip any');
        expect (out).toContain ('return (skip == nil)');
    });
});
