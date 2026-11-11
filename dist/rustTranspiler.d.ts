import { BaseTranspiler } from "./baseTranspiler.js";
import { type Block, type CallExpression, type Declaration, type Identifier, type Node, type ParameterDeclaration, type VariableDeclaration } from "typescript/unstable/ast";
import { type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
/** Answer of `RustTranspiler.rustDeclaredLocalTypeResolver` for a local whose
 *  value provably holds a `Value::Dict` at every use. */
export type RustDeclaredLocalKind = 'dict';
/** One `let x: Value = <dict-proven initialiser>` declaration. `kind` is only
 *  answered by the resolver when `alwaysDict && stable`. */
export interface RustDeclaredDictLocalEntry {
    kind: RustDeclaredLocalKind;
    name: string;
    /** printed callee of the initialiser: a `safe_dict*` name, or `value_map`. */
    source: string;
    /** the `safe_dict*` `optionalArgs` default is itself Dict-proven, so the
     *  helper returns a Dict on every path (it returns that default when the
     *  key does not hold one). */
    alwaysDict: boolean;
    /** no later write in the enclosing function can change the kind (D2). */
    stable: boolean;
    /** use classification: element-access receiver / kind-preserving mutator / anything else. */
    uses: {
        elementAccess: number;
        mutHelper: number;
        other: number;
    };
    declaration: VariableDeclaration;
    start: number;
}
/** A `Dict`/`List` parameter whose body uses are all printable reads: the
 *  printer re-binds the same name to a borrowed container at fn entry
 *  (`let x = x.as_map().unwrap_or(&__x_empty);`) so every read is native. */
export interface RustParamShadow {
    kind: RustParamShadowKind;
    /** the parameter name; the shadow re-binds it, the `Value` ABI is untouched. */
    name: string;
    declaration: ParameterDeclaration;
}
/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>`. */
export type RustParamShadowKind = 'map' | 'list';
/** Vocabulary of the parameter-shadow table (`RustTranspiler.rustParamShadowOf`). */
export declare const RUST_PARAM_SHADOWS: {
    MAP: RustParamShadowKind;
    LIST: RustParamShadowKind;
    /** `this.<safe*>` reads inlined natively against a shadowed dict param. */
    SAFE_READS: Set<string>;
};
/** Vocabulary of the declared-Dict locals table (see
 *  `RustTranspiler.rustDeclaredLocalTypeResolver`). */
export declare const RUST_DECLARED_DICT_LOCALS: {
    /** value the resolver answers for a proven Dict local */
    DICT: RustDeclaredLocalKind;
    /** printed `self.<callee>` -> index of its `optionalArgs` parameter.
     *  `safe_dict*` returns `optional_args[0]` whenever the key holds a non-Dict. */
    SAFE_CALLEES: Record<string, number>;
    /** `&mut` receivers whose writes land inside the container, so a Dict local
     *  stays a Dict (`add_element_to_object` / `append_to_array` no-op on a
     *  non-container, `set_value` / `remove` write a key). */
    KIND_PRESERVING_MUTATORS: Set<string>;
};
/** Preorder (forEachChild order) of a scope's descendants, decoded once: `end[i]` is the index past
 *  node i's subtree; `byName` lists identifiers and name-binding declarations per name text. */
interface RustScopeIndex {
    nodes: Node[];
    end: number[];
    byName: Map<string, number[]> | undefined;
}
export declare class RustTranspiler extends BaseTranspiler {
    private rustScopeIndexes;
    rustScopeIndex(scope: Node): RustScopeIndex;
    /** `scope.forEachChild(visit)` recursion over the cached preorder: `visit` answers
     *  RUST_WALK_SKIP to skip the node's subtree, RUST_WALK_STOP to end the walk. */
    rustWalkScope(scope: Node, visit: (n: any) => number | void): void;
    /** Scope nodes that are an identifier or a name-binding declaration spelled `name`, in walk order. */
    rustScopeNameNodes(scope: Node, name: string): Node[];
    private static readonly RUST_PREFETCH_TYPE_KINDS;
    /** One bulk getTypeAtLocation for the class's nodes of those kinds, seeding the checker memo. */
    rustPrefetchClassTypes(node: Node): void;
    binaryExpressionsWrappers: any;
    methodSignatures: Record<string, {
        requiredCount: number;
    }>;
    forLoopCounter: number;
    /** The handler `message` parameter a shadow is being printed for (set only
     *  while its method body is printed). */
    rustProHandlerShadowParam: ParameterDeclaration | undefined;
    /** Unified methods printed with a typed public signature (`config.typedUnified`, TS names). */
    rustTypedUnified: Set<string>;
    constructor(config?: {});
    initConfig(): void;
    quotedStringLiteral(text: string): string;
    static readonly RUST_NAME_VALUE_IMPORTS: Set<string>;
    static readonly RUST_NUMBER_CONSTANT_IMPORTS: Set<string>;
    printIdentifier(node: any): string;
    /** A bare read of an imported (or top-level destructured) binding: never a callee, member, key or `new` target. */
    rustIsImportedValueName(node: any): boolean;
    printStringLiteral(node: any): any;
    printNumericLiteral(node: any): string;
    printBooleanLiteral(node: any): string;
    printNullKeyword(node: any, identation: any): string;
    private static readonly BOOL_PRODUCING_OPERATORS;
    private static readonly BOOL_PRODUCING_CALLS;
    private static readonly RUST_NATIVE_INSERT_RECEIVERS;
    private static readonly RUST_ORDERBOOK_META_FIELDS;
    private static readonly RUST_ORDERBOOK_READ_FIELDS;
    private static readonly RUST_ORDERBOOK_CLASSES;
    private static readonly RUST_BOOK_META_KEYS;
    private static readonly RUST_TAGGED_HANDLE_FIELDS;
    private static readonly RUST_PLAIN_DICT_FIELDS;
    private static readonly RUST_BOOL_VALUE_HELPERS;
    private static readonly PAYLOAD_ACCESSORS;
    primitiveKindOfType(type: any): string;
    /** `true` / `false` / `boolean` (a union of BooleanLiteral members too). */
    isBooleanValueType(type: Type | undefined): boolean;
    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: Type | undefined): boolean;
    /** Operands this rule handles: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node: any): boolean;
    /** Declarations `printVariableDeclarationList` emitted as `let mut x: bool`. */
    private rustBoolDeclaredLocals;
    /** A bare identifier whose reads still hold a `Value` box: every declaration
     *  this printer emits as `Value` (param, destructured element, local) minus
     *  the ones the declaration site retypes to a native Rust type. */
    isBooleanValueIdentifier(node: any): boolean;
    /** The declaration site emits `let mut x: bool = …` (see
     *  `getRustBoolLocalInitializer`): its reads are native bools, not `Value`. */
    rustDeclarationPrintsNativeBool(declaration: any): boolean;
    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node: any): boolean;
    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node: any): any;
    rustConditionBoolSlot(node: any): boolean;
    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node: any): string | undefined;
    /** Same native truthiness for a bare `Value`-boxed identifier of boolean type. Prints the bool-tuple
     *  truthiness text (`x.as_bool() == Some(true)`) so the typed-locals pass keeps rewriting it byte-identically. */
    printNativeIdentifierTruthiness(node: any): string | undefined;
    literalKindOfNode(node: any): string;
    printsValueExpression(node: any): boolean;
    callExpressionName(node: any): string;
    textCoercesToNumber(text: string): boolean;
    numericLiteralF64Text(node: any): string;
    rustReadPrintsValue(node: any): boolean;
    rustBooleanComparableType(type: any): boolean;
    printNativeEqualityComparison(left: any, right: any, op: any): string;
    typeOfNodeIfAny(node: Node): Type | undefined;
    isValueLengthType(type: Type | undefined): boolean;
    printArrayLength(node: any, identation: any, leftExpr?: any): string;
    /** `orderbook['bids']` / `orderbook.asks` on an `OrderBook`-typed receiver, or a
     *  local initialised from one. The WS runtime keeps those sides as marker dicts
     *  whose levels live in the side store, so only `get_array_length` / `get_value`
     *  reach them — the checker's array type is not the runtime shape. */
    rustIsOrderBookSide(node: Node, depth?: number): boolean;
    /** Literal integer bound of a `slice` call (`3`, `-64`), else undefined. */
    rustSliceLiteralBound(node: any): number | undefined;
    rustSliceClampedIndex(value: number): string;
    printNativeStringIndexOf(node: any, receiverText: string): string | undefined;
    printNativeStringSlice(node: any, receiverText: string): string | undefined;
    private static readonly RUST_TYPE_PREDICATE_PATTERNS;
    isDeclaredValueIdentifier(node: any): boolean;
    isDeclaredValuePlace(node: any): boolean;
    valuePlaceRoot(node: any): any;
    nativeValuePredicateText(kind: string, operandNode: any, printedOperand: string): string | undefined;
    isDictShapedType(type: Type | undefined): boolean;
    printNativeInOperator(key: any, obj: any): string;
    rustStringLiteralOf(printedKey: string): string | undefined;
    printNativeBookMetaWrite(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    rustReadsOrderbooksStore(ident: any): boolean;
    printNativeDictInsert(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    /** The `insert` key argument. A literal becomes `"k".into()`; a proven
     *  string place becomes `crate::runtime::stringify_param(&k)` — the exact
     *  conversion the helper's dict branch applies to a non-string key, and
     *  `k.to_string()` for a string one. */
    rustNativeInsertKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    nestedDictWrite(baseExpr: any, keyNodes: any[], keyTexts: string[], valueText: string, fallbackText: string): string | undefined;
    /** The `get_mut` key of a nested-dict hop: a borrowed `&str` — the literal itself,
     *  or the stringification the insert's key uses. */
    entryKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    rustNativeInsertReceiver(expr: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
    } | undefined;
    /** Element-write receiver proof for a local: a whitelisted name (`plain: false`), a dict-shape proof plus a
     *  plain-`Value::Map` build on every path, or a plain-dict-annotated parameter whose writes keep that shape.
     *  The flag is the by-construction plainness (literal-init locals, handler tuples, plain fields) a book-meta key needs. */
    rustInsertIdentifierReceiver(ident: any): boolean | undefined;
    /** A literal initializer must carry no runtime tag key; a call initializer
     *  is the axiom the declared-Dict table itself rests on. */
    rustDeclaredInitIsTagFree(declaration: VariableDeclaration): boolean;
    /** Skip `( … )`, `x!` and `x as T` wrappers. */
    rustStripWrappers(node: any): any;
    /** The local's single declaration is initialised from a call that reads
     *  `x.hashmap` / `x.subscriptions` / `x.futures` — element dicts the runtime
     *  tags with a backref so writes reach the shared store, not the COW copy. */
    rustLocalInitReadsTaggedContainer(ident: Identifier): boolean;
    static readonly RUST_TAGGED_CONTAINER_FIELDS: Set<string>;
    /** True when every value the local can hold comes from an object literal:
     *  the runtime tags a dict (`__book_id`, `__ws_subs_url`, `__ws_sub_ref`,
     *  `__cache_backref`) only on handles its own store builds, so the helper's
     *  write-through branches are provably dead and `insert` is the whole
     *  helper. A `[ x, params ] = this.handle…(…)` tuple re-assigns the
     *  hand-written handler's own dict arguments. */
    rustInsertReceiverBuildsPlainDict(declaration: VariableDeclaration): boolean;
    /** An object literal with no runtime tag key — the transpiler built it, so
     *  it is a fresh plain `Value::Map` on every path. */
    rustPlainDictLiteral(node: Node | undefined): boolean;
    /** `this.handle…(…)` — the hand-written `handle*AndParams` / `handleUntil…`
     *  family; each returns its own request/params dict arguments. */
    rustHandlerTupleCall(node: Node | undefined): boolean;
    /** A `null`/`undefined` write leaves the receiver a non-dict, which the
     *  emitted `if let Value::Dict` no-ops exactly like the helper. */
    private rustTypeIsUndefinedish;
    /** The single variable declaration a local identifier binds to, or
     *  undefined when the checker cannot answer / the binding is not a local. */
    rustSingleLocalDeclaration(ident: Identifier): VariableDeclaration | ParameterDeclaration | undefined;
    rustWriteDictShape(type: any): boolean;
    rustReceiverStaysDict(baseExpr: any, receiver: any): boolean;
    rustFieldStaysDict(baseExpr: any, fieldName: string): boolean;
    rustParamStaysPlainDict(declaration: ParameterDeclaration): boolean;
    /** RHS of a write to a plain-dict parameter that keeps the shape. */
    rustPlainDictPreservingRhs(node: Node, name: string): boolean;
    rustPrintedBoolArg(raw: string): boolean;
    foldNegateLiteral(operandText: string): string | undefined;
    ensureRef(expr: string): string;
    isNumberTyped(node: any): boolean;
    isBooleanPosition(node: any): boolean;
    printNativeNumericComparison(node: any, operator: any, leftText: any, rightText: any): string;
    rustNumericOperandKind(node: any): string | undefined;
    orderedComparisonOperand(node: any): any;
    printNativeOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    printNativeIndexOfLiteralTest(node: any, op: any, left: any, right: any): string | undefined;
    nativeIndexOfLiteralTestText(op: any, left: any, right: any): string | undefined;
    rustTypeFlagsAll(type: any, flags: Set<number>): boolean;
    isNumberLikeType(type: any): boolean;
    isStringLikeType(type: any): boolean;
    private static readonly RUST_CONCAT_SAFE_FLAGS;
    isStringOrNullishType(type: any): boolean;
    isNativeStringConcatPair(leftType: any, rightType: any): boolean;
    printNativeAssignmentArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeStringConcat(leftText: string, rightText: string): string;
    printNativeNumeric(op: any, leftText: string, rightText: string): string;
    private static readonly RUST_TYPEOF_HELPERS;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printBinaryExpression(node: any, identation: any): any;
    printDateNowCall(node: any, identation: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
    private static readonly RUST_NIL_INT_HELPERS;
    private static readonly RUST_NIL_BOOL_HELPERS;
    private static readonly RUST_NIL_PRECISE_STR;
    private rustNilLocalDecisions;
    /** `'str' | 'int' | 'bool'` when the nil-declared local prints `Option<..>`, else undefined. */
    rustNilLocalKind(declaration: any): string | undefined;
    private rustNilCandidateNames;
    rustNilLocalOfIdentifier(node: any): {
        declaration: any;
        kind: string;
    } | undefined;
    rustNilLocalKindUncached(declaration: any): string | undefined;
    /** Static kind of a write's right-hand side: `null`, or the `Option` payload it yields exactly. */
    rustNilWriteKind(rhs: any): string | undefined;
    rustNilSelfHelperName(call: any): string | undefined;
    /** Integer literal text (`5`, `-5`), else undefined. */
    rustNilIntLiteral(node: any): string | undefined;
    /** How a read of a typed nil local prints: `'test'` (null / literal compare), `'cond'` (bool
     *  condition slot) or `'box'` (a `Value` argument, field, element, return or plain copy). */
    rustNilReadForm(n: any, kind: string): string | undefined;
    /** Box reads go only into plain `Value` slots: no `&mut` receivers, no native-typed callee slots. */
    rustNilBoxCallOk(call: any, at: number): boolean;
    /** Native text of `x == <literal>` for a typed nil local of `kind`; undefined when not exact. */
    rustNilLiteralTest(kind: string, other: any): string | undefined;
    /** Equality hook: `x.is_none()`, `x.as_deref() == Some("lit")`, `x == Some(5)`. */
    printRustNilLocalEquality(left: any, right: any, op: any): string | undefined;
    /** Condition hook: a bool nil local is truthy exactly when it holds `Some(true)`. */
    printRustNilLocalCondition(node: any): string | undefined;
    /** Identifier hook: a box read converts with the standard `From` impls. */
    printRustNilLocalRead(node: any): string | undefined;
    private static readonly RUST_NIL_SCALAR_NATIVE_FORMS;
    /** `ostr|oint|onum` for an empty local the scalar rule types, else undefined. */
    rustNilScalarKind(declaration: any): string | undefined;
    /** A write that decodes a `Value` result (a call, or a ternary over one). */
    rustNilDecodedWrite(rhs: any): boolean;
    /** `[ x, .. ] = <list>` as its own statement: `x` is written from a tuple slot. */
    rustNilSlotWrite(n: any): boolean;
    /** Slot hook: an `Option<String>` local takes the slot's string. */
    printRustNilSlotWrite(element: any, read: string): string | undefined;
    /** Declaration hook: `let mut x: Option<..> = None` for an empty scalar local. */
    printRustNilScalarDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** Assignment hook: `x = <rhs>` with the right-hand side unwrapped to the local's payload. */
    printRustNilLocalWrite(left: any, right: any): string | undefined;
    private static readonly RUST_BOOL_RESULT_HELPERS;
    private static readonly RUST_BOOL_RESULT_CALLEES;
    rustCallPrintsBool(node: any): boolean;
    private rustSkipStringLiteral;
    peelValueBox(printedValue: string, prefix: string): string | undefined;
    peelValueBoolBox(printedValue: string): string | undefined;
    peelValueStrBox(printedValue: string): string | undefined;
    stripOuterParens(printedValue: string): string;
    printedBoolHelperCall(printedValue: string): boolean;
    rustNodeIsBoolExpression(node: any): boolean;
    rustTypeIsBoolean(node: any): boolean;
    rustTypeIsString(node: any): boolean;
    rustEnclosingFunction(node: any): any;
    rustBindsName(node: any, name: string): boolean;
    rustIdentifierUseIsCondition(node: any): boolean;
    private rustLocalUsesAll;
    rustLocalUsesAcceptBool(declaration: any, sourceName: string): boolean;
    private rustBoolParamDecisions;
    rustParamPrintsBool(param: any): boolean;
    rustParamPrintsBoolUncached(param: any): boolean;
    /** True when `this.<name>` is read as a value (not called) in the method's own file. */
    rustMethodReferencedAsValue(method: any): boolean;
    private rustValueReferencedMethods;
    rustValueReferenceCensus(file: any): Set<string>;
    /** Native type text of a parameter in the emitted signature. */
    rustParamType(param: any): string;
    rustBoolParamUseAccepted(node: any): boolean;
    /** Parameter declarations of a call's resolved callee, when the checker has them. */
    rustCalleeParams(call: any): any[] | undefined;
    /** `bool` text for an argument in a native-`bool` parameter slot. */
    rustBoolArgumentText(node: any, identation: any): string;
    /** True when the call's `at`-th argument lands in a required native-`bool` slot. */
    rustNativeBoolArgumentSlot(params: any, at: number): boolean;
    /** Argument shapes the printer already emits as a Rust `bool`. */
    rustNativeBoolArgumentText(node: any): string | undefined;
    rustDeclaredNode(node: any): Node | undefined;
    /** Condition text for a bare identifier of native-`bool` type, else undefined. */
    printNativeBoolParamCondition(node: any): string | undefined;
    private rustMapParamDecisions;
    private rustStrVecParamDecisions;
    rustParamPrintsStrVec(param: any): boolean;
    rustStrVecParamUncached(param: any): boolean;
    /** Every call site resolving to `method` passes an array literal of plain `Value` identifiers (none is fine: the dispatcher converts). */
    rustStrVecCallSitesOk(method: any, index: number): boolean;
    rustStrVecArgumentOk(arg: any): boolean;
    /** A plain `Value` local (not a param, not a typed container): `x.to_str_vec()` converts it. */
    rustStrVecValueLocal(node: any): boolean;
    rustNativeStrVecArgumentSlot(params: any, at: number): boolean;
    /** `vec![a.to_string(), ..]` for an array literal landing in a `Vec<String>` slot. */
    rustStrVecArgumentText(node: any, identation: any): string;
    printStrVecParamJoin(node: any): string | undefined;
    rustParamPrintsMap(param: any): boolean;
    rustMapParamIsTypedUncached(param: any): boolean;
    /** Every body use is a map operation the bearered printer emits, and at
     *  least one of them writes (otherwise the read shadow already covers it). */
    rustMapParamBodyUsesOk(param: any): boolean;
    /** `read` / `write` on a single-level key, or `box` where the printer moves
     *  the map into a `Value::Map(..)`; anything else has no printed form. */
    rustMapParamUseKind(node: any): string | undefined;
    /** The value operand of a `m['k'] = x` write: the receiver takes a `Value`, so
     *  the map is boxed there (a move at its last use, a clone before it). */
    rustDictWriteValue(node: any): boolean;
    /** A use that prints the map as `Value::Map(x.clone())`: the body scan's
     *  `box` positions, never a key read or a map argument slot. */
    rustMapParamBoxes(node: any): boolean;
    /** A parameter printed as a native map, or undefined. */
    rustMapParamDeclaration(node: any): any | undefined;
    /** The `at`-th argument of a call lands in a native-map parameter slot. */
    rustNativeMapArgumentSlot(params: any, at: number): any | undefined;
    /** `&mut <bearer>` for a map slot; every call site is proven a bearer. */
    rustMapArgumentText(node: any, identation: any): string;
    rustMapArgumentIsBearer(node: any): boolean;
    /** Program-wide call sites of `method`: every one passes a bearer in the slot. */
    rustMapParamCallSitesOk(method: any, index: number): boolean;
    rustDeclarationKey(node: any): string;
    private rustCallSitesCache;
    rustCallSitesForName(name: string): any[];
    /** `x['k'] = v` on a native-map parameter: the insert `add_element_to_object`
     *  performs on the same plain dict, on the map the type already is. */
    rustMapParamDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    private rustStringMethodLocalDecisions;
    /** The native initializer text of a string-method local, else undefined. */
    rustStringMethodLocalInit(declaration: any): string | undefined;
    rustStringMethodLocalIsTyped(declaration: any): boolean;
    rustStringMethodLocalBoxUse(n: any): boolean;
    private static readonly RUST_STRING_LOCAL_HELPERS;
    private rustStringLocalDecisions;
    rustSafeStringLocalInitializer(declaration: any): boolean;
    rustStringLocalUseIsNative(node: any): boolean;
    rustSafeStringLocalIsTyped(declaration: any): boolean;
    rustSignApiStringLocalIsTyped(declaration: any): boolean;
    rustSafeStringLocalIsTypedUncached(declaration: any): boolean;
    private static readonly RUST_SIGN_API_METHODS;
    /** The `api: string[]` / `section: string[]` parameter (position 1) of sign/fetch2/request an identifier names. */
    rustSignApiParam(node: any): ParameterDeclaration | undefined;
    /** `api[N]` on a shadowed sign-api parameter: the element read the shadow prints as `api.get(N)`. */
    rustSignApiElementInit(declaration: any): {
        receiver: string;
        index: number;
    } | undefined;
    rustIdentifierIsPropertyName(node: any): boolean;
    rustStringLocalIdentifierIsTyped(node: any): boolean;
    getRustBoolLocalInitializer(declaration: any, printedValue: string): string | undefined;
    private static readonly RUST_SCALAR_INT_HELPERS;
    private static readonly RUST_SCALAR_NUM_HELPERS;
    private static readonly RUST_SCALAR_BOOL_HELPERS;
    private static readonly RUST_SCALAR_TYPES;
    private rustScalarDecisions;
    private rustScalarCandidates;
    private rustScalarUseForms;
    private rustScalarSolved;
    private rustScalarSolving;
    private rustScalarSeeding;
    private rustScalarVetoed;
    private rustScalarGuarded;
    /** The Rust kind (`ostr|oint|onum|str|int|num|bool`) a scalar local is declared with, else undefined. */
    rustScalarLocalKind(declaration: any): string | undefined;
    /** Decides every scalar candidate of one function together: seeds each with its initializer kind,
     *  then re-checks all of them in declaration order until a whole pass changes nothing (each kept
     *  decision is then proven against the final ones); a candidate that keeps flipping stays `Value`. */
    rustScalarSolveScope(scope: any): void;
    rustScalarTry(declaration: any): string | null;
    /** The scalar local an identifier reads (never its own declaration name). */
    rustScalarLocalOf(node: any): {
        declaration: any;
        kind: string;
    } | undefined;
    /** Syntactic pre-filter: a literal, a `+` chain, or a `this.safe<Scalar>(..)` call. */
    rustScalarInitShape(init: any): boolean;
    /** True for test sources: their helpers take every argument as a `Value`, so a local typed there must earn a native use. */
    rustTestTierSource(node: any): boolean;
    /** `this`, or in a test source an identifier typed as the base `Exchange` class (it resolves to the base readers). */
    rustScalarReceiver(node: any): boolean;
    rustScalarLocalKindUncached(declaration: any): string | undefined;
    /** Integer literal text (`5`, `-5`) that fits an `i64`, else undefined. */
    rustScalarIntLiteral(node: any): string | undefined;
    /** Decimal float literal text (`1.5`, `-0.25`, `1e8`), else undefined. */
    rustScalarFloatLiteral(node: any): string | undefined;
    /** The scalar kind an expression yields exactly (`null` for nullish); `fresh` admits the
     *  non-null literal kinds (`str|int|num|bool`) a declaration may seed. */
    rustScalarValueKind(expr: any, fresh: boolean): string | undefined;
    private static readonly RUST_BASE_SCALAR_RETURNS;
    rustBaseReturnScalarKind(call: any, name: string): string | undefined;
    rustDerivedScalarKind(call: any): string | undefined;
    rustElementReadScalarKind(node: any): string | undefined;
    rustScalarUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    private static readonly RUST_SCALAR_COUNTER_COND;
    rustScalarCounterCond(name: string, condStr: string): string | undefined;
    /** True for the derived sources above, which must earn a native use (not only `Value` boxes). */
    rustScalarNeedsNativeUse(init: any): boolean;
    rustScalarCallee(call: any): any;
    private rustVenueReturnTypesByRoot;
    rustVenueStrCall(node: any): boolean;
    /** A sync venue method (not a base one) every venue declaration of which returns `int`: it keeps its
     *  `-> Value` signature and dispatch arm, and its result holds an `Int`, read once as an `i64`. */
    rustVenueIntCall(node: any): boolean;
    /** A venue string-method result: typed only when no use boxes it back or hands it to another local
     *  (each would copy the `String`). */
    rustVenueScalarSource(init: any): boolean;
    rustVenueLocalHandedOn(declaration: any): boolean;
    /** The whole initializer of a `let`/`const` (writes and ternary arms keep their `Value`). */
    rustVenueInitializer(node: any): boolean;
    /** `x.toString()` on an `i64` local: it prints `format!("{}", x)`, the same text `Display` gives the `Int` box. */
    rustVenueIntToString(call: any, access: any): boolean;
    /** The `toString()` print of an `i64` scalar local receiver, else undefined. */
    printRustVenueIntToString(node: any, name: string): string | undefined;
    /** Declared return type texts per method name over the venue sources under `srcRoot`. */
    rustVenueReturnTypes(srcRoot: string): Map<string, Set<string>>;
    /** The `Option<String>` text of a venue string-method call (the box a `Value` position adds is left off). */
    rustVenueStrCallText(node: any): string;
    /** The bare `format!(..)` a string concat prints as (its `Value::Str(..into())` box peeled), else undefined. */
    rustScalarFormatText(node: any): string | undefined;
    /** How a use of a scalar local prints: `test` (literal/null compare), `cond` (bool condition),
     *  `write` (same-kind assignment statement), `concat` (a `format!` operand) or `box` (a by-value `Value` slot). */
    rustScalarUseForm(n: any, kind: string): string | undefined;
    private static readonly RUST_WS_CLIENT_VALUE_METHODS;
    rustWsClientCallArg(call: any, kind: string): boolean;
    rustWsClientOnlyUse(declaration: any): boolean;
    rustWsClientLastUse(node: any, declaration: any): boolean;
    rustTestLastUse(node: any, declaration: any): boolean;
    private static readonly RUST_CLIENT_HANDLE_TYPE;
    private static readonly RUST_CLIENT_HANDLE_KEYS;
    private static readonly RUST_CLIENT_HANDLE_NAMES;
    private static readonly RUST_CLIENT_HANDLE_METHODS;
    private static readonly RUST_CLIENT_HANDLE_MARK;
    private rustClientHandlePlans;
    private rustClientHandleDeclPrinting;
    /** Line of a node's first token (statements print one per line, so this orders reads and writes). */
    rustClientHandleLine(node: any): number;
    /** The handle plan of the method enclosing `node`, or undefined. */
    rustClientHandlePlan(node: any): any;
    rustClientHandlePlanUncached(method: any): any;
    /** A `this.client(url)` local whose every use the handle serves: a handle field read (not after a
     *  write of that field) or write, a `resolve|reject|send|future|reusableFuture` call, or a hand-off
     *  (`client.as_value()`) as a call argument or the returned value. */
    rustClientHandleTypedLocal(plan: any, refs: any[]): boolean;
    /** The ws `Client` class or a class extending it (`WsClient`, what `this.client(url)` returns). */
    rustClientHandleClassType(type: any): boolean;
    /** `client.<field>` on the planned handle: its plan, field and whether it is written; undefined
     *  when the access is not on the handle or reads a field after the method wrote it. */
    rustClientHandleAccess(node: any): {
        plan: any;
        key: string;
        write: boolean;
    } | undefined;
    rustClientHandleReceiver(plan: any, field: boolean): string;
    /** `client.<field>` as the handle's field (`top`: only for a local declared as the handle, ahead of
     *  the native map reads; otherwise the last resort of the property printer). */
    printClientHandleField(node: any, top: boolean): string | undefined;
    /** `k in client.subscriptions|futures` as the handle's key test (`bare`: a Rust bool). */
    printClientHandleInOp(key: any, obj: any, bare: boolean): string | undefined;
    /** A condition that is a handle key test, printed as a Rust bool. */
    printClientHandleCondition(node: any): string | undefined;
    rustClientHandleIsInTest(node: any): boolean;
    /** `client.subscriptions|futures[k]` read with a plain local key: the handle's keyed read. */
    printClientHandleKeyedRead(node: any): string | undefined;
    /** `Object.keys(client.subscriptions|futures)` bound to a key list: the handle's key list. */
    printClientHandleKeys(init: any): string | undefined;
    /** `delete client.subscriptions[k]`: the handle drops the live entry and its snapshot entry. */
    printClientHandleDelete(node: any): string | undefined;
    /** `client.subscriptions[k] = v`: the handle writes the live client and its snapshot. */
    printClientHandleSubscriptionWrite(left: any, right: any): string | undefined;
    /** A bare use of a local declared as the handle hands the `Value` handle on. */
    printClientHandleUse(node: any): string | undefined;
    /** The planned `client` local: declared as the handle, or printed as usual with a mark where the
     *  handle binding goes. */
    printClientHandleDeclaration(node: any, identation: number): string | undefined;
    /** After a method body printed: the handle binding of a touched `client` param (returned, for the
     *  body head) or local (spliced at its mark). */
    rustClientHandleFinish(method: any, statements: string, identation: number): {
        statements: string;
        head: string;
    };
    rustScalarInNestedWrite(n: any): boolean;
    /** A write source the local's type holds exactly: a same-kind value, a typed scalar local of the
     *  same kind, or a ternary of those (its condition printed as a bool). */
    rustScalarWriteOk(kind: string, rhs: any, depth: number): boolean;
    /** Plain `Value` argument slots: `this.`/`super.` methods without a native-typed slot, and `Precise.*`. */
    rustNilBoxSlotOk(call: any, at: number): boolean;
    /** Native right-hand side of `x == <literal>` for a scalar local of `kind`; undefined when not exact. */
    rustScalarLiteralTest(kind: string, other: any): string | undefined;
    /** Equality hook: `x.is_none()`, `x.as_deref() == Some("lit")`, `n == 5`. */
    printRustScalarLocalEquality(left: any, right: any, op: any): string | undefined;
    /** Condition hook: a `bool` scalar local is its own condition. */
    printRustScalarLocalCondition(node: any): string | undefined;
    /** Identifier hook: a `box` use converts with the standard `From` impls (scalars are `Copy`). */
    printRustScalarLocalRead(node: any): string | undefined;
    /** The native value of a scalar expression for a local of `kind` (`Some(..)` for optional kinds). */
    rustScalarNativeText(kind: string, expr: any): string | undefined;
    /** Declaration hook: `let mut x: <scalar> = <native init>`, else undefined. */
    printRustScalarLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** Assignment hook: `x = <rhs>` in the local's native type. */
    printRustScalarLocalWrite(left: any, right: any): string | undefined;
    private static readonly RUST_SCALAR_ARITH_OPS;
    /** Kind of a typed local an identifier reads: a scalar local, or a typed `Option<String>|Option<i64>` of another rule. */
    rustScalarIdentifierKind(node: any): string | undefined;
    /** `{ method, kind }` of a native string method on a typed string local receiver, else undefined. */
    rustScalarStrMethod(node: any, syntactic?: boolean): {
        recv: any;
        recvKind: string;
        method: string;
        kind: string;
    } | undefined;
    /** `Precise.string<Add|Sub|..>(..)`: a `string | undefined` result. */
    rustScalarPreciseCall(node: any): boolean;
    /** `s.length` on a typed string local. */
    rustScalarLengthRecv(node: any): any;
    /** Non-optional numeric operand kind (`int|num`), optional (`oint|onum`), or undefined. */
    rustScalarNumericKind(node: any): string | undefined;
    /** The exact kind an expression shape yields over typed operands, else undefined. */
    rustScalarExpressionKind(expr: any): string | undefined;
    rustScalarJoinKinds(a: string | undefined, b: string | undefined): string | undefined;
    /** Joins the initializer kind with every `x = <rhs>` write: a nullish write makes the local optional. */
    rustScalarWidenedKind(declaration: any, kind: string): string;
    /** Native text of an ordered/equality comparison over typed operands (`dry`: shape check only). */
    rustScalarCompareText(node: any, dry: boolean): string | undefined;
    rustScalarCompareKind(node: any): string | undefined;
    /** `s.indexOf("lit") >= 0` / `> -1` / `!== -1` (contains) and `< 0` / `=== -1` (absent) on a typed string. */
    rustScalarContainsTest(node: any, dry: boolean): string | undefined;
    /** An operand printed by this rule: a scalar local, or a `.length` / string-method / `indexOf` of one. */
    rustScalarOwnsOperand(node: any): boolean;
    rustScalarHasTypedOperand(node: any): boolean;
    /** Native text of an operand in `kind` (an `int` operand of an `f64` expression is cast). */
    rustScalarOperandText(kind: string, node: any): string;
    /** Native text of an expression shape for a local of `kind`, else undefined. */
    rustScalarExpressionText(kind: string, node: any): string | undefined;
    /** The `Value` box of a native scalar text. */
    rustScalarBoxText(kind: string, text: string, node: any): string;
    /** Binary hook: arithmetic/ordered comparisons over typed operands, and `+=`/`-=` on a typed local. */
    printRustScalarBinary(node: any): string | undefined;
    /** `s += <string>` (`push_str`) on a `String` local, `n += <int>` / `n -= <int>` on an `i64` local. */
    rustScalarCompoundText(node: any, dry: boolean): string | undefined;
    /** Pair equality of two typed operands (or a typed expression and a literal). */
    rustScalarPairEquality(left: any, right: any, op: any): string | undefined;
    /** Typed-signature argument text for a scalar local (`&str`, `Option<&str>`, `i64`, ..), else undefined. */
    rustScalarTypedArgText(arg: any, rustType: string, dry?: boolean): string | undefined;
    /** The typed-signature param type of a `this.<typed unified>(..)` argument slot the call prints natively. */
    rustScalarTypedParamType(call: any, at: number): string | undefined;
    /** A plain `Value` assignment target (no typed-local rule claims it). */
    rustScalarPlainValueTarget(left: any): boolean;
    /** Re-boxing an optional local lengthens each use: keep a line under the 400-char limit it was under. */
    /** Prints a method body; boxed expression-shape locals named on a printed line over 400 chars
     *  are left `Value` when that lowers the count of such lines. */
    printRustScalarGuardedBody(method: any, print: () => string): string;
    /** `m[k] = v` with `k` a `String` local whose single-key write prints a native insert. */
    rustScalarInsertKeyUse(n: any): boolean;
    /** The insert key of a `String` scalar local, else undefined. */
    rustScalarInsertKeyArg(keyNode: any): string | undefined;
    rustScalarOptKeyUse(n: any): boolean;
    rustScalarOptKeyArg(key: any): string | undefined;
    rustScalarOptKeyCount(declaration: any): number;
    rustScalarOptKeyCostly(declaration: any, kind: string): boolean;
    rustScalarOptKeyText(key: any): string;
    /** Use forms of the expression shapes: `native` (operand / receiver printed by the shape), `targ`
     *  (typed-signature argument), `err` (error message) or `box` (alias, key, push, initializer). */
    rustScalarExpressionUseForm(n: any, kind: string): string | undefined;
    /** Call hook: a string method of a typed string local, boxed back to `Value`. */
    printRustScalarMethodCall(node: any): string | undefined;
    /** `.length` hook: the char count of a typed string local. */
    rustScalarLengthText(node: any, boxed: boolean): string | undefined;
    private rustNativeStrReturnDecisions;
    private static readonly RUST_BASE_TIER_FILE;
    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: Node): string | undefined;
    private rustMethodOverrides;
    private rustClassAncestorTables;
    /** Per ancestor class (nearest first): method name -> its LAST declaration; undefined when a
     *  parent class does not resolve. */
    private rustAncestorMethodTables;
    getMethodOverride(node: Node): Node;
    private rustNativeStrReturnDecisionUncached;
    /** Every `return` of the method's own body converts, and the body's last
     *  statement is one of them (so Rust sees no `()`-valued tail the
     *  `-> Value` post-passes would have patched with `Value::Null`). */
    rustStrReturnPathsConvert(body: Block): boolean;
    /** A `return` value of a native-`Str` method: a nullish literal, an
     *  expression already printing an `Option<String>` (a nested retyped call
     *  or a typed string local), or a `Value`-printing expression the checker
     *  types `string | undefined`. */
    rustStrReturnValueConverts(expression: Node): boolean;
    /** An expression that already prints an `Option<String>` in a `: Str`
     *  method's return position. */
    rustStrNativeExpression(expression: Node): boolean;
    unwrapParensNode(node: Node): Node | undefined;
    /** The callee declaration behind `self.<method>(..)` when it is emitted
     *  `-> Option<String>`; undefined otherwise (no proof → keep the box). */
    private rustCallDeclarations;
    rustNativeStrCalleeKind(node: Node): string | undefined;
    /** `Option<String>` → `Value` (exact inverse of the return conversion). The operand is already a
     *  typed `String`, so the conversion is the standard `From` impl — no `|__s|` closure between them. */
    rustNativeStrValueBox(text: string): string;
    /** True when a call to a native-`Str` callee must be boxed back to a
     *  `Value` at this position; the declaration and return printers run the
     *  conversion themselves. */
    rustNativeStrCallNeedsBox(node: Node): boolean;
    /** Wrap a call text when the callee returns a native `Option<String>`
     *  and the position still needs a `Value`. */
    rustBoxNativeStrCallIfNeeded(node: Node, text: string): string;
    private declaredDictLocalsCache;
    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]>;
    /** Printer hook for the helper-removal units: the proven kind of a declared
     *  local, or undefined when the local is not proven Dict at every use.
     *  Accepts the receiver node of the helper call (identifier, `x['k']` chain,
     *  `this.x` chain) or the declaration itself. */
    rustDeclaredLocalTypeResolver(node: Node): RustDeclaredLocalKind | undefined;
    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: Node): RustDeclaredDictLocalEntry | undefined;
    /** The identifier at the head of a place (`x`, `x['k']`, `this.x` is not a
     *  local) — the node the resolver matches against the table. */
    private rustDeclaredLocalIdentifier;
    /** Binding symbol of an identifier, or undefined when the checker cannot
     *  answer (ByContent probes without a class context, for instance). */
    private rustSymbolOf;
    /** True when this identifier is a use of the given declaration's binding.
     *  Without a checker answer the callers stay conservative (reject). */
    private rustIdentifierRefersToDeclaration;
    /** Census of the current source file's table, for reports and tests. */
    rustDeclaredDictLocalCensus(): {
        declarators: number;
        dict: number;
        alwaysDict: number;
        kindUnstable: number;
        retypeEligible: number;
    };
    private collectRustDeclaredDictLocals;
    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo;
    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee;
    /** True when the expression can only be a Dict at run time: an object
     *  literal, a `safe_dict*` call with a Dict-proven default, an element of a
     *  one-element literal default, or an already-proven local. */
    private rustDictProvenExpression;
    /** D2 scan over the enclosing function: an assignment of a non-Dict-proven
     *  value would let the kind change. Every other write path the printer emits
     *  for a local is kind-preserving (`x['k'] = v` -> `add_element_to_object`,
     *  `x.push(v)` -> `append_to_array`, `delete x[k]` -> `remove`, nested
     *  `x['a']['b'] = v` -> `get_value_mut`/`set_value`). A *different* binding of
     *  the same name (sibling block, parameter) is not this local and does not
     *  count; when the checker cannot separate the two bindings the scan stays
     *  conservative and rejects. */
    private rustDictLocalWriteScan;
    /** True when this assignment target writes the local ITSELF (`x = ..`,
     *  `[x, y] = ..`, `({x} = ..)`), as opposed to a write *into* it
     *  (`x['k'] = ..`, kind-preserving). */
    private rustAssignmentWritesWholeLocal;
    /** One use of a dict-proven local: an element-access chain (`x['k']`, also
     *  the `x['k'] = v` write), a kind-preserving mutator (`x.push(v)`,
     *  `delete x[k]`), or something that would need the local to still be a
     *  `Value`. */
    private rustDictLocalClassifyUse;
    printPropertyDeclaration(node: any, identation: any): string;
    getStructFields(node: any): Array<{
        name: string;
        init: string;
    }>;
    printStruct(node: any, identation: any): string;
    printNewMethod(node: any, identation: any): string;
    printClass(node: any, identation: any): string;
    printMethodDefinition(node: any, identation: any): string;
    private static rustTypedParam;
    private static readonly RUST_TYPED_STR_PARAMS;
    private static readonly RUST_TYPED_RETURNS;
    rustTypedSignature(node: any): {
        params: Array<{
            name: string;
            rustType: string;
            toValue: string;
            optional: boolean;
        }>;
        ret: string;
    } | undefined;
    rustTypedBody(node: any, typed: any, identation: number, inner: string): string;
    printTypedUnifiedCall(node: any): string | undefined;
    /** `await this.loadMarkets ();` as its own statement (the value is dropped). */
    rustTypedCallIsDiscarded(node: any): boolean;
    private static readonly RUST_MARKET_STR_FIELDS;
    private static readonly RUST_MARKET_BOOL_FIELDS;
    private static readonly RUST_MARKET_OPT_BOOL_FIELDS;
    private static readonly RUST_MARKET_SAFE_READERS;
    private static readonly RUST_MARKET_OPT_STR_FIELDS;
    private rustMarketLocalDecisions;
    /** `this.market (x)` printed through the typed core. */
    rustIsTypedMarketCall(node: any): boolean;
    /** The literal key of a struct-local read `m['k']` / `m.k` (not written, not called). */
    rustMarketReadKey(n: any): string | undefined;
    /** The listed field a `this.safeString|safeBool (m, 'k')` call reads (no default, or a `false` default for a flag). */
    rustMarketSafeReadField(call: any): string | undefined;
    /** A whole-value hand-off: a call argument, an array element, a dict value or a returned value. */
    rustMarketValueUse(n: any): boolean;
    rustMarketLocalKind(declaration: any): false | 'struct' | 'opt' | 'call';
    rustMarketLocalIsTyped(declaration: any): boolean;
    /** `m = this.market (x)` as its own statement: a later write of the same struct. */
    rustIsTypedMarketWrite(n: any): boolean;
    /** `m === undefined` / `m !== undefined` (either side). */
    rustIsNullTestOf(n: any): boolean;
    rustMarketLocalIsTypedUncached(declaration: any): false | 'struct' | 'opt' | 'call';
    /** The Rust result type of an awaited typed core call other than `market` that decodes into a struct. */
    rustTypedCallResultType(init: any): string | undefined;
    rustCallLocalOf(node: any): any;
    rustOptMarketLocalOf(node: any): any;
    /** The typed `this.market (x)` call, unboxed; its `Err` re-raises as the untyped call did. */
    printTypedMarketValue(call: any): string | undefined;
    /** A later `m = this.market (y)` on a struct local (`Some(..)` on an `Option<Market>` one). */
    printTypedMarketWrite(left: any, right: any): string | undefined;
    /** `m === undefined` on an `Option<Market>` local. */
    printOptMarketNullTest(left: any, right: any, op: any): string | undefined;
    /** The struct local behind an identifier use (never the declaration name). */
    rustTypedMarketLocalOf(node: any): any;
    /** `let mut market: crate::types::Market = …` — the typed call, its `Err` re-raised as the untyped call did. */
    printTypedMarketLocal(declaration: any, indent: string, varName: string): string | undefined;
    /** A read off a struct local: a listed field natively, any other key off `raw`; `asBool` for a condition slot. */
    printTypedMarketRead(node: any, asBool?: boolean): string | undefined;
    private static readonly RUST_MARKET_FLAG_KEYS;
    /** `const f = m['stock']` off a struct local, tested as a condition: `f.as_bool() == Some(true)`. */
    printTypedMarketFlagLocalCondition(node: any): string | undefined;
    /** A whole-value hand-off of a struct local: the `Value` the untyped local held. */
    printTypedMarketValueUse(node: any): string | undefined;
    private static rustTypedLiteralArg;
    printRustFunctionType(node: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    rustFreeFnFirstDefault(node: any): number;
    printFunctionDefinition(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    /** A bare local name (not `self`/`true`/`false`): passing it by value needs a `.clone()`. */
    static isBareLocal(text: string): boolean;
    /** `text.clone()` for a bare local, else `otherwise` (default: the text itself). */
    static cloneIfBareLocal(text: string, otherwise?: string): string;
    private static readonly RUST_RUNTIME_VARIADIC_ARITY;
    private static readonly RUST_TEST_VARIADIC_ARITY;
    printRuntimeVariadicCall(node: any, receiver: string, methodName: string, identation: number, testCrate?: boolean, handleProven?: boolean): string | undefined;
    printOptionalArgsSliceCall(node: any, receiver: string, methodName: string, fixed: number, identation: number): string | undefined;
    rustCalleeIsRuntimeBase(node: any): boolean;
    rustCallsTestExchange(node: any): boolean;
    rustCallsRuntimeHandle(node: any): boolean;
    printImplicitApiCall(node: any, methodName: string, identation: number): string | undefined;
    printTranspiledVariadicCall(node: any, receiver: string, methodName: string, identation: number): string | undefined;
    rustTranspiledCalleeParams(node: any, methodName: string): any[] | undefined;
    printArgsForCallExpression(node: any, identation: any): any;
    rustPrintedArgs(node: any, identation: any, params?: any[]): string[];
    private static readonly RUST_PRECISE_TRIMMED;
    printRustNamespaceCall(node: any, identation: any): string | undefined;
    printRustSignerCall(node: any, identation: any): string | undefined;
    printCallExpression(node: any, identation: any): string;
    printFreeFnDefaultArgsCall(node: any, identation: any): string | undefined;
    printDynamicSelfRead(node: any): string | undefined;
    printDynamicSelfCall(node: any, identation: any): string | undefined;
    printThisKeyword(node: any, identation: any): string;
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS;
    printErrorConstructorArg(name: string, index: number, node: any, identation: number): string;
    rustErrorConstructorName(className: string): string;
    printNewExpression(node: any, identation: any): any;
    /** Printed class expression of a `new` whose class is a runtime value, else undefined. */
    rustDynamicErrorClass(node: any): string | undefined;
    /** `param.member` where `param` is a class-typed parameter, the member is
     *  string-typed and the read is a plain rvalue: `get_value_k(&param, "member")`. */
    printStringMemberOfClassParam(node: any, receiverText: string): string | undefined;
    printPropertyAccessExpression(node: any, identation: any): any;
    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS: Set<string>;
    /** Global parse helpers that go native (`str::parse`) on a proven string arg,
     *  keyed to the rust integer/float type their runtime helper parses into. */
    static readonly RUST_PARSE_HELPERS: Record<string, string>;
    toSnakeCaseName(name: string): string;
    escapeRustStringLiteral(text: string): string;
    getCheckedTypeOf(node: any): Type | undefined;
    typeSymbolOf(type: Type): TsSymbol | undefined;
    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: Type): boolean;
    isClassInstanceType(type: Type): boolean;
    hasCallableShape(type: Type): boolean;
    isProvenListType(type: Type): boolean;
    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: Type): boolean;
    /** `undefined` / `null` / `void` / `never` — a union member that carries no
     *  runtime value; `Value::Null` is the only box these ever get. */
    rustTypeIsNullish(type: Type): boolean;
    isProvenMapExpression(node: Node): boolean;
    isProvenListExpression(node: Node): boolean;
    /** RHS of a generator destructure that provably holds a `Value::Arr`: the
     *  checker-proven list, or a call whose callee returns an array literal on
     *  every path. */
    rustNativeListSource(node: Node): boolean;
    /** `x.split(sep)` → the runtime `split`, which yields an array on every
     *  path (a non-string receiver gives the empty array, never a dict). */
    rustCallPrintsRuntimeSplit(node: Node): boolean;
    /** True when the call's value is always a runtime array: the `handle*AndParams`
     *  family and its exchange overrides declare `any`, so the checker cannot
     *  prove the `[T, Dict]` tuple the body always builds — walk the resolved
     *  callee instead. */
    rustCallReturnsProvenList(node: Node): boolean;
    private rustProvenListCall;
    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration;
    /** Every `return` in the function's own body builds an array literal, or
     *  delegates to a call that does. `throw` and fall-through (the printer's
     *  `Value::Null`) read the same through both forms. */
    private rustFunctionReturnsArrayLiteral;
    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number, receiverNode?: Node): string;
    /** Element read of a `Vec<Value>` binding (a destructuring temp the printer declares typed). */
    printTypedVecElementRead(name: string, index: number): string;
    private rustTupleSlotDecisions;
    rustTupleSlotKind(element: any): string | undefined;
    private rustTupleSlotKindUncached;
    rustStrSlotBoxUse(n: any): boolean;
    /** A `+` operand of a thrown error message: the statement diverges, so the slot moves into its `format!`. */
    rustStrSlotThrownConcat(n: any): boolean;
    /** `x.clone().map(Value::from).unwrap_or(Value::Null)` at a boxed use of a typed string slot. */
    printRustStrSlotBox(node: any): string | undefined;
    /** The slot's final read: no later use, no other use in its statement, no loop or closure since the destructure. */
    rustStrSlotLastUse(node: any, declaration: any): boolean;
    /** An optional `params: Dict = {}` of a transpiled `handle*` / `fetchPaginatedCall*` method (the base one or a venue
     *  override): the argument rides in the `optional_args` slice, where a dict local is the shared map (`From<&Dict>`). */
    rustOptionalParamsSlot(call: any, arg: any): boolean;
    /** `Value::from(&x)` for a handed dict local riding in an optional params slot. */
    printOptionalParamsArg(node: any, text: string): string | undefined;
    /** `let mut a: Option<String> | bool = <temp>.get(i)..` for a typed tuple slot, else undefined. */
    printRustTupleSlotLocal(element: any, printedName: string, temp: string, index: number, nativeList: boolean, indent: string): string | undefined;
    /** Native read for one chain level, or undefined to keep `get_value`. */
    printNativeBookFieldRead(receiverText: string, receiverNode: Node, keyText: string, viaStore?: boolean): string | undefined;
    printNativeContainerAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `get_value(&X, &i)` for a checker-proven list `X` and a dynamic integer
     *  index local `i`: the runtime's own array branch, spelled natively.
     *  `get_value` reaches its array arm for an `Arr` receiver and its default
     *  (`Value::Null`) otherwise, so the emitted match reproduces both — an
     *  `Int` index by value (a negative or out-of-range index misses), a
     *  numeric string by parse, anything else a miss. */
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** True when this read initialises a local that the very next statement in
     *  the same block mutates (`x['k'] = v` -> `add_element_to_object(&mut x…)`,
     *  `x.push(v)` -> `append_to_array(&mut x…)`). */
    isWriteBackBindRead(read: Node): boolean;
    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: Node, name: string): boolean;
    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: Node): boolean;
    /** Strips `( )`, `as T` and `!` wrappers. */
    rustSkipWrappers(node: any): any;
    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined;
    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean;
    /** The local/parameter proof of a dynamic-key map read: a parameter whose
     *  annotation proves a plain dict, or any local whose checker type
     *  proves a plain map and which nothing in the enclosing function
     *  re-assigns (D2). Returns the proven declaration. */
    rustProvenDynamicMapReceiver(node: Node): Declaration | undefined;
    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: Node): Node | undefined;
    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** Keys `get_value` serves from the book store / cache bucket / live
     *  snapshot instead of the dict itself — a dynamic read cannot prove the
     *  key away, so a place named after one stays boxed. */
    rustNodeIsKeyUnsafePlace(keyText: string): boolean;
    private paramShadowCache;
    /** Functions whose shadow lines were actually emitted — a read converts
     *  only inside one of those (an arrow body prints inline and gets none). */
    private paramShadowEmitted;
    private rustParamShadowEmittedSet;
    rustParamShadowTables(): Map<Node, Map<string, RustParamShadow>>;
    /** Emitted shadow lines for a function, or '' when no parameter qualifies.
     *  The caller must use this before printing the body statements (it both
     *  registers the function as shadowed and computes the lines). */
    rustParamShadowLines(fn: Node, identation: number): string;
    private rustParamShadowTable;
    /** The shadow a read receiver resolves to, or undefined (no proof → helper). */
    rustParamShadowOf(node: Node): RustParamShadow | undefined;
    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName;
    private collectRustParamShadows;
    /** A checker-proven array parameter type (`Vec<Value>` on the rust side);
     *  tuples are excluded (their printed shape is not a plain `Vec`). */
    isProvenShadowListType(type: Type): boolean;
    /** Every reference to the parameter must be a printable read, and at least
     *  one must exist; anything else (a write, a `Value` pass-through, a Null
     *  comparison, a marker key) answers undefined and the parameter keeps its
     *  box. */
    private rustParamShadowUseCensus;
    /** One reference of a shadow candidate: true only for a read the shadow can
     *  print exactly (same proofs the emitted forms re-check). */
    private rustParamUseIsRead;
    /** A key a shadow read can print: dicts take a bare string literal or a
     *  proven-string place, lists a literal non-negative index; the `safe_*`
     *  inline takes the literal key form only. Marker-route key names and keys
     *  whose text needs escaping are excluded. */
    private rustShadowKeyIsReadable;
    private rustShadowKeyIsLiteral;
    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral;
    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee;
    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read, or undefined to keep
     *  the helper (the shadow proof guarantees it never happens for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey;
    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(shadow: RustParamShadow): string | undefined;
    /** `this.safe<Type>(x, 'k'[, default])` on a shadowed dict parameter: the
     *  runtime helper's exact semantics over `.get(..)`. */
    printShadowSafeReadCall(node: CallExpression): string | undefined;
    /** The borrowed view bound by the shadow. */
    private static readonly PRO_HANDLER_SHADOW_NAME;
    /** TS helper name -> emitted match kind. */
    private static readonly PRO_HANDLER_SHADOW_SAFE_READS;
    /** The `message: Dict` parameter of a WS handler method (2nd param of a
     *  `handle*` method), undefined when unproven or written (D2). */
    rustProHandlerMessageParam(node: Node): ParameterDeclaration | undefined;
    /** D2: a write rooted at the parameter (reassignment, element/property
     *  write, a merge/splice onto it) can reshape the dict after the shadow is
     *  taken — the shadow is skipped and every read keeps the helper. */
    rustProHandlerParamIsWritten(param: ParameterDeclaration, name: string): boolean;
    /** Shadow plan for a handler: the parameter plus the two binding lines,
     *  present only when some body read actually turns native (no dead shed). */
    rustProHandlerShadowPlan(node: Node, identation: number): {
        param: ParameterDeclaration;
        lines: string;
    } | undefined;
    /** The `safe_*` call on the shadowed parameter prints as a native
     *  `.get("k")` match, or undefined when the call is not one. In `probe`
     *  mode the shape is checked without printing (the pre-scan must not print
     *  a node twice). */
    printProHandlerShadowRead(node: Node, probe?: boolean): string | undefined;
    /** A miss-arm default the match can hold: absent (`Value::Null`) or a
     *  literal; a computed default keeps the helper (its Value is not
     *  re-printable inside an arm without re-evaluating it twice). */
    rustProHandlerShadowDefaultShape(node: Node): boolean;
    rustProHandlerShadowDefault(node: Node): string | undefined;
    /** Exact native form of the runtime `_k` helper: same value kinds, same
     *  empty-string-is-missing rule, same default (verified against
     *  `exchange_stubs.rs`). `.cloned()` keeps the emitted line clone-free for
     *  the ccxt clone-pruning passes; the parenthesised `match` keeps the
     *  driver's `};` trailing-block replacement off the statement's `;`. */
    rustProHandlerShadowReadText(kind: string, key: string, dflt: string): string;
    private rustDictPhase;
    private rustDictSites;
    private rustDictDecisions;
    private rustDictOwnerDepth;
    private rustDictHoistHosts;
    /** Base `Exchange` fields that hold plain, tag-free runtime state (never a cache/book marker). */
    static readonly RUST_DICT_FIELDS: Set<string>;
    /** Fields whose values are themselves Dicts (cache containers / client handles). */
    static readonly RUST_DICT_VALUE_FIELDS: Set<string>;
    static readonly RUST_DICT_TAGGED_ENTRY_FIELDS: Set<string>;
    static readonly RUST_DICT_MARKER_KEYS: RegExp;
    /** Base callees that only ever return a Dict (the content may still carry a marker). */
    static readonly RUST_DICT_CALLEES: Set<string>;
    /** Name of the base-Exchange runtime-state field behind `this.<name>`, else undefined. */
    rustDictField(node: Node): string | undefined;
    /** One dict-read site. `free` = closure-free text, `closure` = closure text, `helper` = the helper call;
     *  `guarded` = the helper form is kept when the closure would push the line over 400 chars. */
    rustDictSite(site: {
        free?: string;
        closure: string;
        helper?: string;
        guarded?: boolean;
    }): string;
    /** Dict read keyed by a Str place: closure-free when both operands are side-effect-free places. */
    rustDictRead(recv: string, key: string, node: Node, guarded?: boolean): string;
    /** `K.as_str().and_then(|__k| D.get(__k))` on a shadowed parameter map. */
    rustShadowKeyRead(shadow: string, key: string, node: Node): string;
    /** `K.as_str().map(|__k| D.contains_key(__k)).unwrap_or(false)` on a shadowed parameter map. */
    rustShadowKeyHas(shadow: string, key: string, node: Node): string;
    /** Key text a dict read can take as `K.as_str()`: any printed place/expression that is not a boxed literal. */
    rustDictKeyText(keyNode: Node): string | undefined;
    /** `this.<field>[k]` with a non-literal key: the runtime reads the key as a Str and yields
     *  Null for anything else, which is `K.as_str()`; the field container is never tagged. */
    rustFieldDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** A local whose declaration and every write pin a Dict. 'plain': fresh object literals and nullish only
     *  (never tagged by the runtime); 'dicty': also dict-only base callees (content unproven). */
    rustDictLocalProof(ident: Node): 'plain' | 'dicty' | undefined;
    /** 'plain' for a fresh object literal (or nullish when `allowNullish`), 'dicty' for a dict-only base callee. */
    rustDictSource(node: any, allowNullish: boolean): 'plain' | 'dicty' | undefined;
    /** `X[k]` on a proven local with a non-literal key. */
    rustLocalDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `X['k']` on a proven local, for a key the runtime does not route to a marker store. */
    rustLocalDictLiteralRead(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    /** `k in D` on a base-field / field-container map or a proven local: `in_op`'s Dict arm. */
    rustDictInOp(key: Node, obj: Node): string | undefined;
    /** `this.F['k1']['k2'] = v` as a statement on a base runtime-state field: the first hop is the map's own
     *  `entry`, the write below it an `insert`; a value that reads `self` keeps the helper pair. */
    rustFieldNestedInsert(node: Node, baseExpr: any, keys: any[], keyStrs: string[], rhs: string): string | undefined;
    /** `x[k] = f(x[k])`: the read sits in the value of an assignment the printer writes as a native
     *  insert (which binds the value first, `{ let __be_tmp = ..; insert }`), so the position rule that
     *  protects the helper-form write passes does not apply to it. */
    rustDictReadInNativeInsert(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    /** Characters the ccxt clone passes add to a printed line afterwards: every bare local passed by value in a
     *  call or array-literal argument slot gets a `.clone()` (`autoCloneCallArgs` / `cloneInArrayLiterals`). */
    rustDictCloneGrowth(line: string): number;
    /** `this.<field>['k'].length`: a read-only use of a literal-key read off a base runtime-state field. */
    rustFieldLengthRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    /** Statement-like nodes whose finished lines the 400-char budget is measured on. */
    private rustDictIsOwner;
    printNode(node: any, identation?: number): string;
    /** Print a statement; when a finished line of it passes 400 chars, decide each dict site against the
     *  line it sits on (the budget the closure-free / closure / helper forms are chosen under). */
    private rustDictPrintOwner;
    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    /** Keys `get_value(_k)` serves from the book store, a cache bucket or a
     *  live `__live_id` snapshot instead of from the dict itself: those routes
     *  are invisible to a plain map read, so they keep the helper. */
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS: Set<string>;
    rustDeclarationOfIdentifier(node: Node): Declaration | undefined;
    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: Node | undefined, seen: Set<Node>): boolean;
    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: Declaration, name: string): boolean;
    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: Node): boolean;
    /** The ws `OrderBook` class (`ts/src/base/ws/OrderBook.ts`): the rust port never
     *  builds a struct for it — `order_book()` returns a `Value::Dict` — so its
     *  element reads are plain map reads on a proven map. */
    rustWsOrderBookClassType(type: Type | undefined): boolean;
    /** Types the port stores as a plain `Value::Dict`: a checker-proven map, or the
     *  ws order book class. */
    rustDictBearerType(type: Type | undefined): boolean;
    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean;
    /** The ws `Client` class (or a union with it); its type symbol is the file's `default` export. */
    rustIsWsClientType(type: Type | undefined): boolean;
    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined;
    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    printNativeParseCall(node: CallExpression): string | undefined;
    isNodeInsideNode(node: Node, container: Node): boolean;
    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: Node): string | undefined;
    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: Node, ignoreAssign?: Node): boolean;
    /** `(x.k as T).push(..)`: the cast wrapper hides the push receiver from the position check. */
    isCastOrParenOperand(node: Node): boolean;
    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: Node): boolean;
    /** True when this read is the receiver of an element-access chain that is
     *  written (`x['a'] = v`, `x['a']['b'] = v`, `delete x['a']['b']`), or a
     *  property write itself (`x.k = v`, `delete x.k`). The ccxt write passes
     *  match the `get_value(&…)` / `x.k` text to reach the real container, so a
     *  native read would write into a discarded clone. */
    isNativeWriteTargetBase(node: Node): boolean;
    transformPropertyAcessExpressionIfNeeded(node: any): string;
    staticKeyLookup(node: any, container: any): string | undefined;
    printElementAccessExpression(node: any, identation: any): any;
    printForStatement(node: any, identation: any): string;
    rustIntCounter(node: any, initStr: string, incrStr: string): {
        name: string;
        sign: '+' | '-';
        literal: string;
        symbol: any;
    } | undefined;
    /** True when the identifier is (part of) an assignment target, a `++`/`--` operand or a `for-in/of` head. */
    rustIdentifierIsWritten(id: any): boolean;
    private rustI64Counters;
    /** The place `X` of a `i < X.length` condition over this counter, when its uses are all admissible. */
    rustI64CounterPlan(node: any, counter: {
        name: string;
        symbol: any;
    }, condStr: string): string | undefined;
    /** A bare counter use that is an argument of a `this.m(..)` call or the value of an `x[k] = i` write. */
    rustI64BoxedUse(id: any): boolean;
    /** The registered counter's symbol when `node` is a use of it, else undefined. */
    rustI64CounterOf(node: any): any;
    /** True when every use of `name` in the printed body is a `.get(name as usize)` read or a `Value::Int(name)` box. */
    rustI64BodyIsClosed(text: string, name: string): boolean;
    private static readonly COMPARISON_OPS;
    private static readonly NATIVE_COMPARISON_OPERATORS;
    isEqualityOp(op: any): boolean;
    isLogicalOp(op: any): boolean;
    printCondition(node: any, identation: any): any;
    /** Bool-slot text of a parenthesised native comparison/predicate, else undefined. */
    printNativeParenthesizedCondition(node: any): string | undefined;
    printTruthyArgument(expression: string): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    splitFirstArgument(parsedArgs: string): [string, string];
    printComparisonInBooleanContext(node: any, identation: any): string;
    nativeEqualityText(node: any): string;
    unwrapParens(node: any): any;
    hasNativeComparisonOperand(node: any): any;
    printLogicalInBooleanContext(node: any): any;
    printWhileStatement(node: any, identation: any): string;
    printIfStatement(node: any, identation: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printNativeIncrement(op: any, operand: any, operandText: string): string | undefined;
    printPrefixUnaryExpression(node: any, identation: any): any;
    printObjectLiteralExpression(node: any, identation: any): string;
    /** The object-literal block on its own (`{ let mut m = …; m }`) — the payload a
     *  `Value::Map(..)` box carries and the initialiser a typed dict bearer needs. */
    rustObjectLiteralBlock(node: any, identation: any): string;
    printArrayLiteralExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printConditionalExpression(node: any, identation: any): string;
    private static readonly BOOL_VALUE_PREFIXES;
    private static isBoolValueExpression;
    printTernaryArm(node: any, identation?: number): string;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    /** `Object.keys/values(x)` on a typed bearer — the map's own iterators. A bearer is built
     *  from an object literal, so the helper's ws/tag filters have nothing to strip. */
    bearerEnum(node: any, kind: 'keys' | 'values'): string | undefined;
    /** The single plain-identifier argument of `Object.keys/values(…)`. */
    bearerEnumArg(node: any): Identifier | undefined;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printAwaitExpression(node: any, identation: any): string;
    printSelfCallShape(node: any, identation: any): string | undefined;
    private static readonly RUST_PROXY_CALLBACK_FIELDS;
    rustValueSpawnCall(node: any): boolean;
    printValueSpawnCall(node: any, identation: any): string | undefined;
    rustInlinesValueSpawn(method: any): boolean;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printThrowStatement(node: any, identation: any): string;
    rustCatchBindingIsRead(block: Node, name: string): boolean;
    printTryStatement(node: any, identation: any): string;
    printReturnStatement(node: any, identation: any): string;
    printBreakStatement(node: any, identation: any): string;
    printContinueStatement(node: any, identation: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printSpreadElement(node: any, identation: any): string;
    /** Base-tier methods whose every return is a fresh tag-free object
     *  literal (no venue override, no hand-written stub replaces them). */
    private static readonly RUST_PLAIN_DICT_BUILDERS;
    /** Base-tier `[Dict, Dict]` tuple helpers that hand back their `request` argument (index 1). */
    private static readonly RUST_REQUEST_TUPLE_HELPERS;
    rustNativeDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    /** A local (single binding in its function, no closure capture of a write)
     *  whose declaration and every write is a plain-dict source or nullish. A
     *  nullish value leaves a non-Dict, which `if let Value::Dict` no-ops on
     *  exactly like the helper's `_ => {}` arm. */
    rustLocalStaysPlain(ident: Identifier, depth?: number): boolean;
    /** `const [ x, p ] = this.handleUntilOption (k, r, …)` with `r` itself a
     *  plain local: element 0 is `r` handed back, and `x` is never re-written. */
    private rustTupleBindingStaysPlain;
    /** The shipped construction proof (literal-built local / handler tuple), read-only. */
    private rustShippedPlain;
    /** A use of the local: reads and element writes keep the box; a direct
     *  assignment must store a plain source; any other write shape rejects. */
    private rustUseKeepsPlain;
    /** `[ x, … ] = this.handleUntilOption (k, x, …)` — element 0 is the request
     *  argument handed back (base-tier implementation, no override). */
    private rustRequestTupleWrite;
    /** Element 0 of `this.m (…)` is a plain dict: `m` is the base-tier
     *  `handleUntilOption` (returns its `request` argument), or a method of the
     *  calling file (Rust calls it statically) whose every `return [ X, … ]`
     *  has X a plain literal / plain local, or a parameter whose argument here is. */
    private rustTupleHeadIsPlain;
    /** A pass-through parameter: never assigned in the method body. */
    private rustParamUnassigned;
    /** A value that is a fresh plain dict, nullish, or the local itself. */
    rustPlainSource(node: Node, name: string): boolean;
    /** The checker resolves the call to the base-tier implementation (a venue
     *  override could return anything). */
    private rustCalleeIsBase;
    /** The class property declaration behind `this.<name>` when its annotation proves a plain dict. */
    rustProvenDictThisField(node: Node): Declaration | undefined;
    /** `this.<field>[a]` whose declared field type's element type is itself a plain dict
     *  (`Dictionary<Dictionary<T>>`). */
    rustProvenDictThisFieldElement(node: Node): boolean;
    /** `this.<field>[k]` with a proven-dict field and a proven string key place. */
    printNativeThisFieldDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    private rustVecLocalDecisions;
    rustVecLocalIsTyped(declaration: any): boolean;
    rustVecLocalIsTypedUncached(declaration: any): boolean;
    /** The array literal's native `vec![..]`: elements are `Value`s taken by move, so a
     *  bare local is cloned (the boxed form relied on ccxt's argument-clone pass). */
    rustVecNativeLiteral(declaration: any): string | undefined;
    rustVecPushShape(call: any, name: string): boolean;
    rustVecValueUse(n: any, name: string): boolean;
    rustVecIsFinalUse(n: any, name: string): boolean;
    rustVecBoxingCallee(callee: any): boolean;
    rustVecLocalDeclarationOf(node: any): any;
    printRustVecPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    transformIdentifier(node: any, identifier: any): string;
    private literalKeyHits;
    /** Same-named sibling bindings `literalLocalUsesAll` skipped for the local being decided. */
    private literalSiblingBindings;
    /** `rustLocalUsesAll` for a literal-initialised `let`/`const`: a same-named
     *  block-scoped binding elsewhere in the function is another symbol, so its
     *  uses are skipped instead of rejecting this local. */
    literalLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    literalKeyWidened(keyArg: string | undefined): boolean;
    /** `return x`, bare or under a cast: the statement leaves the function, so the box moves. */
    rustReturnOperand(node: any): boolean;
    /** `return x as T` / `return (x)`: the cast only narrows the TS type, the
     *  statement still moves `x` out once. */
    rustCastReturnOperand(node: any): boolean;
    /** The key of `x[k]` on a bearer built from an object literal, when `k` is a
     *  `string` local that prints as a plain `Value` (no typed-local rule claimed it). */
    rustLiteralBearerKeyArg(receiver: any, keyNode: any): string | undefined;
    /** A `string` key local that prints as a plain `Value`: the helper's own
     *  `stringify` of the key is the map key. */
    rustValueKeyLocalArg(key: any, text: string, receiverName: string): string | undefined;
    private rustDictBearerDecisions;
    /** Bearers whose escapes all box a clone (the prediction-tier multi-escape rule). */
    private rustDictBearerCloned;
    /** A prediction venue: `ts/src/prediction/<id>.ts` builds nested request maps in one method. */
    private static readonly RUST_PREDICTION_VENUE_FILE;
    /** The declaration behind `node` when it is a local typed as a dict bearer. */
    rustDictBearerDeclaration(node: any): any | undefined;
    rustDictLocalIsTyped(declaration: any): boolean;
    rustDictLocalIsTypedUncached(declaration: any): boolean;
    /** A call that builds a fresh plain map — the request/params builders, `parseJson`, and the `handle*` family.
     *  The checker proves the result Dict-shaped and every copied map operand plain, so the bearer may be declared
     *  from the call and the box is cloned out once. */
    rustDictProducer(node: any): boolean;
    /** A map operand the producer only copies into a fresh map: built by the
     *  transpiler (literal / bearer / admitted producer) or a Dict-typed place.
     *  `any` is out — its content may carry a runtime tag. */
    copyOnlyPlainMap(arg: any): boolean;
    /** `x = this.extend(..)` on a bearer — the producer hands back a
     *  fresh map, so the local keeps its `IndexMap` type and the print clones the
     *  box out at the assignment. */
    rustProducerReuse(node: any): boolean;
    private static readonly RUST_DICT_PRODUCER_CALLEES;
    /** Builders that hand back one of their own arguments: the container kind is
     *  the argument's (they only add fields to it). */
    private static readonly RUST_BUILDER_PASSTHROUGH;
    /** `this.<m>(…)` whose every return is a fresh untagged
     *  container of `kind` — the method's own body, no venue override (the
     *  checker resolves the most derived declaration for `this`). */
    rustCallBuildsContainer(call: any, kind: 'map' | 'list', depth?: number): boolean;
    /** A call operand that hands back a live-store map: `x.hashmap()` (the ws
     *  order/subscription cache) or a `.subscriptions` / `.futures` read. The
     *  runtime tags those dicts, so a write must reach the store. */
    rustInitReadsTaggedStore(node: any): boolean;
    /** `this.<field>` or `this.<field>[…]` — a store the runtime may tag. */
    rustThisRootedPlace(node: any): boolean;
    /** Container kind an expression the callee body builds yields, or undefined.
     *  Shapes: a tag-free literal, a local that only ever receives element
     *  writes, a `this.` builder that copies plain operands, a pass-through
     *  builder of a built argument. */
    rustBuiltContainerKind(node: any, depth?: number): 'map' | 'list' | undefined;
    /** True when the only writes to this local inside its own function are
     *  element writes and container rebuilds (no whole-local write of another
     *  shape): the container it was built as is what it holds at every use. */
    private rustLocalContainerWritesOnly;
    /** An escape the printer boxes: a `return` of the local, or an argument of a
     *  `this.`/`super.` call. Anything else (a free-function argument) has no box
     *  site. */
    boxSiteOk(node: any): boolean;
    /** `Object.keys/values/entries`, `JSON.*`, `String(x)`, `typeof`-style readers: the printer
     *  emits them from the receiver's own text, so a bearer boxed there is a wasted clone. */
    nativeReadCallee(call: any): boolean;
    private static readonly NATIVE_READ_NAMESPACES;
    /** One `x[...]` use rooted at the bearer: a key read or a single-level `x['k'] = v`
     *  write. Chained reads stay native at the first level; a chained/compound write,
     *  `delete` and a call on the read reach the container through a `&mut Value`, so
     *  they keep the box. */
    rustDictBearerElementUse(access: any, name: string): boolean;
    /** A literal string key, or a checker-proven `string` place. A by-construction
     *  object literal carries no marker key (`__book_id`, `__cacheKind`, `__live_id`)
     *  and no ws client-handle triple, so `get_value`'s store routes cannot fire and
     *  the read is the map lookup. */
    rustDictBearerKeyOk(keyNode: any): boolean;
    /** Keys a bearer may carry: no empty/numeric key, no ws client-handle marker
     *  (`subscriptions`/`futures` serve their live registry) and nothing `__`-prefixed. */
    static rustBearerKeyTextOk(text: string): boolean;
    /** `x[k]` on a bearer with a proven `string` key place: an `IndexMap` lookup, and
     *  `get_value`'s non-`Str` key branches (always `Value::Null` here) become the
     *  `""` fallback — the bearer can never hold an empty key. */
    rustBearerDictDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `x['k'] = v` on a bearer: the insert `add_element_to_object` performs on the
     *  same plain dict, minus the box (`Arc::make_mut` guard the type proves). */
    rustBearerDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    /** `<name>.insert(<key>, <value>)` for a receiver the type proves is a map. The
     *  insert holds the receiver's `&mut`, so a value that reads it binds first; the
     *  trailing `;` keeps the block unit-typed when it stands as a statement. */
    rustBearerInsertText(name: string, keyArg: string, valueText: string): string;
    /** The `entry` key of a chained write's first hop, or undefined when the key
     *  cannot be proven. The bearer proof and the emission share this one answer,
     *  so a local is never typed on a chain the printer then prints boxed. */
    rustBearerChainHopArg(keyNode: any, keyText: string, name: string): string | undefined;
    rustBearerChainedWrite(baseExpr: any, keys: any[], keyStrs: string[], valueText: string): string | undefined;
    /** A key the bearer write takes natively: the checker proves a `string` and
     *  the printed key is a `Value::Str(..)` whose payload is that `String`, or a
     *  native `Option<String>` place. A key that names the receiver is out (the
     *  insert holds its `&mut`). */
    rustBearerWriteKeyOk(keyNode: any, receiverName: string): boolean;
    /** `m[k] = v` on a bearer with `k` a native `Option<String>` local. */
    placeKeyNative(key: any): boolean;
    /** The native map key for a printed bearer-write key, or undefined when the
     *  box's payload is not a `String`. Literal keys stay with the shared path. */
    rustBearerWriteKeyArg(keyNode: any, keyText: string, receiverName: string): string | undefined;
    /** A write key of any boxed type: `add_element_to_object` stores a non-`Str` key through `stringify_simple`,
     *  which `stringify_param` is, so the same call is the whole key conversion. Only `Value`-printed shapes qualify. */
    stringifiedWriteKeyArg(key: any, text: string): string | undefined;
    /** The printed text of a key place that is a `Value` and safe to evaluate in a
     *  key position: no nested statement, assignment or await. */
    keyTextIsValuePlace(key: any, text: string): boolean;
    /** `k in x` on a typed bearer: `in_op`'s own Dict arm — a key that is not a
     *  `Str` is never a hit — with the lookup on the bare map. */
    bearerInOp(key: any, obj: any): string | undefined;
    /** The key half of `bearerInOp`, also used while the receiver's own bearer
     *  proof is still running (its declaration probe answers "not typed" then). */
    bearerInOpKeyText(key: any): string | undefined;
    /** The printed Rust for this TS type is a `Value`: `any`, an object/dict shape,
     *  or a union of those with nullish. A `string`/number/bool place prints its own
     *  Rust type instead (the caller's string proof owns those). */
    keyPrintsAsValue(type: any): boolean;
    /** A plain object literal a bearer may be rebuilt from (`x = { .. }`): no
     *  spread, literal keys only — the same rules the declaration proof applies. */
    rustBearerPlainLiteral(node: any): boolean;
    /** `x = { .. }` (or a compound rebuild) on a bearer: the value is the map. */
    rustBearerRebuild(n: any): boolean;
    /** The move of a bearer into a parent object literal's value. Shorthand
     *  (`{ x }`) is out: the literal printer clones the name without passing
     *  through the identifier printer, so the box could not be emitted. */
    rustBearerLiteralMove(node: any): boolean;
    private rustReadBearerDecisions;
    /** The container kind a local is declared as, or undefined (no proof). */
    rustReadBearerKind(node: any): 'list' | 'map' | undefined;
    rustReadBearerKindOfDeclaration(declaration: any): 'list' | 'map' | false;
    rustReadBearerKindUncached(declaration: any): 'list' | 'map' | false;
    private rustContainerBoxUses;
    private static readonly RUST_CONTAINER_NULL_SAFE_READERS;
    private static readonly RUST_CONTAINER_LOCAL_SKIP;
    /** `'list' | 'map'` for a container local with at least one boxing use, else false. */
    rustContainerLocalKind(declaration: any): 'list' | 'map' | false;
    /** An argument rooted at a `this.` field other than `options` may be a runtime store (books, caches). */
    rustContainerInitReadsStore(init: any): boolean;
    /** A literal list/dict default (or a reader that always builds one): the local is never `Null`. */
    rustContainerInitNeverNull(init: any, kind: 'list' | 'map'): boolean;
    /** How a non-read use boxes: an argument of a plain `Value` slot of a `this.` method, the value of an object
     *  literal property or array element, or `return x`; a nullable local only feeds base `safe*` readers. */
    rustContainerBoxForm(n: any, neverNull: boolean): 'clone' | 'move' | undefined;
    /** `Value::Map(x.clone())` / `Value::from(x.clone())` at an admitted boxing use, else undefined. */
    printRustContainerLocalBox(node: any, text: string): string | undefined;
    private static readonly RUST_BORROWED_DICT_READERS;
    private static readonly RUST_BORROWED_DICT_SOURCES;
    private static readonly RUST_BORROWED_LIST_SOURCES;
    private static readonly RUST_BORROWED_ANY_KEY_READERS;
    private rustBorrowedDictDecisions;
    rustBorrowedDictLocal(declaration: any): boolean;
    rustBorrowedDictLocalUncached(declaration: any): boolean;
    /** `'dict' | 'list'` for a local that holds the shared container and lends it to every read, else undefined. */
    rustBorrowedLocalKind(declaration: any): 'dict' | 'list' | undefined;
    private rustBorrowedKinds;
    rustBorrowedLocalKindUncached(declaration: any): 'dict' | 'list' | undefined;
    private rustOptContainerLocals;
    rustDictTernaryInit(init: any): boolean;
    /** An arm that is always a map: a base `extend`/`deepExtend`/`omit` call, or a local / `params = {}`
     *  parameter whose initializer and every write are such calls. */
    rustDictTernaryArm(arm: any): boolean;
    rustDictTernaryCall(call: any): boolean;
    private rustNilResponseLocals;
    /** The container kind of a write to a borrowed local; an endpoint write to an empty `let` counts as a map. */
    rustNilResponseWriteKind(rhs: any, nilDeclared: boolean, declaration: any): 'dict' | 'list' | 'api' | undefined;
    /** A base `safeDict*` / `safeList*` call (default absent, nullish or an empty literal of its kind), or a base `extend`/`omit`. */
    rustOptContainerSourceOk(call: any, kind: 'dict' | 'list' | 'api'): boolean;
    /** The optional form's local behind an identifier, else undefined. */
    rustOptContainerOf(node: any): {
        declaration: any;
        kind: 'dict' | 'list';
    } | undefined;
    /** `let mut x: Option<crate::value::Dict> = <init>.into_opt_dict()` (`None` when declared empty). */
    printOptContainerDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** `x = None` / `x = <container read>.into_opt_dict()` for the optional form. */
    printOptContainerWrite(left: any, right: any): string | undefined;
    /** `x.is_some()` / `x.is_none()` for a null test of the optional form. */
    printOptContainerNullTest(left: any, right: any, op: any): string | undefined;
    rustBorrowedListUse(node: any): boolean;
    /** A base hand-written reader (`safeString`, `safeValue2`, `safeIntegerN`, ..) with any key. */
    rustBorrowedAnyKeyReader(call: any): boolean;
    /** `'dict' | 'list' | 'api'` for a container source the local may hold by reference. */
    rustBorrowedSourceKind(call: any): 'dict' | 'list' | 'api' | undefined;
    /** `&x` for a borrowed local (or a typed container local) passed to a hand-written any-key reader. */
    printBorrowedReaderArg(node: any, text: string): string | undefined;
    /** A base `safeDict*` / `extend` / `omit` call, or an implicit-API endpoint call. */
    rustBorrowedDictSource(call: any): boolean;
    private static readonly RUST_RECORD_LOOKUP_SOURCES;
    rustRecordLookupSource(call: any): boolean;
    /** Rust `_k` reader name of a base `this.safeX(obj, 'literal'[, default])` call, else undefined. */
    rustBorrowedDictReader(call: any): string | undefined;
    /** `self.safe_X_k(&x, "k", &[..])` when `x` is a borrowed dict local or a typed container local. */
    printBorrowedDictRead(node: any, identation: number): string | undefined;
    private rustLentListKinds;
    private rustLentListBoxes;
    rustLentListLocal(declaration: any): boolean;
    /** A call that yields a string list on every path (never `undefined`). */
    rustLentListSource(init: any): boolean;
    rustLentListLocalUncached(declaration: any): boolean;
    rustLentListUse(node: any): boolean;
    /** `Value::Arr(x.clone())` (the shared handle) or `Value::Arr(x)` at a hand-off of a lent list. */
    printRustLentListBox(node: any, text: string): string | undefined;
    private static readonly RUST_OPT_LIST_SOURCES;
    private rustOptListDecisions;
    private rustOptListBoxes;
    rustOptListLocal(declaration: any): boolean;
    /** A base-tier list source that may return `undefined` (a `safeList*` default must be absent or nullish). */
    rustOptListSource(node: any): boolean;
    rustOptListLocalUncached(declaration: any): boolean;
    /** `xs[N]` on a `string[]` parameter the body re-binds as its slice (`xs.get(N)`). */
    rustOptListParamRead(node: any): boolean;
    rustOptListParamInit(init: any): boolean;
    /** `Array.isArray`. */
    rustIsArrayIsArrayCallee(call: any): boolean;
    /** The optional list local an identifier reads (never its own declaration name). */
    rustOptListOf(node: any): any;
    rustOptListName(node: any): string;
    /** The slice an optional list reads through (empty for `None`). */
    rustOptListSlice(node: any): string;
    printOptListDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    printOptListWrite(left: any, right: any): string | undefined;
    printOptListNullTest(left: any, right: any, op: any): string | undefined;
    printOptListIsArray(node: any): string | undefined;
    printOptListLength(node: any): string | undefined;
    printOptListElement(receiverNode: any, keyNode: any): string | undefined;
    /** `i < x.length` over an optional list: the slice the `i64` counter is bounded by (the condition printed as that read). */
    rustOptListCounterBound(node: any, counter: string, condStr: string): string | undefined;
    /** `&x` at an any-key reader, the shared handle at a `Value` slot, a move at `return x`. */
    printOptListIdentifier(node: any, text: string): string | undefined;
    private static readonly RUST_HANDED_DICT_SOURCES;
    private rustHandedDictDecisions;
    rustHandedDictLocal(declaration: any): boolean;
    /** `this.m (..)` resolved to the base tier, `m` in `names`. */
    rustBaseCallNamed(call: any, names: Set<string>): boolean;
    rustHandedDictLocalUncached(declaration: any): boolean;
    private static readonly RUST_HANDED_DICT_OMIT;
    private static readonly RUST_HANDED_DICT_EXTEND;
    /** The sole extra operand of a base `this.extend (a, x)` / `this.deepExtend (a, x)` when it is a bare identifier. */
    rustHandedDictExtendOperand(call: any): any;
    /** `self.extend(a, &[&x])` / `self.omit(&x, keys, &[])` lending a handed dict local. */
    printHandedDictExtend(node: any, identation: number): string | undefined;
    /** `let mut x: crate::value::Dict = <slot read>.into_dict()` for a handed params slot. */
    printRustHandedDictSlot(element: any, printedName: string, read: string, indent: string): string | undefined;
    private rustLentParamDecisions;
    private rustLentOverrideNames;
    rustParamIsLentDict(param: any): boolean;
    rustParamIsLentDictUncached(param: any): boolean;
    /** A method of that name is declared outside the base tier: in this program (checker-visible), or in a venue
     *  source next to the base tier, which a base-only program does not load. Either keeps the `Value` signature. */
    rustLentOverridden(name: string): boolean;
    private rustVenueMethodNamesByRoot;
    /** Method names declared by the venue sources under `srcRoot` (REST, pro, prediction). */
    rustVenueMethodNames(srcRoot: string): Set<string>;
    /** The callee parameter a call argument lands in, when that parameter takes a lent dict. */
    rustLentParamsSlot(call: any, arg: any): boolean;
    /** `&x` for a handed dict local lent to a lent-params slot. */
    printLentParamsArg(node: any, text: string): string | undefined;
    /** `let mut params: Value = params.into();` heading a method whose params dict is lent: the body reads the `Value`. */
    rustLentParamsBinding(node: any, identation: number): string;
    /** A base `handleUntilOption` / `handleParam*` call, or any `this.handle*` call whose slot 1 the checker types as a
     *  dict: that slot is the params dict, like a `handle*AndParams` one. */
    rustLentSlotSource(init: any, element: any): boolean;
    /** One element read rooted at the bearer: a plain read the native op serves. */
    rustReadBearerElementUse(access: any, kind: 'list' | 'map'): boolean;
    /** Key a read-only bearer serves natively: a literal string for a map, a
     *  literal (or proven-number `Value`) index for a list. */
    rustReadBearerKeyOk(kind: 'list' | 'map', keyNode: any): boolean;
    /** Native read of one bearer level; undefined keeps the helper. */
    printReadBearerAccess(kind: 'list' | 'map', receiverText: string, keyNode: any): string | undefined;
    /** Container kind a printed `Value` expression provably yields on every path. */
    rustContainerProducingKind(node: any, seen: Set<Node>): 'list' | 'map' | undefined;
    /** Declared element type of a container indexed by a string key. */
    rustStringIndexedElementType(node: Node | undefined): Type | undefined;
    private rustNestedBearerDecisions;
    /** The declaration behind `node` when it is a local typed as a two-level
     *  dict bearer. */
    rustNestedDictBearerDeclaration(node: any): any;
    rustNestedDictLocalIsTyped(declaration: any): boolean;
    /** `{ k: { .. }, .. }` — every value an object literal, every key a plain
     *  string: the outer map's value type is the inner `IndexMap`, never a box. */
    rustNestedDictLiteral(node: any): any;
    rustNestedDictLocalIsTypedUncached(declaration: any): boolean;
    /** One use rooted at the bearer: exactly two key levels, either read
     *  (`x[k1][k2]` in a value position) or a whole-entry write (`x[k1][k2] = v`
     *  whose value never reads the receiver, which the write holds `&mut` of). */
    rustNestedBearerElementUse(access: any, name: string): boolean;
    /** The initialiser of a two-level bearer: one bucket per key, a line per entry. */
    rustNestedObjectLiteralBlock(literal: any, identation?: number): string;
    /** Read key: a bare literal, or the String an `IndexMap` lookup takes. */
    rustNestedBearerReadKey(node: any, text: string, receiver?: string): string | undefined;
    /** Write key: the `String` an `entry`/`insert` takes. */
    rustNestedBearerWriteKey(node: any, text: string, receiver?: string): string | undefined;
    /** `x[k1][k2] = v` on a two-level bearer: create the bucket, insert. */
    rustNestedBearerInsert(baseExpr: any, key1Node: any, key1Text: string, key2Node: any, key2Text: string, valueText: string): string | undefined;
    /** `x[k1] = {}` on a two-level bearer: seed the bucket, no box, no helper. */
    rustNestedBearerBucket(baseExpr: any, key1Node: any, key1Text: string, valueNode: any): string | undefined;
    /** `x[k1][k2]` on a two-level bearer: the two map lookups, boxed like `get_value`. */
    rustNestedBearerRead(baseExpr: any, key1Node: any, key2Node: any): string | undefined;
    /** Source path of a node (forward slashes). */
    provenDictFieldPath(node: Node): string;
    /** Test sources keep the helpers: tests-pipeline post-passes match `in_op(` text. */
    isTestSource(node: Node): boolean;
    /** `k in X` with a non-literal key on a dict-shaped receiver: `in_op`'s Dict arm.
     *  The Arr arm is the only other `true` path; the dict proof excludes it. */
    provenDictFieldInOp(key: any, obj: any): string | undefined;
    /** `delete X[k]` on a receiver the native-insert proof admits (never a ws
     *  subscriptions snapshot, so `try_ws_subs_remove` is dead): `shift_remove`. */
    provenDictFieldDelete(node: any): string | undefined;
    /** A key the native `if let` can borrow beside `&mut RECV`: one expression
     *  (no statement), naming neither the receiver nor its owner — the tuple
     *  would borrow `self` twice — and never a bare `self`. */
    rustDeleteKeyBorrowable(keyExpr: string, recv: string): boolean;
    /** `this.<field>` with a declared plain-dict type that is no ws container: the
     *  hand-written base builds these maps itself and never tags them. */
    untaggedDictField(node: any): boolean;
    rustDeclaredPlainDictField(node: any): boolean;
    /** `Object.keys/values(X)` in REST-tier sources (`ts/src/<id>.ts`): no ws client
     *  there, so X never carries the `__ws_subs_url`/`__ws_sub_ref` tags the helper filters. */
    provenDictFieldEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** Printed receiver usable as a method receiver, else undefined. */
    rustNativeStringReceiver(node: any, receiverText: string, kind?: string): string | undefined;
    /** Escaped text of a string-literal argument, else undefined. */
    rustNativeStringLiteralArg(node: any): string | undefined;
    printNativeStringCase(node: any, receiverText: string, method: string): string | undefined;
    rustStrCaseConvert(receiver: string, method: string): string;
    printNativeStringAffixTest(node: any, receiverText: string, method: string): string | undefined;
    printNativeStringSplit(node: any, receiverText: string): string | undefined;
    printNativeStringReplace(node: any, receiverText: string): string | undefined;
    printNativeStringPadStart(node: any, receiverText: string): string | undefined;
    printNativeStringPadEnd(node: any, receiverText: string): string | undefined;
    printNativeToFixed(node: any, receiverText: string): string | undefined;
    printNativeStringIndexOfString(node: any, receiverText: string): string | undefined;
    printNativeStringJoin(node: any, receiverText: string): string | undefined;
    rustOperandKind(node: any): string | undefined;
    printRustNativeToString(node: any, name: string): string | undefined;
    printRustNativeMathCall(node: any, op: string, parsedArg: string): string | undefined;
    printRustNativeNegate(operand: any, operandText: string): string | undefined;
    printRustNativeMod(left: any, right: any, leftText: string, rightText: string): string | undefined;
    rustIsDefiniteInt(node: any): boolean;
    rustNumericOperand(node: any): string | undefined;
    rustLengthEquality(left: any, right: any, op: any): string | undefined;
    rustNativeAddSubtract(op: any, left: any, right: any, leftType: any, rightType: any, leftText: string, rightText: string): string | undefined;
    /** 'local' for a proven plain-dict local, 'param' for a plain-kept dict parameter. */
    rustPlainReceiver(node: Node): 'local' | 'param' | undefined;
    /** A literal-key read (`x['k']` / `x.k`) on a proven plain receiver. */
    rustLiteralReadOk(receiverNode: Node, keyText: string): boolean;
    /** `x[k]` on a proven plain receiver with a `Value` key place (`string` or `any` typed). */
    rustDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    vecUse(n: any): boolean;
    loopBetween(n: any): boolean;
    vecReadShape(access: any): boolean;
    printElementAccessExpressionExceptionIfAny(node: any): any;
    provenListValue(node: any, depth?: number): boolean;
    /** Base-tier bool readers whose Rust form returns `Value::Bool` or `Value::Null`
     *  (`safe_bool*` keep only `Value::Bool` or the default; the `check_option_bool` stub). */
    private static readonly RUST_BOOL_READERS;
    private static readonly RUST_DICT_READERS;
    /** A REST venue file (`ts/src/<id>.ts`): no base / pro / prediction tier. */
    private static readonly RUST_REST_FILE;
    /** Extra plain-dict write sources (write-history proof), REST venue files only: no
     *  runtime tagged handle (book, ws subscription, cache bucket) is reachable there. */
    private rustVisiting;
    rustPlainDictSource(node: any, depth?: number): boolean;
    /** `this.options`, a parameter, or a const local whose initializer reads no `this` field
     *  but `options` and no tagged container (`hashmap`, `subscriptions`, `futures`). */
    rustUnsharedDict(arg: any): boolean;
    /** `this.m (…)` on a sync method of the calling file whose every `return` is a plain
     *  literal, a plain local, or `this.extend|omit|keysort (plain, …unshared)`. */
    rustPlainBuilder(call: any, depth: number): boolean;
    rustPlainReturn(expr: any, depth: number): boolean;
    /** The single bodied method declaration `this.m (…)` resolves to (implementation of an
     *  overload set), in the calling file or the base tier. */
    rustMethodImpl(call: any): any;
    /** The expression's Rust value is always `Value::Bool(_)` or `Value::Null`. */
    rustBoolValue(expr: any, depth?: number): boolean;
    /** A base `safeBool*` with a bool default, `checkOptionBool`, or a method (calling file or
     *  base tier) whose every `return` is such a value. */
    rustBoolCall(call: any, depth: number): boolean;
    rustEveryReturn(call: any, depth: number, ok: (e: any) => boolean): boolean;
    /** Element `index` of `this.m (…)`'s tuple is a bool value on every return path. */
    rustBoolTupleElement(expr: any, index: number, depth: number): boolean;
    /** A local whose declaration and every write store a bool value. Locals the printer or
     *  ccxt's narrowBoolLocals may declare `bool` (bool-expression initializer) are left out. */
    rustBoolLocal(ident: any, depth: number): boolean;
    /** `if (x)` on a local or `this.m (…)` proven a bool value: `x.as_bool() == Some(true)`
     *  is `is_true` on `Value::Bool`/`Value::Null`; bool slots only (leading-token boxing). */
    rustNativeTruthiness(node: any): string | undefined;
    /** `x === true|false` with `x` proven a bool value: `is_equal` against a `Value::Bool` is
     *  the payload compare there (Null matches neither). */
    rustNativeBoolEquality(left: any, right: any, op: any): string | undefined;
    rustProvenStrSource(node: any): boolean;
    rustProvenStrIdentifier(node: any): boolean;
    /** A destructuring / for-in-of target: a write the direct-assignment check cannot see. */
    rustWriteTarget(node: any): boolean;
    /** `x` / `(x as string)` → the identifier under parens / `as`. */
    rustPeelCast(node: any): any;
    /** Printed text of an operand that is always `Value::Str` / `Value::Null`, else undefined:
     *  a proven-`Str` local, a checker-`string` declared local/param (the checker-string needle rule), or
     *  `"lit" + e` / `e + "lit"` (the `add` helper's string branch always yields `Value::Str`). */
    rustStrOperand(node: any, allowChecker: boolean): string | undefined;
    printRustProvenStrEquality(left: any, right: any, op: any): string | undefined;
    /** Receiver text when the call's receiver is a proven-`Str` local (checker strings are handled separately). */
    rustReceiver(node: any, receiverText: string): string | undefined;
    /** The checker-string receiver, when it prints as a bare name (it is read twice). */
    rustCheckerStrReceiver(node: any, receiverText: string): string | undefined;
    printRustReplace(node: any, receiverText: string): string | undefined;
    printRustSplit(node: any, receiverText: string): string | undefined;
    printRustToString(node: any, receiverText: string): string | undefined;
    printRustCase(node: any, receiverText: string, method: string): string | undefined;
    /** A bodiless overload signature whose class also holds the bodied implementation. */
    baseOverload(declaration: any): boolean;
    /** `x[a ± b]` on a checker-proven list, each operand a numeric literal, a `Value` loop
     *  counter or a `const n = y.length` local: the key prints as a `Value` number, so the
     *  list arm of `get_value` (Int index, else miss) is spelled natively. */
    listArithIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    valueNumberOperand(node: any): boolean;
    vecJoinUse(access: any): boolean;
    printVecJoin(node: any): string | undefined;
    vecPropertyUse(n: any): boolean;
    private rustInProgress;
    private rustAssumed;
    rustNumericKind(node: any, depth?: number): string | undefined;
    rustCombine(kinds: (string | undefined)[]): string | undefined;
    rustStructuralKind(inner: any, depth: number): string | undefined;
    rustCallKind(call: any, depth: number): string | undefined;
    rustIdentifierKind(ident: any, depth: number): string | undefined;
    rustWrittenKind(declaration: any, depth: number): string | undefined;
    rustHasWrites(declaration: any): boolean;
    rustOrderedProven(op: any, left: any, right: any): boolean;
    rustNativeArithmetic(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    alwaysStr(node: any): boolean;
    concatOperandSafe(node: any, type: any): boolean;
    concatIsAnchored(left: any, right: any, leftType: any, rightType: any): boolean;
    /** Checker-string or proven-`Str` receiver printed as a plain name / parenthesised. */
    strReceiverText(node: any, receiverText: string): string | undefined;
    printTrim(node: any, receiverText: string): string | undefined;
    printAffixTest(node: any, receiverText: string, method: string): string | undefined;
    printReplace(node: any, receiverText: string): string | undefined;
    /** `"lit" in x` where x is a proven plain local / plain-kept Dict parameter. */
    literalInOp(key: any, obj: any): string | undefined;
    /** `Object.keys/values(x)` in `ts/src/prediction/<id>.ts` on a proven plain local. */
    predictionEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** Base-tier array readers whose result is the stored `Value::Arr` or the default argument. */
    private static readonly RUST_LIST_READERS;
    /** A source that is a `Value::Arr` or `Value::Null` (both helpers agree with `len()` / a no-op
     *  push there): `[...]`, nullish, a runtime `split`, base `toArray`, or a base `safeList*`
     *  read whose default is absent, nullish or `[...]`. */
    arrSource(node: any, allowNull: boolean): boolean;
    /** A local whose every write (declaration included) is an `arrSource`, never captured by
     *  a closure: its `Value` is a plain `Value::Arr` (the runtime never tags an array). */
    arrLocal(ident: any, allowNull: boolean): boolean;
    /** `x[i]` on an Arr-only local, except the initializer shapes the native get_value
     *  post-pass already retypes to `Vec<Value>`/native reads (it owns those). */
    arrReadLocal(ident: any): boolean;
    private ownedArrayInitializer;
    /** `x.length` on an Arr-only local: `get_array_length`'s marker arms need a Dict. */
    arrLength(node: any, receiver: string): string | undefined;
    /** `x.push(v)` statement on an Arr-only local: `append_to_array`'s cache-push arm needs a Dict. */
    arrPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    /** A `Value` local whose single declaration is an element read of a local typed as a
     *  plain `IndexMap<String, Value>`: plain data all the way down, never a book handle. */
    bearerReadLocal(ident: any): boolean;
    boolCallEquality(left: any, right: any, op: any): string | undefined;
    /** `fn(...)` whose first `(` closes at the very end (string literals skipped). */
    boolCallBalanced(text: string): boolean;
    nativeNumericAdd(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    /** Base-tier (`ts/src/base/**`) `Object.keys/values(x)` on a proven plain local. */
    baseEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    private static readonly RUST_PURE_STRING_METHODS;
    /** `x['k'].m (…)` with `m` a non-mutating string method on a checker-`string` read: no
     *  ccxt pass rewrites that target (only `.push` / calls of the read itself). */
    pureStringMethodReceiver(node: any): boolean;
    /** Locals whose Arr-only proof is in progress (a self-referencing write proves nothing new). */
    private arrVisiting;
    /** More always-`Value::Arr` sources for the Arr-only proof: base `arrayConcat` (Array on every
     *  arm), base `sortBy`/`sortBy2` of an Arr-only local (returns its input's variant), and a
     *  plain alias of a non-nullable Arr-only local (COW: the push never reaches the alias). */
    extraArrSource(n: any): boolean;
    arrAlias(ident: any): boolean;
    assumedNumericSelf(inner: any): string | undefined;
    private strVisiting;
    /** Always `Value::Str`: string-helper shapes, a `+` chain with such an operand, or an always-Str local. */
    alwaysStrOperand(node: any): boolean;
    /** A plain `Value` local, never captured by a closure, whose every write is always-Str (`x += e`
     *  keeps it), or Str|Null (proven-Str source / nullish) when the checker narrows this read to `string`. */
    alwaysStrLocal(ident: any, allowNull?: boolean): boolean;
    concatAnchor(node: any): boolean;
    strOrNullConcatIsAnchored(left: any, right: any, leftType: any, rightType: any): boolean;
    /** `Option<&str>` text of an operand that is always `Value::Str` / `Value::Null`, else undefined. */
    strOrNullOperand(node: any): string | undefined;
    strOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    rustSourceTier(node: Node): 'rest' | 'base' | 'pro' | undefined;
    plainSourceTier(node: Node): boolean;
    /** A copied/read dict argument outside REST: in pro only `this.options` or a proven plain
     *  local; in base also a parameter annotated with a plain-dict type (no `any` caller handle). */
    tierSourceOk(arg: any): boolean;
    /** `this.extend (plain, …unshared)` / `this.omit|keysort (plain, …)` called directly
     *  (not only as a builder's return): the same fresh-copy proof as `rustPlainReturn`. */
    private copyVisiting;
    freshCopy(node: any, depth: number): boolean;
    looseF64(binding: string): string;
    plainValueOperand(node: any): boolean;
    nativeCoercingArithmetic(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    nativeLooseOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    nativeStrOrNullConcat(left: any, right: any, leftText: string, rightText: string): string | undefined;
    strOrNull(node: any, depth: number): boolean;
    /** Every dict `node` can evaluate to holds `key` as Str/Null or lacks it (a read of a missing key / non-dict is Null). */
    dictFieldStrOrNull(node: any, key: string, depth: number): boolean;
    /** `this.m(..)` resolved to a same-file method with a body whose every return holds `key` as Str/Null. */
    methodFieldStrOrNull(call: any, key: string, depth: number): boolean;
    private static readonly PARAMS_SLOT_ARG;
    paramsSlot(rhs: Node, selfName: string | undefined, depth: number): boolean;
    looseI64(expr: string): string;
    looseI64OrZero(expr: string): string;
    looseSliceArm(variant: string, len: string, take: string, empty: string): string;
    looseSlice(name: string, start: string, end: string): string;
    looseIndexOf(name: string, needle: string): string;
    looseStrCase(name: string, method: string): string;
}
export {};
