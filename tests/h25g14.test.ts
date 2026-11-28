import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go throw of an Add chain over this.id and *string leaves prints a native concat under one nil test', () => {
    const root = path.join (__dirname, 'files', 'tmp-h25g14', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        "import { BadRequest } from './base/errors.js';\n" +
        'export default class v extends Exchange {\n' +
        '    pointer (o: any) {\n' +
        "        const network = this.safeString (o, 'network');\n" +
        "        throw new BadRequest (this.id + ' invalid network ' + network + ' here');\n" +
        '    }\n' +
        '    call (o: any) {\n' +
        "        throw new BadRequest (this.id + ' no type ' + this.safeString (o, 'type'));\n" +
        '    }\n' +
        '    anyLeaf (o: any) {\n' +
        "        throw new BadRequest (this.id + ' bad ' + o);\n" +
        '    }\n' +
        '    guarded (o: any) {\n' +
        "        const msg = this.safeString (o, 'm');\n" +
        '        if (msg !== undefined) {\n' +
        "            throw new BadRequest (this.id + ' ' + msg);\n" +
        '        }\n' +
        '    }\n' +
        '    callAndIndex (o: any, xs: any) {\n' +
        "        throw new BadRequest (this.id + ' ' + this.safeString (o, 'a') + xs[this.safeString (o, 'b')]);\n" +
        '    }\n' +
        '}\n';
    const ERRORS = 'export class BadRequest extends Error {}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'base', 'errors.ts'), ERRORS);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => {
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h25g14'), { recursive: true, force: true });
    });
    const body = (name) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        return out.substring (start, out.indexOf ('\n}', start));
    };
    test ('positive: one *string identifier leaf', () => {
        expect (body ('pointer')).toContain ('if network != nil {');
        expect (body ('pointer')).toContain ('messageText := this.Id + " invalid network " + *network + " here"');
        expect (body ('pointer')).toContain ('panic(BadRequest(messageText))');
        expect (body ('pointer')).toContain ('panic(BadRequest(nil))');
        expect (body ('pointer')).not.toContain ('Add(');
    });
    test ('positive: one *string call leaf is bound once', () => {
        expect (body ('call')).toContain ('if messagePiece := this.SafeString(o, "type"); messagePiece != nil {');
        expect (body ('call')).toContain ('messageText := this.Id + " no type " + *messagePiece');
        expect (body ('call')).not.toContain ('Add(');
    });
    test ('negative: an any leaf keeps Add', () => {
        expect (body ('anyLeaf')).toContain ('Add(');
        expect (body ('anyLeaf')).not.toContain ('BadRequest(nil)');
    });
    test ('negative: a nil-guarded pointer is not double tested', () => {
        expect (body ('guarded')).not.toContain ('BadRequest(nil)');
    });
    test ('negative: another leaf that makes a call keeps Add (evaluation order)', () => {
        expect (body ('callAndIndex')).toContain ('Add(');
        expect (body ('callAndIndex')).not.toContain ('messagePiece');
    });
});
