import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const BASE = (param: string, body: string) => 'export interface Dict { [key: string]: any }\nexport type NullableDict = Dict | undefined;\nexport type Bool = boolean | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    isLeveragedCurrency (currencyCode: ' + param + ', checkBaseCoin: Bool = false, existingCurrencies: NullableDict = undefined): boolean {\n' + body + '    }\n}\n';
const BODY = [
    '        const leverageSuffixes = [',
    '            \'2L\', \'2S\', // LT',
    '            \'UP\', \'DOWN\',',
    '        ];',
    '        for (let i = 0; i < leverageSuffixes.length; i++) {',
    '            const leverageSuffix = leverageSuffixes[i];',
    '            const endsWithSuffix: boolean = currencyCode.endsWith (leverageSuffix);',
    '            if (endsWithSuffix) {',
    '                if (!checkBaseCoin) {',
    '                    return true;',
    '                } else {',
    '                    const baseCurrencyCode = currencyCode.replace (leverageSuffix, \'\');',
    '                    if ((existingCurrencies !== undefined) && (baseCurrencyCode in existingCurrencies)) {',
    '                        return true;',
    '                    }',
    '                }',
    '            }',
    '        }',
    '        return false;',
    '',
].join ('\n');

const mk = (tag: string, param: string, body: string = BODY) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-ilc-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), BASE (param, body));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    parseKind (raw: Dict): string {\n        if (this.isLeveragedCurrency (this.safeString (raw, \'currency\', \'\'))) {\n            return \'leveraged\';\n        }\n        return \'crypto\';\n    }\n}\n');
    return t.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content + '\n=====\n' + t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
};

describe ('a &str parameter read only by endsWith / replace stays a borrow', () => {
    test ('string parameter: no re-box, native ends_with / replace over the borrowed suffix', () => {
        const out = mk ('ok', 'string');
        expect (out).toMatch (/fn is_?[lL]everaged_?[cC]urrency\(&self, currencyCode: &str, /);
        expect (out).not.toMatch (/let mut currencyCode: Value = currencyCode\.into\(\);/);
        expect (out).not.toMatch (/ends_with\(&currencyCode/);
        expect (out).not.toMatch (/replace_str\(/);
        expect (out).toMatch (/matches!\(leverageSuffix\.as_deref\(\), Some\(__p\) if currencyCode\.ends_with\(__p\)\)/);
        expect (out).toMatch (/Some\(__p\) => currencyCode\.replace\(__p, ""\), None => currencyCode\.to_string\(\)/);
        console.log (out.split ('=====')[1]);
    });
    test ('negative: an any parameter keeps the Value and the helpers', () => {
        const out = mk ('any', 'any');
        expect (out).toMatch (/currencyCode: Value, /);
        expect (out).not.toMatch (/currencyCode\.ends_with\(/);
    });
    test ('negative: a parameter also read another way stays bound to its Value', () => {
        const out = mk ('other', 'string', BODY.replace ('        return false;', '        return currencyCode === \'X\';'));
        expect (out).not.toMatch (/currencyCode\.ends_with\(__p\)/);
    });
    test ('negative: a replace with a non-literal replacement keeps the binding', () => {
        const out = mk ('repl', 'string', BODY.replace ('currencyCode.replace (leverageSuffix, \'\')', 'currencyCode.replace (leverageSuffix, leverageSuffix)'));
        expect (out).not.toMatch (/currencyCode\.replace\(__p/);
    });
    test ('negative: literal needles only (btse cleanPath shape) keep the base print', () => {
        const body = '        let result = currencyCode.replace (\'spot\', \'\');\n        result = result.replace (\'otc\', \'\');\n        return result === \'\';\n';
        const out = mk ('lit', 'string', body);
        // the parameter is not marked unbound, so a `Value` read of it has its binding
        expect (out).toMatch (/let mut currencyCode: Value = currencyCode\.into\(\);/);
        expect (out).not.toMatch (/Value::from\(currencyCode\.replace\(/);
    });
});
