import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local initialised by a venue method whose every return is a never-rebound safeList local with an
// empty literal default takes `[]any`; a default-free reader or a rebound local keeps the box.
describe ('go local typed from a never-nil defaulted reader return', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    extend (a: any, b: any = undefined): Dict {\n        return a;\n    }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n' +
        '    parseOrders (o: any): any {\n        return o;\n    }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        "    rowsOf (r: Dict): Dict[] {\n        const data: Dict[] = this.safeList (r, 'data', []);\n        if (data.length > 0) {\n            data[0] = r;\n        }\n        return data;\n    }\n" +
        "    rowsMaybe (r: Dict): Dict[] {\n        const data: Dict[] = this.safeList (r, 'data');\n        return data;\n    }\n" +
        "    rowsRebound (r: Dict, o: any): Dict[] {\n        let data: Dict[] = this.safeList (r, 'data', []);\n        data = o;\n        return data;\n    }\n" +
        "    rowsN (r: Dict): any[] {\n        const result = this.safeDict (r, 'result', {});\n        const data: Dict[] = this.safeList (result, 'list', []);\n        const c = this.safeString (result, 'c');\n        const n = data.length;\n        if ((c !== undefined) && (n > 0)) {\n            const first = data[0];\n            first['c'] = c;\n            data[0] = first;\n        }\n        return data;\n    }\n" +
        "    useN (r: Dict) {\n        const rows = this.rowsN (r);\n        return this.parseOrders (rows);\n    }\n" +
        "    useRows (r: Dict) {\n        const rows = this.rowsOf (r);\n        return rows.length;\n    }\n" +
        "    useMaybe (r: Dict) {\n        const rows = this.rowsMaybe (r);\n        return rows === undefined;\n    }\n" +
        "    useRebound (r: Dict, o: any) {\n        const rows = this.rowsRebound (r, o);\n        return rows === undefined;\n    }\n" +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf (') ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (out.lastIndexOf ('func ', start), (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g29-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: defaulted safeList local returned', () => {
        expect (fn ('UseN')).toMatch (/var rows \[\]any = this\.RowsN\(r\)/);
    });
    test ('negative: a reader with no default can answer nil', () => {
        expect (fn ('UseMaybe')).not.toMatch (/var rows \[\]any = this\.RowsMaybe\(/);
    });
    test ('negative: a rebound returned local can carry a nil', () => {
        expect (fn ('UseRebound')).not.toMatch (/var rows \[\]any = this\.RowsRebound\(/);
    });
});
