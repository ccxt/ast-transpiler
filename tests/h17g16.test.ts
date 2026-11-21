import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string[] local read through this.safeString keeps its []string type', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g16', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    anyList (o: any): any { return o; }\n' +
        '}\n';
    const print = (body: string): string => {
        const venue =
            "import { Exchange, Str, Dict } from './base/Exchange';\n" +
            'export class ex extends Exchange {\n' +
            '    run (o: Dict, c: boolean) {\n' + body + '    }\n' +
            '}\n';
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), venue);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g16'), { recursive: true, force: true }));

    test ('a string[] literal local read by safeString and .length prints []string and len()', () => {
        const out = print (
            "        const xs: string[] = [ 'a', 'b' ];\n" +
            '        const first = this.safeString (xs, 0);\n' +
            '        for (let i = 0; i < xs.length; i++) {\n' +
            '            o[first] = this.safeString (xs, i);\n' +
            '        }\n');
        expect (out).toMatch (/var xs \[\]string = \[\]string\{"a", "b"\}/);
        expect (out).toMatch (/i < len\(xs\)/);
        expect (out).not.toMatch (/GetArrayLength\(xs\)/);
    });

    test ('a write that is not a []string keeps the box', () => {
        const out = print (
            "        let xs: string[] = [ 'a' ];\n" +
            '        if (c) { xs = this.anyList (o); }\n' +
            '        for (let i = 0; i < xs.length; i++) {\n' +
            '            o[i] = this.safeString (xs, i);\n' +
            '        }\n');
        expect (out).not.toMatch (/var xs \[\]string/);
        expect (out).toMatch (/GetArrayLength\(xs\)/);
    });

    test ('a nil-declared local whose consumer tests nil keeps the box', () => {
        const out = print (
            '        let xs: string[] = undefined;\n' +
            "        if (c) { xs = [ 'a' ]; }\n" +
            '        if (xs === undefined) { return; }\n' +
            '        o[0] = this.safeString (xs, 0);\n');
        expect (out).not.toMatch (/var xs \[\]string/);
    });

    test ('the local as the key (not the container) keeps the box', () => {
        const out = print (
            "        const xs: string[] = [ 'a' ];\n" +
            '        o[0] = this.safeString (o, xs);\n' +
            '        o[1] = xs.length;\n');
        expect (out).not.toMatch (/var xs \[\]string/);
    });
});
