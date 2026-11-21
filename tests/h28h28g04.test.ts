import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string[] local handed to the base watchMultiple', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g04', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Strings = string[] | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    watchMultiple (url: Str, messageHashes: string[], message: any = undefined, subscribeHashes: Strings = undefined, subscription: any = undefined): any { return url; }\n' +
        '    other (url: Str, messageHashes: any, message: any = undefined): any { return url; }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\n" +
            'export default class venue extends Exchange {\n    async m (url: string, symbols: string[], request: any): Promise<any> {\n' + body + '\n    }\n}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g04'), { recursive: true, force: true }));

    const fill = '        const messageHashes: string[] = [];\n' +
        '        for (let i = 0; i < symbols.length; i++) {\n' +
        "            messageHashes.push ('ticker:' + symbols[i]);\n" +
        '        }\n';

    test ('positive: hashes passed as messageHashes and subscribeHashes print []string', () => {
        const out = print (fill + '        return await this.watchMultiple (url, messageHashes, request, messageHashes);');
        expect (out).toContain ('var messageHashes []string = []string{}');
        expect (out).toContain ('this.WatchMultiple(url, messageHashes, request, messageHashes)');
    });

    test ('negative: another any-typed consumer keeps the box', () => {
        const out = print (fill + '        return await this.other (url, messageHashes, request);');
        expect (out).not.toContain ('var messageHashes []string');
    });

    test ('negative: a non-string push keeps the box even with watchMultiple', () => {
        const out = print (fill + '        messageHashes.push (request);\n        return await this.watchMultiple (url, messageHashes, request, messageHashes);');
        expect (out).not.toContain ('var messageHashes []string');
    });

    test ('negative: the list as the message slot keeps the box', () => {
        const out = print (fill + '        return await this.watchMultiple (url, [], messageHashes);');
        expect (out).not.toContain ('var messageHashes []string');
    });
});
