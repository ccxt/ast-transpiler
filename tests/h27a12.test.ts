import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// prediction tier: a typed map local read from a decoded endpoint response takes the comma-ok
// assertion; a REST file, a non-JSON container, a variable key or a written container keep the wrap
describe ('h27 A12 prediction JSON nested reads', () => {
    const ABSTRACT =
        "import { Dict } from 'BASEREL/types.js';\n" +
        "import { Exchange as _Exchange } from 'BASEREL/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetA (params = {}): Promise<Dict> {\n        return this.request ("a", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
    const BASE =
        "import { Dict, List } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeList (o: any, k: any, d: List = undefined): List {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const VENUE =
        "import Exchange from 'ABSREL/ex.js';\n" +
        "import { Dict } from 'VBASE/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async pos (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        const rows = this.safeList (data, 'rows', []);\n" +
        "        return [ this.safeString (data, 'id'), rows.length ];\n" +
        '    }\n' +
        '    async varKey (k: string, params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        '        const data = this.safeDict (response, k, {});\n' +
        "        return this.safeString (data, 'id');\n" +
        '    }\n' +
        '    async param (box: Dict) {\n' +
        "        const data = this.safeDict (box, 'data', {});\n" +
        "        return this.safeString (data, 'id');\n" +
        '    }\n' +
        '    async written (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        response['x'] = 1;\n" +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        return this.safeString (data, 'id');\n" +
        '    }\n' +
        '}\n';
    const API = 'package ccxt\n\nfunc (this *Ex) PublicGetA(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';
    const outs: Record<string, string> = {};
    const fn = (which: string, name: string) => {
        const out = outs[which];
        const start = out.indexOf ('func (this *ex) ' + name + 'Body(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        for (const [ which, pred ] of [ [ 'pred', true ], [ 'rest', false ] ] as [ string, boolean ][]) {
            const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27a12-'));
            try {
                const src = path.join (tmp, 'ts', 'src');
                const venue = pred ? path.join (src, 'prediction') : src;
                const abs = pred ? path.join (src, 'abstract', 'prediction') : path.join (src, 'abstract');
                const goDir = pred ? path.join (tmp, 'go', 'v4', 'prediction') : path.join (tmp, 'go', 'v4');
                for (const d of [ path.join (src, 'base'), venue, abs, goDir ]) {
                    fs.mkdirSync (d, { 'recursive': true });
                }
                fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
                fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
                fs.writeFileSync (path.join (abs, 'ex.ts'), ABSTRACT.split ('BASEREL').join (pred ? '../../base' : '../base'));
                fs.writeFileSync (path.join (venue, 'ex.ts'), VENUE.split ('ABSREL').join (pred ? '../abstract/prediction' : './abstract').split ('VBASE').join (pred ? '../base' : './base'));
                fs.writeFileSync (path.join (goDir, 'ex_api.go'), API);
                const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/(prediction/)?abstract/' ] } });
                installCcxtGoHooks (t.goTranspiler);
                outs[which] = t.transpileGoByPath (path.join (venue, 'ex.ts')).content;
            } finally {
                fs.rmSync (tmp, { 'recursive': true, 'force': true });
            }
        }
    });
    test ('positive: nested reads of a decoded response print the comma-ok assertion', () => {
        // sibling h27-A02 prints the list read as a typed declaration plus the comma-ok assignment
        expect (fn ('pred', 'pos')).toContain ('rows, _ = data["rows"].([]any)');
        expect (fn ('pred', 'pos')).toContain ('var data, _ = response["data"].(map[string]any)');
        expect (fn ('pred', 'pos')).not.toMatch (/Safe(?:List|Map)Typed\(/);
    });
    test ('negative: a variable key keeps the wrap', () => {
        expect (fn ('pred', 'varKey')).not.toContain ('.(map[string]any)');
    });
    test ('negative: a parameter container keeps the wrap', () => {
        expect (fn ('pred', 'param')).not.toContain ('.(map[string]any)');
    });
    test ('negative: a written response keeps the wrap', () => {
        expect (fn ('pred', 'written')).not.toContain ('.(map[string]any)');
    });
    test ('negative: the REST tier is untouched', () => {
        // siblings h27-A01 / A02 convert the REST tier with the same proof; this unit adds no wrap there
        expect (outs['rest']).not.toMatch (/Safe(?:List|Map)Typed\(response/);
    });
});
