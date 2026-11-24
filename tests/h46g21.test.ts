import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a `: string` base stub that only throws prints string, and so do its overrides', () => {
    const top = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h46g21-'));
    const root = path.join (top, 'ts', 'src');
    const BASE = (stub: string) =>
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    id: string;\n' +
        '    encode (items: string[]): string { return items.join (\'\'); }\n' +
        '    sign (tx: Dict, key: string): string {\n' + stub + '    }\n' +
        '    other (tx: Dict): string {\n' +
        "        return 'x';\n" +
        '    }\n' +
        '}\n' +
        'export { Exchange };\n';
    const venue = (name: string, body: string) =>
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        `class ${name} extends Exchange {\n` +
        '    override sign (tx: Dict, key: string): string {\n' + body + '    }\n' +
        '}\n' +
        `export default ${name};\n`;
    const print = (name: string, stub: string, body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (stub));
        fs.writeFileSync (path.join (root, name + '.ts'), venue (name, body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, name + '.ts')).content;
    };
    afterAll (() => fs.rmSync (top, { recursive: true, force: true }));
    const THROW = "        throw new Error (this.id + ' sign() must be overridden');\n";

    test ('positive: the override of a throwing stub returns string', () => {
        const out = print ('vok', THROW, "        return '0x02' + 'ab';\n");
        expect (out).toMatch (/\) Sign\([^)]*\) string \{/);
    });
    test ('negative: a stub with a real body keeps the any return', () => {
        const out = print ('vbody', "        return '';\n", "        return '0x02' + 'ab';\n");
        expect (out).toMatch (/\) Sign\([^)]*\) any \{/);
    });
    test ('negative: an override returning a boxed value fails the build', () => {
        expect (() => print ('vbox', THROW, "        return tx['raw'];\n")).toThrow (/go string stub returns/);
    });
});
