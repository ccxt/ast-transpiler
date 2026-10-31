import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// RFM-G1 GP18: a receive from an implicit endpoint whose declared type is the stub's EndpointResult
// element reads the carrier's typed view (`.Checked()`, hoisted by ccxt's go-err pass to `rN.Value`)
// instead of converting `.Raw` through MapTyped/ListTyped. The element comes from the receiver's own
// generated `<id>_api.go`; another receiver's stub of the same name, or a stub of the other shape,
// keeps the conversion.

const ABSTRACT =
    "import { Dict, List } from '../base/types.js';\n" +
    "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
    'abstract class Exchange extends _Exchange {\n' +
    '    privateGetOrdersId (params = {}): Promise<Dict> {\n        return this.request ("orders", [ "private" ], "GET", params);\n    }\n\n' +
    '    privateGetRows (params = {}): Promise<List> {\n        return this.request ("rows", [ "private" ], "GET", params);\n    }\n}\n' +
    'export default Exchange;\n';

const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
const BASE =
    "import { Dict } from './types.js';\n" +
    'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
    '    extend (a: Dict, b: Dict): Dict {\n        return a;\n    }\n' +
    '    safeString (o: any, k: string): string {\n        return k;\n    }\n' +
    '    indexBy (o: any, k: string): Dict {\n        return {};\n    }\n}\n';

const VENUE =
    "import Exchange from './abstract/ex.js';\n" +
    "import { Dict } from './base/types.js';\n" +
    'export default class ex extends Exchange {\n' +
    '    async fetchThing (params = {}) {\n' +
    '        const response = await this.privateGetOrdersId (params);\n' +
    "        return this.safeString (response, 'id');\n" +
    '    }\n' +
    '    async fetchRows (params = {}) {\n' +
    '        const rows = await this.privateGetRows (this.extend ({\n' +
    "            'a': 1,\n" +
    "            'b': 2,\n" +
    '        }, params));\n' +
    "        return this.indexBy (rows, 'id');\n" +
    '    }\n' +
    '}\n';

function stubs (mapElement: string, listElement: string): string {
    return 'package ccxt\n\n' +
        '// PrivateGetOrdersId returns a channel that yields a JSON object.\n' +
        'func (this *Ex) PrivateGetOrdersId(args ...any) <-chan EndpointResult[' + mapElement + '] {\n\treturn nil\n}\n' +
        '// PrivateGetRows returns a channel that yields a JSON array.\n' +
        'func (this *Ex) PrivateGetRows(args ...any) <-chan EndpointResult[' + listElement + '] {\n\treturn nil\n}\n';
}

function print (apiGo: string | undefined, install = true): string {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'rfm-g1-gp18-'));
    try {
        const src = path.join (tmp, 'ts', 'src');
        fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
        fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
        fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
        fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
        if (apiGo !== undefined) {
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), apiGo);
        }
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
        if (install) {
            installCcxtGoHooks (t.goTranspiler);
        }
        return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
    } finally {
        fs.rmSync (tmp, { 'recursive': true, 'force': true });
    }
}

describe('RFM-G1 GP18 endpoint receive reads the typed view', () => {
    test('a map stub receive prints the checked typed view, not MapTyped(Raw)', () => {
        const out = print (stubs ('map[string]any', '[]any'));
        expect (out).toContain ('var response map[string]any = (<-this.PrivateGetOrdersId(params)).Checked()');
        expect (out).not.toContain ('MapTyped(PanicOnError((<-this.PrivateGetOrdersId');
    });
    test('a multi-line []any stub receive prints the checked typed view', () => {
        const out = print (stubs ('map[string]any', '[]any'));
        expect (out).toContain ('var rows []any = (<-this.PrivateGetRows(');
        expect (out).toContain ('.Checked()');
        expect (out).not.toContain ('ListTyped(PanicOnError((<-this.PrivateGetRows');
    });
    test('without the receiver stub table the shipped conversion stays', () => {
        const out = print (undefined);
        expect (out).not.toContain ('.Checked()');
    });
    test('a stub whose element disagrees with the declared Promise<T> is refused, never retyped', () => {
        expect (() => print (stubs ('string', '[]any'))).toThrow ();
    });
});
