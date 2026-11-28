import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go slugToOutcomeSymbol outcome prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h51g33', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    walletAddress: string = "";\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    remove0xPrefix (hexData: any): string { return hexData; }\n' +
        '    padHexAddress (address: Str): string {\n' +
        '        if (address === undefined) {\n' +
        "            return '';\n" +
        '        }\n' +
        '        const stripped = this.remove0xPrefix (address);\n' +
        "        return '000000000000000000000000' + stripped;\n" +
        '    }\n' +
        '    otherPadHexAddress (address: Str): string {\n' +
        '        if (address === undefined) {\n' +
        "            return '';\n" +
        '        }\n' +
        '        const stripped = this.remove0xPrefix (address);\n' +
        "        return '000000000000000000000000' + stripped;\n" +
        '    }\n' +
        '    slugToOutcomeSymbol (eventSlug: Str, marketSlug: Str, outcome: Str): string {\n' +
        "        const upper = (outcome === undefined) ? '' : outcome.toUpperCase ();\n" +
        "        return eventSlug + ':' + marketSlug + ':' + upper;\n" +
        '    }\n' +
        '    f (row: Dict): string {\n' +
        "        const spender = this.safeString (row, 'spender');\n" +
        '        const owner = this.walletAddress;\n' +
        "        return this.padHexAddress (owner) + this.padHexAddress (spender);\n" +
        '    }\n' +
        '    g (row: Dict, labels: string[]): string {\n' +
        "        const label = this.safeString (row, 'label');\n" +
        '        const plain: string = labels[0];\n' +
        "        return this.slugToOutcomeSymbol ('e', 'm', label) + this.slugToOutcomeSymbol ('e', 'm', plain);\n" +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h51g33'), { recursive: true, force: true }));

    test ('padHexAddress is tabled: its address is *string', () => {
        expect (print ()).toContain ('func (this *Exchange) PadHexAddress(address *string) ');
    });
    test ('slugToOutcomeSymbol outcome is *string; the other slots keep their type', () => {
        const out = print ();
        expect (out).toContain ('SlugToOutcomeSymbol(eventSlug any, marketSlug any, outcome *string) ');
        expect (out).toContain ('if outcome == nil {');
        expect (out).not.toContain ('IsEqual(outcome, nil)');
    });
    test ('the untabled twin keeps any', () => {
        expect (print ()).toContain ('OtherPadHexAddress(address any) ');
    });
    test ('without the ccxt hooks the inputs stay any', () => {
        const out = print (false);
        expect (out).toContain ('PadHexAddress(address any) ');
        expect (out).toContain ('outcome any) ');
    });
});
