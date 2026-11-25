import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go dict params: safeOrder takes a map when every tree caller passes one', () => {
    const tmp = path.join (__dirname, 'files', 'tmp-h16g15');
    const root = path.join (tmp, 'ts', 'src');
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeString (d: any, k: any): any { return undefined; }\n' +
        '    safeOrder (order: Dict, market: any = undefined): any {\n' +
        '        let orderDict: Dict = order;\n' +
        '        if (order === undefined) {\n' +
        '            orderDict = {};\n' +
        '        }\n' +
        "        if (this.safeString (orderDict, 'id') === undefined) {\n" +
        "            orderDict['id'] = '1';\n" +
        '        }\n' +
        '        return orderDict;\n' +
        '    }\n' +
        '    run () {\n' +
        "        return this.safeOrder ({ 'id': '2' });\n" +
        '    }\n' +
        '}\n';
    // the venue reaches the base only through an abstract `Exchange extends _Exchange` file
    const ABSTRACT = "import { Exchange as _Exchange } from '../base/Exchange';\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n";
    const VENUE = (body: string) => "import Exchange from './abstract/ven';\nexport default class ven extends Exchange {\n    go (x: any) {\n" + body + '    }\n}\n';
    const print = (venueBody: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'abstract', 'ven.ts'), ABSTRACT);
        fs.writeFileSync (path.join (root, 'ven.ts'), VENUE (venueBody));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('literal callers type the parameter and its nil guard prints a map compare', () => {
        const typed = print ("        return this.safeOrder ({ 'id': x });\n");
        expect (typed).toContain ('SafeOrder(order map[string]any, optionalArgs ...any)');
        expect (typed).toContain ('var orderDict map[string]any = order');
        expect (typed).toContain ('if order == nil {');
        expect (typed).toContain ('orderDict["id"] = "1"');
        expect (typed).not.toContain ('AddElementToObject(orderDict');
    });
    test ('a venue behind an abstract class passing an any value keeps the box', () => {
        const boxed = print ('        return this.safeOrder (x);\n');
        expect (boxed).toContain ('SafeOrder(order any, optionalArgs ...any)');
        expect (boxed).toContain ('AddElementToObject(orderDict, "id", "1")');
    });
    test ('a venue passing undefined (nil the body tests) keeps the box', () => {
        const boxed = print ('        return this.safeOrder (undefined);\n');
        expect (boxed).toContain ('SafeOrder(order any, optionalArgs ...any)');
        expect (boxed).toContain ('var orderDict any = order');
    });
});
