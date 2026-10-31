// @ts-nocheck
// FM-GO5 G04: typed `IsEqual(x, <nil|-N>)` comparisons, folded in from ccxt build/hx10w2-G04.ts (a text pass over the
// printed Go). Two rules at the `===` / `!==` node, both keyed on checker declarations:
//
//  1. `this.<field> === undefined|null` where the property is declared on the hand-written base classes
//     (BaseExchange, PredictionExchange) and the Go struct holds it as a plain interface / container that no
//     generated or hand-written code ever stores a nil pointer into (go/v4/exchange.go; every write is a
//     `map[string]any{}` literal or a `.(string)` / `.(map[string]any)` assertion, the proxy settings are only set
//     by the user). `IsEqual(this.F, nil)` is then the interface nil test itself: `(this.F == nil)`.
//  2. `p === -N` / `p !== -N` where `p` is an identifier the printer declared `*int64` / `*float64` / `*int`: the
//     helper derefs, nil is never equal to a number, so `(p != nil && *p == int64(-N))` (`!==`: `(p == nil || *p !=
//     int64(-N))`). The negative literal needs the typed constant because the generic literal arm only takes a bare
//     NumericLiteral and a prefix `-` prints `OpNeg(N)` (an `any`).
//
// Every other operand keeps the existing arms / the helper call.
import { ts } from './tsApi.js';

const OWNER_CLASSES = [ 'BaseExchange', 'PredictionExchange' ];
// Go field names (as printed) whose declared Go type cannot hold a nil pointer, see the header
const NIL_TESTABLE_FIELDS = new Set ([
    'Outcomes', 'Outcomes_by_id', 'Events_by_slug', 'Features',
    'ProxyUrl', 'Proxy', 'Proxy_url', 'ProxyUrlCallback', 'Proxy_url_callback',
]);

function isNilLiteral (node: any) {
    return (node?.kind === ts.SyntaxKind.NullKeyword) || ((node?.kind === ts.SyntaxKind.Identifier) && (node.text === 'undefined'));
}

function nilTestableBaseField (go: any, node: any) {
    const SK = ts.SyntaxKind;
    if ((node?.kind !== SK.PropertyAccessExpression) || (node.expression?.kind !== SK.ThisKeyword) || (node.name?.kind !== SK.Identifier)) {
        return false;
    }
    if (!NIL_TESTABLE_FIELDS.has (go.transformPropertyAccessExpressionName (node.name.text, node.name))) {
        return false;
    }
    const decl = go.checkerOrUndefined ()?.getSymbolAtLocation (node.name)?.valueDeclaration?.resolve ();
    return (decl?.kind === SK.PropertyDeclaration) && OWNER_CLASSES.includes (decl.parent?.name?.text);
}

// `-N` with N a decimal integer literal (the width the typed constant below can hold)
function negativeIntegerLiteral (node: any) {
    const SK = ts.SyntaxKind;
    return (node?.kind === SK.PrefixUnaryExpression) && (node.operator === SK.MinusToken)
        && (node.operand?.kind === SK.NumericLiteral) && /^\d{1,15}$/.test (node.operand.text) ? node.operand.text : undefined;
}

export function installFmGo5G04 (goTranspiler: any) {
    const flag = 'fmGo5G04Installed';
    if ((goTranspiler[flag] === true) || (typeof goTranspiler.printInlineEquality !== 'function')) {
        return;
    }
    goTranspiler[flag] = true;
    const upstream = goTranspiler.printInlineEquality;
    goTranspiler.printInlineEquality = function (this: any, left: any, right: any, leftText: string, rightText: string, isEq: boolean) {
        const SK = ts.SyntaxKind;
        const op = isEq ? [ '==', '!=' ] : [ '!=', '==' ];
        // 1. nil test of a base field
        if (isNilLiteral (right) && nilTestableBaseField (this, left)) {
            return `(${leftText} ${op[0]} nil)`;
        }
        if (isNilLiteral (left) && nilTestableBaseField (this, right)) {
            return `(${rightText} ${op[0]} nil)`;
        }
        // 2. a declared numeric pointer against a negative integer literal
        for (const [ ptr, lit, ptrText, ptrIsLeft ] of [ [ left, right, leftText, true ], [ right, left, rightText, false ] ]) {
            const digits = negativeIntegerLiteral (lit);
            if ((digits === undefined) || (ptr?.kind !== SK.Identifier)) {
                continue;
            }
            const declared = this.goDeclaredTypeOfIdentifier (ptr);
            if ((declared !== '*int64') && (declared !== '*float64') && (declared !== '*int')) {
                continue;
            }
            const constant = (declared === '*int') ? `-${digits}` : `${declared.substring (1)}(-${digits})`;
            const value = `*${ptrText}`;
            const lhs = ptrIsLeft ? value : constant;
            const rhs = ptrIsLeft ? constant : value;
            return isEq
                ? `(${ptrText} != nil && ${lhs} == ${rhs})`
                : `(${ptrText} == nil || ${lhs} != ${rhs})`;
        }
        return upstream.call (this, left, right, leftText, rightText, isEq);
    };
}
