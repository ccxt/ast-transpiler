import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a row read from the awaited result of an endpoint declared `Promise<List>` (printed `var r []any = rRecv.Value`)
// is a JSON-origin list: the read prints the comma-ok element assertion while the result is only read
describe ('go row read on an awaited list endpoint result', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return k;\n    }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict {\n        return o[k];\n    }\n' +
        '    parseX (o: Dict): Dict {\n        return o;\n    }\n}\n';
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetRows (params = {}): Promise<List> {\n        return this.request ("rows", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const STUBS = 'package ccxt\n\n// PublicGetRows returns a channel that yields a JSON array.\n' +
        'func (this *Ex) PublicGetRows(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async fetchLit (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeDict (response, 0, {});\n' +
        '        return this.parseX (data);\n' +
        '    }\n' +
        '    async fetchLoop (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < response.length; i++) {\n' +
        '            const row = this.safeDict (response, i, {});\n' +
        "            out.push (this.safeString (row, 'id'));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async fetchReversed (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rev = [];\n' +
        '        const length = response.length;\n' +
        '        for (let i = 0; i < length; i++) {\n' +
        '            rev.push (response[length - 1 - i]);\n' +
        '        }\n' +
        '        return rev;\n' +
        '    }\n' +
        '    async fetchHanded (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const hd = this.safeDict (response, 0, {});\n' +
        '        this.parseX (response);\n' +
        '        return this.parseX (hd);\n' +
        '    }\n' +
        '    async fetchWritten (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        response.push ({});\n' +
        '        const wr = this.safeDict (response, 0, {});\n' +
        '        return this.parseX (wr);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h29a09-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), STUBS);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: a literal-index row of the awaited list keeps its {} default', () => {
        expect (out).toMatch (/if 0 < len\(response\) \{\n\t\tdata, _ = response\[0\]\.\(map\[string\]any\)\n\t\}\n\tif data == nil \{/);
        expect (out).not.toMatch (/var data map\[string\]any = /);
    });
    test ('positive: a loop row over the awaited list', () => {
        expect (out).toContain ('var row, _ = response[i].(map[string]any)');
    });
    test ('negative: a plain element read keeps its printing (no bounds closure)', () => {
        expect (out).not.toMatch (/rev = append\(rev, func\(\)/);
    });
    test ('negative: the list handed to a callee that may write it', () => {
        expect (out).not.toMatch (/hd, _ = response\[0\]/);
    });
    test ('negative: the list written before the read', () => {
        expect (out).not.toMatch (/wr, _ = response\[0\]/);
    });
});
