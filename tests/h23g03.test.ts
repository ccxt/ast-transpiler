import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string locals written from iso8601 of the clock / numberToString into a Str local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h23g03', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    milliseconds (): number {\n' +
        '        return 1;\n' +
        '    }\n' +
        '    iso8601 (x: any): Str {\n' +
        '        return String (x);\n' +
        '    }\n' +
        '    numberToString (x: number): string;\n' +
        '    numberToString (x: any): Str;\n' +
        '    numberToString (x: any): Str {\n' +
        '        return (x === undefined) ? undefined : String (x);\n' +
        '    }\n' +
        '    parseToNumeric (x: any): number {\n' +
        '        return Number (x);\n' +
        '    }\n' +
        '    safeString (o: any, k: string, d: Str = undefined): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '    clockSeed (method: string): string {\n' +
        '        const timestamp = this.milliseconds ();\n' +
        '        const dateTime = this.iso8601 (timestamp);\n' +
        "        const payload = dateTime + '/' + 'x';\n" +
        '        return payload;\n' +
        '    }\n' +
        '    inputSeed (method: string, ts: any): string {\n' +
        '        const loose = this.iso8601 (ts);\n' +
        "        const looseload = loose + '/' + 'x';\n" +
        '        return looseload;\n' +
        '    }\n' +
        '    strikeLocal (o: any, base: string): Str {\n' +
        '        let symbol = base;\n' +
        '        let strike: Str = undefined;\n' +
        '        if (base.length > 1) {\n' +
        "            strike = this.numberToString (this.parseToNumeric (this.safeString (o, 'k')));\n" +
        "            symbol = base + '-' + strike;\n" +
        '        }\n' +
        '        let parsed = undefined;\n' +
        '        if (strike !== undefined) {\n' +
        '            parsed = this.parseToNumeric (strike);\n' +
        '        }\n' +
        '        return symbol + parsed;\n' +
        '    }\n' +
        '    strikeStored (o: any, base: string): any {\n' +
        '        let stored: Str = undefined;\n' +
        '        if (base.length > 1) {\n' +
        "            stored = this.numberToString (this.parseToNumeric (this.safeString (o, 'k')));\n" +
        '        }\n' +
        "        return { 'strike': stored, 'n': this.parseToNumeric (stored) };\n" +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h23g03'), { recursive: true, force: true }));

    test ('positive: iso8601 of the clock seeds a native concat', () => {
        expect (out).toMatch (/payload string = \*dateTime \+ "\/" \+ "x"/);
        expect (out).not.toMatch (/Add\(Add\(dateTime/);
    });

    test ('negative: iso8601 of an arbitrary input can be nil, Add stays', () => {
        expect (out).toMatch (/var looseload any = nil\n\s*if loose != nil \{\n\s*looseload = \*loose \+ "\/" \+ "x"\n\s*\}/);
    });

    test ('negative: a Str local written by numberToString and read by parseToNumeric keeps the box', () => {
        expect (out).toMatch (/var strike any = nil/);
    });

    test ('negative: a Str local stored into a map keeps the box', () => {
        expect (out).toMatch (/var stored any = nil/);
    });
});
