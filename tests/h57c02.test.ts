import { Transpiler } from '../src/transpiler';

describe ('csharp: typeof test on a string-declared base member', () => {
    const transpiler = new Transpiler({ 'verbose': false });
    const print = (body: string) => transpiler.transpileCSharp(
        'class T {\n' +
        '    proxy: any;\n' +
        '    other: any;\n' +
        '    main(url, method, headers, body) {\n' +
        '        let proxyUrl = undefined;\n' + body +
        '        return proxyUrl;\n' +
        '    }\n' +
        '}'
    ).content;

    test('the constant-false branch is dropped and the else statements print in place', () => {
        const output = print(
            "        if (typeof this.proxy === 'function') {\n" +
            '            proxyUrl = this.proxy (url, method, headers, body);\n' +
            '        } else {\n' +
            '            proxyUrl = this.proxy;\n' +
            '        }\n'
        );
        expect(output).not.toContain('callDynamically');
        expect(output).not.toContain('is Delegate');
        expect(output).toContain('proxyUrl = this.proxy;');
    });

    test('no else: the whole statement is dropped', () => {
        const output = print(
            "        if (typeof this.proxy === 'function') {\n" +
            '            proxyUrl = this.proxy (url, method, headers, body);\n' +
            '        }\n'
        );
        expect(output).not.toContain('callDynamically');
        expect(output).not.toContain('is Delegate');
    });

    test('a member outside the table keeps the delegate test', () => {
        const output = print(
            "        if (typeof this.other === 'function') {\n" +
            '            proxyUrl = 1;\n' +
            '        } else {\n' +
            '            proxyUrl = this.other;\n' +
            '        }\n'
        );
        expect(output).toContain('(this.other is Delegate)');
    });

    test('a negated test keeps the plain form', () => {
        const output = print(
            "        if (typeof this.proxy !== 'function') {\n" +
            '            proxyUrl = this.proxy;\n' +
            '        }\n'
        );
        expect(output).toContain('!(this.proxy is Delegate)');
    });

    test('an else-if chain and an else that declares a local keep the plain form', () => {
        const chained = print(
            "        if (typeof this.proxy === 'function') {\n" +
            '            proxyUrl = 1;\n' +
            '        } else if (url === 2) {\n' +
            '            proxyUrl = 2;\n' +
            '        }\n'
        );
        expect(chained).toContain('(this.proxy is Delegate)');
        const declares = print(
            "        if (typeof this.proxy === 'function') {\n" +
            '            proxyUrl = 1;\n' +
            '        } else {\n' +
            '            const x = this.proxy;\n' +
            '            proxyUrl = x;\n' +
            '        }\n'
        );
        expect(declares).toContain('(this.proxy is Delegate)');
    });

    test('a plain call of the member outside such a test is unchanged', () => {
        const output = print('        proxyUrl = this.proxy (url, method, headers, body);\n');
        expect(output).toContain('proxyUrl = callDynamically(this, "proxy", new object[] { url, method, headers, body });');
    });
});
