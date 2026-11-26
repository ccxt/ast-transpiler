import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    pickOdds (raw: Dict, isOne: boolean): Str {\n' +
    "        const twoOdds = this.safeDict (raw, 'outcomeTwo', {});\n" +
    "        const oneOdds = this.safeDict (raw, 'outcomeOne', {});\n" +
    '        let opposite: Dict = oneOdds;\n' +
    '        if (isOne) {\n            opposite = twoOdds;\n        }\n' +
    '        let own: Dict = twoOdds;\n' +
    '        if (isOne) {\n            own = oneOdds;\n        }\n' +
    "        return this.safeString (opposite, 'p', this.safeString (own, 'p'));\n" +
    '    }\n' +
    '    buildTopics (ids: string[], uta: boolean): Dict[] {\n' +
    '        const topics: Dict[] = [];\n' +
    '        for (let i = 0; i < ids.length; i++) {\n' +
    "            const args: Dict = { 'instType': 'spot' };\n" +
    "            let key = 'channel';\n" +
    "            if (uta) {\n                key = 'topic';\n            }\n" +
    "            args[key] = ids[i];\n" +
    '            topics.push (args);\n' +
    '        }\n' +
    '        return topics;\n' +
    '    }\n}\n';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('rust defaulted map locals aliased by two Dict locals', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r38-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('both defaulted map locals hold the map, whichever is decided first (fails on the base printer)', () => {
        expect (output).toMatch (/let (?:mut )?twoOdds: crate::value::Dict = /);
        expect (output).toMatch (/let (?:mut )?oneOdds: crate::value::Dict = /);
        expect (output).not.toMatch (/Odds: Value\b/);
        expect (output).not.toMatch (/Odds(?:\.clone\(\))?\.into_dict\(\)/);
    });

    test ('a literal Dict local keeps one kind at its declaration and its push', () => {
        const m = output.match (/let (?:mut )?args: ([^=]+?) = /);
        expect (m).not.toBeNull ();
        if (m !== null && m[1].includes ('IndexMap')) {
            expect (output).not.toMatch (/Value::Dict\(args\)/);
        }
    });
});
