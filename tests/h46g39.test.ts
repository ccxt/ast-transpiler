import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `const xs: string[] = this.safeList (..)` element local reads the in-range element by a comma-ok string test
describe ('h46g39: string[]-declared safeList elements read as strings', () => {
    const PRELUDE = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nexport class Exchange {\n'
        + '    safeList (a: any, k: any, d: any = undefined): any[] { return a; }\n    safeStringList (a: any, ks: any[]): Strings { return a; }\n'
        + '    cleanUnsubscription (c: any, a: Str, b: Str) { return a; }\n    cleanCache (s: any) { return s; }\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h46g39-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (src, { recursive: true });
            const file = path.join (src, 'x.ts');
            fs.writeFileSync (file, PRELUDE + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const unsub = (read: string) => '    handleUnSubscription (client: any, subscription: Dict) {\n'
        + '        const messageHashes: Strings = this.safeStringList (subscription, [ \'messageHashes\' ]);\n'
        + '        const subMessageHashes: string[] = this.safeList (subscription, \'subMessageHashes\', []);\n'
        + '        if (messageHashes !== undefined) {\n            for (let i = 0; i < messageHashes.length; i++) {\n'
        + '                const unsubHash = messageHashes[i];\n' + read
        + '                this.cleanUnsubscription (client, subHash, unsubHash);\n            }\n        }\n        this.cleanCache (subscription);\n    }\n';
    test ('a loop element local takes the in-range address of the []string', () => {
        const out = run (unsub ('                const subHash = subMessageHashes[i];\n'));
        expect (out).toContain ('\t\t\tvar subHash *string = nil\n\t\t\tif i >= 0 && i < len(subMessageHashes) {\n\t\t\t\tif s, ok := subMessageHashes[i].(string); ok {\n\t\t\t\t\tsubHash = &s\n\t\t\t\t}\n\t\t\t}\n');
        expect (out).not.toContain ('SafeStringPtr(');
    });
    test ('a list written through keeps the helper (a pointer may be stored)', () => {
        const out = run (unsub ('                subMessageHashes[i] = unsubHash;\n                const subHash = subMessageHashes[i];\n'));
        expect (out).not.toContain ('.(string); ok');
    });
    test ('an undeclared or any[] list keeps the box', () => {
        const out = run (unsub ('                const subHash = subMessageHashes[i];\n').replace ('const subMessageHashes: string[] =', 'const subMessageHashes =').replace ('this.safeList (subscription', 'this.safeList (subscription'));
        expect (out).not.toContain ('.(string); ok');
    });
});
