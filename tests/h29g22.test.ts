import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go dict params: featuresMapper initialFeatures', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29g22-' + process.pid, 'ts', 'src');
    const MAPPER = (recursiveArg: string) =>
        '    featuresMapper (initialFeatures: Dict, marketType: Str, subType: Str = undefined): NullableDict {\n' +
        '        let featuresObj = this.safeDict (initialFeatures, marketType);\n' +
        '        if (subType !== undefined) {\n' +
        '            featuresObj = this.safeDict (featuresObj, subType);\n' +
        '        }\n' +
        '        const extendsStr = this.safeString (featuresObj, \'extends\');\n' +
        '        if (extendsStr !== undefined) {\n' +
        '            featuresObj = this.omit (featuresObj, \'extends\');\n' +
        '            const extendObj = this.featuresMapper (' + recursiveArg + ', extendsStr);\n' +
        '            featuresObj = this.deepExtend (extendObj, featuresObj);\n' +
        '        }\n' +
        '        return featuresObj;\n' +
        '    }\n';
    const BASE = (recursiveArg: string, generatorArg: string) =>
        'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\ntype Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    features: Dict = undefined;\n' +
        '    other: any = undefined;\n' +
        '    safeDict (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '    safeString (d: any, k: any, def: any = undefined): Str { return def; }\n' +
        '    omit (d: any, ...k: any[]): any { return d; }\n' +
        '    deepExtend (...xs: any[]): any { return xs[0]; }\n' +
        '    featuresGenerator () {\n' +
        '        if (this.features === undefined) {\n' +
        '            return;\n' +
        '        }\n' +
        '        const initialFeatures = this.features;\n' +
        '        this.features = {};\n' +
        '        this.features[\'spot\'] = this.featuresMapper (' + generatorArg + ', \'spot\');\n' +
        '    }\n' +
        MAPPER (recursiveArg) +
        '}\n';
    const print = (recursiveArg: string, generatorArg: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (recursiveArg, generatorArg));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h29g22-' + process.pid), { recursive: true, force: true }));

    test ('both callers pass a map: the parameter prints map[string]any', () => {
        const typed = print ('initialFeatures', 'initialFeatures');
        expect (typed).toContain ('FeaturesMapper(initialFeatures map[string]any, marketType any');
    });
    test ('a recursive call passing another value keeps the box', () => {
        const boxed = print ('this.other', 'initialFeatures');
        expect (boxed).not.toContain ('FeaturesMapper(initialFeatures map[string]any');
    });
    test ('a caller passing an untyped field keeps the box', () => {
        const boxed = print ('initialFeatures', 'this.other');
        expect (boxed).not.toContain ('FeaturesMapper(initialFeatures map[string]any');
    });
});
