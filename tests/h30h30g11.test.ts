import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go base getListFromObjectValues returns []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h30g11-' + process.pid, 'ts', 'src');
    const BASE = (body: string, name = 'getListFromObjectValues') =>
        'type IndexType = string | number;\n' +
        'export class Exchange {\n' +
        '    toArray (o: any): any[] { return []; }\n' +
        '    other: any = undefined;\n' +
        '    ' + name + ' (objects: any, key: IndexType): string[] {\n' + body + '    }\n' +
        '    user (rows: any) {\n' +
        '        const symbols = this.' + name + ' (rows, 0);\n' +
        '        return symbols;\n' +
        '    }\n' +
        '}\n';
    const GOOD = '        const newArray = this.toArray (objects);\n        const results: string[] = [];\n' +
        '        for (let i = 0; i < newArray.length; i++) {\n            results.push (newArray[i][key]);\n        }\n        return results;\n';
    const print = (src: string, file = 'Exchange.ts'): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', file), src);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30g11-' + process.pid), { recursive: true, force: true }));

    test ('the accumulator return types the signature and the caller local', () => {
        const out = print (BASE (GOOD));
        expect (out).toContain ('GetListFromObjectValues(objects any, key any) []any {');
        expect (out).toContain ('var symbols []any = this.GetListFromObjectValues(rows, 0)');
    });
    test ('a return of an untyped value that can be nil keeps the box', () => {
        const out = print (BASE ('        if (key === 0) {\n            return this.other;\n        }\n' + GOOD));
        expect (out).not.toContain ('GetListFromObjectValues(objects any, key any) []any');
    });
    test ('another method with the same body keeps the box', () => {
        const out = print (BASE (GOOD, 'getOtherValues'));
        expect (out).not.toContain ('GetOtherValues(objects any, key any) []any');
    });
    test ('outside the base file keeps the box', () => {
        const out = print (BASE (GOOD), 'Venue.ts');
        expect (out).not.toContain ('GetListFromObjectValues(objects any, key any) []any');
    });
});
