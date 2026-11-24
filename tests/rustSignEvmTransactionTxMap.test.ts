import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const SE = 'signEvmTransaction (tx: Dict, privateKey: string): string';
const BODY = ' {\n        return this.remove0xPrefix (privateKey) + this.safeString (tx, \'to\', \'\') + this.safeString (tx, \'data\', \'0x\');\n    }\n';
const CALLER = '    sendTx (to: string) {\n        const tx: Dict = {\n            \'to\': to,\n        };\n        const signed = this.signEvmTransaction (tx, \'k\');\n        return [ signed ];\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = SE, body: string = BODY) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-sevmtx-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (root, 'ts/src/prediction'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    remove0xPrefix (hexData: any): string {\n        return hexData;\n    }\n    safeString (o: any, k: any, d: any = undefined): any {\n        return d;\n    }\n    ' + baseHead + ' {\n        return \'\';\n    }\n' + CALLER + '}\n');
    fs.writeFileSync (path.join (root, 'ts/src/prediction/venue.ts'), 'import Exchange, { Dict } from \'../base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + body + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    const venue = t.transpileRustByPath (path.join (root, 'ts/src/prediction/venue.ts')).content;
    const base = t.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content;
    return { venue, base };
};

describe ('signEvmTransaction tx (Dict in every declaration) is a lent map', () => {
    test ('every declaration spells it Dict: base and override take a lent map, reads take it uncloned', () => {
        const { venue, base } = mk ('ok', SE);
        expect (venue).toMatch (/fn signEvmTransaction\(&(mut )?self, tx: &indexmap::IndexMap<String, Value>, privateKey: &str\)/);
        expect (base).toMatch (/fn signEvmTransaction\(&(mut )?self, tx: &indexmap::IndexMap<String, Value>, privateKey: &str\)/);
        expect (venue).not.toMatch (/tx\.clone\(\)/);
        expect (base).not.toMatch (/Value::Map\(tx\)/);
    });
    test ('the declared string return prints natively in the base and the override', () => {
        const { venue, base } = mk ('ret', SE);
        expect (venue).toMatch (/fn signEvmTransaction\(&(mut )?self, tx: &indexmap::IndexMap<String, Value>, privateKey: &str\) -> String/);
        expect (base).toMatch (/fn signEvmTransaction\(&(mut )?self, tx: &indexmap::IndexMap<String, Value>, privateKey: &str\) -> String/);
        expect (base).not.toMatch (/signEvmTransaction\([^\n]*\.as_str\(\)\.map\(str::to_owned\)/);
    });
    test ('negative: an override declaring Str keeps its Value return', () => {
        const { venue } = mk ('retno', SE.replace ('): string', '): Str'));
        expect (venue).not.toMatch (/privateKey: &str\) -> String/);
    });
    test ('negative: the base spelling it any keeps tx Value', () => {
        const { venue } = mk ('no', SE, SE.replace ('tx: Dict', 'tx: any'));
        expect (venue).toMatch (/(mut )?tx: Value, privateKey/);
    });
    test ('negative: a venue spelling it NullableDict keeps tx Value', () => {
        const { venue } = mk ('venueno', SE.replace ('tx: Dict', 'tx: NullableDict'));
        expect (venue).toMatch (/(mut )?tx: Value, privateKey/);
    });
    test ('negative: a body that writes tx keeps it Value', () => {
        const { venue } = mk ('write', SE, SE, ' {\n        tx = {};\n        return this.remove0xPrefix (privateKey) + this.safeString (tx, \'to\', \'\');\n    }\n');
        expect (venue).not.toMatch (/tx: &indexmap/);
    });
});
