import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go nil-seeded accumulator written on every path before its reads prints a Go string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h21g10', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string, d: Str = undefined): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    sub (channel: Str, hash: Str): any {\n' +
        '        return [ channel, hash ];\n' +
        '    }\n' +
        '    branches (kind: Str, m: any) {\n' +
        '        let messageHash: Str = undefined;\n' +
        '        let channel: Str = undefined;\n' +
        "        if (kind === 'a') {\n" +
        "            messageHash = 'accounts';\n" +
        '        } else {\n' +
        "            let prefix = 'accounts';\n" +
        "            if (kind === 'b') {\n" +
        "                prefix = prefix + '_cross';\n" +
        '            }\n' +
        '            messageHash = prefix;\n' +
        '            if (m !== undefined) {\n' +
        "                messageHash += '.' + this.safeString (m, 'id', '');\n" +
        '            }\n' +
        '        }\n' +
        '        channel = messageHash;\n' +
        '        return this.sub (channel, messageHash);\n' +
        '    }\n' +
        '    oneArm (kind: Str, m: any) {\n' +
        '        let partial: Str = undefined;\n' +
        "        if (kind === 'a') {\n" +
        "            partial = 'accounts';\n" +
        "            partial += '.' + this.safeString (m, 'id', '');\n" +
        '        }\n' +
        '        return this.sub (partial, partial);\n' +
        '    }\n' +
        '    tested (kind: Str, m: any) {\n' +
        '        let hash: Str = undefined;\n' +
        "        if (kind === 'a') {\n" +
        "            hash = 'x';\n" +
        '        } else {\n' +
        "            hash = 'y';\n" +
        "            hash += '.' + this.safeString (m, 'id', '');\n" +
        '        }\n' +
        '        if (hash === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.sub (hash, hash);\n' +
        '    }\n' +
        '    boxedWrite (kind: Str, m: any) {\n' +
        '        let mixed: Str = undefined;\n' +
        "        if (kind === 'a') {\n" +
        "            mixed = this.safeString (m, 'id');\n" +
        '        } else {\n' +
        "            mixed = 'y';\n" +
        "            mixed += '.z';\n" +
        '        }\n' +
        '        return this.sub (mixed, mixed);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h21g10'), { recursive: true, force: true }));

    test ('positive: every path writes a string before the read, the accumulator is a Go string', () => {
        expect (out).toMatch (/var messageHash string\n/);
        expect (out).toMatch (/messageHash \+= "\."\+\*this\.SafeString\(m, "id", ""\)/);
        expect (out).not.toMatch (/messageHash = Add\(/);
    });

    test ('negative: a read the nil seed can still reach keeps the box', () => {
        expect (out).toMatch (/var partial any = nil/);
        expect (out).toMatch (/partial = Add\(partial, /);
    });

    test ('negative: a nil-tested local keeps the box', () => {
        expect (out).toMatch (/var hash any = nil/);
        expect (out).toMatch (/hash = Add\(hash, /);
    });

    test ('negative: a *string write keeps the box', () => {
        expect (out).toMatch (/var mixed any = nil/);
        expect (out).toMatch (/mixed = Add\(mixed, /);
    });
});
