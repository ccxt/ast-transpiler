import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { BinaryExpression, CallExpression, TypeChecker } from 'typescript';

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'map[string]any{',
    'ARRAY_OPENING_TOKEN': '[]any{',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'VAR_TOKEN': 'object', // object
    'METHOD_TOKEN': 'func',
    'PROPERTY_ASSIGNMENT_OPEN': '',
    'PROPERTY_ASSIGNMENT_CLOSE': '',
    'SUPER_TOKEN': 'base',
    'SUPER_CALL_TOKEN': 'base',
    'FALSY_WRAPPER_OPEN': 'EvalTruthy(',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN' : "IsEqual(",
    'COMPARISON_WRAPPER_CLOSE' : ")",
    'UKNOWN_PROP_WRAPPER_OPEN': 'this.call(',
    'UNKOWN_PROP_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': 'this.callAsync(',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': ')',
    'DYNAMIC_CALL_OPEN': 'callDynamically(',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'IsEqual(',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!IsEqual(',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'IsGreaterThan(',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'IsGreaterThanOrEqual(',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'IsLessThan(',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'IsLessThanOrEqual(',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN':'Add(',
    'PLUS_WRAPPER_CLOSE':')',
    'MINUS_WRAPPER_OPEN':'Subtract(',
    'MINUS_WRAPPER_CLOSE':')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'GetArrayLength(',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'Divide(',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'Multiply(',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'GetIndexOf(',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'Mod(',
    'MOD_WRAPPER_CLOSE': ')',
    'FUNCTION_TOKEN': 'func',
    'DEFAULT_RETURN_TYPE': 'any',
    'BLOCK_OPENING_TOKEN': '{',
    'DEFAULT_PARAMETER_TYPE': 'any',
    'LINE_TERMINATOR': '',
    'CONDITION_OPENING':'',
    'CONDITION_CLOSE':'',
    'AWAIT_TOKEN': '',
    'NULL_TOKEN': 'nil',
    'UNDEFINED_TOKEN': 'nil',
    'WHILE_TOKEN': 'for',
    'ELEMENT_ACCESS_WRAPPER_OPEN': 'GetValue(',
    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
};

// Go static type of the value each base helper returns. A local initialised by
// one of these already holds that concrete type inside its `any` box, so naming
// the type at the declaration site keeps the very same runtime value and only
// refines what the Go compiler knows about it.
const GO_HELPER_RETURN_TYPES: { [name: string]: string } = {
    'GetArrayLength': 'int',
    'GetLength': 'int',
    // the printInlineArrayLength emission of `.length` on a slice
    'len': 'int',
    'GetIndexOf': 'int',
    'ToString': 'string',
    'ToLower': 'string',
    'ToUpper': 'string',
    'JsonStringify': 'string',
    'Capitalize': 'string',
    'this.Uuid': 'string',
    'this.Hmac': 'string',
    'this.Ymdhms': 'string',
    'this.Yyyymmdd': 'string',
    'this.Ymd': 'string',
    'Split': '[]string',
    'ObjectKeys': '[]string',
    'this.Extend': 'map[string]any',
    'this.DeepExtend': 'map[string]any',
    'this.Keysort': 'map[string]any',
    'this.IndexBy': 'map[string]any',
    'this.GroupBy': 'map[string]any',
    'this.Milliseconds': 'int64',
    'this.Seconds': 'int64',
    'this.Microseconds': 'int64',
    'ParseInt': 'int64',
    'MathFloor': 'float64',
    'MathCeil': 'float64',
    'MathRound': 'float64',
    'MathAbs': 'float64',
    'MathPow': 'float64',
    'ToFloat64': 'float64',
    'EvalTruthy': 'bool',
    'IsEqual': 'bool',
    'IsGreaterThan': 'bool',
    'IsLessThan': 'bool',
    'IsGreaterThanOrEqual': 'bool',
    'IsLessThanOrEqual': 'bool',
    'InOp': 'bool',
    'IsArray': 'bool',
    'IsString': 'bool',
    'IsInt': 'bool',
    'IsBool': 'bool',
    'IsNumber': 'bool',
    'IsObject': 'bool',
    'IsDictionary': 'bool',
    'StartsWith': 'bool',
    'EndsWith': 'bool',
    // the native string operations (emitted with a proven Go `string` receiver) return exactly
    // the type of the helper they replace, so a local initialised by one keeps its declared type
    'strings.Split': '[]string',
    'strings.Join': 'string',
    'strings.ToUpper': 'string',
    'strings.ToLower': 'string',
    'strings.Replace': 'string',
    'strings.ReplaceAll': 'string',
    'strings.HasPrefix': 'bool',
    'strings.HasSuffix': 'bool',
    'IsInstance': 'bool',
    'IsInteger': 'bool',
    'this.InArray': 'bool',
    'this.ValueIsDefined': 'bool',
    'Precise.StringGt': 'bool',
    'Precise.StringGe': 'bool',
    'Precise.StringLt': 'bool',
    'Precise.StringLe': 'bool',
    'Precise.StringEq': 'bool',
    'Precise.StringEquals': 'bool',
    // the base Safe* accessors return a typed pointer so that an absent value is a
    // nil pointer, distinct from a present zero value ("" / 0 / false)
    'this.SafeString': '*string',
    'this.SafeString2': '*string',
    'this.SafeStringN': '*string',
    'this.SafeStringLower': '*string',
    'this.SafeStringLower2': '*string',
    'this.SafeStringLowerN': '*string',
    'this.SafeStringUpper': '*string',
    'this.SafeStringUpper2': '*string',
    'this.SafeStringUpperN': '*string',
    'this.SafeInteger': '*int64',
    'this.SafeInteger2': '*int64',
    'this.SafeIntegerN': '*int64',
    'this.SafeIntegerProduct': '*int64',
    'this.SafeIntegerProduct2': '*int64',
    'this.SafeIntegerProductN': '*int64',
    'this.SafeTimestamp': '*int64',
    'this.SafeTimestamp2': '*int64',
    'this.SafeTimestampN': '*int64',
    'this.SafeFloat': '*float64',
    'this.SafeFloat2': '*float64',
    'this.SafeFloatN': '*float64',
    // absent flag → nil pointer, present flag → its value, mirroring the string/number accessors
    'this.SafeBool': '*bool',
    'this.SafeBool2': '*bool',
    'this.SafeBoolN': '*bool',
    // SafeDict*/SafeList* stay untyped: the Go accessors return `any` because the value
    // may be a *sync.Map, a Dict or an order-book side, none of which is a map[string]any / []any
    // Precise arithmetic returns a numeric string, or nil when an operand is
    // absent, so it carries the same *string shape as the Safe* string accessors
    'Precise.StringMul': '*string',
    'Precise.StringDiv': '*string',
    'Precise.StringSub': '*string',
    'Precise.StringAdd': '*string',
    'Precise.StringOr': '*string',
    'Precise.StringMax': '*string',
    'Precise.StringMin': '*string',
    'Precise.StringAbs': '*string',
    'Precise.StringNeg': '*string',
    'Precise.StringMod': '*string',
};

// helpers whose Go signature is `any` (GetValue, Ternary, Add, SafeValue, ...) are
// deliberately absent above: their box holds a value the printer cannot name, so
// those locals stay `any`. A Safe* entry presupposes the matching Go accessor
// returns that shape (as the hand-written base already does for Str/Int/Float).

// Hand-written CCXT fields whose Go type is a plain `bool` (go/v4/exchange.go,
// struct BaseExchange, embedded by every derived exchange). Reading one already
// yields a Go bool, so a condition on it needs no truthiness helper at all.
const GO_BOOL_FIELDS = new Set([
    'this.Verbose',
    'this.EnableRateLimit',
    'this.ReduceFees',
    'this.SubstituteCommonCurrencyCodes',
    'this.IsSandboxModeEnabled',
]);
// A printed call the printer cannot type *and* whose Go signature returns `any`
// can be compared with nil / a string / a bool literal without the helper: the
// box holds a scalar or nil, never a typed pointer.
const GO_ANY_BOX_CALLS = [
    'GetValue', 'Ternary',
    'SafeValue', 'this.SafeValue',
    'SafeDict', 'this.SafeDict',
    'SafeList', 'this.SafeList',
    'SafeNumber', 'this.SafeNumber',
];

const GO_TYPE_NAMES = [ 'string', 'int', 'int64', 'float64', 'bool', 'any' ];

// the boundary comment ccxt's base sources (ts/src/base/Exchange.ts, PredictionExchange.ts)
// carry and build/goTranspiler.ts re-assembles the generated file around
const METHODS_BOUNDARY_MARKER = 'METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT';

// the Go numeric kinds. `<` `>` `<=` `>=` compile without a conversion only when
// both operands carry the same one of these
const GO_NUMERIC_KINDS = [ 'int', 'int64', 'float64' ];

const ORDERED_COMPARISON_OPERATORS: { [kind: number]: string } = {
    [ts.SyntaxKind.GreaterThanToken]: '>',
    [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
    [ts.SyntaxKind.LessThanToken]: '<',
    [ts.SyntaxKind.LessThanEqualsToken]: '<=',
};

// hand-written BaseExchange fields (go/v4/exchange.go) declared `string`: their Go
// value is never nil, so `this.<field> + s` matches Add(field, s) exactly.
const GO_STRING_FIELD_NAMES = [ 'Id', 'Name', 'Version' ];

// operator kinds the arithmetic helpers are emitted for
const GO_ARITHMETIC_KINDS = [
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
];

// ---------------------------------------------------------------------------------------------
// Trailing `//` comment alignment (gofmt's tabwriter cells).
//
// go/printer separates a trailing comment from the code with a hard tab (`writeCommentPrefix`),
// so the code text is the last tab-terminated cell of the line. text/tabwriter pads that cell to
// the widest cell of its column block plus `padding = 1` (gofmt runs with `minwidth = 0`,
// `padding = 1`, `padchar = ' '`), which is why adjacent statements get their comments aligned
// and a lone one gets exactly one space. A column block is the run of adjacent lines whose code
// cell sits in the same column (same indentation); formfeeds terminate all columns, and
// go/printer emits them between sections: blank and comment-only lines, a change of indentation,
// each line of a multi-line expression (`binaryExpr` breaks with `newSection = true`) and every
// statement that follows a multi-line one (`stmtList` breaks with `newSection = true`).
//
// The pass below reproduces that padding on the printed text. It is a no-op on text gofmt has
// already aligned (verified over the whole go/v4 tree) and it never reflows or re-wraps a line.
// ---------------------------------------------------------------------------------------------

// a line whose code ends like this does not end its statement: the line below it belongs to the
// same multi-line expression, and go/printer puts a formfeed before it (a new column block)
const GO_COMMENT_BREAK_END = /(?:[({[:]|[+\-*/%&|^<>=!])$/;

// (opens - closes) of ()[]{} outside strings, so `foo(` (statement continues) and `}` (statement
// ended before this line) are not mistaken for complete single-line statements
function goBracketBalance (code: string): number {
    let depth = 0;
    let i = 0;
    while (i < code.length) {
        const ch = code[i];
        if ((ch === '"') || (ch === '\'')) {
            const quote = ch;
            i += 1;
            while (i < code.length) {
                if (code[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (code[i] === quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if (ch === '`') {
            i += 1;
            while ((i < code.length) && (code[i] !== '`')) {
                i += 1;
            }
            i += 1;
            continue;
        }
        if ((ch === '(') || (ch === '[') || (ch === '{')) {
            depth += 1;
        } else if ((ch === ')') || (ch === ']') || (ch === '}')) {
            depth -= 1;
        }
        i += 1;
    }
    return depth;
}

// index of the first `//` outside strings and comments, or -1. The state is carried across lines
// because `/* */` comments and `-quoted strings can span them (a `//` inside a string literal is
// data, e.g. the `https://` of an endpoint, and must not be taken for a comment)
function goTrailingCommentIndex (line: string, state: { block: boolean, raw: boolean }): number {
    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (state.block) {
            if ((ch === '*') && (line[i + 1] === '/')) {
                state.block = false;
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }
        if (state.raw) {
            if (ch === '`') {
                state.raw = false;
            }
            i += 1;
            continue;
        }
        if (ch === '`') {
            state.raw = true;
            i += 1;
            continue;
        }
        if ((ch === '"') || (ch === '\'')) {
            const quote = ch;
            i += 1;
            while (i < line.length) {
                if (line[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (line[i] === quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if ((ch === '/') && (line[i + 1] === '/')) {
            return i;
        }
        if ((ch === '/') && (line[i + 1] === '*')) {
            state.block = true;
            i += 2;
            continue;
        }
        i += 1;
    }
    return -1;
}

// tabwriter counts runes, not bytes (a multi-byte identifier is one column wide)
function goRuneWidth (text: string): number {
    let width = 0;
    for (const _rune of text) { // eslint-disable-line @typescript-eslint/no-unused-vars
        width += 1;
    }
    return width;
}

function alignGoTrailingComments (content: string): string {
    const lines = content.split ('\n');
    const entries: { index: number, indent: string, code: string, comment: string }[] = [];
    const state = { 'block': false, 'raw': false };
    for (let index = 0; index < lines.length; index++) {
        const commentIndex = goTrailingCommentIndex (lines[index], state);
        if (commentIndex < 0) {
            continue;
        }
        // the code cell: everything before the comment, without the padding already inside it
        const code = lines[index].slice (0, commentIndex).replace (/[ \t]+$/, '');
        if (!code.trim ()) {
            continue; // a comment-only line is a section break, it is never a cell
        }
        const indent = code.match (/^[ \t]*/)[0];
        entries.push ({ 'index': index, indent, code, 'comment': lines[index].slice (commentIndex) });
    }
    // group the lines that share a code column: adjacent, same indentation, and no section break
    // in between (the previous line must end its own statement, and that statement must be a
    // single-line one, or the next statement starts a new section)
    const groups: typeof entries[] = [];
    let group: typeof entries = [];
    for (const entry of entries) {
        const previous = group[group.length - 1];
        const continues = previous
            && (entry.index === previous.index + 1)
            && (entry.indent === previous.indent)
            && (goBracketBalance (previous.code) === 0)
            && !GO_COMMENT_BREAK_END.test (previous.code);
        if (continues) {
            group.push (entry);
        } else {
            if (group.length) {
                groups.push (group);
            }
            group = [ entry ];
        }
    }
    if (group.length) {
        groups.push (group);
    }
    for (const members of groups) {
        let width = 0;
        for (const member of members) {
            width = Math.max (width, goRuneWidth (member.code));
        }
        width += 1; // tabwriter padding
        for (const member of members) {
            const pad = width - goRuneWidth (member.code);
            lines[member.index] = member.code + ' '.repeat (pad) + member.comment;
        }
    }
    return lines.join ('\n');
}

export {
    alignGoTrailingComments,
};

export class GoTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    wrapThisCalls: boolean;
    wrapCallMethods: string[] = [];
    // declarations whose Go local type is being resolved right now (see goLocalStaticType)
    goLocalTypeResolution = new Set<any>();
    // appended to every async (channel returning) Go method/function name and to each
    // checker-resolved call site of one; '' disables the rename
    asyncMethodSuffix = '';
    classNameMap: { [key: string]: string };
    DEFAULT_RETURN_TYPE = 'any';
    // suffix of the sibling body method an async trampoline hands its work to
    ASYNC_BODY_SUFFIX = 'Body';
    // gofmt indents every nesting level with exactly one tab; the printer emits the
    // same bytes so the generated tree needs no `gofmt` pass (campaign go-gofmt F01)
    DEFAULT_IDENTATION = "\t";
    // stdlib packages the source file being printed references. A Go import may only be
    // declared before the file's first declaration, i.e. in the head of the printed body
    // (printSourceFileStatements), so the file-level print collects the names here and
    // prepends `import "..."` to its own output. Nested prints keep their own list.
    goStdlibPackages = [];
    // memo of goStdlibImportIsPlaceable() for the file being printed (reset per source file)
    goStdlibImportPlaceable: boolean | undefined = undefined;

    constructor(config = {}) {
        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = false;
        this.implicitAsyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.wrapThisCalls = false;
        this.id = "Go";
        this.className = "undefined";
        this.classNameMap = config['classNameMap'] ?? {};
        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);
        this.wrapThisCalls = config['wrapThisCalls'] ?? false;
        this.wrapCallMethods = config['wrapCallMethods'] ?? [];
        this.asyncMethodSuffix = config['asyncMethodSuffix'] ?? '';
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            // 'this': '$this',
        };

        this.RightPropertyAccessReplacements = {
            'push': 'Add', // list method
            'indexOf': 'IndexOf', // list method
            'toUpperCase': 'ToUpper',
            'toLowerCase': 'ToLower',
            'toString': 'ToString',
        };

        this.FullPropertyAccessReplacements = {
            'JSON.parse': 'parseJson', // custom helper method
            'console.log': 'fmt.Println',
            'Number.MAX_SAFE_INTEGER': 'Int32.MaxValue',
            'Math.min': 'Math.Min',
            'Math.max': 'Math.Max',
            'Math.log': 'Math.Log',
            'Math.abs': 'Math.Abs',
            // 'Math.ceil':  'Math.Ceiling', // need cast
            // 'Math.round': 'Math.Round', // need to cast
            'Math.floor': 'Math.Floor',
            'Math.pow': 'Math.Pow',
            // 'Promise.all': 'Task.WhenAll',
        };

        this.CallExpressionReplacements = {
            // "parseInt": "parseINt",
            // "parseFloat": "float.Parse",
        };

        this.ReservedKeywordsReplacements = {
            // 'string': 'str',
            // 'params': 'parameters',
            'type': 'typeVar',
            // 'internal': 'intern',
            // 'event': 'eventVar',
            // 'fixed': 'fixedVar',
        };

        this.binaryExpressionsWrappers = {
            [ts.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
            [ts.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
            [ts.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE],
        };
    }

    // getBlockOpen(identation){
    //     return this.getIden(identation)  + this.BLOCK_OPENING_TOKEN;
    // }

    printSuperCallInsideConstructor(node, identation) {
        return ""; // csharp does not need super call inside constructor
    }

    printStringLiteral(node) {
        const token = this.STRING_QUOTE_TOKEN;
        let text = node.text;
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
        // skip the replaceAll passes when there is nothing to escape
        // note: single quotes must NOT be escaped — \' is an invalid escape in Go string literals
        if (/[\\"\b\f\n\r\t]/.test(text)) {
            // Preserve real backslashes
            const backslashPlaceholder = "\x00";
            text = text.replaceAll("\\", backslashPlaceholder);
            text = text.replaceAll("\b", "\\b");
            text = text.replaceAll("\f", "\\f");
            text = text.replaceAll("\n", "\\n");
            text = text.replaceAll("\r", "\\r");
            text = text.replaceAll("\t", "\\t");
            text = text.replaceAll(backslashPlaceholder, "\\\\");
            text = text.replaceAll("\"", "\\\"");
        }
        return token + text + token;
    }

    transformFunctionNameIfNeeded(name): string {
        return this.capitalize(name);
    }


    // The cells of one struct field in the shape gofmt's fieldList() prints them: a named
    // field is `Name Type [Tag]` (the name cell — and, when the field carries a tag, the type
    // cell too — is a tab-terminated column cell) and an embedded field is a single cell.
    // printStruct() lays those cells out; printPropertyDeclaration() joins them with spaces.
    getStructFieldCells(node) {
        const name = this.capitalize(this.printNode(node.name, 0));
        let type = 'any';
        if (node.type === undefined) {
            type = 'any';
        } else if (node.type.kind === SyntaxKind.StringKeyword) {
            type = 'string';
        } else if (node.type.kind === SyntaxKind.NumberKeyword) {
            type = 'int';
        } else if (node.type.kind === SyntaxKind.BooleanKeyword || (ts as any).isBooleanLiteral(node)) {
            type = 'bool';
        } else if (node.type.kind === SyntaxKind.ArrayType) {
            type = '[]any';
        }
        const cells = [ name, type ];
        if (node.initializer) {
            // we have to save the value and initialize it later
            let initializer = this.printNode(node.initializer, 0);
            // quick fix
            initializer = initializer.replaceAll('"', '');
            cells.push(`\`default:"${initializer}"\``);
        }
        return cells;
    }

    printPropertyDeclaration(node, identation) {
        return this.getIden(identation) + this.getStructFieldCells(node).join(' ') + this.LINE_TERMINATOR;
    }

    printStruct(node, indentation) {

        const rows: string[][] = [];
        // check if we have heritage
        if (node?.heritageClauses?.length > 0) {
            const heritage = node.heritageClauses[0];
            const heritageType = heritage.types[0];
            let heritageEscapedText = heritageType.expression.escapedText;
            if (this.classNameMap[heritageEscapedText]) {
                heritageEscapedText = this.classNameMap[heritageEscapedText];
            }
            // an embedded field has no type cell: it is a single, unterminated cell
            rows.push([ heritageEscapedText ]);
        }

        const propDeclarations = node.members.filter(member => member.kind === SyntaxKind.PropertyDeclaration);
        propDeclarations.forEach(member => rows.push(this.getStructFieldCells(member)));

        // gofmt lays the fields out with text/tabwriter (go/printer's fieldList): a column
        // block is a run of consecutive fields whose cell in that column is tab-terminated,
        // and every cell of the block is padded with spaces to the widest cell of the block
        // plus one. An embedded field (a single cell) and a field without a tag (its type is
        // the trailing cell) end the block of every column they have no cell in, which is
        // what keeps `Exchange` from widening the `exchangeTyped *ExchangeTyped` column.
        const lines = rows.map((cells, row) => {
            let line = cells[0];
            for (let column = 0; column < cells.length - 1; column++) {
                let width = 0;
                for (let previous = row; previous >= 0 && rows[previous].length > column + 1; previous--) {
                    width = Math.max(width, rows[previous][column].length);
                }
                for (let next = row + 1; next < rows.length && rows[next].length > column + 1; next++) {
                    width = Math.max(width, rows[next][column].length);
                }
                line += ' '.repeat(width + 1 - cells[column].length) + cells[column + 1];
            }
            return this.getIden(indentation + 1) + line;
        });

        // a struct with no fields is `type X struct {\n}`: no stray blank line before the brace
        const body = lines.length ? '\n' + lines.join('\n') + '\n' : '\n';
        return `type ${this.className} struct {${body}}`;
    }

    printNewStructMethod(node){
        return `
func New${this.capitalize(this.className)}() *${(this.className)} {
\tp := &${this.className}{}
\tsetDefaults(p)
\treturn p
}\n`;
        // TO remove `return copies lock value: github.com/ccxt/ccxt/go/v4.bitvavoWs contains github.com/ccxt/ccxt/go/v4.bitvavo contains github.com/ccxt/ccxt/go/v4.Exchange contains sync.Mutex`
        // change the return value to
        //
        //         return `
        // func New${this.capitalize(className)}() *${(className)} {
        //    p := ${className}{}
        //    setDefaults(&p)
        //    return &p
        // }\n`;
        //

    }

    printClass(node, identation) {
        this.className = node.name.escapedText;
        if (this.classNameMap[this.className]) {
            this.className = this.classNameMap[this.className];
        }

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewStructMethod(node);

        const methods = node.members.filter(member => member.kind === SyntaxKind.MethodDeclaration);
        const classMethods = this.joinTopLevelDecls(methods.map(method => this.printMethodDeclaration(method, identation)));
        // const classDefinition = this.printClassDefinition(node, identation);

        // const classBody = this.printClassBody(node, identation);

        // const classClosing = this.getBlockClose(identation);

        // return classDefinition + classBody + classClosing;
        return struct + "\n" + newMethod  + "\n" + classMethods;
    }

    /**
     * gofmt's declaration-list rule (go/printer nodes.go `declList`): a top-level
     * declaration that carries a doc comment is separated from the previous declaration
     * by exactly one blank line (`min = 2` linebreaks), while a declaration without one
     * keeps the source's own separation (the printer emits members adjacent to the
     * closing brace above them). `printClass` used to join every member with a bare
     * "\n", so a method whose leading `/** ... *` + `/` comment follows the previous
     * method's closing brace came out as `}\n/**` and gofmt re-inserted the blank line.
     */
    joinTopLevelDecls (decls: string[]): string {
        return decls.map((decl, index) => {
            if (index === 0 || !this.startsWithComment(decl)) {
                return (index === 0 ? "" : "\n") + decl;
            }
            return "\n\n" + decl;
        }).join("");
    }

    /**
     * True when the emitted declaration text opens with its doc comment - the comment
     * group gofmt attaches to the declaration (`getDoc(d) != nil` in go/printer).
     */
    startsWithComment (decl: string): boolean {
        return this.isComment(decl.split("\n")[0]);
    }

    /**
     * Indent every non-blank line of `lines` by `identation` levels. gofmt trims trailing
     * whitespace, so an indented *blank* line (only the indentation of a blank source
     * line) must stay empty instead of becoming whitespace-only text.
     */
    indentLines (lines: string[], identation: number): string[] {
        return lines.map((line) => line.trim().length === 0 ? "" : this.getIden(identation) + line);
    }

    printPropertyAccessModifiers (node) {
        return "";
    }

    printSpreadElement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        return this.getIden(identation) + expression + this.SPREAD_TOKEN;
    }

    printMethodDeclaration(node, identation) {

        let methodDef = this.printMethodDefinition(node, identation);

        const isAsync = this.isAsyncFunction(node);

        const funcBody = this.printFunctionBody(node, identation, isAsync);

        if (!isAsync) {
            methodDef += funcBody;
            return methodDef;
        }

        // Trampoline + body pair, see printAsyncTrampolineBlock.
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = methodDef + this.printAsyncTrampolineBlock(node, identation, `${this.THIS_TOKEN}.${bodyName}`);
        const bodyDef = `${this.getIden(identation)}func (${this.THIS_TOKEN} *${this.className}) ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return trampoline + "\n" + bodyDef + funcBody;
    }

    printFunctionDeclaration(node, identation) {
        if (ts.isArrowFunction(node)) {
            const parameters = node.parameters.map(param => this.printParameter(param)).join(", ");
            const body = this.printNode(node.body);
            return `(${parameters}) => ${body}`;
        }
        const isAsync = this.isAsyncFunction(node);
        const functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node, identation, isAsync);

        // printFunctionDefinition already carries the leading comment
        if (!isAsync) {
            return functionDef + funcBody;
        }

        // module-scope `async function` has no receiver: the body is a package-level
        // sibling function with the same trampoline contract
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = functionDef + this.printAsyncTrampolineBlock(node, identation, bodyName);
        const bodyDef = `${this.getIden(identation)}func ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return trampoline + "\n" + bodyDef + funcBody;
    }

    /**
     * Name of the sibling *body* method/function an async core hands its work to.
     *
     * `FetchTicker` -> `fetchTickerBody`. Deliberately UNEXPORTED: the body is an
     * implementation detail of the trampoline, so it must not show up on the generated
     * interfaces (ICoreExchange) nor on the typed `*_wrapper.go` facades, and it stays
     * invisible to the reflection based `callInternal`/`callDynamically` dispatch.
     *
     * If that name is already taken by a real declaration (a hand written
     * `fetchTickerBody`), a numeric suffix is appended instead of silently clobbering it.
     */
    getAsyncBodyName(node, goName: string): string {
        const taken = new Set<string>();
        const remember = (raw) => {
            if (!raw) {
                return;
            }
            const name = String(raw);
            taken.add(name);
            try {
                taken.add(this.transformMethodNameIfNeeded(name));
            } catch {
                // a malformed name must never break emission
            }
        };
        try {
            const parent = node?.parent;
            if (parent && ts.isClassDeclaration(parent)) {
                parent.members.forEach((member: any) => remember(member?.name?.escapedText));
            } else if (parent && ts.isSourceFile(parent)) {
                parent.statements.forEach((statement: any) => {
                    if (ts.isFunctionDeclaration(statement)) {
                        remember(statement?.name?.escapedText);
                    }
                });
            }
        } catch {
            // a malformed/synthesised node must never break emission
        }
        const base = goName.charAt(0).toLowerCase() + goName.slice(1) + this.ASYNC_BODY_SUFFIX;
        let name = base;
        let suffix = 0;
        while (taken.has(name)) {
            suffix++;
            name = `${base}${suffix}`;
        }
        return name;
    }

    /**
     * Parameter list of the body: the channel it must fill, then the original parameters
     * verbatim (including the `optionalArgs ...any` tail), so the trampoline can forward
     * its own arguments unchanged.
     */
    printAsyncBodyParameters(node): string {
        const params = this.printMethodParameters(node);
        const channelParam = `ch chan ${this.DEFAULT_RETURN_TYPE}`;
        return params ? `${channelParam}, ${params}` : channelParam;
    }

    /**
     * Arguments the trampoline forwards to its body, matching printMethodParameters:
     * the declared parameters in order, plus the variadic `optionalArgs...` tail when
     * the function has any defaulted parameter.
     */
    printAsyncTrampolineArgs(node): string {
        const args = [];
        let hasOptionalParameter = false;
        (node?.parameters ?? []).forEach((param) => {
            if (param.initializer) {
                hasOptionalParameter = true;
                return;
            }
            args.push(this.printNode(param.name, 0));
        });
        if (hasOptionalParameter) {
            args.push('optionalArgs...');
        }
        return args.join(", ");
    }

    /**
     * The trampoline: an async core hands back a *hot handle*.
     *
     *     func (this *Exchange) FetchTicker(symbol any) <-chan any {
     *         ch := make(chan any, 1)
     *         go this.fetchTickerBody(ch, symbol)
     *         return ch
     *     }
     *
     *   - `ch` is buffered (cap 1): the body's single `ch <- value` never blocks, so a
     *     result nobody ever receives still lets the goroutine finish and run
     *     `defer close(ch)` (no leak for abandoned calls).
     *   - the body runs on its own goroutine, so the call expression returns immediately
     *     with work already in flight. That is what makes
     *     `const a = this.fetchA (); const b = this.fetchB (); await Promise.all([a,b])`
     *     overlap, exactly like the C#/Java ports, with no call-site wrapper.
     *   - the result stays UNNAMED (`<-chan any`): `return ch` is the trampoline's only
     *     statement and it always runs, because the recover (`defer ReturnPanicError(ch)`)
     *     lives on the body, not here.
     */
    printAsyncTrampolineBlock(node, identation, callee: string): string {
        const args = this.printAsyncTrampolineArgs(node);
        const argList = args ? `, ${args}` : "";
        return [
            // F04: the signature above ends WITHOUT a trailing space, so the block opener
            // carries the one space before `{` (same contract as getBlockOpen)
            " {",
            `${this.getIden(identation + 1)}ch := make(chan ${this.DEFAULT_RETURN_TYPE}, 1)`,
            `${this.getIden(identation + 1)}go ${callee}(ch${argList})`,
            `${this.getIden(identation + 1)}return ch`,
            `${this.getIden(identation)}}`,
        ].join("\n");
    }

    /**
     * Go name of an async (channel returning) declaration: `fetchTicker` -> `FetchTickerAsync`.
     * Empty `asyncMethodSuffix` (the default) keeps the plain name, so the suffix is opt-in.
     */
    printAsyncDeclarationName(node, goName: string): string {
        if (!this.asyncMethodSuffix || !this.isAsyncFunction(node)) {
            return goName;
        }
        return goName + this.asyncMethodSuffix;
    }

    /**
     * Resolve the declaration a call/property access refers to and append `asyncMethodSuffix`
     * when it is an async function. Uses the checker, so `this.x()`, `super.x()`, `obj.x()` and
     * bare `x()` all agree with the declaration site. Unresolvable or non-function symbols
     * (properties, `any` receivers, JS builtins) keep the plain name.
     */
    applyAsyncSuffixToCallee(nameNode, goName: string): string {
        if (!this.asyncMethodSuffix || !nameNode) {
            return goName;
        }
        let decls;
        try {
            let symbol = this.getChecker().getSymbolAtLocation(nameNode);
            if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
                symbol = this.getChecker().getAliasedSymbol(symbol);
            }
            decls = symbol?.declarations;
        } catch {
            return goName;
        }
        if (!decls || decls.length === 0) {
            return goName;
        }
        // only declarations with a body count: interface/abstract signatures (e.g. implicit API
        // endpoints declared as `foo(params?: {}): Promise<T>;`) are emitted elsewhere, unsuffixed
        const isAsyncDecl = decls.some((d) => (ts.isMethodDeclaration(d) || ts.isFunctionDeclaration(d))
            && d.body !== undefined && this.isAsyncFunction(d));
        return isAsyncDecl ? goName + this.asyncMethodSuffix : goName;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));

        const returnType = this.printFunctionType(node).trim();

        const parsedArgs = this.printMethodParameters(node);

        // F04: `func`, the receiver, the name and the return type are separated by exactly one
        // space, and the signature carries NO trailing space — the block opener (`getBlockOpen`,
        // or `printAsyncTrampolineBlock` below) contributes the single space before `{`.
        // gofmt rejects both `func  (this *X)` and `) any  {`.
        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
        const structReceiver = `(${this.THIS_TOKEN} *${this.className})`;
        const returnSignature = returnType ? " " + returnType : "";
        const methodDef = this.getIden(identation) + methodToken + structReceiver + " " + name + "(" + parsedArgs + ")" + returnSignature;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }


    printFunctionDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));

        const returnType = this.printFunctionType(node).trim();

        const parsedArgs = this.printMethodParameters(node);

        // F04: single spaces only, no trailing space before the block (see printMethodDefinition)
        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
        const returnSignature = returnType ? " " + returnType : "";
        const methodDef = this.getIden(identation) + methodToken + name + "(" + parsedArgs + ")" + returnSignature;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodParameters(node) {
        const params = node.parameters.map(param => this.printParameter(param));
        const hasOptionalParameter = params.some(p => p === 'optional');
        if (!hasOptionalParameter) {
            return params.join(", ");
        }
        const paramsWithOptional = params.filter(param => param !== 'optional');
        paramsWithOptional.push('optionalArgs ...any');
        return paramsWithOptional.join(", ");
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const type = this.printParameterType(node);

        if (defaultValue) {
            if (initializer) {
                return 'optional'; // will be handled later
            }
            // not supported we have to find an alternative for go like defining multiple methods with different parameters
            // if (initializer) {
            //     const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
            //     const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
            //     return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            // }
            return name + ' ' + type;
        }
        return name + ' ' + type;
    }

    printParameterType(node) {
        const typeText = this.getType(node);
        // // if (typeText === this.BOOLEAN_KEYWORD) {
        // //     return typeText;
        // // }

        //tmp default to interface
        return 'any';

        if (typeText === this.STRING_KEYWORD) {
            return 'string';
        }
        if (typeText === this.NUMBER_KEYWORD) {
            return 'float64';
        }

        if (typeText === this.BOOLEAN_KEYWORD) {
            return 'bool';
        }

        return this.DEFAULT_PARAMETER_TYPE;

        if (typeText === undefined || typeText === this.STRING_KEYWORD) {
            // throw new FunctionReturnTypeError("Parameter type is not supported or undefined");
            this.warn(node, node.getText(), "Parameter type not found, will default to: " + this.DEFAULT_PARAMETER_TYPE);
            return this.DEFAULT_PARAMETER_TYPE;
        }
        return typeText;

    }

    printFunctionType(node){
        const typeText = this.getFunctionType(node);
        if (typeText === 'void') {
            // // If the function is async (returns a Promise in TS) but declared void, emit a typed channel
            // if (this.isAsyncFunction(node)) {
            //     // Ensure element type is present; some edge cases yield '<-chan' only
            //     const elementType = this.DEFAULT_RETURN_TYPE || 'any';
            //     return `<-chan ${elementType}`;
            // }
            return "";
        }
        if (typeText === undefined || (typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD)) {
            // throw new FunctionReturnTypeError("Function return type is not supported");
            let res = "";
            if (this.isAsyncFunction(node)) {
                res = `<-chan ${this.DEFAULT_RETURN_TYPE}`;
            } else {
                res = this.DEFAULT_RETURN_TYPE;
            }
            this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
            return res;
        }
        if (typeText === this.PROMISE_TYPE_KEYWORD) {
            return `<-chan any`;
        }

        // move any trailing array brackets "[]" to directly precede the element type
        if (typeText && typeText.endsWith('[]')) {
            const core = typeText.substring(0, typeText.length - 2); // drop []
            const lastBracketPos = core.lastIndexOf(']');
            if (lastBracketPos !== -1) {
                // insert [] right after the last ']'
                return core.substring(0, lastBracketPos + 1) + '[]' + core.substring(lastBracketPos + 1);
            }
        }
        return typeText;
    }

    // true when the printed expression is a single call `Callee(...)` covering the
    // whole string, so its Go type is the callee's return type and nothing else
    isWholePrintedCall(value: string, open: number): boolean {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = open; i < value.length; i++) {
            const c = value[i];
            if (inString) {
                if (escaped) { escaped = false; }
                else if (c === '\\') { escaped = true; }
                else if (c === '"') { inString = false; }
                continue;
            }
            if (c === '"') { inString = true; continue; }
            if (c === '(') { depth++; continue; }
            if (c === ')') {
                depth--;
                if (depth === 0) { return i === value.length - 1; }
            }
        }
        return false;
    }

    // the concrete Go type the initializer already produces, or undefined when the
    // printer cannot name it (GetValue, Ternary, Add, ... return any)
    goTypeOfInitializer(initializer, printedValue: string): string | undefined {
        switch (initializer?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case ts.SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!EvalTruthy(x)`
            return (initializer.operator === ts.SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goTypeOfInitializer(initializer.expression, printedValue);
        case ts.SyntaxKind.BinaryExpression: {
            // `a || b` prints `EvalTruthy(a) || EvalTruthy(b)`, a Go bool
            const op = initializer.operatorToken.kind;
            if ((op === ts.SyntaxKind.BarBarToken) || (op === ts.SyntaxKind.AmpersandAmpersandToken)) {
                return 'bool';
            }
            // `a === b` prints either `IsEqual(a, b)` or an inlined `(a == b)`;
            // `a < b` prints either `IsLessThan(a, b)` or an inlined `(a < b)`.
            // All of them are Go bools.
            if ((op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                || (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
                || (ORDERED_COMPARISON_OPERATORS[op] !== undefined)) {
                return 'bool';
            }
            break;
        }
        }
        let value = printedValue.trim();
        // `const x = (a === b)` prints the wrapping parentheses of the source
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        const open = value.indexOf('(');
        // the native `key in obj` emission is an immediately-called func literal that
        // returns a Go bool, so it needs no EvalTruthy round-trip either
        if (value.startsWith('func() bool {') && value.endsWith('}()')) {
            return 'bool';
        }
        if (open <= 0 || !this.isWholePrintedCall(value, open)) {
            return undefined;
        }
        const callee = value.substring(0, open);
        if (!/^[A-Za-z_][\w.]*$/.test(callee)) {
            return undefined;
        }
        return GO_HELPER_RETURN_TYPES[callee];
    }

    // strips the wrapping parentheses the source (or an operand) printed around a
    // whole expression, so the inner text can be classified
    goUnwrapPrintedParens(printedText: string): string {
        let value = (printedText ?? '').trim();
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        return value;
    }

    // the concrete Go type of a `var x T = <init>` local, undefined for `any`
    goLocalStaticType(node): string | undefined {
        const declaration: any = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        if (declaration.parent?.parent?.kind !== ts.SyntaxKind.FirstStatement) {
            return undefined; // declared with `:=`, where the printer annotates nothing
        }
        if (this.goLocalTypeResolution.has(declaration)) {
            return undefined; // the safety scan below prints an expression using this same local
        }
        this.goLocalTypeResolution.add(declaration);
        try {
            return this.getGoLocalType(declaration, this.printNode(declaration.initializer, 0));
        } finally {
            this.goLocalTypeResolution.delete(declaration);
        }
    }

    // `this.<field>` read of a hand-written BaseExchange string field
    goStringFieldStaticType(node, printedText: string): string | undefined {
        const match = /^this\.([A-Za-z_]\w*)$/.exec(this.goUnwrapPrintedParens(printedText));
        if (match === null || GO_STRING_FIELD_NAMES.indexOf(match[1]) < 0) {
            return undefined;
        }
        // a `string | undefined` field prints a nilable Go value, where Add's nil
        // branch is reachable — only a non-optional string is provable
        return this.getChecker().getTypeAtLocation(node).flags === ts.TypeFlags.String ? 'string' : undefined;
    }

    // Go static type of an operand's printed form: 'string', 'int', 'int64' or
    // 'const-int' (untyped integer literal). undefined when the printer cannot name
    // it — a nilable/`any` operand keeps the helper call.
    goOperandStaticType(node, printedText: string): string | undefined {
        switch (node?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.NumericLiteral:
            return /^[0-9]+$/.test(node.text) ? 'const-int' : undefined;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goOperandStaticType(node.expression, this.goUnwrapPrintedParens(printedText));
        case ts.SyntaxKind.BinaryExpression:
            return this.goNativeArithmetic(node)?.goType;
        case ts.SyntaxKind.Identifier:
            return this.goLocalStaticType(node);
        case ts.SyntaxKind.PropertyAccessExpression:
            // `a.length` / `s.replace(...)` print as helper calls, `this.Id` as a field
            return this.goStringFieldStaticType(node, printedText) ?? this.goStringCallStaticType(node, printedText);
        }
        return this.goStringCallStaticType(node, printedText);
    }

    // the Go type the printed expression already produces; '*string' / '*int64'
    // helpers box a nilable pointer, so those keep the helper call as well
    goStringCallStaticType(node, printedText: string): string | undefined {
        // the operator needs the printed expression's *static* Go type. A helper whose
        // Go signature returns `any` (GetValue, Ternary, ...) prints an interface box even
        // when a classifier can name the value inside it — that value only becomes
        // typed through an assertion at a declaration, never inline as an operand.
        if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
            return undefined;
        }
        const goType = this.goTypeOfInitializer(node, printedText);
        return ('string' === goType || 'int' === goType || 'int64' === goType) ? goType : undefined;
    }

    isNonZeroIntegerLiteral(node): boolean {
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.isNonZeroIntegerLiteral(node.expression);
        }
        return node?.kind === ts.SyntaxKind.NumericLiteral && /^[1-9][0-9]*$/.test(node.text);
    }

    // The bare Go operator must yield the same type the runtime helper returns for
    // the same operands (go/v4/exchange_helpers.go): Add keeps int/int64, while
    // Subtract/Multiply/Divide collapse every integer result to int64 and Mod is
    // float-based, so only the rows below are equivalent.
    goNativeIntResultType(op, leftType: string, rightType: string, rightNode): string | undefined {
        let operands = undefined;
        if (leftType === 'int64' && (rightType === 'int64' || rightType === 'const-int')) {
            operands = 'int64';
        } else if (leftType === 'const-int' && rightType === 'int64') {
            operands = 'int64';
        } else if (leftType === 'int' && (rightType === 'int' || rightType === 'const-int')) {
            operands = 'int'; // Add's int/int branch, the only int-typed helper result
        } else if (leftType === 'const-int' && (rightType === 'int' || rightType === 'const-int')) {
            operands = 'int';
        }
        if (operands === undefined || op === ts.SyntaxKind.PercentToken) {
            return undefined;
        }
        if (op === ts.SyntaxKind.SlashToken && !this.isNonZeroIntegerLiteral(rightNode)) {
            return undefined; // Divide returns nil on a zero divisor, the operator panics
        }
        if (op === ts.SyntaxKind.PlusToken) {
            return operands === 'int64' ? 'int64' : 'int';
        }
        // int64 in, int64 out: Subtract goes through ParseInt, Multiply/Divide use reflect Int()
        return operands === 'int64' ? 'int64' : undefined;
    }

    // an operand that is itself a bare operator expression needs parens under a
    // tighter parent operator; a whole helper call is already delimited
    goNativeOperandText(node, printedText: string): string {
        const text = printedText.trim();
        if (node?.kind !== ts.SyntaxKind.BinaryExpression || text.startsWith('(')) {
            return text;
        }
        const open = text.indexOf('(');
        if (open > 0 && this.isWholePrintedCall(text, open)) {
            return text;
        }
        // `a + b` on strings is the only shape that can never sit under a tighter
        // operator, so it is the only one left unwrapped
        return (this.goOperandStaticType(node, text) === 'string') ? text : '(' + text + ')';
    }

    // `Add(a, b)` & co. become the Go operator when both printed operands already
    // hold a concrete Go type the helper would return unchanged; undefined keeps the
    // helper call (nil branches, `any` boxes, strings passed to Subtract, ...).
    goNativeArithmetic(node, leftText = undefined, rightText = undefined): { goType: string, text: string } | undefined {
        const op = node.operatorToken.kind;
        if (GO_ARITHMETIC_KINDS.indexOf(op) < 0) {
            return undefined;
        }
        leftText = leftText ?? this.printNode(node.left, 0);
        rightText = rightText ?? this.printNode(node.right, 0);
        const leftType = this.goOperandStaticType(node.left, leftText);
        const rightType = this.goOperandStaticType(node.right, rightText);
        if (leftType === undefined || rightType === undefined) {
            return undefined;
        }
        if (leftType === 'string' || rightType === 'string') {
            if (leftType !== 'string' || rightType !== 'string' || op !== ts.SyntaxKind.PlusToken) {
                return undefined; // the other four helpers return nil for strings
            }
            return { 'goType': 'string', 'text': this.goNativeBinaryText(node, '+', leftText, rightText) };
        }
        const goType = this.goNativeIntResultType(op, leftType, rightType, node.right);
        if (goType === undefined) {
            return undefined;
        }
        return { goType, 'text': this.goNativeBinaryText(node, this.SupportedKindNames[op], leftText, rightText) };
    }

    // the operator line gofmt prints for a natively emitted arithmetic expression: the
    // blanks follow go/printer's cutoff at the current depth, and a binary operand is
    // re-printed at the expression's own depth (a same-precedence left operand, or the
    // parentheses the printer wraps it in, which undo the one level the operand adds)
    goNativeBinaryText(node, symbol: string, leftText: string, rightText: string): string {
        const operandText = (operand, printed: string) => {
            const isBinary = operand?.kind === ts.SyntaxKind.BinaryExpression;
            const text = isBinary ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(operand, 0)) : printed;
            return this.goNativeOperandText(operand, text);
        };
        const left = operandText(node.left, leftText);
        const right = operandText(node.right, rightText);
        const separator = this.goBinarySeparator(symbol, right, node.left, node.right);
        return left + separator + symbol + separator + right;
    }

    // `x += y` prints `x = Add(x, y)`; the compound operator is equivalent while
    // both sides hold a concrete Go type that can never make the helper return nil
    goNativeCompoundAssignment(op, leftNode, leftText: string, rightNode, rightText: string): string | undefined {
        const leftType = this.goOperandStaticType(leftNode, leftText);
        const rightType = this.goOperandStaticType(rightNode, rightText);
        if (leftType === undefined || rightType === undefined) {
            return undefined;
        }
        const isAdd = op === ts.SyntaxKind.PlusEqualsToken;
        const isSubtract = op === ts.SyntaxKind.MinusEqualsToken;
        if (!isAdd && !isSubtract) {
            return undefined;
        }
        if (leftType === 'string' && isAdd && rightType === 'string') {
            return `${leftText.trim()} += ${rightText.trim()}`;
        }
        if (leftType !== 'int64') {
            return undefined;
        }
        if (isAdd && (rightType === 'int64' || rightType === 'const-int')) {
            return `${leftText.trim()} += ${rightText.trim()}`;
        }
        if (isSubtract && (rightType === 'int64' || rightType === 'const-int')) {
            return `${leftText.trim()} -= ${rightText.trim()}`;
        }
        return undefined;
    }

    goEnclosingFunction(node) {
        let current = node?.parent;
        while (current) {
            switch (current.kind) {
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
            case ts.SyntaxKind.Constructor:
            case ts.SyntaxKind.SourceFile:
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }

    // a transpiled parameter or local can literally be named `string`, which would
    // turn `var x string = ...` into a reference to that value instead of the type
    goTypeNameIsShadowed(scope, goType: string): boolean {
        const names = goType.match(/[A-Za-z_]\w*/g) ?? [];
        const relevant = names.filter((n) => GO_TYPE_NAMES.indexOf(n) >= 0);
        if (relevant.length === 0 || scope === undefined) {
            return false;
        }
        let shadowed = false;
        const visit = (n) => {
            if (shadowed) { return; }
            const isBinding = (n.kind === ts.SyntaxKind.Parameter) || (n.kind === ts.SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === ts.SyntaxKind.Identifier)) {
                if (relevant.indexOf(n.name.escapedText as string) >= 0) { shadowed = true; return; }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return shadowed;
    }

    // reject the refinement when something downstream needs the local to stay `any`:
    // `x.push(v)` prints `AppendToArray(&x, v)` (a *T is not a *any) and a later
    // assignment of a value with another concrete type would stop compiling
    goLocalIsSafeToType(scope, declaration, varName: string, goType: string): boolean {
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        const visit = (n) => {
            if (!safe) { return; }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === varName) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === ts.SyntaxKind.PropertyAccessExpression && parent.expression === n
                    && parent.name?.escapedText === 'push') {
                    safe = false; // AppendToArray(&x, ...)
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === ts.SyntaxKind.PostfixUnaryExpression) || (parent?.kind === ts.SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === ts.SyntaxKind.PlusPlusToken) || (op === ts.SyntaxKind.MinusMinusToken)) {
                        safe = false;
                        return;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.SpreadElement) {
                    safe = false; // `x...` only forwards a slice whose element type matches
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression
                    && parent.parent?.kind === ts.SyntaxKind.BinaryExpression
                    && parent.parent.left === parent
                    && parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    safe = false; // [x, y] = f() destructures into `x = GetValue(...)`
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === ts.SyntaxKind.EqualsToken) {
                        if (this.goTypeOfInitializer(parent.right, this.printNode(parent.right, 0)) !== goType) {
                            safe = false;
                            return;
                        }
                    } else if ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment)) {
                        safe = false;
                        return;
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    getGoLocalType(declaration, parsedValue: string): string {
        const goType = this.goTypeOfInitializer(declaration.initializer, parsedValue);
        if (goType === undefined) {
            return 'any';
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`type` is renamed to `typeVar` on the way out)
        const sourceName = declaration.name?.escapedText;
        if (sourceName === undefined) {
            return 'any';
        }
        const scope = this.goEnclosingFunction(declaration);
        if (this.goTypeNameIsShadowed(scope, goType) || !this.goLocalIsSafeToType(scope, declaration, sourceName, goType)) {
            return 'any';
        }
        return goType;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        // const varToken = this.VAR_TOKEN ? this.VAR_TOKEN + " ": "";
        // const name = declaration.name.escapedText;

        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            // gofmt drops every redundant statement terminator: Go statements are
            // newline-separated, so the joins below must not emit ';'
            let arrayBindingStatement =  `${this.getIden(identation)}${syntheticName} := ${this.printNode(declaration.initializer, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const statement = this.getIden(identation) + `${e} := GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (declaration?.initializer?.kind=== ts.SyntaxKind.AwaitExpression) {
            const parsedName = this.printNode(declaration.name, 0);
            // the awaited call can carry a multi-line literal argument: printing it at the
            // declaration's own level keeps that literal one level deeper
            const parsedInitializer = this.printNode(declaration.initializer, identation);
            return `
${this.getIden(identation)}${parsedName} := ${parsedInitializer}
${this.getIden(identation)}PanicOnError(${parsedName})`;

        }

        const isNew = declaration.initializer && (declaration.initializer.kind === ts.SyntaxKind.NewExpression);

        const parsedValue = (declaration.initializer) ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;

        if (parsedValue === this.UNDEFINED_TOKEN) {
            return this.getIden(identation) + "var " + this.printNode(declaration.name) + " any = " + parsedValue;
        }

        if (node?.parent?.kind === ts.SyntaxKind.FirstStatement) {
            if (isNew) {
                return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue;
            }
            const varName = this.printNode(declaration.name);
            const declaredType = this.getGoLocalType(declaration, parsedValue);
            // an initializer printed at the declaration's own level (parenthesized expression,
            // helper call) carries that indentation; gofmt puts one space after `=`
            const stm = this.getIden(identation) + "var " + varName + " " + declaredType + " = " + parsedValue.trimStart();
            if (parsedValue.startsWith("<-this.callInternal(")) {
                return `
${stm}
${this.getIden(identation)}PanicOnError(${varName})`;
            }
            return stm;
        }

        return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue.trim();
    }

    // printObjectLiteralExpression(node, identation) {
    //     const objectCreation = 'make(map[string]any) {';
    //     let formattedObjectBody = '{}';
    //     if (node.properties?.length > 0) {
    //         const objectBody = this.printObjectLiteralBody(node, identation);
    //         formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
    //     }
    //     // return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    //     return objectCreation + formattedObjectBody;
    // }

    // printObjectLiteralBody(node, identation) {
    //     let objectName = node.parent?.name?.escapedText;
    //     if (objectName === undefined) {
    //         objectName = "object";
    //     }
    //     const body =  node.properties.map((p) => `${this.getIden(identation)}${objectName}["${node.properties[0].name.text}"] = ${p.initializer.text}` ).join("\n");
    //     return body;
    // }

    // F09 — gofmt aligns the key/value columns inside multi-line composite literals.
    //
    // go/printer's exprList prints a single-line `key: value` entry as `key:` + vtab, so
    // every consecutive single-line entry of a literal body lands in one text/tabwriter
    // column block: the value starts after the widest key cell of that block (`"key":`,
    // the key plus its colon) and one space of padding. An entry whose value spans lines
    // carries no vtab cell, so it ends the block on both sides, exactly like a blank line
    // does. exprList also writes a formfeed — turned into a plain newline by the trimmer,
    // so it never shows up in the output — before an entry that opens a new alignment
    // section: that happens when the entry or its predecessor does not fit on a single
    // line, and when the key size ratio against the geometric mean of the previous key
    // sizes of the section reaches r = 2.5 (or drops to 1/r) while at least one of the
    // two keys is larger than smallSize = 40 bytes; keys of at most 40 bytes always keep
    // the section aligned. A trailing comment is one more tabwriter cell, so comments
    // line up after the widest `value,` cell of the run of consecutive commented entries.
    printObjectLiteralBody(node, identation) {
        // composite literal elements are printed at depth 1 again (go/printer exprList(..., 1, ...));
        // a literal nested in an entry's value is laid out relative to that entry
        const previousLevel = this.goStatementLevel;
        this.goStatementLevel = identation + 1;
        try {
            const entries = node.properties.map((p) => this.goWithExprDepth(1, () => this.printNode(p, identation + 1)));
            return this.alignGoCompositeEntries(entries).join("\n");
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // Applies the gofmt column alignment to already-printed `key: value` entries (the
    // entries must not carry the separating comma). Reused by the hand-written composite
    // literals in ccxt's build/goTranspiler.ts, which do not go through this printer.
    alignGoCompositeEntries(entries) {
        const parsedEntries = entries.map((entry) => this.parseGoCompositeEntry(entry));
        const paddings = this.getGoCompositePaddings(parsedEntries);
        return entries.map((entry, index) => this.renderGoCompositeEntry(entry, parsedEntries[index], paddings[index]));
    }

    // `        "key": value, // comment` -> the pieces gofmt's tabwriter aligns.
    // Returns undefined for anything that is not a plain `key: value` entry (a spread, a
    // method, a computed key): the caller then leaves that entry alone and ends the block.
    parseGoCompositeEntry(entry) {
        const newlineIndex = entry.indexOf("\n");
        const firstLine = newlineIndex === -1 ? entry : entry.slice(0, newlineIndex);
        const keyMatch = /^([ \t]*)("(?:[^"\\]|\\.)*"): /.exec(firstLine);
        if (keyMatch === null) {
            return undefined;
        }
        const singleLine = newlineIndex === -1;
        // for a multi-line entry only the trailing comment of its last line matters here
        const tail = singleLine ? entry.slice(keyMatch[0].length) : entry.slice(entry.lastIndexOf("\n") + 1);
        const commentIndex = this.findGoTrailingCommentStart(tail);
        return {
            'indent': keyMatch[1],
            'key': keyMatch[2],
            // nodeSize() measures the printed key; a value that spans lines gets size 0
            'size': singleLine ? this.getGoByteLength(keyMatch[2]) : 0,
            'singleLine': singleLine,
            'value': singleLine ? (commentIndex === -1 ? tail : tail.slice(0, commentIndex)).trimEnd() : undefined,
            'comment': commentIndex === -1 ? undefined : tail.slice(commentIndex).trimEnd(),
        };
    }

    // Index of the trailing comment of a printed line, or -1. `//` or `/*` inside a string
    // or a rune literal (e.g. a "https://…" value) is not a comment.
    findGoTrailingCommentStart(line) {
        let quote;
        for (let index = 0; index < line.length; ++index) {
            const character = line[index];
            if (quote !== undefined) {
                if (character === "\\" && quote !== "`") {
                    index += 1;
                } else if (character === quote) {
                    quote = undefined;
                }
                continue;
            }
            if (character === "\"" || character === "`" || character === "'") {
                quote = character;
            } else if (character === "/" && (line[index + 1] === "/" || line[index + 1] === "*")) {
                return index;
            }
        }
        return -1;
    }

    // {key, comment} space counts per entry, i.e. the padding gofmt's tabwriter inserts.
    // Only entries that are part of a block get a padding; every other entry is rendered
    // as printed (gofmt leaves single-line and multi-line sections untouched).
    getGoCompositePaddings(parsedEntries) {
        // the sectioning below mirrors go/printer's exprList
        const smallSize = 40;
        const ratio = 2.5;
        const paddings = parsedEntries.map(() => undefined);
        let block = [];
        let previousSize = 0;
        let size = 0;
        let lnSum = 0;
        let count = 0;
        const flushBlock = () => {
            if (block.length === 0) {
                return;
            }
            let keyWidth = 1; // widest key cell of the block + one space of padding
            for (const index of block) {
                keyWidth = Math.max(keyWidth, this.getGoRuneLength(parsedEntries[index].key) + 2);
            }
            for (const index of block) {
                paddings[index] = { 'key': keyWidth - this.getGoRuneLength(parsedEntries[index].key) - 1, 'comment': 1 };
            }
            // the comment column only spans the runs of consecutive commented entries
            let run = [];
            const flushRun = () => {
                if (run.length === 0) {
                    return;
                }
                let runWidth = 1; // widest `value,` cell of the run + one space of padding
                for (const index of run) {
                    runWidth = Math.max(runWidth, this.getGoRuneLength(parsedEntries[index].value) + 2);
                }
                for (const index of run) {
                    paddings[index].comment = runWidth - this.getGoRuneLength(parsedEntries[index].value) - 1;
                }
                run = [];
            };
            for (const index of block) {
                if (parsedEntries[index].comment !== undefined) {
                    run.push(index);
                } else {
                    flushRun();
                }
            }
            flushRun();
            block = [];
        };
        for (let index = 0; index < parsedEntries.length; ++index) {
            const entry = parsedEntries[index];
            previousSize = size;
            size = entry !== undefined ? entry.size : 0;
            let sectionBreak = true; // exprList's useFF
            if (previousSize > 0 && size > 0) {
                if (count === 0 || (previousSize <= smallSize && size <= smallSize)) {
                    sectionBreak = false;
                } else {
                    const geomean = Math.exp(lnSum / count);
                    const sizeRatio = size / geomean;
                    sectionBreak = ratio * sizeRatio <= 1 || ratio <= sizeRatio;
                }
            }
            const alignable = entry !== undefined && entry.singleLine;
            if (index > 0 && sectionBreak) {
                // exprList resets the geometric mean accumulation whenever it starts a
                // new section (a formfeed break is two line breaks, nbreaks > 1), so the
                // ratio below is measured against the current section only
                lnSum = 0;
                count = 0;
            }
            if (!alignable || sectionBreak) {
                flushBlock();
            }
            if (alignable) {
                block.push(index);
            }
            if (size > 0) {
                lnSum += Math.log(size);
                count += 1;
            }
        }
        flushBlock();
        return paddings;
    }

    renderGoCompositeEntry(entry, parsed, padding) {
        if (parsed === undefined || !parsed.singleLine || padding === undefined) {
            return this.appendGoTrailingComma(entry);
        }
        const comment = parsed.comment === undefined ? "" : " ".repeat(padding.comment) + parsed.comment;
        return parsed.indent + parsed.key + ":" + " ".repeat(padding.key) + parsed.value + "," + comment;
    }

    // gofmt prints the comma of an entry before its trailing comment (`value, // comment`),
    // the entry text carries the comment last, so move the comma in front of it
    appendGoTrailingComma(entry) {
        const newlineIndex = entry.lastIndexOf("\n");
        const lastLine = newlineIndex === -1 ? entry : entry.slice(newlineIndex + 1);
        const commentIndex = this.findGoTrailingCommentStart(lastLine);
        if (commentIndex === -1) {
            return entry + ",";
        }
        const offset = entry.length - lastLine.length + commentIndex;
        return entry.slice(0, offset).trimEnd() + ", " + entry.slice(offset).trimEnd();
    }

    // text/tabwriter sizes cells in runes, go/printer's nodeSize counts bytes
    getGoRuneLength(text) {
        return [...text].length;
    }

    getGoByteLength(text) {
        let length = 0;
        for (const character of text) {
            const codePoint = character.codePointAt(0);
            length += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
        }
        return length;
    }

    printConstructorDeclaration (node, identation) {
        const classNode = node.parent;
        const className = this.printNode(classNode.name, 0);
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);

        // find super call inside constructor and extract params
        let superCallParams = '';
        let hasSuperCall = false;
        node.body?.statements.forEach(statement => {
            if (ts.isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (ts.isCallExpression(expression)) {
                    const expressionText = expression.expression.getText().trim();
                    if (expressionText === 'super') {
                        hasSuperCall = true;
                        superCallParams = expression.arguments.map((a) => {
                            return this.printNode(a, identation).trim();
                        }).join(", ");
                    }
                }
            }
        });

        if (hasSuperCall) {
            return this.getIden(identation) + className +
                `(${args}) : ${this.SUPER_CALL_TOKEN}(${superCallParams})` +
                constructorBody;
        }

        return this.getIden(identation) +
                className +
                "(" + args + ")" +
                constructorBody;
    }

    printThisElementAccesssIfNeeded(node, identation) {
        // convert this[method] into this.call(method) or this.callAsync(method)
        // const isAsync = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
        const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        // if the call is async or not, so we need to assume it is async
        // example Promise.all([this.unknownPropAsync()])
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            if (elementAccess?.expression?.kind === ts.SyntaxKind.ThisKeyword) {
                let parsedArg = node.arguments?.length > 0 ? this.printNode(node.arguments[0], identation).trimStart() : "";
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                const wrapperOpen = isAsync ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
                const wrapperClose = isAsync ? this.UNKOWN_PROP_ASYNC_WRAPPER_CLOSE : this.UNKOWN_PROP_WRAPPER_CLOSE;
                parsedArg = parsedArg ? ", " + parsedArg : "";
                return wrapperOpen + propName + parsedArg + wrapperClose;
            }
        }
        return;
    }

    printDynamicCall(node, identation) {
        // const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            // the emitted call also carries the property name as its first
            // argument, so a call with arguments is a call with more than one
            // argument and prints them one level deeper
            const argumentDepth = this.goExprDepth + ((node.arguments?.length > 0) ? 1 : 0);
            const parsedArg = node.arguments?.length > 0 ? node.arguments.map(n => this.goWithExprDepth(argumentDepth, () => this.printNode(n, identation).trimStart())).join(", ") : "";
            // const target = this.printNode(elementAccess.expression, 0);
            const propName = this.goWithExprDepth(argumentDepth, () => this.printNode(elementAccess.argumentExpression, 0));
            const argsArray = `${parsedArg}`;
            const open = this.DYNAMIC_CALL_OPEN;
            const statement = `${open}${propName}, ${argsArray})`;
            // statement = isAsync ? `((Task<object>)${statement})` : statement;
            return statement;
        }
        return undefined;
    }


    printElementAccessExpressionExceptionIfAny(node) {
        // Fix malformed Split(...) element access where the index arg is mistakenly placed
        // inside the Split call. We force the correct pattern: GetValue(Split(str, sep), idx)
        const tsKind = ts.SyntaxKind;
        if (node.expression.kind === tsKind.CallExpression) {
            const callExp = node.expression;
            const calleeText = callExp.expression.getText();
            if (calleeText.endsWith('.split') || calleeText.toLowerCase().includes('split')) {
                // print Split call normally (should already close with ))
                let splitCall = this.printNode(callExp, 0).trim();
                if (!splitCall.endsWith(')')) {
                    splitCall += ')';
                }
                const idxArg = this.printNode(node.argumentExpression, 0);
                return `GetValue(${splitCall}, ${idxArg})`;
            }
        }
        // default: no exception
        return undefined;
    }

    printWrappedUnknownThisProperty(node, identation = 0) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            // the emitted call carries the property name as its first argument; arguments
            // print at the call's level so a multi-line literal keeps its nesting
            const argumentDepth = this.goExprDepth + ((node.arguments?.length > 0) ? 1 : 0);
            let parsedArguments = node.arguments?.map((a) => this.goWithExprDepth(argumentDepth, () => this.printNode(a, identation).trimStart())).join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.escapedText;
            // const isAsyncDecl = true;
            // const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
            // const isAsyncDecl = false;
            // const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
            // const close = this.UNKOWN_PROP_WRAPPER_CLOSE;
            // return `${open}"${propName}"${parsedArguments}${close}`;
            const argsArray = `${parsedArguments}`;
            const open = this.DYNAMIC_CALL_OPEN;
            const statement = `${open}"${propName}", ${argsArray})`;
            return statement;
        }
        return undefined;
    }

    transformMethodNameIfNeeded(name: string): string {
        const res = this.unCamelCaseIfNeeded(name);
        return this.capitalize(res);
    }

    transformCallExpressionName(name: string, nameNode = undefined) {
        return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
    }

    transformPropertyAccessExpressionName(name: string, nameNode = undefined) {
        return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const args = node.arguments;

            if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
                const methodName = this.printNode(node.expression.name, 0);
                if (this.wrapThisCalls || (this.wrapCallMethods.includes(methodName))) {
                    let argsParsed = "";
                    if (args.length > 0) {
                        argsParsed = args.map((a) => this.printNode(a, 0)).join(", ");
                        return `<-this.callInternal("${methodName}", ${argsParsed})`;
                    }
                    return `<-this.callInternal("${methodName}")`;
                }
            }

            const expressionText = node.expression.getText().trim();
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                // case "JSON.parse":
                //     return `json_decode(${parsedArg}, $as_associative_array = true)`;
                case "Math.abs":
                    return `mathAbs(${parsedArg})`;
                }
            } else if (args.length === 2)
            {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                    return `mathMin(${parsedArg1}, ${parsedArg2})`;
                case "Math.max":
                    return `mathMax(${parsedArg1}, ${parsedArg2})`;
                case "Math.pow":
                    return `MathPow(${parsedArg1}, ${parsedArg2})`;
                }
            }
            const leftSide = node.expression?.expression;
            const leftSideText = leftSide ? this.printNode(leftSide, 0) : undefined;

            // wrap unknown property this.X calls
            if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) { // double check this
                const res = this.printWrappedUnknownThisProperty(node, identation);
                if (res) {
                    return res;
                }
            }
        }

        // // replace this[method]() calls
        // const thisElementAccess = this.printThisElementAccesssIfNeeded(node, identation);
        // if (thisElementAccess) {
        //     return thisElementAccess;
        // }

        // handle dynamic calls, this[method](A) or exchange[b] (c) using reflection
        if (node.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }


        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return notOperator + `IsString(${target})`;
        case "number":
            return notOperator + `IsNumber(${target})`;
        case "boolean":
            return notOperator + `IsBool(${target})`;
        case "object":
            return notOperator + `IsObject(${target})`;
        case "function":
            return notOperator + `IsFunction(${target})`;
        }

        return undefined;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        // ---------------------------------------------------------------
        // Array destructuring assignment:  [a, b] = foo()
        // Transforms into:
        // __tmpX := foo()
        // a = GetValue(__tmpX, 0)
        // b = GetValue(__tmpX, 1)
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            // const elems = (left.elements as any[]);
            // const returnRandName = "retRes" + this.getLineBasedSuffix(node);
            // const rhs   = this.printNode(right, 0);

            // // build extraction lines
            // const assignments = elems.map((el, idx) => {
            //     const leftName = this.printNode(el, 0);
            //     return `${leftName} = GetValue(${returnRandName}, ${idx})`;
            // }).join(`\n${this.getIden(identation)}`);

            // return `${returnRandName} := ${rhs}\n${this.getIden(identation)}${assignments}`;
            //
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {

                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access assignments:  a[b] = v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // Build GetValue(GetValue( ... )) chain for all but the last key.
            let acc = containerStr;
            for (let i = 0; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            const lastKey = keyStrs[keyStrs.length - 1];
            // the value is printed at the statement's own level so a multi-line object
            // literal (bare, or nested inside a call argument) lands one level deeper with
            // its closing brace at the statement level; the leading indentation is dropped
            const rhs     = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();

            // a single key over a receiver the printer typed itself is plain Go
            // indexing; a nested chain goes through GetValue, which is `any`
            // a native `m[k] = v` is a plain assignment, whose value go/printer prints at
            // the statement's own depth rather than inside the helper's argument list
            const nativeRhs = (right.kind === ts.SyntaxKind.BinaryExpression)
                ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(right, identation)).trimStart()
                : rhs;
            const native = (keyStrs.length === 1)
                ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, nativeRhs)
                : undefined;
            if (native !== undefined) {
                return native;
            }

            return `AddElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access compound assignments:  a[b] += v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.PlusEqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // Build GetValue(GetValue( ... )) chain for all but the last key.
            let acc = containerStr;
            for (let i = 0; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);

            // For +=, we need to get the current value, add to it, then set it back
            const currentValue = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${lastKey}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            const native = (keyStrs.length === 1)
                ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, `Add(${containerStr}[${lastKey}], ${rhs})`)
                : undefined;
            if (native !== undefined) {
                return native;
            }
            const result = `AddElementToObject(${acc}, ${lastKey}, Add(${currentValue}, ${rhs}))`;
            return result;
        }

        if (left.kind === ts.SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        if (op === ts.SyntaxKind.InKeyword) {
            const dictText = this.printNode(right, 0);
            const keyText = this.printNode(left, 0);
            const inlined = this.printInlineInOp(right, left, dictText, keyText);
            if (inlined !== undefined) {
                return inlined;
            }
            return `InOp(${dictText}, ${keyText})`;
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            // both operands end up in the two-argument helper call below (or in the
            // `Add(x, y)` on the right of the compound assignment), i.e. one level
            // deeper than the expression itself
            const operandDepth = this.goExprDepth + 1;
            const leftText = this.goWithExprDepth(operandDepth, () => this.printNode(left, 0));
            const rightText = this.goWithExprDepth(operandDepth, () => this.printNode(right, 0));

            const nativeAssignment = this.goNativeCompoundAssignment(op, left, leftText, right, rightText);
            if (nativeAssignment !== undefined) {
                return nativeAssignment;
            }

            if (op === ts.SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Add(${leftText}, ${rightText})`;
            }

            if (op === ts.SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            if (ORDERED_COMPARISON_OPERATORS[op] !== undefined) {
                const inlined = this.printInlineOrderedComparison(left, right, leftText, rightText, op);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            const nativeArithmetic = this.goNativeArithmetic(node, leftText, rightText);
            if (nativeArithmetic !== undefined) {
                return nativeArithmetic.text;
            }
            return `${open}${leftText}, ${rightText}${close}`;
        }

        // x = y
        // cast y to x type when y is unknown
        // if (op === ts.SyntaxKind.EqualsToken) {
        //     const leftType = this.getChecker().getTypeAtLocation(left);
        //     const rightType = this.getChecker().getTypeAtLocation(right);

        //     if (this.isAnyType(rightType.flags) && !this.isAnyType(leftType.flags)) {
        //         // const parsedType = this.getTypeFromRawType(leftType);
        //         return `${leftText} = ${rightText}`;
        //     }
        // }

        return undefined;
    }

    // the scalar family the TypeScript type of an operand belongs to: 'string',
    // 'int', 'float', 'bool', 'nil' for the undefined/null literals, or undefined
    // when the type is any/unknown/a union of several families
    goScalarFamily(node): string | undefined {
        // TypeScript narrows `x !== undefined && x === 'v'` to `string`, but the Go
        // local is still the `any` box the declaration printed; when that box holds
        // a *T helper result, `==` against a string is never true in Go
        if (node?.kind === ts.SyntaxKind.Identifier && this.goDeclaredTypeOfIdentifier(node) === undefined) {
            let decl;
            try {
                decl = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
            } catch (e) {
                decl = undefined;
            }
            if (this.goAnyLocalHoldsPointer(decl)) {
                return undefined;
            }
        }
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
        return this.goScalarFamilyOfType(type);
    }

    // the scalar family the TypeScript type of an operand belongs to, where a
    // `string | undefined` union still counts as 'string': the Go box holds that
    // scalar or nil, and both `x == nil` and `x == "lit"` are then the same
    // predicate as the helper. Numbers are excluded by the caller.
    goScalarFamilyWithNil(node): string | undefined {
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
        return this.goScalarFamilyOfType(type, true);
    }

    // the callee name of a printed call, e.g. `this.SafeDict(x, 0, {})` → `this.SafeDict`
    goPrintedCallee(printedValue: string): string | undefined {
        let value = printedValue.trim();
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        const open = value.indexOf('(');
        if (open <= 0 || !this.isWholePrintedCall(value, open)) {
            return undefined;
        }
        const callee = value.substring(0, open);
        return /^[A-Za-z_][\w.]*$/.test(callee) ? callee : undefined;
    }

    // true when this expression prints to an interface (`any`) box: a parameter, a
    // local the printer left `any`, or one of the helpers whose Go signature returns
    // `any`. A *T / scalar local or call is not a box and keeps its own rule.
    goIsAnyBoxExpression(node, printedText: string): boolean {
        if (node?.kind === ts.SyntaxKind.Identifier) {
            let symbol;
            try {
                symbol = this.getChecker().getSymbolAtLocation(node);
            } catch (e) {
                return false;
            }
            const decl = symbol?.valueDeclaration;
            const isBinding = (decl?.kind === ts.SyntaxKind.Parameter)
                || (decl?.kind === ts.SyntaxKind.VariableDeclaration);
            if (!isBinding) {
                return false;
            }
            // the printer names a Go type for this local/`:=` initializer, so the
            // value is not behind an interface
            if (this.goDeclaredTypeOfIdentifier(node) !== undefined) {
                return false;
            }
            // an `any` local initialised from a *T helper (`var x any = this.SafeString(…)`)
            // boxes the pointer itself: a nil *string inside `any` is not `== nil` in Go,
            // so only the deref-aware helper compares it correctly
            return !this.goAnyLocalHoldsPointer(decl);
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            if (this.goTypeOfInitializer(node, printedText) !== undefined) {
                return false; // a *T or a scalar the printer can name
            }
            return GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0;
        }
        return false;
    }

    // true when an `any`-typed local can hold a *T helper result: its initializer or a
    // later `x = …` write is a `this.safeX(…)` call whose Go signature returns a pointer
    goAnyLocalHoldsPointerCache = new Map<any, boolean>();
    goAnyLocalHoldsPointer(decl): boolean {
        if (decl?.kind !== ts.SyntaxKind.VariableDeclaration || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (this.goAnyLocalHoldsPointerCache.has(decl)) {
            return this.goAnyLocalHoldsPointerCache.get(decl);
        }
        // the callee is read from the AST, never printed: printing an operand would
        // re-enter the equality classifier that asks this question
        const isPointerInit = (expr): boolean => {
            while (expr?.kind === ts.SyntaxKind.ParenthesizedExpression) {
                expr = expr.expression;
            }
            if (expr?.kind !== ts.SyntaxKind.CallExpression) {
                return false;
            }
            const callee = expr.expression;
            if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
                return false;
            }
            const name = callee.name?.escapedText;
            if (typeof name !== 'string' || name.length === 0) {
                return false;
            }
            const goType = GO_HELPER_RETURN_TYPES['this.' + name.charAt(0).toUpperCase() + name.substring(1)];
            return (typeof goType === 'string') && goType.startsWith('*');
        };
        let holds = isPointerInit(decl.initializer);
        if (!holds) {
            const name = decl.name.escapedText;
            const scope = this.goEnclosingFunction(decl);
            const visit = (n) => {
                if (holds) { return; }
                if (n.kind === ts.SyntaxKind.BinaryExpression && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
                    && n.left?.kind === ts.SyntaxKind.Identifier && n.left.escapedText === name && isPointerInit(n.right)) {
                    holds = true;
                    return;
                }
                ts.forEachChild(n, visit);
            };
            if (scope !== undefined) {
                ts.forEachChild(scope, visit);
            }
        }
        this.goAnyLocalHoldsPointerCache.set(decl, holds);
        return holds;
    }

    goScalarFamilyOfType(type, allowNil = false): string | undefined {
        if (type === undefined) {
            return undefined;
        }
        // Str/Int/Num/Bool are nullable aliases of `string | undefined` & friends;
        // their Go representation is still `any`, so they never inline — unless the
        // caller is asking about the value the `any` box holds (allowNil)
        const alias = type.aliasSymbol?.escapedName;
        if (!allowNil) {
            switch (alias) {
            case 'Str':
            case 'Int':
            case 'Num':
            case 'Bool':
                return undefined;
            }
        }
        const flags = type.flags;
        if (flags & ts.TypeFlags.Union) {
            const families = new Set<string>();
            for (const member of type.types) {
                const family = this.goScalarFamilyOfType(member, allowNil);
                if (family === undefined) {
                    return undefined;
                }
                // `string | undefined` is `any` in Go, never a bare Go string:
                // one nullable member disqualifies the whole union
                if (family === 'nil') {
                    if (allowNil) {
                        continue; // the box holds nil for that member
                    }
                    return undefined;
                }
                families.add(family);
            }
            if (families.size !== 1) {
                return undefined; // `boolean` is `true | false`, so size === 1
            }
            return families.values().next().value;
        }
        if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
            return 'number';
        }
        if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
            return 'bool';
        }
        if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) {
            return 'nil';
        }
        return undefined;
    }

    // the Go type this identifier is actually *declared* with, or undefined when it
    // stays `any`. It goes through getGoLocalType, not goTypeOfInitializer, so a
    // declaration the reject filters demoted back to `any` is reported as `any` here
    // too — otherwise we would emit `*x` against an `any` box.
    // Parameters stay `any` today, so they never resolve to a concrete type.
    //
    // getGoLocalType re-prints every reassignment's right-hand side, and printing a
    // ternary re-enters printCondition, which lands back here: `x = (x === 'a') ? …`
    // would recurse forever. The in-progress set breaks that cycle by answering
    // `any` for the declaration currently being classified, and the cache keeps the
    // per-occurrence cost at one scope scan per declaration.
    goDeclaredTypeCache = new Map<any, string | undefined>();
    goDeclaredTypeInProgress = new Set<any>();

    goDeclaredTypeOfIdentifier(node): string | undefined {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
        const decl = symbol?.valueDeclaration;
        if (decl === undefined || decl.kind !== ts.SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        if (decl.initializer === undefined || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        if (this.goDeclaredTypeCache.has(decl)) {
            return this.goDeclaredTypeCache.get(decl);
        }
        if (this.goDeclaredTypeInProgress.has(decl)) {
            return undefined;
        }
        this.goDeclaredTypeInProgress.add(decl);
        let goType;
        try {
            goType = this.getGoLocalType(decl, this.printNode(decl.initializer, 0));
        } finally {
            this.goDeclaredTypeInProgress.delete(decl);
        }
        const result = (goType === 'any') ? undefined : goType;
        this.goDeclaredTypeCache.set(decl, result);
        return result;
    }

    // true when this identifier's Go type is a pointer we can deref (*string / *int64 / …)
    goIsPointerIdentifier(node): boolean {
        const goType = this.goDeclaredTypeOfIdentifier(node);
        return (typeof goType === 'string') && goType.startsWith('*');
    }

    // the Go pointer type an *expression* evaluates to, or undefined. Covers both a
    // local declared `var x *string = …` and a direct `this.SafeString(...)` call,
    // whose Go signature returns a pointer even though TypeScript says `string`.
    goPointerTypeOfExpression(node, printedText: string): string | undefined {
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if ((typeof declared === 'string') && declared.startsWith('*')) {
            return declared;
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            const goType = this.goTypeOfInitializer(node, printedText);
            if ((typeof goType === 'string') && goType.startsWith('*')) {
                return goType;
            }
        }
        return undefined;
    }

    // the concrete Go type a `x[k] = v` receiver is declared with, when the printer
    // can name it: a local it typed itself, or a whole call whose Go return type it
    // knows. Everything else is an `any` box, and indexing an `any` in Go needs a
    // type assertion, so those keep the runtime helper.
    goElementAssignmentContainerType(node, printedText: string): string | undefined {
        const declared = this.goDeclaredTypeOfIdentifier(node);
        if ((declared === 'map[string]any') || (declared === '[]any')) {
            return declared;
        }
        if (node?.kind === ts.SyntaxKind.CallExpression) {
            const known = this.goTypeOfInitializer(node, printedText);
            if ((known === 'map[string]any') || (known === '[]any')) {
                return known;
            }
        }
        return undefined;
    }

    // the printed key is a Go string when the printer knows it: a string literal, or
    // an identifier declared `string`. Params, GetValue(...) and string concatenation
    // all print as `any`, which Go refuses as a map key.
    goIsStringKeyExpression(node): boolean {
        if ((node.kind === ts.SyntaxKind.StringLiteral) || (node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return true;
        }
        return this.goDeclaredTypeOfIdentifier(node) === 'string';
    }

    // `[]any` receivers only inline when the index is a literal the slice's own
    // literal initializer covers and nothing rebinds the local: the helper silently
    // ignores an out-of-range index, while Go panics on the assignment.
    goSliceIndexProvablyInRange(node, indexNode): boolean {
        if ((node?.kind !== ts.SyntaxKind.Identifier) || (indexNode?.kind !== ts.SyntaxKind.NumericLiteral)) {
            return false;
        }
        const index = Number(indexNode.text);
        if (!Number.isInteger(index) || (index < 0)) {
            return false;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return false;
        }
        const decl = symbol?.valueDeclaration;
        if (decl === undefined || decl.kind !== ts.SyntaxKind.VariableDeclaration || decl.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const initializer = decl.initializer;
        if (initializer?.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
            return false;
        }
        if (initializer.elements.length <= index) {
            return false;
        }
        return !this.goLocalIsRebound(this.goEnclosingFunction(decl), decl.name);
    }

    // true when the local is rebound anywhere in its function; an element write
    // (`x[k] = v`) leaves the local itself bound, so only the slice header is at stake
    goLocalIsRebound(scope, nameNode): boolean {
        if (scope === undefined) {
            return true;
        }
        const name = nameNode.escapedText;
        let rebound = false;
        const visit = (n) => {
            if (rebound) {
                return;
            }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === name) && (n !== nameNode)) {
                if (this.goRebindingTargetOf(n) !== undefined) {
                    rebound = true;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(scope);
        return rebound;
    }

    // walks up from the identifier to the assignment it targets: `x = …` / `x += …` /
    // `[x, y] = …` / `for (x of …)` rebind the local, `x[k] = v` does not
    goRebindingTargetOf(identifier) {
        let node: any = identifier;
        let parent = node.parent;
        while (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            node = parent;
            parent = parent.parent;
        }
        if ((parent?.kind === ts.SyntaxKind.ForOfStatement) && (parent.initializer === node)) {
            return parent;
        }
        if ((parent?.kind === ts.SyntaxKind.BinaryExpression) && (parent.left === node)) {
            const op = parent.operatorToken.kind;
            if ((op === ts.SyntaxKind.EqualsToken) || ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment))) {
                return parent;
            }
        }
        return undefined;
    }

    // native `container[key] = value` when the receiver's Go type is proved by the
    // printer, otherwise undefined and the caller keeps the runtime helper
    printNativeElementAssignment(containerNode, containerStr: string, keyNode, keyStr: string, valueStr: string): string | undefined {
        const containerType = this.goElementAssignmentContainerType(containerNode, containerStr);
        if (containerType === 'map[string]any') {
            if (!this.goIsStringKeyExpression(keyNode)) {
                return undefined;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        if (containerType === '[]any') {
            if (!this.goSliceIndexProvablyInRange(containerNode, keyNode)) {
                return undefined;
            }
            return `${containerStr}[${keyStr}] = ${valueStr}`;
        }
        return undefined;
    }

    // the concrete Go type an *expression* is printed as: a local's declared type,
    // the return type of a runtime helper call, or a literal. undefined when the value
    // stays inside an `any` box — a native Go operation on an `any` box would not
    // compile, so every rule below falls back to its helper in that case.
    goPrintedTypeOfExpression(node, printedText: string): string | undefined {
        const inner = (node?.kind === ts.SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inner?.kind === ts.SyntaxKind.Identifier) {
            return this.goDeclaredTypeOfIdentifier(inner);
        }
        return this.goTypeOfInitializer(inner, printedText);
    }

    // `x.length` on a value the printer declares as a slice is `len(x)`: Go's len is
    // 0 for a nil slice, exactly like GetArrayLength's `[]T` cases. On a map or an
    // `any` box GetArrayLength answers 0, so only a `[]`-typed value may inline —
    // and only for the slice types the helper itself counts (a []byte would answer 0).
    sliceLengthTypes = [ '[]any', '[]string', '[]int64', '[]float64', '[]bool', '[]int', '[][]any', '[]map[string]any' ];

    printInlineArrayLength(expression, printedText: string): string | undefined {
        if (printedText.includes('\n')) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(expression, printedText);
        if ((typeof goType === 'string') && this.sliceLengthTypes.indexOf(goType) >= 0) {
            return `len(${printedText})`;
        }
        return undefined;
    }

    // Go has no ternary operator. The func literal returns the same branch value the
    // helper would and prints the condition the same way; it evaluates only the branch
    // TypeScript would take, while Ternary receives both already evaluated.
    printInlineTernary(condition: string, whenTrue: string, whenFalse: string): string | undefined {
        if (condition.includes('\n')) {
            return undefined;
        }
        // go/printer never keeps a func literal whose body holds an `if` on one line, and
        // controlClause() strips the parentheses around the `if` condition; the body sits one
        // level below the statement the literal belongs to, `}()` at the statement's level
        const level = this.goStatementLevel;
        const body = this.getIden(level + 1);
        const branch = this.getIden(level + 2);
        return `func() any {\n${body}if ${this.goStripControlClauseParens(condition)} {\n${branch}return ${whenTrue}\n${body}}\n${body}return ${whenFalse}\n${this.getIden(level)}}()`;
    }

    // stripParens() applied to a printed condition text (see goControlClauseParens)
    goStripControlClauseParens(text: string): string {
        for (;;) {
            const inner = this.goEnclosedExpression(text);
            if (inner === undefined) {
                return text;
            }
            text = inner;
        }
    }

    // a multi-line branch (a nested ternary, a composite literal) is laid out relative to
    // the `return` statement that holds it: inside the `if` for whenTrue (two levels below
    // the statement), the literal's body for whenFalse (one level)
    goPrintTernaryBranch(node, levels: number) {
        const previousLevel = this.goStatementLevel;
        this.goStatementLevel = previousLevel + levels;
        try {
            return this.goWithExprDepth(1, () => this.printNode(node, 0));
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // `key in obj` on a Go map[string]any with a string key. The two-value map read is
    // a statement, hence the func literal: a present-but-nil value is ok=true, exactly
    // like InOp's map case. InOp also answers false for a nil/number key and covers
    // sync.Map/orderbook receivers, so anything else keeps the helper.
    printInlineInOp(dictNode, keyNode, dictText: string, keyText: string): string | undefined {
        if (dictText.includes('\n') || keyText.includes('\n')) {
            return undefined;
        }
        if (this.goPrintedTypeOfExpression(dictNode, dictText) !== 'map[string]any') {
            return undefined;
        }
        if (this.goPrintedTypeOfExpression(keyNode, keyText) !== 'string') {
            return undefined;
        }
        // funcBody() keeps the literal on one line while `func() bool` (11 columns) plus
        // the two statements and their `; ` separator fit in 100 columns
        const read = `_, ok := ${dictText}[${keyText}]`;
        if (11 + read.length + 2 + 'return ok'.length <= 100) {
            return `func() bool { ${read}; return ok }()`;
        }
        const level = this.goStatementLevel;
        return `func() bool {\n${this.getIden(level + 1)}${read}\n${this.getIden(level + 1)}return ok\n${this.getIden(level)}}()`;
    }

    // comparison helpers that normalize int/int64/float64 against each other, so a
    // literal operand's Go default type (int) behaves like the int64 OpNeg produces
    comparisonHelpers = [ 'IsEqual', 'IsGreaterThan', 'IsLessThan', 'IsGreaterThanOrEqual', 'IsLessThanOrEqual' ];

    // OpNeg boxes `-val.Int()` / `-val.Float()`, i.e. an int64 or a float64, and nil
    // for anything else. `-x` reproduces that exactly only for an operand that already
    // prints as float64/int64; a Go `int` (or an integer literal) boxes as int instead.
    printInlineOpNeg(node, printedText: string): string | undefined {
        if (printedText.includes('\n')) {
            return undefined;
        }
        const goType = this.goPrintedTypeOfExpression(node.operand, printedText);
        if ((goType === 'float64') || (goType === 'int64')) {
            return `-${printedText}`;
        }
        // a fractional/exponent literal is already a Go float64 constant; an integer
        // literal is only interchangeable where the consumer normalizes the number
        if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(printedText.trim())) {
            if (printedText.includes('.') || /[eE]/.test(printedText)) {
                return `-${printedText}`;
            }
            const parent = node.parent;
            if (parent?.kind === ts.SyntaxKind.CallExpression) {
                const callee = this.printNode(parent.expression, 0);
                if (this.comparisonHelpers.indexOf(callee) >= 0) {
                    return `-${printedText}`;
                }
            }
            // `a > -1` prints as IsGreaterThan(a, …); the relational wrappers all
            // normalise int/int64/float64 the same way the equality helpers do
            if (parent?.kind === ts.SyntaxKind.BinaryExpression) {
                const op = parent.operatorToken.kind;
                if ((op === ts.SyntaxKind.GreaterThanToken) || (op === ts.SyntaxKind.GreaterThanEqualsToken)
                    || (op === ts.SyntaxKind.LessThanToken) || (op === ts.SyntaxKind.LessThanEqualsToken)) {
                    return `-${printedText}`;
                }
            }
        }
        return undefined;
    }

    // JS truthiness of an operand whose Go type the printer knows, expressed with
    // plain Go instead of boxing the value into `EvalTruthy(any)`. Each arm mirrors the
    // matching `EvalTruthy` case exactly, including nil (a nil *T and a nil map are
    // both falsy) — so this is the same predicate, minus the interface round-trip.
    printInlineTruthy(node): string | undefined {
        // every pointer/slice arm below repeats the operand, so only an identifier
        // qualifies; inlining a call would evaluate it twice
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return undefined;
        }
        const goType = this.goDeclaredTypeOfIdentifier(node);
        if (goType === undefined) {
            return undefined;
        }
        const text = this.printNode(node, 0);
        switch (goType) {
        case 'bool':
            return text;
        case 'string':
            return `(${text} != "")`;
        case 'int':
        case 'int64':
        case 'float64':
            return `(${text} != 0)`;
        case '*bool':
            return `(${text} != nil && *${text})`;
        case '*string':
            return `(${text} != nil && *${text} != "")`;
        case '*int':
        case '*int64':
        case '*float64':
            return `(${text} != nil && *${text} != 0)`;
        case '[]string':
        case '[]any':
        case 'map[string]any':
            return `(len(${text}) > 0)`;
        }
        return undefined;
    }

    // the native Go text for a condition operand the printer can type, or undefined
    // when the operand has to go through the truthiness helper. `(x)` is decided on
    // its operand and keeps the source parentheses, so the surrounding operator still
    // parses exactly the same way.
    goNativeCondition(node): string | undefined {
        if (node?.kind === ts.SyntaxKind.Identifier) {
            return this.printInlineTruthy(node);
        }
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            const inner = this.goNativeCondition(node.expression);
            if (inner === undefined) {
                return undefined;
            }
            return (inner.startsWith('(') && this.isWholePrintedCall(inner, 0)) ? inner : `(${inner})`;
        }
        // an expression that already prints a Go `bool` needs no EvalTruthy round-trip:
        // `a || b`, `!x`, `a === b` and the Is*/Precise.String* predicates are all
        // bool-typed, so `EvalTruthy(<bool>)` is the identity function on them
        const printed = this.printNode(node, 0);
        if (this.goTypeOfInitializer(node, printed) === 'bool') {
            return printed;
        }
        return GO_BOOL_FIELDS.has(printed) ? printed : undefined;
    }


    // gofmt prints the condition of every `if`/`for`/`switch` through
    // go/printer/nodes.go controlClause() -> stripParens(): the single outermost,
    // fully enclosing parentheses pair is dropped, and the rule applies again to the
    // enclosed expression while that one is parenthesized as well
    // (`if (x == 1) {` -> `if x == 1 {`, `if ((x == 1)) {` -> `if x == 1 {`).
    // Parentheses survive when the enclosed expression holds an unparenthesized
    // composite literal whose type is a type name, because `if T{} == x {` does not
    // parse. The printer emits text instead of an ast.Expr, so stripParens runs over
    // the printed condition text here.
    goControlClauseParens(node, expression: string): string {
        if (!this.goIsControlClauseCondition(node)) {
            return expression;
        }
        let text = expression;
        for (;;) {
            const inner = this.goEnclosedExpression(text);
            if (inner === undefined) {
                return text;
            }
            text = inner;
        }
    }

    // the expression inside the outermost parentheses pair of `text`, or undefined
    // when `text` is not one fully enclosing pair or gofmt keeps that pair
    goEnclosedExpression(text: string): string | undefined {
        const trimmed = text.trim();
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
            return undefined;
        }
        // `(a) && (b)` opens and closes with a parenthesis, but not the same pair
        if (this.goSkipBalanced(trimmed, 0, '(', ')') !== trimmed.length) {
            return undefined;
        }
        const inner = trimmed.substring(1, trimmed.length - 1).trim();
        if (this.goHasTypeNameCompositeLiteral(inner)) {
            return undefined; // stripParens keeps parentheses protecting a literal
        }
        return inner;
    }

    // the expression a Go `if`/`for`/`switch` statement tests, the only positions
    // gofmt's controlClause() rewrites
    goIsControlClauseCondition(node): boolean {
        const parent = node?.parent;
        switch (parent?.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.SwitchStatement:
            return parent.expression === node;
        case ts.SyntaxKind.ForStatement:
            return parent.condition === node;
        }
        return false;
    }

    // stripParens' ast.Inspect stops at nested parentheses, which protect whatever
    // they enclose, and reports a composite literal whenever its type is a type name
    goHasTypeNameCompositeLiteral(text: string): boolean {
        let index = 0;
        while (index < text.length) {
            const char = text[index];
            if ((char === '"') || (char === '`') || (char === '\'')) {
                index = this.goSkipQuoted(text, index);
                continue;
            }
            if (char === '(') {
                const next = this.goSkipBalanced(text, index, '(', ')');
                if (next < 0) {
                    return false; // unbalanced text cannot be inspected any further
                }
                index = next;
                continue;
            }
            if (char === '{') {
                if (this.goCompositeLitHasTypeName(text, index)) {
                    return true;
                }
                const next = this.goSkipBalanced(text, index, '{', '}');
                if (next < 0) {
                    return false;
                }
                index = next;
                continue;
            }
            index += 1;
        }
        return false;
    }

    // `{` opens a composite literal whose type is a type name when the text in front
    // of it is an ident or a selector chain of idents; `map[string]any{` and `[]any{`
    // are type literals and do not count (isTypeName in go/printer/nodes.go)
    goCompositeLitHasTypeName(text: string, braceIndex: number): boolean {
        let start = braceIndex;
        while (start > 0 && /[A-Za-z0-9_.[\]]/.test(text[start - 1])) {
            start -= 1;
        }
        const typeText = text.substring(start, braceIndex).trim();
        if (['map', 'struct', 'interface', 'func', 'chan'].indexOf(typeText) >= 0) {
            return false;
        }
        return /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(typeText);
    }

    // the index right after the bracket closing the one at `start`, or -1 when the
    // brackets are unbalanced (the printer sees statement fragments, not whole files)
    goSkipBalanced(text: string, start: number, open: string, close: string): number {
        let depth = 0;
        let index = start;
        while (index < text.length) {
            const char = text[index];
            if ((char === '"') || (char === '`') || (char === '\'')) {
                index = this.goSkipQuoted(text, index);
                continue;
            }
            if (char === open) {
                depth += 1;
            } else if (char === close) {
                depth -= 1;
                if (depth === 0) {
                    return index + 1;
                }
            }
            index += 1;
        }
        return -1;
    }

    // the index right after the string, rune or raw string literal opening at `start`
    goSkipQuoted(text: string, start: number): number {
        const quote = text[start];
        let index = start + 1;
        while (index < text.length) {
            const char = text[index];
            if ((char === '\\') && (quote !== '`')) {
                index += 2;
                continue;
            }
            if (char === quote) {
                return index + 1;
            }
            index += 1;
        }
        return text.length;
    }

    // gofmt keeps a comment group that the source separates from the following
    // declaration by a blank line as a free-standing comment; joined to it, it becomes
    // the declaration's doc comment and its indented lines are re-laid out as a code
    // block. The blank line is preserved so the emitted text keeps the source's shape.
    printLeadingComments(node, identation) {
        const printed = super.printLeadingComments(node, identation);
        if (printed.length === 0) {
            return printed;
        }
        const fullText = this.getSrc().getFullText();
        const ranges = ts.getLeadingCommentRanges(fullText, node.pos) ?? [];
        const last = ranges[ranges.length - 1];
        if (last === undefined) {
            return printed;
        }
        const gap = fullText.slice(last.end, node.getStart());
        const detached = (gap.match(/\n/g) ?? []).length > 1;
        return detached ? printed + "\n" : printed;
    }

    // level of the statement being printed: a multi-line composite literal is laid out
    // relative to it (go/printer), whatever level the expression printers hand down
    goStatementLevel = 0;

    // gofmt separates a top-level declaration that carries a comment from the previous
    // declaration by a blank line (go/printer declList: min = 2 when the decl has a doc
    // comment); the file members are joined with a bare newline otherwise
    printSourceFileStatements(node, identation): string {
        // a nested SourceFile print must not inherit the outer file's package list
        const previousPackages = this.goStdlibPackages;
        const previousPlaceable = this.goStdlibImportPlaceable;
        this.goStdlibPackages = [];
        this.goStdlibImportPlaceable = undefined;
        let statements = '';
        let packages: string[] = [];
        try {
            const printed = node.statements.map((m) => this.printNode(m, identation + 1)).filter((st) => st.length > 0);
            statements = printed.map((st, index) => (index > 0 && /^\s*(\/\/|\/\*)/.test(st)) ? "\n" + st : st).join("\n") + "\n".repeat(this.NUM_LINES_END_FILE);
        } finally {
            packages = this.goStdlibPackages;
            this.goStdlibPackages = previousPackages;
            this.goStdlibImportPlaceable = previousPlaceable;
        }
        return this.goStdlibImportPreamble(packages) + statements;
    }

    // Go requires every import declaration before the file's first declaration, so a stdlib
    // reference emitted inside the body needs its `import` in the head of that body; go/printer
    // keeps exactly one blank line between the import and what follows (both orders around a
    // leading comment are gofmt-stable, verified with `gofmt -l`).
    goStdlibImportPreamble(packages: string[]): string {
        if (packages.length === 0) {
            return '';
        }
        return packages.map((name) => `import "${name}"`).join("\n") + "\n\n";
    }

    printNode(node, identation = 0): string {
        if (node !== undefined && ts.isSourceFile(node)) {
            this.className = "undefined";
            return this.printSourceFileStatements(node, identation);
        }
        const isStatement = node !== undefined && ts.isStatement(node) && node.kind !== ts.SyntaxKind.Block;
        const previousLevel = this.goStatementLevel;
        if (isStatement) {
            this.goStatementLevel = identation;
        }
        try {
            const printed = super.printNode(node, identation);
            // the if/for/switch conditions go through here (printCondition resolves the
            // bool and the falsy/truthy paths before printing the node's text)
            return this.goControlClauseParens(node, printed);
        } finally {
            this.goStatementLevel = previousLevel;
        }
    }

    // composite literal body one level deeper than the statement, closing brace at the
    // statement's level; the leading indentation belongs to the enclosing printer
    printObjectLiteralExpression(node, identation) {
        const level = this.goStatementLevel;
        const objectBody = this.printObjectLiteralBody(node, level);
        const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(level) : objectBody;
        return this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    }

    printCondition(node, identation) {
        // `!x` is handled by printPrefixUnaryExpression, which calls back into this
        // method with the operand; let the base class keep that recursion intact
        const native = this.goNativeCondition(node);
        if (native !== undefined) {
            // goNativeCondition prints the operand itself, so the control-clause
            // parens of printNode do not see the parentheses it wraps it in
            return `${this.getIden(identation)}${this.goControlClauseParens(node, native)}`;
        }
        // a native `key in obj` prints as a `func() bool` call, which the type probe
        // above cannot name; it is a Go bool all the same
        const inNode = (node?.kind === ts.SyntaxKind.ParenthesizedExpression) ? node.expression : node;
        if (inNode?.kind === ts.SyntaxKind.BinaryExpression && inNode.operatorToken.kind === ts.SyntaxKind.InKeyword) {
            const inlined = this.printInlineInOp(inNode.right, inNode.left, this.printNode(inNode.right, 0), this.printNode(inNode.left, 0));
            if (inlined !== undefined) {
                const text = (inNode === node) ? inlined : `(${inlined})`;
                return `${this.getIden(identation)}${this.goControlClauseParens(node, text)}`;
            }
        }
        return super.printCondition(node, identation);
    }

    // === / !== inlined to plain Go operators when both sides are concrete Go
    // values or real pointers. Everything else — in particular anything that is
    // still `any` in Go — falls through to the existing IsEqual helper.
    // `(a == b || *a == *b)` is rejected: a nil *T panics on the second clause.
    // Go has no implicit numeric conversion: `*limit == length` does not compile
    // when limit is *int64 and length is int, even though TypeScript calls both
    // `number`. Dereferencing is therefore only safe against an untyped constant
    // (a literal, which adapts to the pointee) or an operand of the very same Go
    // type. Anything else — including any `any` operand — keeps IsEqual.
    goDerefComparableWith(ptrNode, ptrText: string, otherNode): boolean {
        const pointee = this.goPointerTypeOfExpression(ptrNode, ptrText)?.substring(1);
        if (pointee === undefined) {
            return false;
        }
        switch (otherNode?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return pointee === 'string';
        case ts.SyntaxKind.NumericLiteral:
            return (pointee === 'int') || (pointee === 'int64') || (pointee === 'float64');
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return pointee === 'bool';
        }
        const otherType = this.goDeclaredTypeOfIdentifier(otherNode);
        return otherType === pointee;
    }

    printInlineEquality(left, right, leftText: string, rightText: string, isEq: boolean): string | undefined {
        const lPtr = this.goPointerTypeOfExpression(left, leftText) !== undefined;
        const rPtr = this.goPointerTypeOfExpression(right, rightText) !== undefined;
        // the branches below that deref repeat the operand, so they may only be used
        // on an identifier; a `this.SafeString(...)` call would be evaluated twice
        const lRepeatable = (left?.kind === ts.SyntaxKind.Identifier);
        const rRepeatable = (right?.kind === ts.SyntaxKind.Identifier);
        const lFam = this.goScalarFamily(left);
        const rFam = this.goScalarFamily(right);
        if (lFam === 'nil' && rPtr) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        if (rFam === 'nil' && lPtr) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (lPtr && rPtr) {
            const lPointee = this.goPointerTypeOfExpression(left, leftText);
            if (!lRepeatable || !rRepeatable
                || lPointee !== this.goPointerTypeOfExpression(right, rightText)) {
                return undefined; // IsEqual + derefScalar evaluates each side once
            }
            if (isEq) {
                return `(${leftText} == ${rightText} || (${leftText} != nil && ${rightText} != nil && *${leftText} == *${rightText}))`;
            }
            return `(${leftText} != ${rightText} && (${leftText} == nil || ${rightText} == nil || *${leftText} != *${rightText}))`;
        }
        if (lPtr && rFam !== undefined && rFam !== 'nil') {
            if (!lRepeatable || !this.goDerefComparableWith(left, leftText, right)) {
                return undefined;
            }
            return isEq
                ? `(${leftText} != nil && *${leftText} == ${rightText})`
                : `(${leftText} == nil || *${leftText} != ${rightText})`;
        }
        if (rPtr && lFam !== undefined && lFam !== 'nil') {
            if (!rRepeatable || !this.goDerefComparableWith(right, rightText, left)) {
                return undefined;
            }
            return isEq
                ? `(${rightText} != nil && *${rightText} == ${leftText})`
                : `(${rightText} == nil || *${rightText} != ${leftText})`;
        }
        // two definitely-present scalars of the same family: `==` is valid Go and
        // needs no helper. Nullable aliases (Str/Int/Num/Bool) are `any` in Go and
        // returned undefined by goScalarFamily, so they keep IsEqual.
        if (!lPtr && !rPtr && lFam !== undefined && rFam !== undefined
            && lFam !== 'nil' && rFam !== 'nil' && lFam === rFam) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // an operand the printer boxes into `any` whose TypeScript type proves the box
        // holds a scalar or nil: `x === undefined` and `x === 'lit'` are then the same
        // predicate as the helper, without the interface round-trip. Numbers stay on
        // IsEqual: an `any` box may hold int, int64 or float64, and Go compares those
        // by exact width.
        const lNilFam = this.goScalarFamilyWithNil(left);
        const rNilFam = this.goScalarFamilyWithNil(right);
        const lBox = !lPtr && this.goIsAnyBoxExpression(left, leftText);
        const rBox = !rPtr && this.goIsAnyBoxExpression(right, rightText);
        if (lBox && (rFam === 'nil') && (lNilFam !== undefined) && (lNilFam !== 'number')) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (rBox && (lFam === 'nil') && (rNilFam !== undefined) && (rNilFam !== 'number')) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        // a string or bool literal: only a value of that very type is equal in both
        // predicates, so no numeric or nil member can be compared away
        const isLiteral = (node): boolean => {
            switch (node?.kind) {
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            case ts.SyntaxKind.TrueKeyword:
            case ts.SyntaxKind.FalseKeyword:
                return true;
            }
            return false;
        };
        const literalMatchesBox = (boxFam: string | undefined, litNode, litFam: string | undefined): boolean =>
            ((litFam === 'string') || (litFam === 'bool')) && isLiteral(litNode)
            && ((boxFam === litFam) || (boxFam === undefined));
        if (lBox && literalMatchesBox(lNilFam, right, rFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        if (rBox && literalMatchesBox(rNilFam, left, lFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        // two boxes of one non-numeric family: both hold that scalar or nil
        if (lBox && rBox && (lNilFam !== undefined) && (lNilFam !== 'number') && (lNilFam === rNilFam)) {
            return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        return undefined;
    }

    // the Go numeric kind an operand's static type is, or undefined when it stays
    // `any` (unknown helper result, union, pointer box): only a concrete kind can
    // join a comparison the Go compiler accepts
    goOperandNumericKind(node, printedText: string): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === ts.SyntaxKind.Identifier) {
            const declared = this.goDeclaredTypeOfIdentifier(node);
            if (declared !== undefined) {
                return (GO_NUMERIC_KINDS.indexOf(declared) >= 0) ? declared : undefined;
            }
            return this.goLiteralTypedLocalKind(node);
        }
        if (node.kind === ts.SyntaxKind.NumericLiteral) {
            return this.goNumericLiteralKind(node);
        }
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.goOperandNumericKind(node.expression, this.printNode(node.expression, 0));
        }
        const goType = this.goTypeOfInitializer(node, printedText);
        return (goType !== undefined && GO_NUMERIC_KINDS.indexOf(goType) >= 0) ? goType : undefined;
    }

    // a local bound by `:=` takes its Go type from the initializer: an untyped
    // integer constant is `int`, a floating-point one is `float64`. A variable
    // statement prints `var x <type> = …` instead, where the printer already
    // decided the type, so only the `:=` form may be trusted here.
    goLiteralTypedLocalKind(node): string | undefined {
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
        const declaration = symbol?.valueDeclaration;
        if (declaration?.kind !== ts.SyntaxKind.VariableDeclaration || declaration.initializer === undefined) {
            return undefined;
        }
        const declarationList = declaration.parent;
        if (declarationList?.kind !== ts.SyntaxKind.VariableDeclarationList
            || declarationList.parent?.kind === ts.SyntaxKind.FirstStatement) {
            return undefined;
        }
        return this.goNumericLiteralKind(declaration.initializer);
    }

    // an untyped Go constant: the integer forms adopt any numeric kind, the
    // floating-point ones only fit float64
    goNumericLiteralKind(node): string | undefined {
        const text = node?.text;
        if (text === undefined) {
            return undefined;
        }
        if (/^[0-9][0-9_]*$/.test(text) || /^0[xXoObB][0-9a-fA-F_]+$/.test(text)) {
            return 'int';
        }
        if (/^[0-9][.eE]/.test(text)) {
            return 'float64';
        }
        return undefined;
    }

    // a constant only joins a comparison when its value is representable in the
    // other operand's kind: `0.5` is not an int, and neither is 1e400 (infinity)
    goLiteralFitsKind(node, kind: string): boolean {
        const value = Number(node?.text?.replaceAll('_', ''));
        if (!Number.isFinite(value)) {
            return false;
        }
        if (kind === 'float64') {
            return true;
        }
        return Number.isInteger(value) && (Math.abs(value) <= 2147483647);
    }

    // the kind both operands are compared in, or undefined when Go would need a
    // conversion (two different concrete kinds) or the constant does not fit
    goComparisonKind(left, leftKind: string, right, rightKind: string): string | undefined {
        if (leftKind === rightKind) {
            return leftKind;
        }
        if ((left?.kind === ts.SyntaxKind.NumericLiteral) && (right?.kind !== ts.SyntaxKind.NumericLiteral)) {
            return this.goLiteralFitsKind(left, rightKind) ? rightKind : undefined;
        }
        if ((right?.kind === ts.SyntaxKind.NumericLiteral) && (left?.kind !== ts.SyntaxKind.NumericLiteral)) {
            return this.goLiteralFitsKind(right, leftKind) ? leftKind : undefined;
        }
        return undefined;
    }

    // `<` `>` `<=` `>=` between two operands the checker proves to be numbers of the
    // same Go kind is exactly the comparison the helper performs, minus the interface
    // round-trip, so the call carries no information. Everything else — `any` boxes,
    // pointers, mixed kinds, strings — keeps the helper. float64 keeps
    // IsLessThan/IsLessThanOrEqual: the helper answers true whenever an operand is
    // NaN while Go (and JS) answer false, and only those two operators differ.
    printInlineOrderedComparison(left, right, leftText: string, rightText: string, op): string | undefined {
        const operator = ORDERED_COMPARISON_OPERATORS[op];
        if (operator === undefined) {
            return undefined;
        }
        const leftKind = this.goOperandNumericKind(left, leftText);
        const rightKind = this.goOperandNumericKind(right, rightText);
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        // both operands may additionally be checker-typed numbers; that check is
        // implied by the concrete Go kind above and buys nothing
        const kind = this.goComparisonKind(left, leftKind, right, rightKind);
        if (kind === undefined) {
            return undefined;
        }
        if ((kind === 'float64') && ((operator === '<') || (operator === '<='))) {
            return undefined;
        }
        return `(${leftText} ${operator} ${rightText})`;
    }

    // Go's printer never wraps an already parenthesised expression: gofmt prints a
    // ParenExpr whose child is itself a ParenExpr without its own parentheses
    // (`((x))` prints as `(x)`), because the text it is handed is re-parsed that way.
    // Our output is re-parsed exactly like that, so a source parenthesis around an
    // expression that already prints parenthesised -- an inlined comparison, a nested
    // parenthesised expression, an EvalTruthy(...) arm -- must emit the single pair
    // gofmt keeps instead of doubling it.
    printParenthesizedExpression(node, identation) {
        const expression = node.expression;
        if (expression?.kind === ts.SyntaxKind.AsExpression) {
            // transform (this as any) into this, () and as any are not necessary
            return this.getIden(identation) + this.printNode(expression, 0);
        }
        if (expression?.kind === ts.SyntaxKind.ArrowFunction) {
            // ignore arrowFunctions inside parenthesis
            return "";
        }
        // parentheses undo one level of depth (go/printer reduceDepth())
        const printed = this.goWithExprDepth(this.goExprDepth - 1, () => this.printNode(expression, 0));
        if (this.goIsParenthesizedExpression(printed)) {
            return this.getIden(identation) + printed;
        }
        return this.getIden(identation) + this.LEFT_PARENTHESIS + printed + this.RIGHT_PARENTHESIS;
    }

    // true when the printed text is exactly one parenthesised expression: its first
    // `(` closes on the last non-space character. Literals and comments are skipped
    // so a parenthesis inside them cannot unbalance the scan.
    goIsParenthesizedExpression(printed: string): boolean {
        const text = printed.trimStart();
        if (text[0] !== '(') {
            return false;
        }
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if ((c === '/') && (text[i + 1] === '/')) {
                // a trailing line comment belongs to the statement, not to the expression
                return false;
            }
            if ((c === '/') && (text[i + 1] === '*')) {
                const end = text.indexOf('*/', i + 2);
                if (end < 0) {
                    return false;
                }
                i = end + 1;
                continue;
            }
            if ((c === '"') || (c === '\'') || (c === '`')) {
                i = this.goSkipGoLiteral(text, i);
                if (i < 0) {
                    return false;
                }
                continue;
            }
            if (c === '(') {
                depth += 1;
            } else if (c === ')') {
                depth -= 1;
                if (depth === 0) {
                    return text.substring(i + 1).trim().length === 0;
                }
            }
        }
        return false;
    }

    // index of the quote closing the Go string/rune literal that starts at `start`, -1 when unterminated
    goSkipGoLiteral(text: string, start: number): number {
        const quote = text[start];
        for (let i = start + 1; i < text.length; i++) {
            const c = text[i];
            if (c === '\\') {
                i += 1;
                continue;
            }
            if (c === quote) {
                return i;
            }
        }
        return -1;
    }

    // castVariableAssignmentIfNeeded(left, right, identation) {
    //     const leftType = this.getChecker().getTypeAtLocation(left);
    //     const rightType = this.getChecker().getTypeAtLocation(right);

    //     const leftText = this.printNode(left, 0);
    //     const rightText = this.printNode(right, 0);

    //     if (this.isAnyType(rightType.flags) && !this.isAnyType(leftType.flags)) {
    //         const parsedType = this.getTypeFromRawType(leftType);
    //         return `${this.getIden(identation)}${leftText} = (${parsedType})${rightText}`;
    //     }
    //     return undefined;
    // }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as TypeChecker).getTypeAtLocation(expression); // eslint-disable-line
            // this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.isStringType(type.flags) ? `GetLength(${leftSide})` : this.printInlineArrayLength(expression, leftSide) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`; // `(${leftSide}.Cast<object>()).ToList().Count`
            break;
        case 'push':
            rawExpression = `((IList<object>)${leftSide}).Add`;
            break;
            // case 'push':
            //     rawExpression = `(List<object>${leftSide}).Add`s
            //     break;
        }
        return rawExpression;
    }

    printCustomDefaultValueIfNeeded(node) {
        return undefined;
    }

    printFunctionBody(node, identation, wrapInChannel = false) {

        // check if there is any default parameter to initialize
        let functionBody: string;
        const funcParams = node.parameters;
        const initParams = [];
        if (funcParams.length > 0) {
            const body = node.body.statements;
            const first = body.length > 0 ? body[0] : [];
            const remaining = body.length > 0 ? body.slice(1): [];
            let firstStatement = this.printNode(first, identation + 1);

            const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
            let offSetIndex = 0;
            funcParams.forEach((param, i) => {
                const initializer = param.initializer;
                if (initializer) {
                    const index = i + offSetIndex;
                    // index = index < 0 ? 0 : i - 1;
                    const paramName = this.printNode(param.name, 0);
                    initParams.push(`${paramName} := GetArg(optionalArgs, ${index}, ${this.printNode(initializer, 0)})`);
                    initParams.push(`_ = ${paramName}`);
                } else {
                    offSetIndex--;
                }
            });

            if (initParams.length > 0) {
                const defaultInitializers = initParams.map( l => this.getIden(identation+1) + l ).join("\n") + "\n";
                const bodyParts = firstStatement.split("\n");
                const commentPart = bodyParts.filter(line => this.isComment(line));
                const isComment = commentPart.length > 0;
                if (isComment) {
                    // the statement's leading comment must keep the ' * ' continuation-alignment
                    // of printLeadingComments: gofmt re-indents a /* */ block to
                    // `<indent> * text` (printer.stripCommonPrefix + the tab indent), so a bare
                    // trim() here would emit `* text` under the '/**'.
                    const commentPartString = commentPart.map((c) => {
                        const line = c.trim();
                        return this.getIden(identation+1) + (line.startsWith("*") ? " " + line : line);
                    }).join("\n");
                    const firstStmNoComment = bodyParts.filter(line => !this.isComment(line)).join("\n");
                    firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
                } else {
                    firstStatement = defaultInitializers + firstStatement;
                }
            }
            const blockOpen = this.getBlockOpen(identation);
            const blockClose = this.getBlockClose(identation);
            firstStatement = remainingString.length > 0 ? firstStatement + "\n" : firstStatement;
            if (!wrapInChannel) {
                functionBody = blockOpen + firstStatement + remainingString + blockClose;
            } else {
                functionBody = firstStatement + remainingString;
            }
        } else {
            if (!wrapInChannel) {
                functionBody = super.printFunctionBody(node, identation);
            } else {
                functionBody = node.body.statements.map(statement => {
                    // if (statement.kind === ts.SyntaxKind.ReturnStatement) {
                    //     if (statement?.expression) {
                    //         return this.getIden(identation) + "ch <-" + this.printNode(statement.expression) + '\n' + this.getIden(identation) + "return " + this.printNode(statement.expression);
                    //     }
                    // }
                    return this.printNode(statement, identation + 1);
                }).join("\n");

            }
        }
        if (wrapInChannel) {
            // return statement might be inside ifs or other complex statements so we still have to replace them manually :(
            // functionBody = functionBody.replace(/(\s*)return\s+([^\n]+\n?)/g, '$1ch <- $2$1');
            const functionBodySplit = functionBody.split("\n");
            // the body half of the trampoline pair is a flat function body: the statements
            // are already printed at their own level (the `defer` lines below sit at the
            // same level), so no extra indentation level is added here
            const bodyWithIndentationExtraAndNoReturn = functionBodySplit.join("\n");
            let shouldAddLastReturn = true;

            // const bodySplit = bodyWithIndentationExtraAndNoReturn.split("\n");
            const bodySplit = functionBodySplit;
            const lastLine = bodySplit[bodySplit.length - 1];
            if (lastLine.trim().startsWith("return") || lastLine.trim().startsWith("panic")) {
                shouldAddLastReturn = false;
            }

            // Check if the function body ends with a conditional that has returns in all branches
            if (node.body && this.blockEndsWithConditionalReturn(node.body.statements)) {
                shouldAddLastReturn = false;
            }

            const lastReturn = shouldAddLastReturn ? this.getIden(identation+1) + "return nil" : "";

            // This is the *body* half of the trampoline pair (see printAsyncTrampolineBlock):
            //
            //     func (this *Exchange) fetchTickerBody(ch chan any, symbol any) any {
            //         defer close(ch)
            //         defer ReturnPanicError(ch)
            //         ch <- ...
            //         return nil
            //     }
            //
            // It is a plain flat function: the trampoline already `go`es it, so there is no
            // `go func() any {...}()` envelope here, and no channel allocation either — the
            // trampoline owns `ch` and hands it in. The recover lives HERE, on the goroutine
            // that can actually panic, which is why the trampoline's result can stay unnamed.
            const lines = [
                "{",
                `${this.getIden(identation + 1)}defer close(ch)`,
                `${this.getIden(identation + 1)}defer ReturnPanicError(ch)`,
                bodyWithIndentationExtraAndNoReturn,
            ];
            if (lastReturn) {
                lines.push(lastReturn);
            }
            lines.push(`${this.getIden(identation)}}`);
            functionBody = lines.join("\n");

            // to do fix this later
            // we can't pass nil to the channel when we just want to
            // return from the try catch, otherwise the channel will close with nil
            // instead of the proper result
            functionBody = functionBody.replaceAll(/(^\s*)ch\s<-\snil\s+return\snil(\s*\})/gm, "$1return nil$2");

        }

        return functionBody;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        if (expression.startsWith("<-")) {
            return expression;
        }
        return `(<-${expression})`;
    }

    printInstanceOfExpression(node: BinaryExpression, identation: number): string {
        const left = this.printNode (node.left);
        const right = this.printNode (node.right);
        return this.getIden(identation) + `IsInstance(${left}, ${right})`;
    }

    getRandomNameSuffix() {
        return Math.floor(Math.random() * 1000000).toString();
    }

    getLineBasedSuffix(node): string {
        const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        return `${line}${character}`;
    }

    printExpressionStatement(node, identation) {

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }
        if (node.expression.kind !== ts.SyntaxKind.AwaitExpression) {
            return this.stripWhitespaceOnlyLines (super.printExpressionStatement(node, identation));
        }

        const exprStm = this.printNode(node.expression, identation);

        // const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        // console.log(`line: ${line}, character: ${character}`);
        const returnRandName = "retRes" + this.getLineBasedSuffix(node);

        // const expStatement =this.getIden(identation) + exprStm + this.LINE_TERMINATOR;

        const expStatement = `
${this.getIden(identation)}${returnRandName} := ${exprStm}
${this.getIden(identation)}PanicOnError(${returnRandName})`;
        return this.printNodeCommentsIfAny(node, identation, expStatement);
    }

    isInsideAsyncFunction(returnStatementNode) {
        let currentNode = returnStatementNode;

        while (currentNode) {
            // Check if the current node is a function or method
            if (ts.isFunctionDeclaration(currentNode) ||
              ts.isFunctionExpression(currentNode) ||
              ts.isArrowFunction(currentNode) ||
              ts.isMethodDeclaration(currentNode)) {
                return this.isAsyncFunction(currentNode);
            }
            // Move up the tree to the parent node
            currentNode = currentNode.parent;
        }

        // Return false if no async function or method is found
        return false;
    }

    /**
     * Statement that terminates an async (channel returning) function body.
     *
     * The body is the trampoline's sibling method (`go this.fetchTickerBody(ch, ...)`),
     * and the synthetic try/catch closures nest inside it: in both cases `return` leaves
     * a function whose result is a plain `any`, never the channel. The trampoline itself
     * owns the single `return ch`, emitted by printFunctionBody.
     */
    getAsyncReturnStatement(node): string {
        return "return nil";
    }

    printReturnStatement(node, identation) {

        const isAsyncFunction = this.isInsideAsyncFunction(node);
        // if (node?.expression?.kind !== ts.SyntaxKind.AwaitExpression) {
        //     return super.printReturnStatement(node, identation);
        // }
        if (!isAsyncFunction) {
            return super.printReturnStatement(node, identation);
        }

        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const exp =  node.expression;
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();

        // `return nil` only exits the synthetic try/catch closure; at the function's own
        // level the async core has to hand the (named) result channel back instead.
        const returnStatement = this.getAsyncReturnStatement(node);

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }

        if (node?.expression?.kind === ts.SyntaxKind.AwaitExpression) {
            // const returnRandName = "retRes" + this.getRandomNameSuffix();
            const returnRandName = "retRes" + this.getLineBasedSuffix(node.expression);
            // the template's `:= ` already supplies the separator; keep the printed expression
            // flush so the receive reads `retResNNN := (<-this.X())` (gofmt spacing)
            rightPart = rightPart ? rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
            // return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
            // printLeadingComments returns the comment lines with their own indentation and a
            // trailing newline, so the comment is emitted as its own line(s) and the `ch <-`
            // line carries the indentation the comment would otherwise have swallowed.
            return `
${this.getIden(identation)}${returnRandName} := ${rightPart}
${this.getIden(identation)}PanicOnError(${returnRandName})
${leadingComment}${this.getIden(identation)}ch <- ${returnRandName}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
            // ${this.getIden(identation)}return ${returnRandName}`;
        }

        if (rightPart.length === 0) {
            return `\n${this.getIden(identation)}${returnStatement}`;
        }

        return `
${leadingComment}${this.getIden(identation)}ch <- ${rightPart}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
        // ${this.getIden(identation)}return ${rightPart}`;
        // ${this.getIden(identation)}return ${rightPart}`;
    }


    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === ts.SyntaxKind.AnyKeyword) {
            // return `(()${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.StringKeyword) {
            // return `((string)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.ArrayType) {
            // if (type.elementType.kind === ts.SyntaxKind.AnyKeyword) {
            //     return `(IList<object>)(${this.printNode(node.expression, identation)})`;
            // }
            // if (type.elementType.kind === ts.SyntaxKind.StringKeyword) {
            //     return `(IList<string>)(${this.printNode(node.expression, identation)})`;
            // }
        }

        return this.printNode(node.expression, identation);
    }

    printArrayLiteralExpression(node, identation = 0) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        // elements that span lines (object literals, calls carrying one) need the
        // statement's own level so their bodies land one level deeper
        // …but an element is inline after `{`, so any leading indent a printer prepends is trimmed
        // go/printer prints composite literal elements at depth 1 (exprList(..., 1, ...))
        const elements = node.elements.map((e) => this.goWithExprDepth(1, () => this.printNode(e, identation)).trim()).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === ts.SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                const type = this.getFunctionType(first);
                // const parsedType = this.getTypeFromRawType(type);
                // parsedType === "Task" ||
                // to do check this later
                if (type === undefined || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
                    // if (type === undefined) {
                    arrayOpen = "[]any{";
                    // }
                    //  else {
                    //     arrayOpen = "new List<Task<object>> {";
                    // }
                } else {
                    // type = 'object';
                    // check this out later
                    // if (type === 'Task<List<object>>') {
                    //     type = 'Task<object>';
                    // }
                    // if (type === 'string'){
                    //     type = 'object';
                    // }
                    // type =
                    arrayOpen = `[]any{`;
                }
            }
        }

        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printArgsForCallExpression(node, identation) {
        const args = node.arguments;
        let parsedArgs  = "";
        if (false && this.requiresCallExpressionCast && !this.isBuiltInFunctionCall(node?.expression)) { //eslint-disable-line
            const parsedTypes = this.getTypesFromCallExpressionParameters(node);
            const tmpArgs = [];
            args.forEach((arg, index) => {
                const parsedType = parsedTypes[index];
                let cast = "";
                if (parsedType !== "object" && parsedType !== "float" && parsedType !== "int") {
                    cast = parsedType ? `(${parsedType})` : '';
                }
                tmpArgs.push(cast + this.printNode(arg, identation).trim());
            });
            parsedArgs = tmpArgs.join(",");
            return parsedArgs;
        }
        // go/printer prints the arguments of a call with more than one argument
        // one level deeper than the call itself (nodes.go, CallExpr)
        if (node.arguments && node.arguments.length > 1) {
            return this.goWithExprDepth(this.goExprDepth + 1, () => super.printArgsForCallExpression(node, identation));
        }
        return super.printArgsForCallExpression(node, identation);
    }

    // check this out later

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `IsArray(${parsedArg})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `ObjectKeys(${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `ObjectValues(${parsedArg})`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `JsonParse(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `JsonStringify(${parsedArg})`; // make this customizable
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `MathFloor(${parsedArg})`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `MathRound(${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `MathCeil(${parsedArg})`;
    }

    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any) {
        return `IsInt(${parsedArg})`;
    }

    // the base printer prints a method-call argument at the statement's depth; the
    // emitted Go call has two or more arguments, which go/printer lays out one level
    // deeper (a native `a + b` argument then drops its blanks)
    goPrintCallArgument(argument, printedText: string | undefined): string | undefined {
        if (argument?.kind !== ts.SyntaxKind.BinaryExpression || printedText === undefined) {
            return printedText;
        }
        return this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(argument, 0)).trimStart();
    }

    printArrayPushCall(node: CallExpression, identation: number, name: string | undefined = undefined, parsedArg: string | undefined = undefined) {
        let returnValue = '';
        let returnRandName = name;
        parsedArg = this.goPrintCallArgument(node.arguments?.[0], parsedArg);
        // a map/slice index or a GetValue box is not addressable: copy it into a local first
        if (name?.startsWith('GetValue') || /[\]\)]$/.test(name ?? '')) {
            returnRandName = "retRes" + this.getLineBasedSuffix(node);
            returnValue = `${returnRandName} := ${name}\n${this.getIden(identation)}`;
        }
        return  `${returnValue}AppendToArray(&${returnRandName}, ${parsedArg})`;
        // works with:
        //  func AppendToArray(slicePtr *any, element any)
        //  func AppendToArrayValue(slice any, element any) any
        //  func AppendToArraySafe(slice any, element any) any
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Contains(${name}, ${parsedArg})`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    // A native string operation needs every operand to be a printed Go `string` — the helper
    // takes `any` and re-derives the same string at runtime, so a proven operand cannot change
    // the result. A regex literal is never a Go string (its printed text is a pattern, not the
    // value the helper's ToString would produce), so those keep the helper call.
    goNativeStringOperands(operands: any[], texts: string[], expected: string[]): boolean {
        for (let i = 0; i < expected.length; i++) {
            const operand = operands[i];
            if (operand === undefined || operand.kind === ts.SyntaxKind.RegularExpressionLiteral) {
                return false;
            }
            if (this.goOperandStaticType(operand, texts[i]) !== expected[i]) {
                return false;
            }
        }
        return true;
    }

    // the emission entry point: undefined when the file's stdlib import could not be placed
    // (see goStdlibImportIsPlaceable), else the native call text, with the file-level import
    // recorded for printSourceFileStatements
    goNativeStringCall(nativeCall: string): string | undefined {
        if (!this.goStdlibImportIsPlaceable()) {
            return undefined;
        }
        if (this.goStdlibPackages.indexOf('strings') < 0) {
            this.goStdlibPackages.push('strings');
        }
        return nativeCall;
    }

    // The native string calls below need `import "strings"` in front of the file's first
    // declaration. Every ccxt consumer splices the printed body at the head of the file it
    // writes (createGoExchange, the test/example emitters), except the two base sources:
    // build/goTranspiler.ts#transpileBaseMethods drops everything above the `METHODS BELOW THIS
    // LINE` boundary and #transpilePredictionBaseMethods splices the methods after its own struct
    // declaration, so neither can carry the import — those files keep the boxed helper call until
    // the emitter declares the import itself (getGoImports(file)).
    goStdlibImportIsPlaceable(): boolean {
        if (this.goStdlibImportPlaceable === undefined) {
            const source: any = this.getSrc();
            const text: string = source?.getFullText() ?? '';
            this.goStdlibImportPlaceable = !text.includes(METHODS_BOUNDARY_MARKER);
        }
        return this.goStdlibImportPlaceable;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.startsWith (p)` -> strings.HasPrefix
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.HasPrefix(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `StartsWith(${name}, ${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.endsWith (p)` -> strings.HasSuffix
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.HasSuffix(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `EndsWith(${name}, ${parsedArg})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `Trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        // `a.join (sep)` -> strings.Join: only a declared `[]string` receiver can skip the
        // per-element ToString the helper applies to a []any
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['[]string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Join(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Join(${name}, ${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        // `s.split (sep)` -> strings.Split, which keeps JS's empty trailing element
        // ("a," -> ["a", ""]) exactly like the helper's own strings.Split call
        if (parsedArg !== undefined && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0]], [name, parsedArg], ['string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Split(${name}, ${parsedArg})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Split(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `ToString(${name})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Concat(${name}, ${parsedArg})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        // `s.toUpperCase ()` -> strings.ToUpper
        if (this.goNativeStringOperands([node.expression?.expression], [name], ['string'])) {
            const native = this.goNativeStringCall(`strings.ToUpper(${name})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `ToUpper(${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        // `s.toLowerCase ()` -> strings.ToLower
        if (this.goNativeStringOperands([node.expression?.expression], [name], ['string'])) {
            const native = this.goNativeStringCall(`strings.ToLower(${name})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `ToLower(${name})`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `Shift(${name})`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `Reverse(${name})`;
    }

    printPopCall(node, identation, name = undefined) {
        return `Pop(${name}))`;
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        parsedArg = this.goPrintCallArgument(node.arguments?.[0], parsedArg);
        parsedArg2 = this.goPrintCallArgument(node.arguments?.[1], parsedArg2);
        if (parsedArg2 === undefined){
            // return `((string)${name}).Substring((int)${parsedArg})`;
            parsedArg2 = 'nil';
        }
        // return `((string)${name})[((int)${parsedArg})..((int)${parsedArg2})]`;
        return `Slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // JS `replace` with a *string* pattern replaces the first occurrence only, which the
        // boxed helper (ReplaceAll for every argument) cannot express: with all three operands
        // proven strings, emit the count-1 form and the JS semantics exactly.
        if (parsedArg !== undefined && parsedArg2 !== undefined
            && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0], node.arguments?.[1]], [name, parsedArg, parsedArg2], ['string', 'string', 'string'])) {
            const native = this.goNativeStringCall(`strings.Replace(${name}, ${parsedArg}, ${parsedArg2}, 1)`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // `s.replaceAll (a, b)` replaces every occurrence, like the helper
        if (parsedArg !== undefined && parsedArg2 !== undefined
            && this.goNativeStringOperands([node.expression?.expression, node.arguments?.[0], node.arguments?.[1]], [name, parsedArg, parsedArg2], ['string', 'string', 'string'])) {
            const native = this.goNativeStringCall(`strings.ReplaceAll(${name}, ${parsedArg}, ${parsedArg2})`);
            if (native !== undefined) {
                return native;
            }
        }
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `PadEnd(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `PadStart(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printDateNowCall(node, identation) {
        return "DateNow()";
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        // const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        // this.warnIfAnyType(node, type.flags, leftSide, "length");
        return `GetLength(${leftSide})`;
    }

    // printPostFixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
    //         return super.printPostFixUnaryExpression(node, identation);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     const op = this.PostFixOperators[operator]; // todo: handle --
    //     if (op === '--') {
    //         return `postFixDecrement(ref ${leftSide})`;
    //     }
    //     return `postFixIncrement(ref ${leftSide})`;
    // }

    // printPrefixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
    //         return super.printPrefixUnaryExpression(node, identation);
    //     }
    //     if (operator === ts.SyntaxKind.ExclamationToken) {
    //         // not branch check falsy/turthy values if needed;
    //         return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     if (operator === ts.SyntaxKind.PlusToken) {
    //         return `prefixUnaryPlus(ref ${leftSide})`;
    //     } else {
    //         return `prefixUnaryNeg(ref ${leftSide})`;
    //     }
    // }

    printConditionalExpression(node, identation) {
        const condition = this.goWithExprDepth(1, () => this.printCondition(node.condition, 0));
        if (!condition.includes('\n')) {
            const inlined = this.printInlineTernary(condition, this.goPrintTernaryBranch(node.whenTrue, 2), this.goPrintTernaryBranch(node.whenFalse, 1));
            if (inlined !== undefined) {
                return inlined;
            }
        }
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);
        return `Ternary(${condition}, ${whenTrue}, ${whenFalse})`;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `Remove(${object}, ${key})`;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return this.getIden(identation) + 'panic(' + this.printNode(node.expression, 0) + ')' + this.LINE_TERMINATOR;
        }
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            // handle throw new Error (Message)
            // and throw new x[a] (message)
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map(n => this.printNode(n, 0)).join(",") ?? '';
            const newExpression =  this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                // handle throw new X
                const id = expression.expression;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.InterfaceDeclaration ||  l.kind === ts.SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        // return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.escapedText} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        // Go has no statement terminator: the two statements go on
                        // their own lines (gofmt splits `a; b` exactly like this)
                        return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg})\n${this.getIden(identation)}return nil`;
                    }
                }
                return this.getIden(identation) + `panic(${id.escapedText}(${parsedArg}))${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg})`;
            }
            return super.printThrowStatement(node, identation);
        }
        // const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        // const newExpression = node.expression?.expression?.escapedText;
        // // newExpression = newExpression ? newExpression : this.printNode(node.expression.expression, 0); // new Exception or new exact[string] check this out
        // // const args = node.expression?.arguments.map(n => this.printNode(n, 0)).join(",");
        // // const throwExpression = ` ${newToken}${newExpression}${this.LEFT_PARENTHESIS}((string)${args})${this.RIGHT_PARENTHESIS}`;
        // return this.getIden(identation) + this.THROW_TOKEN + throwExpression + this.LINE_TERMINATOR;
    }

    // -----------------------------------------------------------------------
    // gofmt-compatible spacing of the binary expressions this printer emits
    // -----------------------------------------------------------------------
    // go/printer (nodes.go) prints a binary expression with blanks around the
    // operator unless the expression sits deeper than the top level of a
    // statement: binaryExpr() asks cutoff() - which inspects the operator tree
    // through walkBinary() - and drops *both* blanks when the operator
    // precedence is below that cutoff. Level 4/5 operators (`+ - * / % & | ^
    // << >>`) therefore print as `a + b` at the top level but as `a+b`, `a[i+1]`
    // one level down; comparisons and `&&`/`||` (level 3 and below) always keep
    // their blanks.
    //
    // goExprDepth mirrors the depth go/printer tracks over the Go AST it is
    // about to emit: 1 at the start of every statement, +1 for an argument list
    // with more than one argument, +1 for an index expression, +1 for the right
    // operand of a binary expression, -1 inside parentheses (never below 1), and
    // back to 1 for composite literal elements.
    goExprDepth = 1;

    goWithExprDepth<T>(depth: number, callback: () => T): T {
        const previous = this.goExprDepth;
        this.goExprDepth = depth < 1 ? 1 : depth;
        try {
            return callback();
        } finally {
            this.goExprDepth = previous;
        }
    }

    // go/token precedence of the operators this printer can print natively
    // (5 `* / % << >> & &^`, 4 `+ - | ^`, 3 comparisons, 2 `&&`, 1 `||`)
    goOperatorPrecedence(operator: string): number {
        switch (operator) {
        case '*': case '/': case '%': case '<<': case '>>': case '&': case '&^':
            return 5;
        case '+': case '-': case '|': case '^':
            return 4;
        case '==': case '!=': case '<': case '<=': case '>': case '>=':
            return 3;
        case '&&':
            return 2;
        case '||':
            return 1;
        }
        return 0;
    }

    // the operator string a node is printed as when it stays a Go binary
    // expression, or undefined when the node becomes a helper call or is not
    // binary at all - a primary expression, which walkBinary() never looks into
    goNativeBinaryOperator(node): string | undefined {
        if (!node || !ts.isBinaryExpression(node)) {
            return undefined;
        }
        const kind = node.operatorToken.kind;
        if (kind === ts.SyntaxKind.EqualsToken || kind === ts.SyntaxKind.PlusEqualsToken ||
            kind === ts.SyntaxKind.MinusEqualsToken || kind === ts.SyntaxKind.InKeyword ||
            kind === ts.SyntaxKind.InstanceOfKeyword || kind in this.binaryExpressionsWrappers) {
            return undefined;
        }
        const operator = this.SupportedKindNames[kind];
        return this.goOperatorPrecedence(operator) > 0 ? operator : undefined;
    }

    // walkBinary(): has4 / has5 / maxProblem of the operator tree that is about
    // to be printed. Operands that stay binary expressions are walked, every
    // other operand is a primary expression and stops the walk - the same
    // boundary go/printer draws for parens and calls.
    goWalkBinary(operator: string, left, right, rightText: string) {
        const precedence = this.goOperatorPrecedence(operator);
        let has4 = precedence === 4;
        let has5 = precedence === 5;
        let maxProblem = 0;
        const leftOperator = this.goNativeBinaryOperator(left);
        if (leftOperator !== undefined && this.goOperatorPrecedence(leftOperator) >= precedence) {
            const info = this.goWalkBinary(leftOperator, left.left, left.right, '');
            has4 = has4 || info.has4;
            has5 = has5 || info.has5;
            maxProblem = Math.max(maxProblem, info.maxProblem);
        }
        const rightOperator = this.goNativeBinaryOperator(right);
        if (rightOperator !== undefined && this.goOperatorPrecedence(rightOperator) > precedence) {
            const info = this.goWalkBinary(rightOperator, right.left, right.right, '');
            has4 = has4 || info.has4;
            has5 = has5 || info.has5;
            maxProblem = Math.max(maxProblem, info.maxProblem);
        } else if (rightOperator === undefined) {
            // `/*`, `&&`, `&^` and the `+ +` / `- -` pairs must keep a blank so
            // that the two tokens cannot glue into a different operator
            const pair = operator + rightText.replace(/^[ \t]+/, '').slice(0, 1);
            if (pair === '/*' || pair === '&&' || pair === '&^') {
                maxProblem = 5;
            } else if (pair === '++' || pair === '--') {
                maxProblem = Math.max(maxProblem, 4);
            }
        }
        return { has4, has5, maxProblem };
    }

    // the separator gofmt puts around a natively printed operator: `' '` keeps
    // the blanks, `''` drops them (go/printer cutoff())
    goBinarySeparator(operator: string, rightText: string, left, right): string {
        const precedence = this.goOperatorPrecedence(operator);
        if (precedence < 4) {
            // level 3 and below always keep both blanks
            return ' ';
        }
        const { has4, has5, maxProblem } = this.goWalkBinary(operator, left, right, rightText);
        let cutoff;
        if (maxProblem > 0) {
            cutoff = maxProblem + 1;
        } else if (has4 && has5) {
            cutoff = this.goExprDepth === 1 ? 5 : 4;
        } else {
            cutoff = this.goExprDepth === 1 ? 6 : 4;
        }
        return precedence < cutoff ? ' ' : '';
    }

    printBinaryExpression(node, identation) {

        const {left, right, operatorToken} = node;

        const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
        if (customBinaryExp) {
            return customBinaryExp;
        }

        if (operatorToken.kind == ts.SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
        }

        if (operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            // handle test['a'] = 1;
            const elementAccess = left;
            const rightSide = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, 0));
            if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                const leftSide = this.printNode(elementAccess.expression, 0);
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                const value = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();
                const native = this.printNativeElementAssignment(elementAccess.expression, leftSide, elementAccess.argumentExpression, propName, value);
                if (native !== undefined) {
                    return native;
                }
                return `AddElementToObject(${leftSide}, ${propName}, ${value})`;
            }

            if (right?.kind === ts.SyntaxKind.AwaitExpression || rightSide.startsWith('<-this.callInternal')) {
                const leftParsed = this.printNode(left, 0);
                // the awaited call can carry a multi-line object literal argument: printing it
                // at the statement's own level keeps that literal one level deeper
                const awaited = (right?.kind === ts.SyntaxKind.AwaitExpression)
                    ? this.printNode(right, identation)
                    : rightSide;
                return `
${this.getIden(identation)}${leftParsed} = ${awaited}
${this.getIden(identation)}PanicOnError(${leftParsed})`;
            }
        }

        const op = operatorToken.kind;
        // handle: [x,d] = this.method()
        if (op === ts.SyntaxKind.EqualsToken && left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + "\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        let operator = this.SupportedKindNames[operatorToken.kind];


        let leftVar = undefined;
        let rightVar = undefined;

        // c# wrapper
        if (operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
            if (this.COMPARISON_WRAPPER_OPEN) {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
                return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
            }
        }

        // check if boolean operators || and && because of the falsy values
        if (operatorToken.kind === ts.SyntaxKind.BarBarToken || operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            leftVar = this.printCondition(left, 0);
            rightVar = this.printCondition(right, identation);
            if (operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                // `x !== undefined && x === 'v'` inlines to `(x != nil) && (x != nil && *x == "v")`.
                // The right operand already guards nil, so the left test is provably
                // implied — `go vet` reports it as a redundant and. Dropping it keeps
                // the exact same value (Go && is short-circuiting, both sides pure).
                const collapsed = this.goDropRedundantNilGuard(leftVar.trim(), rightVar.trim());
                if (collapsed !== undefined) {
                    return collapsed;
                }
            }
        }  else {
            // go/printer prints the left operand of a binary expression at the
            // depth of the parent plus diffPrec() - 0 only when it is a binary
            // expression of the very same precedence - and the right operand one
            // level deeper. An operator that is not binary in Go (the assignment
            // `=`, or a compound assignment) prints both sides at their own level.
            const precedence = this.goOperatorPrecedence(operator);
            if (precedence > 0) {
                const leftOperator = this.goNativeBinaryOperator(left);
                const samePrecedence = leftOperator !== undefined && this.goOperatorPrecedence(leftOperator) === precedence;
                const leftDepth = samePrecedence ? this.goExprDepth : this.goExprDepth + 1;
                leftVar = this.goWithExprDepth(leftDepth, () => this.printNode(left, 0));
                rightVar = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation));
            } else {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
            }
        }

        const customOperator = this.getCustomOperatorIfAny(left, right, operatorToken);

        operator = customOperator ? customOperator : operator;

        const separator = this.goBinarySeparator(operator, rightVar.trim(), left, right);

        return leftVar + separator + operator + separator + rightVar.trim();
    }

    // `(x != nil) && (x != nil && …)` -> `(x != nil && …)`. Only fires when the
    // right operand opens with the very same nil guard the left operand *is*, so
    // the left is implied and dropping it cannot change the result.
    goDropRedundantNilGuard(leftVar: string, rightVar: string): string | undefined {
        const guard = /^\(([A-Za-z_]\w*) != nil\)$/.exec(leftVar);
        if (guard === null) {
            return undefined;
        }
        if (rightVar.startsWith(`(${guard[1]} != nil && `)) {
            return rightVar;
        }
        return undefined;
    }

    printTryStatement(node, identation: number) {
        // const tryBody = this.printNode(node.tryBlock, 0);

        let tryBody = node.tryBlock.statements.map((s) => {
            return this.printNode(s, identation + 1);
        }).join("\n");
        tryBody = tryBody.replaceAll(/(\s*)break\s*$/gm, "$1panic(\"break\")"); // to do do thing regex-based

        // const catchBody = this.printNode(node.catchClause.block, 0);
        const catchBody = node.catchClause.block.statements.map((s) => this.printNode(s, identation + 1)).join("\n");

        const catchLines = catchBody.split("\n").map(l => l.trim()).filter(Boolean);
        const catchLastLine = catchLines.length ? catchLines[catchLines.length - 1] : "";
        const catchBodyEndsWithReturn = catchLastLine.startsWith("return")
            || catchLastLine.startsWith("panic")
            || catchLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.catchClause.block.statements);

        const tryLines = tryBody.split("\n").map(l => l.trim()).filter(Boolean);
        const tryLastLine = tryLines.length ? tryLines[tryLines.length - 1] : "";
        const tryBodyEndsWithReturn = tryLastLine.startsWith("return")
            || tryLastLine.startsWith("panic")
            || tryLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.tryBlock.statements);

        const returNil = "return nil";
        const isVoid   = this.isInsideVoidFunction(node);

        const nodeEndsWithReturn = tryBodyEndsWithReturn && catchBodyEndsWithReturn && !isVoid;
        const errorName = node.catchClause.variableDeclaration.name.escapedText;
        const classPrefix = this.className !== 'undefined' ? `(this *${this.className})` : "()";
        const thisWord = this.className !== 'undefined' ? "this" : "";
        // the printer indents statements with getIden(); the bodies embedded below are
        // re-placed at their own explicit level so the template only carries the levels
        // *inside* the block (the enclosing getIden(identation) lands on every line)
        const catchBodyBlock = this.indentBlock (catchBody, "					");
        const tryBodyBlock = this.indentBlock (tryBody, "		");
        const catchBlock =`
{
	${nodeEndsWithReturn ? 'ret__ := ' : ''}func${classPrefix} (ret_ any) {
		defer func() {
			if ${errorName} := recover(); ${errorName} != nil {
				if ${errorName} == "break" {
					return
				}
				ret_ = func${classPrefix} any {
					// catch block:
${catchBodyBlock}
					${catchBodyEndsWithReturn ? "" : returNil}
				}(${thisWord})
			}
		}()
		// try block:
${tryBodyBlock}
		${tryBodyEndsWithReturn ? "" : returNil}
	}(${thisWord})
	${nodeEndsWithReturn
        ? `if ret__ != nil {
		return ret__
	}
	return nil`
        : ''}
}`;
        // add identation to every line; a line that is left blank (the conditional
        // entries above emit nothing, and the block opens on a fresh line) stays
        // empty because gofmt trims trailing whitespace
        const indentedBlock = catchBlock.split("\n")
            .map((line) => line.trim().length ? this.getIden(identation) + line : "")
            .join("\n");
        // const catchCondOpen = this.CONDITION_OPENING ? this.CONDITION_OPENING : " ";

        return indentedBlock;
    }

    /**
     * Strip the printer's own leading indentation from every line of a printed
     * statement block so the caller can re-place it at an explicit level. Only the
     * common prefix goes away: relative nesting (one tab per level) is preserved.
     */
    dedentBlock (block: string) {
        const lines = block.split("\n");
        const indents = lines
            .filter((line) => line.trim().length > 0)
            .map((line) => (line.match(/^[\t ]*/) as RegExpMatchArray)[0].length);
        const common = indents.length ? Math.min(...indents) : 0;
        return lines.map((line) => line.slice(common)).join("\n");
    }

    /**
     * Re-place a printed statement block at `level` (a run of tabs): the block's own
     * leading indentation is dropped and every non-blank line is prefixed with `level`,
     * so relative nesting (one tab per level) survives the move.
     */
    indentBlock (block: string, level: string) {
        return this.dedentBlock (block)
            .split("\n")
            .map((line) => line.trim().length ? level + line : "")
            .join("\n");
    }

    /**
     * gofmt writes blank lines with no whitespace at all. A multi-line statement template
     * opens on a fresh line, so the inherited `getIden(identation) + <statement>` prefix
     * lands on a line that carries nothing else: drop that prefix instead of leaving a
     * whitespace-only line behind. Only blank lines are touched, never printed content.
     */
    stripWhitespaceOnlyLines (block: string) {
        return block.split("\n").map((line) => line.trim().length ? line : "").join("\n");
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        if (operator === ts.SyntaxKind.MinusToken) {
            const printed = this.printNode(node.operand, 0);
            const inlined = this.printInlineOpNeg(node, printed);
            if (inlined !== undefined) {
                return this.getIden(identation) + inlined;
            }
            return this.getIden(identation) + `OpNeg(${printed})`;
        }
        return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression); // new Exception or new exact[string] check this out
        if (node.arguments.length === 0) {
            return `New${this.capitalize(expression)}()`;
        }
        // an argument printer may prepend the statement indent (parenthesised casts do);
        // inside the call the argument is inline, so trim it like printArgsForCallExpression
        const args = node.arguments.map(n => this.printNode(n, identation).trim()).join(", ");
        if (expression.endsWith('Error')) {
            return expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
        }
        return 'New' + this.capitalize(expression) + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    /**
     * Override the default element-access printer with a version that walks the
     * entire `x[y][z]` chain and builds a properly nested sequence of helper
     * calls.  This removes the root cause of the unbalanced-parenthesis bug
     * without any post-processing or regex hacks.
     */
    // The Go static type of `printed` when the printer can name it as a native Go
    // map or slice, undefined while the value stays boxed in `any` (GetValue,
    // Ternary, a parameter, an untyped struct field). Only initializer shapes the
    // printer itself types — object/array literals, helper calls whose Go return
    // type it knows (GO_HELPER_RETURN_TYPES + the ccxt extension), and locals whose
    // declaration got that same concrete type — are reported.
    goIndexableTypeOf(node, printed: string): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        switch (node.kind) {
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goIndexableTypeOf(node.expression, printed);
        case ts.SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case ts.SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed);
        case ts.SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node);
        }
        return undefined;
    }

    // the leftover chain after the first (native) step, still helper-wrapped:
    // `m["a"]["b"]["c"]` prints `GetValue(GetValue(m["a"], "b"), "c")`
    goElementAccessChain(containerStr: string, keyStrs: string[]) {
        let acc = containerStr;
        for (let i = 1; i < keyStrs.length; i++) {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }
        return acc;
    }

    // true when the printed key is a Go string, so `m[key]` reads the map with the
    // same key GetValue resolves for a string operand (GetValue parses a non-string
    // key, which on map[string]any just yields nil)
    goKeyIsString(node, printed: string) {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case ts.SyntaxKind.Identifier:
            return this.goDeclaredTypeOfIdentifier(node) === 'string';
        case ts.SyntaxKind.CallExpression:
            return this.goTypeOfInitializer(node, printed) === 'string';
        }
        return false;
    }

    // true for `this.<field>` — the one property-access shape whose Go type the
    // printer itself cannot name (the fields live in the hand-written Go structs)
    isGoThisPropertyAccessExpression(node) {
        return (node?.kind === ts.SyntaxKind.PropertyAccessExpression)
            && (node.expression?.kind === ts.SyntaxKind.ThisKeyword);
    }

    // true when the element access is the target of an assignment: the binary
    // expression printer owns that shape (AddElementToObject / rewritten GetValue
    // chains), a native `x[k]` index there would drop the write
    isGoElementAccessAssignmentTarget(node) {
        const parent = node.parent;
        return (parent?.kind === ts.SyntaxKind.BinaryExpression) && (parent.left === node)
            && ((parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) || (parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken));
    }

    printElementAccessExpression(node, identation) {
        // Maintain original special-case handling first.
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) {
            return special;
        }

        // Always process element access expressions the same way
        // The binary expression handler will override this for assignments

        // For right-side access, build the full nested chain
        const keys: any[] = [];
        let baseExpr = null;
        let current = node as any;
        // Walk down while the *expression* is another ElementAccessExpression.
        while (ts.isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression); // prepend
            const expr = current.expression;
            if (!ts.isElementAccessExpression(expr)) {
                // Reached the base container.
                baseExpr = expr;
                break;
            }
            current = expr;
        }

        // go/printer prints the base of an index expression at depth 1 and the
        // index itself one level deeper; GetValue(base, key) is a two-argument
        // call, so both operands sit one level below the current expression
        const indexDepth = this.goExprDepth + 1;
        const containerStr = this.goWithExprDepth(indexDepth, () => this.printNode(baseExpr, 0));
        const keyStrs = keys.map(k => this.goWithExprDepth(indexDepth, () => this.printNode(k, 0)));

        // GetValue(m, "k") is a read of a Go map[string]any already: a missing key
        // and a nil element both come back as the `any` nil, so the native index
        // yields the identical value without the helper call
        if (this.goIndexableTypeOf(baseExpr, containerStr) === 'map[string]any') {
            if (this.goKeyIsString(keys[0], keyStrs[0]) && !this.isGoElementAccessAssignmentTarget(node)) {
                return this.goElementAccessChain(`${containerStr}[${keyStrs[0]}]`, keyStrs);
            }
        }

        // Now build nested helpers.
        let acc = containerStr;
        keyStrs.forEach(k => {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${k}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        });

        return acc;
    }

    isInsideVoidFunction(node: ts.Node): boolean {
        for (let cur = node.parent; cur; cur = cur.parent) {
            if (ts.isFunctionLike(cur)) {
                return cur.type === undefined || cur.type.kind === ts.SyntaxKind.VoidKeyword;
            }
        }
        return true;          // default-to-void if uncertain
    }

    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: ts.Statement): boolean {
        if (ts.isBlock(statement)) {
            // A sequence of statements returns on all control paths if the last statement returns on all control paths
            if (statement.statements.length === 0) {
                return false;
            }
            return this.hasReturnInBlock(statement.statements[statement.statements.length - 1]);
        } else if (ts.isReturnStatement(statement)) {
            return true;
        } else if (ts.isThrowStatement(statement)) {
            return true;
        } else if (ts.isIfStatement(statement)) {
            // An if statement returns on all control paths if both the "if" and "else" branches return on all control paths
            const ifHasReturn = this.hasReturnInBlock(statement.thenStatement);
            if (statement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(statement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
            return false; // No else statement, so execution can continue
        } else if (ts.isTryStatement(statement)) {
            // A try statement returns on all control paths if both try and catch blocks return on all control paths
            const tryHasReturn = this.hasReturnInBlock(statement.tryBlock);
            const catchHasReturn = this.hasReturnInBlock(statement.catchClause.block);
            return tryHasReturn && catchHasReturn;
        }
        return false;
    }

    /**
     * Check if the last statement in a block is a conditional with returns in all branches
     */
    blockEndsWithConditionalReturn(statements: ts.NodeArray<ts.Statement>): boolean {
        if (statements.length === 0) {
            return false;
        }

        const lastStatement = statements[statements.length - 1];
        if (ts.isIfStatement(lastStatement)) {
            // Check if this if statement has returns in all branches (only if it has an else)
            const ifHasReturn = this.hasReturnInBlock(lastStatement.thenStatement);
            if (lastStatement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(lastStatement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
        }
        if (ts.isTryStatement(lastStatement)) {
            // Check if this try statement has returns in both try and catch blocks
            const tryHasReturn = this.hasReturnInBlock(lastStatement.tryBlock);
            const catchHasReturn = this.hasReturnInBlock(lastStatement.catchClause.block);
            return tryHasReturn && catchHasReturn;
        }
        return false;
    }


}


// get class decl node
// Use the ts.getAllSuperTypeNodes function to get the base classes for the MyClass
// const baseClasses = ts.getAllSuperTypeNodes(classDeclaration);

// // Create a type checker
// const typeChecker = ts.createTypeChecker(sourceFile.context.program, sourceFile.context.checker);

// // Get the type of the base class
// const baseClassType = typeChecker.getTypeAtLocation(baseClasses[0]);

// // Get the class declaration for the base class
// const baseClassDeclaration = baseClassType.symbol.valueDeclaration;

// console.log(baseClassDeclaration);

