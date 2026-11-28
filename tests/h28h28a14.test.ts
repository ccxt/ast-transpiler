import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// prediction tier: a row read from a decoded JSON list inside a bounded loop takes the comma-ok assertion
describe ('h28 A14 prediction JSON loop rows', () => {
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
        '        const n = rows.length;\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            const lvl = this.safeList (rows, i);\n" +
        "            out.push (this.safeString (row, 'id'));\n" +
        "            out.push (this.safeString (lvl, 0));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async holder (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        const rows = this.safeList (data, 'rows', []);\n" +
        "        const result: Dict = { 'info': response };\n" +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            result[this.safeString (row, 'id')] = this.safeString (row, 'v');\n" +
        '        }\n' +
        '        return this.keep (result);\n' +
        '    }\n' +
        '    async holderLeaks (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const rows = this.safeList (response, 'rows', []);\n" +
        "        const result: Dict = { 'info': response };\n" +
        '        this.keep (result);\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            result['x'] = this.safeString (row, 'id');\n" +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    keep (r: Dict) {\n' +
        '        return r;\n' +
        '    }\n' +
        '    async unbounded (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const rows = this.safeList (response, 'rows', []);\n" +
        "        const row = this.safeDict (rows, 0);\n" +
        "        return this.safeString (row, 'id');\n" +
        '    }\n' +
        '    async param (rows: Dict[]) {\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            out.push (this.safeString (row, 'id'));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async written (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const rows = this.safeList (response, 'rows', []);\n" +
        '        const out = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            rows.push (row);\n" +
        "            out.push (this.safeString (row, 'id'));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async escaped (params = {}) {\n' +
        '        const response = await this.publicGetA (params);\n' +
        "        const rows = this.safeList (response, 'rows', []);\n" +
        '        const out = [ rows ];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const row = this.safeDict (rows, i);\n" +
        "            out.push (this.safeString (row, 'id'));\n" +
        '        }\n' +
        '        return out;\n' +
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
            const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28a14-'));
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
    test ('positive: a loop row of a decoded JSON list prints the comma-ok assertion', () => {
        expect (fn ('pred', 'pos')).toContain ('var row, _ = rows[i].(map[string]any)');
        expect (fn ('pred', 'pos')).toContain ('var lvl, _ = rows[i].([]any)');
        expect (fn ('pred', 'pos')).not.toMatch (/Safe(?:List|Map)Typed\(rows/);
    });
    test ('positive: a response stored only into a result holder handed out by the return', () => {
        expect (fn ('pred', 'holder')).toContain ('var row, _ = rows[i].(map[string]any)');
    });
    test ('a result holder handed to a callee before the loop still reads natively ([]any receiver)', () => {
        expect (fn ('pred', 'holderLeaks')).toContain ('rows[i].(map[string]any)');
    });
    test ('negative: an index read outside a bounded loop is not printed as a loop row', () => {
        // sibling rules may print a bounds-guarded read here; this rule must not print the unguarded declaration
        expect (fn ('pred', 'unbounded')).not.toContain ('var row, _ = rows[0]');
    });
    test ('a parameter list reads natively ([]any receiver)', () => {
        expect (fn ('pred', 'param')).toContain ('rows[i].(map[string]any)');
    });
    test ('negative: a list written in the loop gets no assertion', () => {
        expect (fn ('pred', 'written')).not.toContain ('rows[i].(map[string]any)');
    });
    test ('a list handed out still reads natively ([]any receiver)', () => {
        expect (fn ('pred', 'escaped')).toContain ('rows[i].(map[string]any)');
    });
    test ('negative: the REST tier gets no list-row assertion from this rule', () => {
        // merged with H28-A10, which owns REST loop rows of a decoded JSON list: the list row prints its comma-ok form there
        expect (outs['rest']).toContain ('var lvl, _ = rows[i].([]any)');
        expect (outs['rest']).not.toContain ('SafeListTyped(rows, i)');
    });
});
