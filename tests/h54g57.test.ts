import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go featuresMapper featuresObj: a no-default safeDict map local rebound to fresh maps', () => {
    const BASE = (mapperBody: string) =>
        'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\ntype Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    features: Dict = undefined;\n' +
        '    safeDict (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '    safeString (d: any, k: any, def: any = undefined): Str { return def; }\n' +
        '    safeBool (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '    safeValue (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '    omit (d: any, ...k: any[]): any { return d; }\n' +
        '    extend (...xs: any[]): any { return xs[0]; }\n' +
        '    deepExtend (...xs: any[]): any { return xs[0]; }\n' +
        '    inArray (a: any, b: any): boolean { return false; }\n' +
        '    featuresGenerator () {\n' +
        '        if (this.features === undefined) {\n' +
        '            return;\n' +
        '        }\n' +
        '        const initialFeatures = this.features;\n' +
        '        this.features = {};\n' +
        '        this.features[\'spot\'] = this.featuresMapper (initialFeatures, \'spot\');\n' +
        '    }\n' +
        '    featuresMapper (initialFeatures: Dict, marketType: string, subType: Str = undefined): NullableDict {\n' +
        mapperBody +
        '    }\n' +
        '}\n';
    const HEAD =
        '        let featuresObj = this.safeDict (initialFeatures, marketType);\n' +
        '        if (subType !== undefined) {\n' +
        '            featuresObj = this.safeDict (featuresObj, subType);\n' +
        '        }\n' +
        '        const extendsStr = this.safeString (featuresObj, \'extends\');\n' +
        '        if (extendsStr !== undefined) {\n' +
        '            featuresObj = this.omit (featuresObj, \'extends\');\n' +
        '            const extendObj = this.featuresMapper (initialFeatures, extendsStr);\n' +
        '            featuresObj = this.deepExtend (extendObj, featuresObj);\n' +
        '        }\n';
    const TAIL =
        '        if (featuresObj === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        if (\'createOrder\' in featuresObj) {\n' +
        '            const createOrder = this.extend ({}, featuresObj[\'createOrder\']);\n' +
        '            featuresObj[\'createOrder\'] = createOrder;\n' +
        '        }\n' +
        '        const keys = Object.keys (featuresObj);\n' +
        '        for (let i = 0; i < keys.length; i++) {\n' +
        '            const key = keys[i];\n' +
        '            const featureBlock = featuresObj[key];\n' +
        '            if (!this.inArray (key, [ \'sandbox\' ]) && featureBlock !== undefined) {\n' +
        '                if (!(\'symbolRequired\' in featureBlock)) {\n' +
        '                    featureBlock[\'symbolRequired\'] = false;\n' +
        '                }\n' +
        '            }\n' +
        '        }\n' +
        '        return featuresObj;\n';
    const print = (body: string, go: any = {}): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54g57-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE (body));
            const t: any = new Transpiler ({ 'verbose': false, 'go': go });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'base', 'Exchange.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const GO = { 'unifiedStringParams': { 'featuresMapper': [ 1 ] } };
    test ('the features local is a map: omit / deepExtend rebinds keep the type, no InOp or SafeDictMap (fails on the base printer)', () => {
        const out = print (HEAD + TAIL, GO);
        expect (out).toContain ('var featuresObj, _ = initialFeatures[marketType].(map[string]any)');
        expect (out).toContain ('featuresObj, _ = featuresObj[*subType].(map[string]any)');
        expect (out).toContain ('featuresObj = this.OmitDict(featuresObj, "extends")');
        expect (out).toContain ('if _, ok := featuresObj["createOrder"]; ok {');
        expect (out).not.toContain ('InOp(featuresObj');
        expect (out).not.toContain ('SafeDictMap(');
    });
    test ('negative: a rebind to a value that is not a fresh map keeps the box', () => {
        const out = print (HEAD.replace ('this.deepExtend (extendObj, featuresObj)', 'this.safeValue (extendObj, 0)') + TAIL, GO);
        expect (out).toContain ('var featuresObj any = this.SafeDict(initialFeatures, marketType)');
    });
    test ('negative: a membership test with no nil exit before it keeps InOp (nil map)', () => {
        const out = print (HEAD + TAIL.replace ('        if (featuresObj === undefined) {\n            return undefined;\n        }\n', ''), GO);
        expect (out).not.toContain ('var featuresObj, _ =');
    });
    test ('negative: a self-narrowing read of a local written through elsewhere keeps the reader when the local is not narrowed', () => {
        const out = print ('        const d = this.safeDict (initialFeatures, marketType);\n        if (d === undefined) {\n            return undefined;\n        }\n        d[\'k\'] = 1;\n        const e = this.safeDict (d, \'x\');\n        return e;\n', GO);
        expect (out).not.toContain ('d["x"].(map[string]any)');
    });
});
