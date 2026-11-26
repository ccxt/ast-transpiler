import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go featureValueByType methodDict is a typed map', () => {
    const root = path.join (__dirname, 'files', 'tmp-h52g57', 'ts', 'src');
    const BASE = "export type Str = string | undefined;\nexport type Dict = { [key: string]: any };\nexport class Exchange {\n    id: string = \"x\";\n    features: Dict = undefined;\n    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n    featureValueByType (marketType: string, subType: Str, methodName: Str = undefined, paramName: Str = undefined, defaultValue: any = undefined): any {\n        /**\n         * @method\n         * @name exchange#featureValueByType\n         * @description this method is a very deterministic to help users to know what feature is supported by the exchange\n         * @param {string} [marketType] supported only: \"spot\", \"swap\", \"future\"\n         * @param {string} [subType] supported only: \"linear\", \"inverse\"\n         * @param {string} [methodName] view currently supported methods: https://docs.ccxt.com/README?id=features\n         * @param {string} [paramName] unified param value (check docs for supported param names)\n         * @param {object} [defaultValue] return default value if no result found\n         * @returns {object} returns feature value\n         */\n        // if exchange does not yet have features manually implemented\n        if (this.features === undefined) {\n            return defaultValue;\n        }\n        if (marketType === undefined) {\n            return defaultValue; // marketType is required\n        }\n        // if marketType (e.g. 'option') does not exist in features\n        if (!(marketType in this.features)) {\n            return defaultValue; // unsupported marketType, check \"exchange.features\" for details\n        }\n        let methodsContainer = this.safeDict (this.features, marketType);\n        // if marketType dict undefined\n        if (methodsContainer === undefined) {\n            return defaultValue;\n        }\n        if (subType === undefined) {\n            if (marketType !== 'spot') {\n                return defaultValue; // subType is required for non-spot markets\n            }\n        } else {\n            if (!(subType in methodsContainer)) {\n                return defaultValue; // unsupported subType, check \"exchange.features\" for details\n            }\n            methodsContainer = this.safeDict (methodsContainer, subType);\n            // if subType dict undefined\n            if (methodsContainer === undefined) {\n                return defaultValue;\n            }\n        }\n        // if user wanted only marketType and didn't provide methodName, eg: featureIsSupported('spot')\n        if (methodName === undefined) {\n            if (defaultValue !== undefined) {\n                return defaultValue;\n            }\n            return methodsContainer;\n        }\n        if (!(methodName in methodsContainer)) {\n            return defaultValue; // unsupported method, check \"exchange.features\" for details');\n        }\n        // if user wanted only method and didn't provide `paramName`, eg: featureIsSupported('swap', 'linear', 'createOrder')\n        if (paramName === undefined) {\n            if (defaultValue !== undefined) {\n                return defaultValue;\n            }\n            return methodsContainer[methodName];\n        }\n        const methodDict = this.safeDict (methodsContainer, methodName);\n        if (methodDict === undefined) {\n            return defaultValue;\n        }\n        const splited = paramName.split ('.'); // can be only parent key (`stopLoss`) or with child (`stopLoss.triggerPrice`)\n        const parentKey = splited[0];\n        const subKey = this.safeString (splited, 1);\n        if (!(parentKey in methodDict)) {\n            return defaultValue; // unsupported paramName, check \"exchange.features\" for details');\n        }\n        const dictionary = this.safeDict (methodDict, parentKey);\n        if (dictionary === undefined) {\n            // if the value is not dictionary but a scalar value (or undefined), return as is\n            return methodDict[parentKey];\n        } else {\n            // return as is, when calling without subKey eg: featureValueByType('spot', undefined, 'createOrder', 'stopLoss')\n            if (subKey === undefined) {\n                return methodDict[parentKey];\n            }\n            // throw an exception for unsupported subKey\n            if (!(subKey in methodDict[parentKey])) {\n                return defaultValue; // unsupported subKey, check \"exchange.features\" for details\n            }\n            return this.safeValue (dictionary, subKey);\n        }\n    }\n\n}\n";
    const print = (install = true, src = BASE): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), src);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h52g57'), { recursive: true, force: true }));

    test ('methodDict prints map[string]any and the in tests and reads go native', () => {
        const out = print ();
        expect (out).toContain ('var methodDict, _ = methodsContainer[*methodName].(map[string]any)');
        expect (out).toContain ('if _, ok := methodDict[*parentKey]; !ok {');
        expect (out).toContain ('return methodDict[*parentKey]');
        expect (out).not.toContain ('InOp(methodDict, parentKey)');
        expect (out).not.toContain ('GetValue(methodDict, parentKey)');
    });
    test ('an empty separator can answer no element: the box stays', () => {
        const out = print (true, BASE.replace ("paramName.split ('.')", "paramName.split ('')"));
        expect (out).toContain ('InOp(methodDict, parentKey)');
    });
    test ('without the ccxt hooks methodDict stays any', () => {
        expect (print (false)).toContain ('InOp(methodDict, parentKey)');
    });
});

describe ('go featureValueByType methodsContainer is a typed map', () => {
    const root = path.join (__dirname, 'files', 'tmp-h53g57', 'ts', 'src');
    const SRC = "export type Str = string | undefined;\nexport type Dict = { [key: string]: any };\nexport class Exchange {\n    features: { [key: string]: Dict } = undefined;\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n    featureValueByType (marketType: string, subType: Str, methodName: Str = undefined): any {\n        let methodsContainer = this.safeDict (this.features, marketType);\n        if (methodsContainer === undefined) {\n            return undefined;\n        }\n        if (subType === undefined) {\n            return undefined;\n        } else {\n            if (!(subType in methodsContainer)) {\n                return undefined;\n            }\n            methodsContainer = this.safeDict (methodsContainer, subType);\n            if (methodsContainer === undefined) {\n                return undefined;\n            }\n        }\n        if (methodName === undefined) {\n            return methodsContainer;\n        }\n        if (!(methodName in methodsContainer)) {\n            return undefined;\n        }\n        return methodsContainer[methodName];\n    }\n}\n";
    const print = (src = SRC): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), src);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h53g57'), { recursive: true, force: true }));
    test ('the self-narrowing safeDict keeps one map type and reads go native', () => {
        const out = print ();
        expect (out).toContain ('var methodsContainer map[string]any = this.SafeDictMap(this.Features, marketType)');
        expect (out).toContain ('methodsContainer, _ = methodsContainer[*subType].(map[string]any)');
        expect (out).not.toContain ('InOp(methodsContainer');
    });
    test ('a read of another container keeps the box', () => {
        const out = print (SRC.replace ('methodsContainer = this.safeDict (methodsContainer, subType);', 'methodsContainer = this.safeDict (this.features, subType);'));
        expect (out).toContain ('InOp(methodsContainer');
    });
    test ('a nil key outside the else arm keeps the box', () => {
        const out = print (SRC.replace ('if (subType === undefined) {', 'if (marketType === undefined) {'));
        expect (out).not.toContain ('methodsContainer[*subType].(map[string]any)');
    });
});
