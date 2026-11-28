import { Transpiler } from '../src/transpiler';

describe ('csharp negation of an int-declared Int64? local', () => {
    const transpiler = new Transpiler ({});
    const cls = (body: string) =>
        'class Exchange {\n' +
        '    parseToInt (x: any): number { return x; }\n' +
        '    main (s: string, type: string) {\n' + body + '    }\n' +
        '}';
    // the embedding build layer answers the final printed declaration type
    const withDeclared = (declared: string | undefined, body: string) => {
        const printer: any = transpiler.csharpTranspiler;
        const own = printer.csharpFinalDeclaredLocalType;
        printer.csharpFinalDeclaredLocalType = () => declared;
        try {
            return transpiler.transpileCSharp (cls (body)).content;
        } finally {
            printer.csharpFinalDeclaredLocalType = own;
        }
    };
    test ('a local declared int that prints Int64? negates in place', () => {
        const output = withDeclared ('Int64?',
            '        const szAbs: int = this.parseToInt (s);\n' +
            "        const sz: int = (type === 'reduce') ? -szAbs : szAbs;\n" +
            '        return sz;\n');
        expect (output).toContain ('(szAbs = -szAbs)');
        expect (output).not.toContain ('prefixUnaryNeg');
    });
    test ('an unannotated Int64? local keeps the helper', () => {
        const output = withDeclared ('Int64?',
            '        const szAbs = this.parseToInt (s);\n' +
            '        return -szAbs;\n');
        expect (output).toContain ('prefixUnaryNeg(ref szAbs)');
    });
    test ('an int-declared local that prints object keeps the helper', () => {
        const output = withDeclared (undefined,
            '        const szAbs: int = this.parseToInt (s);\n' +
            '        return -szAbs;\n');
        expect (output).toContain ('prefixUnaryNeg(ref szAbs)');
    });
    test ('an int-declared double? local keeps the helper', () => {
        const output = withDeclared ('double?',
            '        const szAbs: int = this.parseToInt (s);\n' +
            '        return -szAbs;\n');
        expect (output).toContain ('prefixUnaryNeg(ref szAbs)');
    });
});
