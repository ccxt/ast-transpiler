import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go findMessageHashes returns []string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g10', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    findMessageHashes (client: any, element: string): string[] {\n' +
        '        const result: string[] = [];\n' +
        '        const messageHashes = Object.keys (client.futures);\n' +
        '        for (let i = 0; i < messageHashes.length; i++) {\n' +
        '            const messageHash = messageHashes[i];\n' +
        '            if (messageHash.indexOf (element) >= 0) {\n' +
        '                result.push (messageHash);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    safeOutcomeSymbol (outcomeIdOrSymbol: Str, outcomeObj: any = undefined): Str {\n' +
        '        if (outcomeObj !== undefined) {\n' +
        "            return outcomeObj['outcome'];\n" +
        '        }\n' +
        '        return outcomeIdOrSymbol;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    handlePositions (client: any, message: any) {\n' +
        "        const messageHashes = this.findMessageHashes (client, 'positions::');\n" +
        '        for (let i = 0; i < messageHashes.length; i++) {\n' +
        '            const messageHash = messageHashes[i];\n' +
        "            const parts = messageHash.split ('::');\n" +
        '            client.resolve (parts, messageHash);\n' +
        '        }\n' +
        '    }\n' +
        '    sym (o: any) {\n' +
        '        const s = this.safeOutcomeSymbol (undefined, o);\n' +
        '        if (s === undefined) {\n' +
        '            return false;\n' +
        '        }\n' +
        '        return true;\n' +
        '    }\n' +
        '    rebound (client: any) {\n' +
        "        let hs: any = this.findMessageHashes (client, 'x');\n" +
        '        hs = {};\n' +
        '        return hs;\n' +
        '    }\n' +
        '    other (client: any, message: any) {\n' +
        "        const messageHashes = this.findMessageHashes (client, 'positions::');\n" +
        '        const x = messageHashes;\n' +
        '        return x;\n' +
        '    }\n' +
        '}\n';
    const write = () => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
    };
    const print = (file: string, install = true): string => {
        write ();
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g10'), { recursive: true, force: true }));

    test ('the base result prints []string and callers read string elements natively', () => {
        const base = print (path.join ('base', 'Exchange.ts'));
        expect (base).toContain ('FindMessageHashes(client any, element any) []string {');
        expect (base).toContain ('var result []string = []string{}');
        const venue = print ('v.ts');
        expect (venue).toContain ('var messageHashes []string = this.FindMessageHashes(client, "positions::")');
        expect (venue).toContain ('var messageHash string = messageHashes[i]');
        expect (venue).not.toContain ('SafeStringPtr(messageHashes[i])');
        expect (venue).not.toContain ('ArrayTyped(');
    });

    test ('safeOutcomeSymbol is in the *string family: nil test stays a nil test', () => {
        const base = print (path.join ('base', 'Exchange.ts'));
        expect (base).toMatch (/SafeOutcomeSymbol\(outcomeIdOrSymbol any, optionalArgs \.\.\.any\) \*string \{/);
        const venue = print ('v.ts');
        expect (venue).toContain ('var s *string = this.SafeOutcomeSymbol(nil, o)');
        expect (venue).toContain ('if s == nil {');
    });

    test ('negative: a result list that also takes a non-string keeps the any signature', () => {
        const saved = BASE;
        const mixed = saved.replace ('const result: string[] = [];', 'const result: any[] = [];').replace ('result.push (messageHash);', 'result.push (messageHash);\n                result.push (1);');
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), mixed);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        const out = t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
        expect (out).toContain ('FindMessageHashes(client any, element any) any {');
    });

    test ('negative: a caller local rebound to a non-list keeps its box', () => {
        expect (print ('v.ts')).toContain ('var hs any = this.FindMessageHashes(client, "x")');
    });
});
