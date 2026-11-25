import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go string[] topic lists: concat pushes and array-literal call sites', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g09', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    options: Dict = {};\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return d; }\n' +
        '    marketIds (s: any): string[] { return []; }\n' +
        '    async send (p: any): Promise<any> { return undefined; }\n' +
        '}\n';
    const VENUE = (push: string, extra = '', other = '') =>
        "import { Exchange, Dict, Str } from './base/Exchange';\n" +
        'export default class ex extends Exchange {\n' +
        '    async watchTopics (url: string, topics: string[], params: Dict = {}): Promise<any> {\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < topics.length; i++) {\n' +
        '            out.push (topics[i]);\n' +
        '        }\n' + extra +
        '        return await this.send (out);\n' +
        '    }\n' +
        '    async watchTickers (symbols: string[], params: Dict = {}): Promise<any> {\n' +
        "        const topic = this.safeString (this.options, 'name', 'tickers');\n" +
        '        const marketIds = this.marketIds (symbols);\n' +
        '        const topics: string[] = [];\n' +
        '        for (let i = 0; i < marketIds.length; i++) {\n' +
        "            const marketId = this.safeString (marketIds, i, '');\n" +
        push +
        '        }\n' +
        "        return await this.watchTopics ('u', topics, params);\n" +
        '    }\n' + other +
        '}\n';
    const print = (src: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), src);
        const t = new Transpiler ({ verbose: false });
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g09'), { recursive: true, force: true }));
    const CONCAT = "            topics.push (topic + '.' + marketId);\n";
    const LITERAL_CALLER = (element: string) =>
        '    async watchOne (params: Dict = {}): Promise<any> {\n' + element +
        "        return await this.watchTopics ('u', [ topic ], params);\n" +
        '    }\n';

    test ('a concat push and a string-literal call site both pass []string', () => {
        const out = print (VENUE (CONCAT, '', LITERAL_CALLER ("        const topic = 'execution';\n")));
        expect (out).toContain ('var topics []string = []string{}');
        expect (out).toMatch (/WatchTopics\w*\(url string, topics \[\]string/);
        expect (out).toContain ('[]string{topic}');
        expect (out).not.toContain ('GetArrayLength(topics)');
    });

    test ('a literal call site with an any element keeps the local and the parameter boxed', () => {
        const out = print (VENUE (CONCAT, '', LITERAL_CALLER ("        const topic: any = this.options['t'];\n")));
        expect (out).toContain ('var topics []any = []any{}');
        expect (out).not.toMatch (/WatchTopics\w*\(url string, topics \[\]string/);
    });

    test ('a concat push with an any leaf keeps the box', () => {
        const out = print (VENUE ("            const m: any = this.options[marketId];\n            topics.push (topic + '.' + m);\n"));
        expect (out).toContain ('var topics []any = []any{}');
        expect (out).not.toMatch (/WatchTopics\w*\(url string, topics \[\]string/);
    });

    test ('a nil-testing consumer of the typed list still compares natively', () => {
        const out = print (VENUE (CONCAT, '        if (topics === undefined) {\n            return undefined;\n        }\n'));
        expect (out).toContain ('var topics []string = []string{}');
        expect (out).toContain ('topics == nil');
    });
});
