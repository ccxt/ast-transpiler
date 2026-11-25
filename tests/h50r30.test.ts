import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// A literal-key write on a row of a typed `Dict[]` list in the prediction base prints the copy-on-write insert,
// as it does in the venue files; the general base and an `any[]` list keep the helper.
describe ('h50r30: prediction base Dict[] row writes', () => {
    const root = path.join (__dirname, 'files', 'tmp-h50r30', 'ts', 'src');
    const exchange = 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n'
        + '    safeString2 (d: any, k: any, k2: any, def: any = undefined): any { return undefined; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return undefined; }\n';
    const body = (name: string, list: string) => '    ' + name + ' (market: Dict) {\n'
        + '        const outcomesList' + list + ' = this.safeList (market, \'outcomes\', []);\n'
        + '        for (let j = 0; j < outcomesList.length; j++) {\n            const oc = outcomesList[j];\n'
        + '            const ocId = this.safeString2 (oc, \'outcomeId\', \'id\');\n            oc[\'outcomeId\'] = ocId;\n        }\n    }\n';
    const out: { [k: string]: string } = {};
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), exchange + body ('indexBase', ': Dict[]') + '}\n');
        fs.writeFileSync (path.join (root, 'base', 'PredictionExchange.ts'), "import Exchange from './Exchange.js';\nimport { Dict } from './Exchange.js';\n"
            + 'export default class PredictionExchange extends Exchange {\n' + body ('indexTyped', ': Dict[]') + body ('indexAny', '') + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        out['base'] = t.transpileRustByPath (path.join (root, 'base', 'Exchange.ts')).content;
        out['pred'] = t.transpileRustByPath (path.join (root, 'base', 'PredictionExchange.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h50r30'), { recursive: true, force: true }));
    test ('a Dict[] row in the prediction base: native insert on the optional row', () => {
        const b = out['pred'].slice (out['pred'].indexOf ('fn indexTyped'), out['pred'].indexOf ('fn indexAny'));
        expect (b).toContain ('if let Some(__d) = &mut oc { std::sync::Arc::make_mut(__d).insert("outcomeId".into()');
        expect (b).not.toContain ('add_element_to_object');
    });
    test ('negative: an any[] list keeps the helper', () => {
        const b = out['pred'].slice (out['pred'].indexOf ('fn indexAny'));
        expect (b).toContain ('add_element_to_object(&mut oc');
    });
    test ('negative: the general base keeps the helper', () => {
        expect (out['base']).toContain ('add_element_to_object(&mut oc');
    });
});
