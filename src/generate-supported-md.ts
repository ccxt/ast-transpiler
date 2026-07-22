#!/usr/bin/env node
/*
 * Auto-generates `supported.md` describing the TypeScript constructs, operators
 * and built-in calls/methods that the transpiler is able to convert.
 *
 * It works by statically scanning the transpiler source files (no compilation
 * needed):
 *   - `printNode`         -> supported AST constructs / statements
 *   - `initOperators`     -> supported operators / keywords / modifiers
 *   - `printCallExpression` -> supported built-in global calls & instance methods
 *   - each language's replacement maps -> per-language conversions
 *
 * Run with: `npm run generate-supported`
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'src');
const README_PATH = join(__dirname, '..', 'README.md');
const CONVERSIONS_PATH = join(__dirname, '..', 'language-conversions.md');

const read = (file: string) => readFileSync(join(SRC_DIR, file), 'utf8');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// turn `FunctionDeclaration` / `isFunctionDeclaration` into `Function declaration`
function humanize(name: string): string {
    const cleaned = name.replace(/^is/, '');
    const spaced = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// extract the body of a method by name from a source string (brace matching)
function extractMethodBody(source: string, methodName: string): string {
    // allows an optional return type annotation, e.g. `printNode(node, i = 0): string {`
    const startRegex = new RegExp(`${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*[\\w<>\\[\\],.| ]+\\s*)?\\{`);
    const match = startRegex.exec(source);

    if (!match) return '';
    let i = match.index + match[0].length;
    let depth = 1;
    const bodyStart = i;
    for (; i < source.length && depth > 0; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
    }
    return source.slice(bodyStart, i - 1);
}

// extract `this.NAME = { ... };` object literal as key/value pairs
function extractObjectMap(source: string, propName: string): [string, string][] {
    const startRegex = new RegExp(`this\\.${propName}\\s*=\\s*\\{`);
    const match = startRegex.exec(source);
    if (!match) return [];
    let i = match.index + match[0].length;
    let depth = 1;
    const start = i;
    for (; i < source.length && depth > 0; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
    }
    const block = source.slice(start, i - 1);
    const pairs: [string, string][] = [];
    const pairRegex = /(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3/g;
    let m;
    while ((m = pairRegex.exec(block)) !== null) {
        pairs.push([m[2], m[4]]);
    }
    return pairs;
}

// Map TS SyntaxKind names to readable symbols (used for operators/keywords)
const KIND_TO_SYMBOL: Record<string, string> = {
    MinusMinusToken: '`--`',
    MinusToken: '`-`',
    SlashToken: '`/`',
    AsteriskToken: '`*`',
    InKeyword: '`in`',
    PlusToken: '`+`',
    PercentToken: '`%`',
    LessThanToken: '`<`',
    LessThanEqualsToken: '`<=`',
    GreaterThanToken: '`>`',
    GreaterThanEqualsToken: '`>=`',
    EqualsEqualsToken: '`==`',
    EqualsEqualsEqualsToken: '`===`',
    EqualsToken: '`=`',
    PlusEqualsToken: '`+=`',
    BarBarToken: '`||`',
    AmpersandAmpersandToken: '`&&`',
    ExclamationEqualsEqualsToken: '`!==`',
    ExclamationEqualsToken: '`!=`',
    ExclamationToken: '`!`',
    PlusPlusToken: '`++`',
};

const KIND_TO_KEYWORD: Record<string, string> = {
    StringKeyword: '`string`',
    NumberKeyword: '`number`',
    BooleanKeyword: '`boolean`',
    VoidKeyword: '`void`',
    AsyncKeyword: '`async`',
    AwaitKeyword: '`await`',
    StaticKeyword: '`static`',
    PublicKeyword: '`public`',
    PrivateKeyword: '`private`',
};

// ---------------------------------------------------------------------------
// 1. supported AST constructs (from printNode)
// ---------------------------------------------------------------------------
function getSupportedConstructs(base: string): string[] {
    const body = extractMethodBody(base, 'printNode');
    const constructs = new Set<string>();
    // ts.isXxx(node)
    for (const m of body.matchAll(/ts\.is([A-Za-z]+)\s*\(/g)) {
        constructs.add(humanize(m[1]));
    }
    // ts.SyntaxKind.Xxx === node.kind
    for (const m of body.matchAll(/ts\.SyntaxKind\.([A-Za-z]+)\s*===\s*node\.kind/g)) {
        constructs.add(humanize(m[1].replace(/Keyword$/, ' keyword')));
    }
    return [...constructs].sort();
}

// ---------------------------------------------------------------------------
// 2. supported operators / keywords (from initOperators)
// ---------------------------------------------------------------------------
function getOperatorsAndKeywords(base: string): { operators: string[], keywords: string[] } {
    const body = extractMethodBody(base, 'initOperators');
    const kinds = new Set<string>();
    for (const m of body.matchAll(/ts\.SyntaxKind\.([A-Za-z]+)\]/g)) {
        kinds.add(m[1]);
    }
    const operators: string[] = [];
    const keywords: string[] = [];
    for (const kind of kinds) {
        if (KIND_TO_SYMBOL[kind]) operators.push(KIND_TO_SYMBOL[kind]);
        else if (KIND_TO_KEYWORD[kind]) keywords.push(KIND_TO_KEYWORD[kind]);
    }
    return {
        operators: [...new Set(operators)].sort(),
        keywords: [...new Set(keywords)].sort(),
    };
}

// ---------------------------------------------------------------------------
// 3. supported built-in calls/methods (from printCallExpression)
// ---------------------------------------------------------------------------
function getBuiltInCalls(base: string): { globals: string[], methods: string[] } {
    const body = extractMethodBody(base, 'printCallExpression');
    const calls = new Set<string>();
    for (const m of body.matchAll(/case\s+(['"])([^'"]+)\1\s*:/g)) {
        calls.add(m[2]);
    }
    // split into "Global" (contains a dot / capitalized) and "instance methods"
    const globals: string[] = [];
    const methods: string[] = [];
    for (const c of [...calls].sort()) {
        if (c.includes('.') || /^[A-Z]/.test(c)) globals.push(c);
        else methods.push(c);
    }
    return { globals, methods };
}

// ---------------------------------------------------------------------------
// 4. per-language replacement maps
// ---------------------------------------------------------------------------
const LANGUAGES = [
    { id: 'Python', file: 'pythonTranspiler.ts' },
    { id: 'PHP', file: 'phpTranspiler.ts' },
    { id: 'C#', file: 'csharpTranspiler.ts' },
    { id: 'Go', file: 'goTranspiler.ts' },
    { id: 'Java', file: 'javaTranspiler.ts' },
];

interface ILangReplacement {
    id: string;
    full: [string, string][];
    right: [string, string][];
    call: [string, string][];
}

function getLanguageReplacements(): ILangReplacement[] {
    const result: ILangReplacement[] = [];
    for (const lang of LANGUAGES) {
        let source: string;
        try {
            source = read(lang.file);
        } catch {
            continue;
        }
        const full = extractObjectMap(source, 'FullPropertyAccessReplacements');
        const right = extractObjectMap(source, 'RightPropertyAccessReplacements');
        const call = extractObjectMap(source, 'CallExpressionReplacements');
        if (full.length || right.length || call.length) {
            result.push({ id: lang.id, full, right, call });
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// build markdown
// ---------------------------------------------------------------------------
function buildReadmeMarkdown(constructs: string[], operators: string[], keywords: string[], globals: string[], methods: string[]): string {
    let md = '<!--\n' +
        '  AUTO-GENERATED SECTION - DO NOT EDIT MANUALLY.\n' +
        '  Generated by `src/generate-supported-md.ts` (runs in CI on every push).\n' +
        '  To update, modify the transpiler source and re-run the generator.\n' +
        '-->\n\n' +
        '## 📚 Supported Methods & Operators\n\n' +
        'Below is a detailed reference of the TypeScript constructs that the transpiler is able to convert\n' +
        '(derived from `src/baseTranspiler.ts` and the language specific transpilers).\n\n';

    // md += '### Language Constructs / Statements\n\n' +
    //     'The following AST node types are handled by `printNode`:\n\n' +
    //     constructs.map(c => `- ${c}`).join('\n') + '\n\n';

    md += '### Operators\n\n' +
        operators.join(', ') + '\n\n';

    md += '### Keywords / Modifiers\n\n' +
        keywords.join(', ') + '\n\n';

    md += '### Built-in Global Functions\n\n' +
        'These global calls are recognized and converted to each target language:\n\n' +
        globals.map(g => `- \`${g}\``).join('\n') + '\n\n';

    md += '### Built-in Instance Methods (string / array / object)\n\n' +
        'These instance methods are recognized and converted to each target language:\n\n' +
        methods.map(m => `- \`${m}\``).join('\n') + '\n\n';

    md += '## Per-language Conversions\n' +
        'Conversions of global calls and string/array methods are also detailed. Explicit replacements are documented in [language-conversions.md](./language-conversions.md).\n\n';

    md += '> ⚠️ Many of these conversions rely on type information. Make sure to annotate\n' +
        '> types (especially function arguments) so the transpiler can disambiguate\n' +
        '> (e.g. `.length` → `len`/`count`, `+` → string concat vs numeric addition).\n';

    return md;
}

function buildConversionsMarkdown(langReplacements: ILangReplacement[]): string {
    let md = '<!--\n' +
        '  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY.\n' +
        '  Generated by `src/generate-supported-md.ts` (runs in CI on every push).\n' +
        '  To update, modify the transpiler source and re-run the generator.\n' +
        '-->\n\n' +
        '# 🌐 Per-language Conversions\n\n' +
        'This document is automatically generated from the transpiler source code.\n' +
        'It lists the explicit property replacements, call expression replacements and method conversions mapped to each target language.\n\n';

    for (const lang of langReplacements) {
        md += `## ${lang.id}\n\n`;
        const rows = [
            ...lang.full.map(([k, v]) => [`${k}`, `${v}`]),
            ...lang.right.map(([k, v]) => [`x.${k}(...)`, `x.${v}(...)`]),
            ...lang.call.map(([k, v]) => [`${k}(...)`, `${v}(...)`]),
        ];
        if (rows.length === 0) {
            md += '_No explicit replacements defined._\n\n';
            continue;
        }
        md += '| TypeScript | ' + lang.id + ' |\n' +
            '| --- | --- |\n' +
            rows.map(([k, v]) => `| \`${k}\` | \`${v}\` |`).join('\n') + '\n\n';
    }

    return md;
}

const baseSource = read('baseTranspiler.ts');
const constructsList = getSupportedConstructs(baseSource);
const { operators: operatorsList, keywords: keywordsList } = getOperatorsAndKeywords(baseSource);
const { globals: globalsList, methods: methodsList } = getBuiltInCalls(baseSource);
const langReplacementsList = getLanguageReplacements();

const readmeMarkdown = buildReadmeMarkdown(constructsList, operatorsList, keywordsList, globalsList, methodsList);
const conversionsMarkdown = buildConversionsMarkdown(langReplacementsList);

// update README.md
const readmeContent = readFileSync(README_PATH, 'utf8');
const startMarker = '<!-- START_SUPPORTED_LIST -->';
const endMarker = '<!-- END_SUPPORTED_LIST -->';

const startIndex = readmeContent.indexOf(startMarker);
const endIndex = readmeContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    throw new Error('Markers not found in README.md!');
}

const updatedReadme = readmeContent.slice(0, startIndex + startMarker.length) +
    '\n' + readmeMarkdown + '\n' +
    readmeContent.slice(endIndex);

writeFileSync(README_PATH, updatedReadme, 'utf8');
console.log(`Updated ${README_PATH}`);

// update language-conversions.md
writeFileSync(CONVERSIONS_PATH, conversionsMarkdown, 'utf8');
console.log(`Updated ${CONVERSIONS_PATH}`);
