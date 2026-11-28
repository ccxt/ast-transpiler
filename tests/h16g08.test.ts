import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string-annotated copy of a defaulted handleOptionString slot', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g08', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    handleOptionStringAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: string): [string, Dict];\n' +
        '    handleOptionStringAndParams (params: Dict, methodName: Str, optionName: string, defaultValue?: Str): [Str, Dict];\n' +
        '    handleOptionStringAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Str = undefined): [Str, Dict] {\n' +
        '        return [ defaultValue, params ];\n' +
        '    }\n' +
        "    safeStr (o: any, k: string): Str {\n        return o[k];\n    }\n" +
        '    handleOptionStringAndParams2 (params: Dict, methodName: string, optionName1: string, optionName2: string, defaultValue: string): [string, Dict];\n' +
        '    handleOptionStringAndParams2 (params: Dict, methodName: string, optionName1: string, optionName2: string, defaultValue?: Str): [Str, Dict];\n' +
        '    handleOptionStringAndParams2 (params: Dict, methodName: string, optionName1: string, optionName2: string, defaultValue: Str = undefined): [Str, Dict] {\n' +
        '        return [ defaultValue, params ];\n' +
        '    }\n' +
        '}\n';
    const VENUE = (body: string) =>
        "import Exchange from './base/Exchange.js';\n" +
        "import type { Str, Dict } from './base/Exchange.js';\n" +
        'export default class venue extends Exchange {\n' +
        '    m (params = {}, flag = false, limit = 5): string {\n' + body + '\n    }\n' +
        '}\n';
    const print = (body: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), VENUE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g08'), { recursive: true, force: true }));

    const KUCOIN =
        "        let defaultMethod: Str = '/market/level2';\n" +
        "        if (flag) {\n            defaultMethod = '/contractMarket/level2';\n        }\n" +
        "        const [ methodOption, paramsMethod ] = this.handleOptionStringAndParams2 (params, 'w', 'o', 'method', defaultMethod);\n" +
        '        let method: string = methodOption;\n' +
        "        if (method.indexOf ('Depth') < 0) {\n" +
        "            method += 'Depth' + limit.toString ();\n" +
        '        }\n' +
        "        if (method === '/market/level2') {\n            return paramsMethod['a'];\n        }\n" +
        "        return method + ':';";

    test ('a Go-string default types the annotated copy string and its reads native', () => {
        const out = print (KUCOIN);
        expect (out).toContain ('var method string = *methodOption');
        expect (out).toContain ('strings.Index(method, "Depth") < 0');
        expect (out).toContain ('if method == "/market/level2" {');
        expect (out).toContain ('return method + ":"');
        expect (out).not.toMatch (/(Add|IsEqual|GetIndexOf)\(method/);
    });

    test ('a literal default on the one-name reader is typed too', () => {
        const out = print ("        const [ o, p ] = this.handleOptionStringAndParams (params, 'w', 'o', 'gtc');\n        const tif: string = o;\n        return tif + p['x'];");
        expect (out).toContain ('var tif string = *o');
    });

    test ('a nullable default keeps the box', () => {
        const out = print ("        const [ o, p ] = this.handleOptionStringAndParams (params, 'w', 'o');\n        let tif: Str = o;\n        return tif + ':';");
        expect (out).not.toContain ('var tif string');
    });

    test ('a nil test of the copy keeps the box', () => {
        const out = print ("        const [ o, p ] = this.handleOptionStringAndParams (params, 'w', 'o', 'gtc');\n        const tif: string = o;\n        if (tif === undefined) {\n            return 'none';\n        }\n        return tif;");
        expect (out).not.toContain ('var tif string');
    });

    test ('a write of a nullable value keeps the box', () => {
        const out = print ("        const [ o, p ] = this.handleOptionStringAndParams (params, 'w', 'o', 'gtc');\n        let tif: string = o;\n        tif = this.safeStr (p, 'k');\n        return tif + ':';");
        expect (out).not.toContain ('var tif string');
    });
});
