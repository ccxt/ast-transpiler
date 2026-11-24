import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const HEAD = 'async fetchTransactionFee (code: string, params: Dict = {})';
const BASE_BODY = ' {\n        return await this.fetchTransactionFees ([ code ], params);\n    }\n    async fetchTransactionFees (codes: string[] = undefined, params: Dict = {}): Promise<{}> {\n        return {};\n    }\n';
const VENUE_BODY = ' {\n        const withdrawFees: Dict = {};\n        withdrawFees[code] = 1;\n        return { \'info\': params, \'withdraw\': withdrawFees };\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = HEAD) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-h47r25-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    ' + baseHead + BASE_BODY + '}\n');
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + VENUE_BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
};

describe ('fetchTransactionFee code (string in every declaration) prints &str', () => {
    test ('every declaration spells it string: the override takes code: &str', () => {
        const venue = mk ('ok', HEAD);
        expect (venue).toMatch (/fn fetch_?[tT]ransaction_?[fF]ee\(&(mut )?self, code: &str, /);
    });
    test ('negative: the base spelling code any keeps code Value', () => {
        const venue = mk ('no', HEAD, HEAD.replace ('code: string', 'code: any'));
        expect (venue).toMatch (/(mut )?code: Value, /);
    });
    test ('negative: a venue spelling code Str keeps code Value', () => {
        const venue = mk ('venueno', HEAD.replace ('code: string', 'code: Str'));
        expect (venue).toMatch (/(mut )?code: Value, /);
    });
});
