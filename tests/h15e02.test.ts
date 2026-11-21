import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go venue Str parameter fed by string literals and undefined', () => {
    const root = path.join (__dirname, 'files', 'tmp-h15e02', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return o[k] ?? d; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Str } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    byType (type: Str, subType: Str): number {\n' +
        "        if (type === 'spot') { return 1; }\n" +
        "        if (subType === 'linear') { return 2; }\n" +
        '        return 3;\n' +
        '    }\n' +
        '    boxedType (type: Str): number {\n' +
        "        if (type === 'spot') { return 1; }\n" +
        '        return 3;\n' +
        '    }\n' +
        '    run (o: any) {\n' +
        "        const a = this.byType ('spot', undefined);\n" +
        "        const b = this.byType (undefined, 'linear');\n" +
        "        const c = this.byType ('swap', 'inverse');\n" +
        "        const d = this.boxedType ('spot');\n" +
        "        const e = this.boxedType (o['x']);\n" +
        '        return a + b + c + d + e;\n' +
        '    }\n' +
        '}\n';
    const print = (): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h15e02'), { recursive: true, force: true }));

    test ('literal and undefined callers type the parameter *string and box the literals', () => {
        const out = print ();
        expect (out).toMatch (/ByType\(typeVar \*string, subType \*string\)/);
        expect (out).not.toContain ('IsEqual(typeVar, "spot")');
        expect (out).not.toContain ('IsEqual(subType, "linear")');
    });
    test ('an untyped caller keeps the box and the helper', () => {
        const out = print ();
        expect (out).toMatch (/BoxedType\(typeVar any\)/);
        expect (out).toContain ('this.BoxedType("spot")');
    });
});
