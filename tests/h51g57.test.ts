import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go featureValueByType subType prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h51g57', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    features: Dict = undefined;\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n' +
        '    market (symbol: Str): Dict { return {}; }\n' +
        '    featureValue (symbol: string, methodName: Str = undefined, paramName: Str = undefined, defaultValue: any = undefined): any {\n' +
        '        const market = this.market (symbol);\n' +
        "        return this.featureValueByType (this.safeString (market, 'type', ''), this.safeString (market, 'subType'), methodName, paramName, defaultValue);\n" +
        '    }\n' +
        '    featureValueByType (marketType: string, subType: Str, methodName: Str = undefined, paramName: Str = undefined, defaultValue: any = undefined): any {\n' +
        '        if (this.features === undefined) {\n' +
        '            return defaultValue;\n' +
        '        }\n' +
        '        let methodsContainer = this.safeDict (this.features, marketType);\n' +
        '        if (methodsContainer === undefined) {\n' +
        '            return defaultValue;\n' +
        '        }\n' +
        '        if (subType === undefined) {\n' +
        "            if (marketType !== 'spot') {\n" +
        '                return defaultValue;\n' +
        '            }\n' +
        '        } else {\n' +
        '            if (!(subType in methodsContainer)) {\n' +
        '                return defaultValue;\n' +
        '            }\n' +
        '            methodsContainer = this.safeDict (methodsContainer, subType);\n' +
        '            if (methodsContainer === undefined) {\n' +
        '                return defaultValue;\n' +
        '            }\n' +
        '        }\n' +
        '        return methodsContainer;\n' +
        '    }\n' +
        '    otherByType (marketType: string, subType: Str): any {\n' +
        '        if (subType === undefined) {\n' +
        '            return marketType;\n' +
        '        }\n' +
        '        return subType;\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h51g57'), { recursive: true, force: true }));

    test ('subType is *string with a native nil test', () => {
        const out = print ();
        expect (out).toMatch (/FeatureValueByType\(marketType \w+, subType \*string, /);
        expect (out).toContain ('if subType == nil {');
        expect (out).not.toContain ('IsEqual(subType, nil)');
        expect (out).not.toContain ('SafeStringPtr(this.SafeString(market');
    });
    test ('the untabled twin keeps any', () => {
        expect (print ()).toMatch (/OtherByType\(marketType \w+, subType any\)/);
    });
    test ('without the ccxt hooks subType stays any', () => {
        expect (print (false)).toMatch (/FeatureValueByType\(marketType \w+, subType any, /);
    });
});
