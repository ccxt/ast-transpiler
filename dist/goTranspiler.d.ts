import { BaseTranspiler } from "./baseTranspiler.js";
import { SyntaxKind } from 'typescript/unstable/ast';
import type { BinaryExpression, CallExpression, Node, NodeArray, Statement } from 'typescript/unstable/ast';
export declare const ts: any;
export declare function urlsDescribeStringProducer(initializer: any): boolean;
export declare function installNilDeclaredTupleJoins(goTranspiler: any): void;
export declare function goNilJoinTypeSelfTest(): any[];
export declare const CCXT_GO_BOOL_METHOD_NAMES: string[];
export declare const CCXT_GO_STRING_PTR_METHOD_NAMES: string[];
export declare const CCXT_GO_HELPER_RETURN_TYPES: {
    GetArgMap: string;
    GetArgMapSlice: string;
    GetArgAnySlice: string;
    GetArgStringSlice: string;
    GetArgString: string;
    GetArgBool: string;
    GetArgInt64: string;
    GetArgFloat64: string;
    GetArgStringPtr: string;
    GetArgInt64Ptr: string;
    GetArgFloat64Ptr: string;
    GetArgBoolPtr: string;
    'this.ToArray': string;
    'this.SortBy': string;
    'this.SortBy2': string;
    'this.FilterBy': string;
    'this.ParseTransactionsByType': string;
    'this.ArraySlice': string;
    'this.Sort': string;
    'this.ExtractParams': string;
    'this.ArrayConcat': string;
    'this.ArraysConcat': string;
    'this.ParseCurrenciesCustom': string;
    'this.DeepExtend2': string;
    'this.Account': string;
    'this.ParseOrderBook': string;
    'this.Market': string;
    'this.Currency': string;
    'this.SafeCurrency': string;
    'this.SafeMarket': string;
    'this.Outcome': string;
    'this.SafeOutcome': string;
    'this.ParseSearchQueries': string;
    'this.ApplyEventFetchParams': string;
    'this.ParsePredictionPositions': string;
    'this.ParseDepositAddresses': string;
    'this.DerivedExchange.ParseDepositAddresses': string;
    'this.SetApiCredentials': string;
    'this.ParseDepositMethodIds': string;
    'this.ParsePortfolioDetails': string;
    'this.StringToCharsArray': string;
    'this.EthEncodeStructuredData': string;
    'this.MarketSymbols': string;
    'exchange.MarketSymbols': string;
    'this.Capitalize': string;
    'this.Uuid16': string;
    'this.Uuid22': string;
    'this.Uuid5': string;
    'this.RandomBytes': string;
    'this.FixStringifiedJsonMembers': string;
    'this.Yymmdd': string;
    'this.PrecisionFromString': string;
    'this.BinaryLength': string;
    'this.Crc32': string;
    'this.RandNumber': string;
    'this.IsDictionary': string;
    'this.Json': string;
    'this.ImplodeParams': string;
    'this.ImplodeHostname': string;
    'this.Urlencode': string;
    'this.UrlencodeWithArrayRepeat': string;
    'this.Rawencode': string;
    'this.Encode': string;
    'this.Decode': string;
    'this.EncodeURIComponent': string;
    'this.IntToBase16': string;
    'this.Remove0xPrefix': string;
    'this.StringToBase64': string;
    'this.BinaryToBase16': string;
    'this.BinaryToBase64': string;
    'this.BinaryToBase58': string;
    'this.BinaryToString': string;
    'this.Base16ToBinary': string;
    'this.Base64ToBinary': string;
    'this.Base58ToBinary': string;
    'this.BinaryConcat': string;
    'this.EthGetAddressFromPrivateKey': string;
    'this.DecimalToPrecision': string;
    'this.ExceptionMessage': string;
    'this.Strip': string;
    'this.ExtendedStarknetGetSelectorFromName': string;
    'this.ExtendedStarknetComputePoseidonHashOnElements': string;
    'this.SafeBool': string;
    'this.SafeBool2': string;
    'this.SafeBoolN': string;
    'this.SafeNumber': string;
    'this.SafeNumber2': string;
    'this.SafeNumberN': string;
    'this.SafeNumberOmitZero': string;
    'exchange.SafeNumber': string;
    'exchange.SafeNumber2': string;
    'exchange.SafeNumberN': string;
    'exchange.SafeNumberOmitZero': string;
    'this.ParseNumber': string;
    'exchange.ParseNumber': string;
    'this.NumberToString': string;
    'this.Parse8601': string;
    'this.Iso8601': string;
    'this.ParseToInt': string;
    Replace: string;
    Join: string;
    'strings.Split': string;
    'strings.Replace': string;
    'strings.ReplaceAll': string;
    'strings.Join': string;
    'strings.ToUpper': string;
    'strings.ToLower': string;
    'strings.HasPrefix': string;
    'strings.HasSuffix': string;
    'strconv.FormatInt': string;
    Slice: string;
    Trim: string;
    PadStart: string;
    PadEnd: string;
    GetLength: string;
    ObjectValues: string;
    Eddsa: string;
    Jwt: string;
    Rsa: string;
    Totp: string;
    Ecdsa: string;
    'this.SafeCurrencyCode': string;
    'this.SafeSymbol': string;
    'this.DerivedExchange.SafeCurrencyCode': string;
    'this.HandleOptionAndParams': string;
    'this.HandleOptionAndParams2': string;
    'this.HandleOptionStringAndParams': string;
    'this.HandleOptionStringAndParams2': string;
    'this.HandleOptionBoolAndParams': string;
    'this.HandleOptionBoolAndParams2': string;
    'this.HandleOptionBoolAndParamsNullable': string;
    'this.HandleOptionBoolAndParams2Nullable': string;
    'this.HandleOptionIntegerAndParamsNullable': string;
    'this.HandleOptionIntegerAndParams2Nullable': string;
    'this.HandleOptionIntegerAndParams': string;
    'this.HandleOptionIntegerAndParams2': string;
    'this.HandleParamString': string;
    'this.HandleParamString2': string;
    'this.HandleMarketTypeAndParams': string;
    'this.ParseTimeframe': string;
    'exchange.ParseTimeframe': string;
};
export declare const CCXT_GO_WS_HELPER_RETURN_TYPES: {
    'this.OrderBook': string;
    'this.IndexedOrderBook': string;
    'this.CountedOrderBook': string;
    'this.Client': string;
};
export declare function ccxtGoElementAccessType(goTranspiler: any, initializer: any, printedValue: any): string;
export declare const CCXT_GO_FAMILY_RETURN_TYPE = "*string";
export declare const CCXT_GO_FAMILY_LITERAL_RETURN_TYPE = "string";
export declare function ccxtGoTernaryType(goTranspiler: any, printedValue: any): "bool" | "float64" | "int" | "string";
export declare function ccxtGoTernaryDeclaration(node: any): any;
export declare function ccxtGoTypeOfArithmeticInitializer(goTranspiler: any, initializer: any, printedValue: any): string;
export declare function ccxtGoUnboxArithmeticDeclaration(goTranspiler: any, printed: any): any;
export declare function ccxtGoUnboxCurrencyDeclaration(goTranspiler: any, printed: any): any;
export declare function ccxtGoWrapAddChainDeclaration(printed: any): any;
export declare function ccxtGoWrapUrlsDeclaration(printed: any): any;
export declare const CCXT_GO_EXCHANGE_MAP_FIELDS: {
    Has: string;
    Api: string;
    TransformedApi: string;
    RequiredCredentials: string;
    HttpExceptions: string;
    Timeframes: string;
    Features: string;
    Exceptions: string;
    Precision: string;
    UserAgents: string;
    TokenBucket: string;
    CommonCurrencies: string;
    Limits: string;
    Fees: string;
    Status: string;
    Urls: string;
};
export declare function ccxtGoIndexableThisField(goTranspiler: any, node: any): any;
export declare function installCcxtGoIndexableTypes(goTranspiler: any): void;
export declare function ccxtGoTypeOfPrintedCall(goTranspiler: any, printedValue: any, wsTree?: boolean, initializer?: any): any;
export declare function ccxtGoTypeOfCopiedLocal(goTranspiler: any, initializer: any, printedValue: any): string;
export declare const CCXT_GO_ARRAY_BINDING_HOLDERS: string[];
export declare function installCcxtGoArrayBindingHolders(goTranspiler: any): void;
export declare function ccxtGoFamilyMethodReturnType(goTranspiler: any, node: any): any;
export declare function ccxtGoFamilyCallType(goTranspiler: any, initializer: any, printedValue: any): any;
export declare function ccxtGoUnboxSumDeclaration(goTranspiler: any, printed: any): any;
export declare function ccxtGoCounterMethodReturnType(goTranspiler: any, node: any): any;
export declare function ccxtGoNilDeclaredJoinType(goTranspiler: any, declaration: any): any;
export declare const CCXT_GO_WRITESITE_CONVERSIONS: {
    'this.SafeMarket': {
        'map[string]any': string;
    };
    'this.SafeCurrency': {
        'map[string]any': string;
    };
    'this.Omit': {
        'map[string]any': string;
    };
    'this.OmitN': {
        'map[string]any': string;
    };
    'this.OmitMap': {
        'map[string]any': string;
    };
};
export declare function ccxtGoClosureJoinType(goTranspiler: any, declaration: any): any;
export declare function ccxtGoClosureDefaultShape(goTranspiler: any, declaration: any): {
    pointerName: any;
    pointerIsTrueArm: boolean;
    valueType: any;
};
export declare const CCXT_GO_GETARG_DECLARED_TYPES: {
    Str: string;
    String: string;
    Int: string;
    Num: string;
    number: string;
    Bool: string;
    boolean: string;
    Dict: string;
    NullableDict: string;
    Market: string;
    Currency: string;
    Order: string;
    Ticker: string;
    Trade: string;
    OHLCV: string;
    Strings: string;
    'Dict[]': string;
    List: string;
};
export declare const CCXT_GO_GETARG_SAFE_CONSUMERS: {
    GetValue: string;
    InOp: string;
    IsEqual: string;
    IsDictionary: string;
    EvalTruthy: string;
    GetArrayLength: string;
    Add: string;
    Multiply: string;
    Divide: string;
    Subtract: string;
    PlusEqual: string;
    MathMin: string;
    MathMax: string;
    MathFloor: string;
    MathCeil: string;
    MathRound: string;
    MathAbs: string;
    Ternary: string;
    IsString: string;
    IsNumber: string;
    IsInteger: string;
    IsFloat: string;
    IsBool: string;
    IsArray: string;
    IsObject: string;
    ToUpper: string;
    ToLower: string;
    ToString: string;
    ToFloat64: string;
    ParseInt: string;
    NumberToString: string;
    Iso8601: string;
    Sum: string;
    ToArray: string;
    SafeString: string;
    SafeString2: string;
    SafeStringN: string;
    SafeInteger: string;
    SafeNumber: string;
    SafeBool: string;
    SafeSymbol: string;
    SafeMarket: string;
    SafeCurrency: string;
    SafeCurrencyCode: string;
    SafeDict: string;
    SafeList: string;
    SafeValue2: string;
    SafeMapTyped: string;
    MapTyped: string;
    DerefScalar: string;
    AddElementToObject: {
        '0': string;
        '1': string;
        '2': string;
    };
    Market: string;
    MarketId: string;
    Currency: string;
    MarketSymbols: string;
    PriceToPrecision: string;
    AmountToPrecision: string;
    DecimalToPrecision: string;
    ImplodeParams: string;
    ParseTimeframe: {
        '0': string;
    };
    HandleOptionAndParams: string;
    HandleMarketTypeAndParams: string;
    HandleSubTypeAndParams: string;
    mathMin: string;
    mathMax: string;
    GetLimit: string;
    CreateOrderRequest: string;
    EditOrderRequest: string;
    HandleMarginModeAndParams: string;
    HandleUntilOption: string;
    HandleProductTypeAndParams: string;
    HandleParamString: string;
    HandleParamBool: string;
    HandleParamInt: string;
    FilterBySinceLimit: string;
    FilterBySymbolSinceLimit: string;
    FilterBySymbolsSinceLimit: string;
    FilterByValueSinceLimit: string;
    FilterByCurrencySinceLimit: string;
    ParseTrades: string;
    ParseOrders: string;
    ParseOHLCVs: string;
    ParseTransactions: string;
    ParseLedger: string;
    ParseTransfers: string;
    ParseIncomes: string;
    ParseConversions: string;
    ParseLiquidations: string;
    ParseFundingRateHistories: string;
    ParsePredictionTrades: string;
    ParsePredictionOrders: string;
    Outcome: string;
    Symbol: string;
    LoadMarketsAsync: string;
    LoadOutcomeAsync: string;
    FetchOrdersAsync: string;
    FetchOrdersByStatusAsync: string;
    FetchOrdersByStateAsync: string;
    FetchCanceledAndClosedOrdersAsync: string;
    FetchOpenOrdersAsync: string;
    FetchMyTradesAsync: string;
    FetchPaginatedCallDynamicAsync: string;
    FetchPaginatedCallCursorAsync: string;
    FetchPaginatedCallDeterministicAsync: string;
    FetchPaginatedCallIncrementalAsync: string;
    FetchTransactionsHelperAsync: string;
    FetchTransactionsWithMethodAsync: string;
    FetchDepositsWithdrawalsAsync: string;
    WatchTradesForSymbolsAsync: string;
    WatchOrderBookForSymbolsAsync: string;
    WatchOHLCVForSymbolsAsync: string;
    DeepExtend: {
        '*': string;
    };
    SubstituteString: string;
    GetClosestLimit: {
        '0': string;
    };
    CheckRequiredArgument: {
        '1': string;
    };
    isEmpty: {
        '0': string;
    };
    isArray: {
        '0': string;
    };
    filterByArray: {
        '2': string;
    };
    filterByArrayTickers: {
        '2': string;
    };
    filterByArrayPositions: {
        '2': string;
    };
    handleWithdrawTagAndParams: {
        '0': string;
    };
    FindNearestCeiling: {
        '1': string;
    };
    ParseToInt: {
        '0': string;
    };
    ParseToNumeric: {
        '0': string;
    };
    ParseBorrowRateHistory: {
        '1': string;
        '2': string;
        '3': string;
    };
};
export declare const CCXT_GO_ASYNC_ELEM_TYPES: {
    AddMarginAsync: string;
    ApproveBuilderCodeAsync: string;
    CancelAllContractOrdersAsync: string;
    CancelAllOrdersAfterAsync: string;
    CancelAllOrdersAsync: string;
    CancelAllOrdersRequestAsync: string;
    CancelAllOrdersWsAsync: string;
    CancelAllSpotOrdersAsync: string;
    CancelAllUtaOrdersAsync: string;
    CancelContractOrderAsync: string;
    CancelOrderAsync: string;
    CancelOrderWsAsync: string;
    CancelOrdersAsync: string;
    CancelOrdersForSymbolsAsync: string;
    CancelOrdersRequestAsync: string;
    CancelOrdersWsAsync: string;
    CancelSpotOrderAsync: string;
    CancelTwapOrderAsync: string;
    CancelUnifiedOrderAsync: string;
    CancelUtaOrderAsync: string;
    CancelUtaOrdersAsync: string;
    ClosePositionAsync: string;
    CompleteRawTopicsAsync: string;
    CreateApiKeyAsync: string;
    CreateContractOrderAsync: string;
    CreateContractOrdersAsync: string;
    CreateConvertTradeAsync: string;
    CreateDepositAddressAsync: string;
    CreateExtendedOrderRequestAsync: string;
    CreateGiftCodeAsync: string;
    CreateMarketBuyOrderWithCostAsync: string;
    CreateMarketOrderWithCostAsync: string;
    CreateMarketSellOrderWithCostAsync: string;
    CreateOrDeriveApiKeyAsync: string;
    CreateOrderAsync: string;
    CreateOrderRequestAsync: string;
    CreateOrderWsAsync: string;
    CreateOrdersAsync: string;
    CreateOrdersWsAsync: string;
    CreateSpotOrderAsync: string;
    CreateSpotOrderRequestAsync: string;
    CreateSpotOrdersAsync: string;
    CreateSwapOrderAsync: string;
    CreateTrailingAmountOrderAsync: string;
    CreateTrailingPercentOrderAsync: string;
    CreateTwapOrderAsync: string;
    CreateUtaOrderAsync: string;
    CreateUtaOrdersAsync: string;
    EditContractOrderAsync: string;
    EditOrderRequestAsync: string;
    EditOrderWsAsync: string;
    EditOrdersAsync: string;
    EditSpotOrderAsync: string;
    EstimateTxFeeAsync: string;
    FetchAccountAsync: string;
    FetchAccountHelperAsync: string;
    FetchAccountPositionsAsync: string;
    FetchAccountSettingsAsync: string;
    FetchAccountsAsync: string;
    FetchAccountsV2Async: string;
    FetchAccountsV3Async: string;
    FetchAmmOrdersAsync: string;
    FetchApiKeyAsync: string;
    FetchApiKeysAsync: string;
    FetchBalanceAsync: string;
    FetchBalanceWsAsync: string;
    FetchBidsAsksAsync: string;
    FetchBorrowInterestAsync: string;
    FetchBorrowRateHistoriesAsync: string;
    FetchBorrowRateHistoryAsync: string;
    FetchCanceledAndClosedOrdersAsync: string;
    FetchCanceledOrdersAsync: string;
    FetchClosedContractOrdersAsync: string;
    FetchClosedOrderAsync: string;
    FetchClosedOrdersAsync: string;
    FetchClosedOrdersWsAsync: string;
    FetchClosedSpotOrdersAsync: string;
    FetchContractBalanceAsync: string;
    FetchContractDepositAddressAsync: string;
    FetchContractDepositsAsync: string;
    FetchContractMarketsAsync: string;
    FetchContractOHLCVAsync: string;
    FetchContractOrderAsync: string;
    FetchContractOrdersAsync: string;
    FetchContractOrdersByStatusAsync: string;
    FetchContractTickersAsync: string;
    FetchContractWithdrawalsAsync: string;
    FetchConvertCurrenciesAsync: string;
    FetchConvertQuoteAsync: string;
    FetchConvertTradeAsync: string;
    FetchConvertTradeHistoryAsync: string;
    FetchCrossBorrowRatesAsync: string;
    FetchCurrenciesAsync: string;
    FetchCurrenciesFromCacheAsync: string;
    FetchCurrenciesFromWebAsync: string;
    FetchCurrencyAsync: string;
    FetchCurrencyByIdAsync: string;
    FetchDefaultMarketsAsync: string;
    FetchDepositAddressAsync: string;
    FetchDepositAddressDefaultAsync: string;
    FetchDepositAddressSupplementAsync: string;
    FetchDepositAddressesByNetworkAsync: string;
    FetchDepositAsync: string;
    FetchDepositMethodIdAsync: string;
    FetchDepositMethodIdsAsync: string;
    FetchDepositMethodsAsync: string;
    FetchDepositWithdrawFeesAsync: string;
    FetchDepositsAsync: string;
    FetchDepositsOrWithdrawalsHelperAsync: string;
    FetchDepositsWithdrawalsAsync: string;
    FetchDepositsWsAsync: string;
    FetchDerivativesMarketLeverageTiersAsync: string;
    FetchDerivativesOpenInterestHistoryAsync: string;
    FetchEventsByQueryAsync: string;
    FetchFinancialBalanceAsync: string;
    FetchFundingHistoryAsync: string;
    FetchFundingIntervalAsync: string;
    FetchFundingIntervalsAsync: string;
    FetchFundingLimitsAsync: string;
    FetchFundingRateAsync: string;
    FetchFundingRateHistoryAsync: string;
    FetchFundingRatesAsync: string;
    FetchFutureMarketsAsync: string;
    FetchGreeksAsync: string;
    FetchHip3MarketsAsync: string;
    FetchInverseSwapMarketsAsync: string;
    FetchL2OrderBookAsync: string;
    FetchL3OrderBookAsync: string;
    FetchLedgerAsync: string;
    FetchLedgerByEntriesAsync: string;
    FetchLedgerEntriesByIdsAsync: string;
    FetchLedgerEntryAsync: string;
    FetchLeverageAsync: string;
    FetchLeverageTiersAsync: string;
    FetchLiquidationsAsync: string;
    FetchLongShortRatioHistoryAsync: string;
    FetchMarginAdjustmentHistoryAsync: string;
    FetchMarginBalanceAsync: string;
    FetchMarginModeAsync: string;
    FetchMarkOHLCVAsync: string;
    FetchMarkPriceAsync: string;
    FetchMarkPricesAsync: string;
    FetchMarketAsync: string;
    FetchMarketByIdAsync: string;
    FetchMarketLeverageTiersAsync: string;
    FetchMarketsAsync: string;
    FetchMarketsByTypeAndSubTypeAsync: string;
    FetchMarketsByTypeAsync: string;
    FetchMarketsFromAPIAsync: string;
    FetchMarketsFromCacheAsync: string;
    FetchMarketsFromWebAsync: string;
    FetchMarketsV1Async: string;
    FetchMarketsV2Async: string;
    FetchMarketsV3Async: string;
    FetchMyBuysAsync: string;
    FetchMyContractTradesAsync: string;
    FetchMyDustTradesAsync: string;
    FetchMyLiquidationsAsync: string;
    FetchMySellsAsync: string;
    FetchMySettlementHistoryAsync: string;
    FetchMySpotTradesAsync: string;
    FetchMyTradesAsync: string;
    FetchMyTradesWsAsync: string;
    FetchMyUtaTradesAsync: string;
    FetchNetworkDepositAddressAsync: string;
    FetchOHLCVAsync: string;
    FetchOHLCVWsAsync: string;
    FetchOpenInterestAsync: string;
    FetchOpenInterestHistoryAsync: string;
    FetchOpenOrderAsync: string;
    FetchOpenOrdersAsync: string;
    FetchOpenOrdersV1Async: string;
    FetchOpenOrdersV2Async: string;
    FetchOpenOrdersWsAsync: string;
    FetchOpenSpotOrdersAsync: string;
    FetchOpenSwapOrdersAsync: string;
    FetchOptionAsync: string;
    FetchOptionChainAsync: string;
    FetchOptionMarketsAsync: string;
    FetchOptionOHLCVAsync: string;
    FetchOptionPositionsAsync: string;
    FetchOptionUnderlyingsAsync: string;
    FetchOrderAsync: string;
    FetchOrderBookAsync: string;
    FetchOrderBooksAsync: string;
    FetchOrderClassicAsync: string;
    FetchOrderDefaultAsync: string;
    FetchOrderSupplementAsync: string;
    FetchOrderTradesAsync: string;
    FetchOrderWsAsync: string;
    FetchOrdersAsync: string;
    FetchOrdersByIdsAsync: string;
    FetchOrdersByStateAsync: string;
    FetchOrdersByStatesAsync: string;
    FetchOrdersByStatusAsync: string;
    FetchOrdersByStatusWsAsync: string;
    FetchOrdersByTypeAsync: string;
    FetchOrdersClassicAsync: string;
    FetchOrdersHelperAsync: string;
    FetchOrdersWithMethodAsync: string;
    FetchOrdersWsAsync: string;
    FetchPaginatedCallCursorAsync: string;
    FetchPaginatedCallDeterministicAsync: string;
    FetchPaginatedCallIncrementalAsync: string;
    LoadOutcomeAsync: string;
    FetchPaginatedCallDynamicAsync: string;
    FetchPortfoliosAsync: string;
    FetchPositionAsync: string;
    FetchPositionHistoryAsync: string;
    FetchPositionModeAsync: string;
    FetchPositionWsAsync: string;
    FetchPositionsADLRankAsync: string;
    FetchPositionsAsync: string;
    FetchPositionsForSymbolAsync: string;
    FetchPositionsHistoryAsync: string;
    FetchPositionsRiskAsync: string;
    FetchPositionsWsAsync: string;
    FetchPrivateTradingFeeAsync: string;
    FetchPrivateTradingFeesAsync: string;
    FetchPrivateTransactionFeesAsync: string;
    FetchPublicTradingFeeAsync: string;
    FetchPublicTradingFeesAsync: string;
    FetchPublicTransactionFeesAsync: string;
    FetchRawActiveMarketsAsync: string;
    FetchRawEventsBySearchAsync: string;
    FetchRawEventsListAsync: string;
    FetchRawMarketsBySearchAsync: string;
    FetchRawMarketsPagedAsync: string;
    FetchRawMarketsByTagsAsync: string;
    FetchRawMarketsListAsync: string;
    FetchRawQuestionsBySearchAsync: string;
    FetchRawQuestionsListAsync: string;
    FetchRawTopicsAsync: string;
    FetchRawTopicsByQueriesAsync: string;
    FetchSeriesEventsAsync: string;
    FetchSettlementHistoryAsync: string;
    FetchSpotBalanceAsync: string;
    FetchSpotMarketsAsync: string;
    FetchSpotOHLCVAsync: string;
    FetchSpotOrderAsync: string;
    FetchSpotOrderTradesAsync: string;
    FetchSpotOrdersAsync: string;
    FetchSpotOrdersByStatesAsync: string;
    FetchSpotOrdersByStatusAsync: string;
    FetchStatusAsync: string;
    FetchSwapAndFutureMarketsAsync: string;
    FetchSwapBalanceAsync: string;
    FetchSwapMarketsAsync: string;
    FetchTicker2Async: string;
    FetchTickerAsync: string;
    FetchTickerV1AndV2Async: string;
    FetchTickerV1Async: string;
    FetchTickerV2Async: string;
    FetchTickerV3Async: string;
    FetchTickerWsAsync: string;
    FetchTickersAsync: string;
    FetchTickersV2Async: string;
    FetchTickersV3Async: string;
    FetchTradeQuoteAsync: string;
    FetchTradesAsync: string;
    FetchTradesWsAsync: string;
    FetchTradingFeeAsync: string;
    FetchTradingFeesAsync: string;
    FetchTradingFeesWsAsync: string;
    FetchTradingLimitsAsync: string;
    FetchTradingLimitsByIdAsync: string;
    FetchTransactionFeeAsync: string;
    FetchTransactionFeesAsync: string;
    FetchTransactionsAsync: string;
    FetchTransactionsByTypeAsync: string;
    FetchTransactionsWithMethodAsync: string;
    FetchTransferAsync: string;
    FetchTransfersAsync: string;
    FetchUSDTMarketsAsync: string;
    FetchUTAMarketsAsync: string;
    FetchUTAOHLCVAsync: string;
    FetchUnderlyingAssetsAsync: string;
    FetchUtaBalanceAsync: string;
    FetchUtaCanceledAndClosedOrdersAsync: string;
    FetchUtaMarketsAsync: string;
    FetchUtaOrderAsync: string;
    FetchUtaOrdersByStatusAsync: string;
    FetchVolatilityHistoryAsync: string;
    FetchWithdrawAddressesAsync: string;
    FetchWithdrawalAsync: string;
    FetchWithdrawalsAsync: string;
    FetchWithdrawalsWsAsync: string;
    GetAssetHistoryRowsAsync: string;
    HandleAccountIndexAsync: string;
    HandleNetworkIdAndParamsAsync: string;
    HandlePortfolioAndParamsAsync: string;
    HandleUTAAndParamsAsync: string;
    InternalFetchTransfersAsync: string;
    IsUnifiedEnabledAsync: string;
    LoadAccountsAsync: string;
    LoadLeverageBracketsAsync: string;
    LoadMarketsAsync: string;
    LoadQuoteTokenAsync: string;
    LoadTradeMarketAsync: string;
    ModifyLeverageAndMarginModeAsync: string;
    ModifyMarginHelperAsync: string;
    PrepareAccountRequestWithCurrencyCodeAsync: string;
    PrepareParadexDomainAsync: string;
    QueryContractsAsync: string;
    QueryTransactionsByEventTypeAsync: string;
    RequestWalletHistoryRowsAsync: string;
    ResolveEventSeriesTickersAsync: string;
    SetContractLeverageAsync: string;
    SetLeverageAsync: string;
    SetMarginAsync: string;
    SignAndCancelAllOrdersAsync: string;
    SignAndCancelOrderAsync: string;
    SignAndCreateOrderAsync: string;
    SignInWithPrivateKeyAsync: string;
    TransferAsync: string;
    TransferBetweenMainAndSubAccountAsync: string;
    TransferBetweenSubAccountsAsync: string;
    TransferClassicAsync: string;
    TransferInAsync: string;
    TransferOutAsync: string;
    TransferUtaAsync: string;
    WatchBalanceAsync: string;
    WatchBidsAsksAsync: string;
    WatchFundingRateAsync: string;
    WatchFundingRatesAsync: string;
    WatchLiquidationsAsync: string;
    WatchLiquidationsForSymbolsAsync: string;
    WatchMarkPriceAsync: string;
    WatchMarkPricesAsync: string;
    WatchMyLiquidationsAsync: string;
    WatchMyLiquidationsForSymbolsAsync: string;
    WatchMyTradesAsync: string;
    WatchMyTradesForSymbolsAsync: string;
    WatchOHLCVAsync: string;
    WatchOHLCVForSymbolsAsync: string;
    WatchOrdersAsync: string;
    WatchOrdersForSymbolsAsync: string;
    WatchPositionAsync: string;
    WatchPositionsAsync: string;
    WatchTickerAsync: string;
    WatchTickersAsync: string;
    WatchTradesAsync: string;
    WatchTradesForSymbolsAsync: string;
    WithdrawAsync: string;
    WithdrawWsAsync: string;
    promiseAll: string;
    FetchDydxAccountAsync: string;
    FetchExtendedAccountAsync: string;
    FetchEventsAsync: string;
};
export declare const CCXT_GO_ASYNC_FORWARD_SAFE: any[];
export declare const CCXT_GO_ASYNC_ELEM_EXCLUDED: string[];
export declare function ccxtGoEndpointElement(goTranspiler: any, call: any): any;
export declare function ccxtGoAsyncListHolderLines(goTranspiler: any, awaitNode: any, target: string, lead: string, wrapped: string): string;
export declare function ccxtGoAwaitReceiveUnbox(goTranspiler: any, awaitNode: any, printedInitializer: any): {
    goType: any;
    wrap: (recv: any) => string;
} | {
    goType: any;
    holder: boolean;
    wrap: (recv: any) => string;
};
export { ccxtGoTupleResultJoin };
export declare function installCcxtGoLocalTypes(goTranspiler: any, unifiedInt64Params?: any): void;
export declare function ccxtGoTupleParamsElementType(goTranspiler: any, element: any): any;
declare class GoNilDeclaredAssignmentScan {
    [key: string]: any;
    constructor(goTranspiler: any, declaration: any, name: any);
    isName(node: any): boolean;
    isStringWrite(rhs: any): boolean;
    classifyIdentifier(node: any, assigned: any): any;
    inNestedFunction(node: any): boolean;
    walkExpression(node: any, assigned: any): any;
    walkStatements(statements: any, assigned: any): {
        assigned: any;
        exit: string;
    };
    walkStatement(statement: any, assigned: any): any;
    run(): any;
}
export declare function installCcxtGoNilDeclaredStringJoins(goTranspiler: any): void;
export declare class GoNilDeclaredValueAssignmentScan extends GoNilDeclaredAssignmentScan {
    valueTypeOf(rhs: any): "bool" | "float64" | "int";
    classifyIdentifier(node: any, assigned: any): any;
    isStringWrite(rhs: any): boolean;
}
export declare function installCcxtGoNilDeclaredValueJoins(goTranspiler: any): void;
export declare function ccxtGoNilDeclaredParseNumberJoin(goTranspiler: any, declaration: any): any;
export declare function installCcxtGoNilDeclaredParseNumberJoins(goTranspiler: any): void;
export declare function ccxtGoTernaryLiftJoin(goTranspiler: any, declaration: any, literal: any): {
    joinType: any;
    whenTrue: any;
    whenFalse: any;
    whenTrueLocal: any;
    whenFalseLocal: any;
    whenTrueCall: any;
    whenFalseCall: any;
};
export declare function installCcxtGoLimitLocals(goTranspiler: any): void;
declare function ccxtGoTupleResultCall(node: any): boolean;
declare function ccxtGoTupleResultFirst(call: any): any;
declare function ccxtGoTupleResultUnwrap(text: any): any;
declare function ccxtGoTupleResultJoin(printed: any, count: any, declare: any, untypedOk?: boolean, first?: string): string;
export { ccxtGoTupleResultCall, ccxtGoTupleResultFirst, ccxtGoTupleResultUnwrap };
export declare function installCcxtGoTupleSlotReads(goTranspiler: any): void;
export declare function installCcxtGoParamTypes(goTranspiler: any): any;
export declare function goDynamicCallParamsCheck(): string[];
export declare const GO_BASE_DICT_PARAMS: {
    [method: string]: number[];
};
export declare function installCcxtGoDictParams(goTranspiler: any): any;
export declare function goDictParamTypesSelfTest(): string[];
export declare function installCcxtGoGb05ParamTypes(goTranspiler: any): any;
export declare function goParseFrameParamTypesSelfTest(): string[];
export declare function installCcxtGoGb11HandleErrorsCode(goTranspiler: any): any;
export declare function goHandleErrorsCodeSelfTest(): string[];
export declare function installCcxtGoSignTyping(goTranspiler: any): void;
export declare function installFmGo5G01(goTranspiler: any): void;
export declare function installFmGo5G04(goTranspiler: any): void;
export declare function installFmGo5GP08(goTranspiler: any): void;
export declare function installFmGo5OG02(goTranspiler: any): void;
export declare function installRfGo5OwnedTables(goTranspiler: any): void;
export declare function installNumParams(goTranspiler: any): void;
export declare function installCcxtGoHooks(goTranspiler: any, unifiedInt64Params?: any): void;
declare function alignGoTrailingComments(content: string): string;
export { alignGoTrailingComments, };
export declare class GoTranspiler extends BaseTranspiler {
    goScopeDescendants: WeakMap<object, any[]>;
    goDescendantsOf(scope: any): any[];
    hasNodeWhere(scope: Node | undefined, predicate: (n: any) => boolean): boolean;
    binaryExpressionsWrappers: any;
    wrapThisCalls: boolean;
    wrapCallMethods: string[];
    unifiedStringParams: {
        [method: string]: number[];
    };
    unifiedSliceParams: {
        [method: string]: {
            [index: number]: string;
        };
    };
    unifiedBoolParams: {
        [method: string]: number[];
    };
    uncalledStringParams: {
        [method: string]: number[];
    };
    stringPointerTupleCalls: string[];
    siblingStringPassthroughPattern: RegExp | undefined;
    predictionMapFields: Set<string>;
    goTupleSlotTypes: {
        [producer: string]: string[];
    };
    goTupleValueDefaultArg: {
        [producer: string]: number;
    };
    goSliceLiteralTypes: Map<any, string>;
    CCXT_GO_GETARG_DECLARED_TYPES: any;
    CCXT_GO_GETARG_SAFE_CONSUMERS: any;
    goGetArgTypeCache: WeakMap<any, string | undefined>;
    goGetArgTypeComputing: Set<any>;
    goLocalTypeResolution: Set<any>;
    goSelfConcatLeafCache: WeakMap<any, boolean>;
    goLocalStaticTypeCache: WeakMap<object, string>;
    goBinaryMemo: Map<object, Map<string, any>> | undefined;
    asyncMethodSuffix: string;
    asyncSuffixExemptPaths: RegExp[];
    classNameMap: {
        [key: string]: string;
    };
    DEFAULT_RETURN_TYPE: string;
    ASYNC_BODY_SUFFIX: string;
    DEFAULT_IDENTATION: string;
    constructor(config?: {});
    initConfig(): void;
    printSuperCallInsideConstructor(node: any, identation: any): string;
    printStringLiteral(node: any): any;
    transformFunctionNameIfNeeded(name: any): string;
    getStructFieldCells(node: any): string[];
    printPropertyDeclaration(node: any, identation: any): string;
    printStruct(node: any, indentation: any): string;
    printNewStructMethod(node: any): string;
    printClass(node: any, identation: any): string;
    /**
     * gofmt's declaration-list rule (go/printer nodes.go `declList`): a top-level
     * declaration that carries a doc comment is separated from the previous declaration
     * by exactly one blank line (`min = 2` linebreaks), while a declaration without one
     * keeps the source's own separation (the printer emits members adjacent to the
     * closing brace above them). `printClass` used to join every member with a bare
     * "\n", so a method whose leading `/** ... *` + `/` comment follows the previous
     * method's closing brace came out as `}\n/**` and gofmt re-inserted the blank line.
     */
    joinTopLevelDecls(decls: string[]): string;
    /**
     * True when the emitted declaration text opens with its doc comment - the comment
     * group gofmt attaches to the declaration (`getDoc(d) != nil` in go/printer).
     */
    startsWithComment(decl: string): boolean;
    /**
     * Indent every non-blank line of `lines` by `identation` levels. gofmt trims trailing
     * whitespace, so an indented *blank* line (only the indentation of a blank source
     * line) must stay empty instead of becoming whitespace-only text.
     */
    printPropertyAccessModifiers(node: any): string;
    printSpreadElement(node: any, identation: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printAsyncDeclarationPair(node: any, identation: any, def: string, funcBody: string, isMethod: boolean): string;
    printFunctionDeclaration(node: any, identation: any): string;
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
    getAsyncBodyName(node: any, goName: string): string;
    /**
     * Parameter list of the body: the channel it must fill, then the original parameters
     * verbatim (including the `optionalArgs ...any` tail), so the trampoline can forward
     * its own arguments unchanged.
     */
    printAsyncBodyParameters(node: any): string;
    /**
     * Arguments the trampoline forwards to its body, matching printMethodParameters:
     * the declared parameters in order, plus the variadic `optionalArgs...` tail when
     * the function has any defaulted parameter.
     */
    printAsyncTrampolineArgs(node: any): string;
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
    printAsyncTrampolineBlock(node: any, identation: any, callee: string): string;
    /**
     * Go name of an async (channel returning) declaration: `fetchTicker` -> `FetchTickerAsync`.
     * Empty `asyncMethodSuffix` (the default) keeps the plain name, so the suffix is opt-in.
     */
    printAsyncDeclarationName(node: any, goName: string): string;
    /**
     * Resolve the declaration a call/property access refers to and append `asyncMethodSuffix`
     * when it is an async function. Uses the checker, so `this.x()`, `super.x()`, `obj.x()` and
     * bare `x()` all agree with the declaration site. Unresolvable or non-function symbols
     * (properties, `any` receivers, JS builtins) keep the plain name.
     */
    applyAsyncSuffixToCallee(nameNode: any, goName: string): string;
    isAsyncSuffixExempt(decl: any): boolean;
    printMethodDefinition(node: any, identation: any): string;
    printFunctionDefinition(node: any, identation: any): string;
    printGoSignature(node: any, identation: any, receiver: string): string;
    printMethodParameters(node: any): any;
    printParameter(node: any, defaultValue?: boolean): string;
    printParameterType(node: any): string;
    printFunctionType(node: any): string;
    isWholePrintedCall(value: string, open: number): boolean;
    goTypeOfInitializer(initializer: any, printedValue: string): string | undefined;
    goUnwrapPrintedParens(printedText: string): string;
    goLocalStaticType(node: any): string | undefined;
    goInferredLocalStaticType(node: any): string | undefined;
    goStringFieldStaticType(node: any, printedText: string): string | undefined;
    goDeclaredParamStaticType(node: any): string | undefined;
    goNilProvenStringDeref(node: any): boolean;
    goDefaultedSafeStringLocal(node: any): boolean;
    goDefaultedSafeStringCall(node: any): boolean;
    goAssertedStringDeref(node: any): boolean;
    goDerefableStringOperand(node: any): boolean;
    goStringConcatOperandType(node: any, printedText: string): string | undefined;
    goNativeStringConcat(node: any, leftText: string, rightText: string): {
        goType: string;
        text: string;
    } | undefined;
    goOperandStaticType(node: any, printedText: string): string | undefined;
    goStringCallStaticType(node: any, printedText: string): string | undefined;
    goConstFloatStaticType(node: any): string | undefined;
    isNonZeroIntegerLiteral(node: any): boolean;
    isNonZeroFloatLiteral(node: any): boolean;
    goConstantIntValue(node: any): number | undefined;
    goInsideTypedDeclarationInitializer(node: any): boolean;
    goNativeNumericResultType(op: any, leftType: string, rightType: string, node: any): string | undefined;
    goConstantProductKind(node: any): string | undefined;
    goNativeConstantProductType(node: any, leftType: string, rightType: string): string | undefined;
    goNativeOperandText(node: any, printedText: string): string;
    goNativeArithmeticType(node: any): string | undefined;
    goNativeArithmetic(node: any, leftText?: any, rightText?: any): {
        goType: string;
        text: string;
    } | undefined;
    goNonNilPointerSubtractionText(node: any, leftText: string, rightText: string): string | undefined;
    goInt64Operand(node: any, printedText: string): {
        pointer: boolean;
        text: string;
    } | undefined;
    goNonNilPointerAdditionText(node: any, leftText: string, rightText: string): string | undefined;
    goNonNilPointerProductText(node: any, leftText: string, rightText: string): string | undefined;
    goInt64ProductOperand(node: any, printedText: string): {
        pointer: boolean;
        text: string;
    } | undefined;
    goDefaultedSafeIntegerCall(node: any): boolean;
    goNonNilPointerDivisionText(node: any, leftText: string, rightText: string): string | undefined;
    goPointerNumberIsNonNil(ident: any): boolean;
    goDivisionConsumerIgnoresBox(node: any): boolean;
    goFloatDivisionText(node: any, leftType: string, rightType: string, leftText: string, rightText: string): string;
    goNativeBinaryText(node: any, symbol: string, leftText: string, rightText: string): string;
    goNativeCompoundAssignment(op: any, leftNode: any, leftText: string, rightNode: any, rightText: string): string | undefined;
    goEnclosingFunction(node: any): any;
    goTypeNameIsShadowed(scope: any, goType: string): boolean;
    goIsNativeAppendShape(receiverNode: any, pushNode: any): boolean;
    goNativeAppendReceiver(pushNode: any): string | undefined;
    goResolvedLocalGoType(receiver: any): string | undefined;
    goStringListAppendsAString(pushNode: any): boolean;
    goStringValueNodeIsProven(node: any): boolean;
    goLocalIsSafeToType(scope: any, declaration: any, varName: string, goType: string, stringWriteProven?: boolean): boolean;
    goSelfConcatWriteIsString(node: any, varName: string): boolean;
    goSelfConcatIsString(node: any, varName: string): boolean;
    goPointerWriteConversion(right: any, goType: string): 'nil' | 'wrap' | undefined;
    goPointerWriteText(node: any, identation: any): string | undefined;
    goStringPointerStore(node: any, value: string, identation: any): string | undefined;
    goOutermostFunction(node: any): any;
    goStringReturningThisCall(call: any): boolean;
    goStringCallLocals: WeakMap<object, Map<string, {
        clash: boolean;
        names: Map<any, string>;
    }>>;
    goStringCallLocalName(call: any): string | undefined;
    goSafeDictLocalArgs(initializer: any): {
        container: any;
        key: any;
    };
    goSafeAccessorLocalArgs(initializer: any, accessor: string, fallbackKind: SyntaxKind, fallbackItems: string): {
        container: any;
        key: any;
    };
    goIsNilComparisonOperand(node: any, parent: any): boolean;
    goSafeDictUseReadsTheMap(node: any): boolean;
    goSafeDictLocalUnboxCache: Map<any, string>;
    goCachedLocalUnbox(cache: Map<any, string | undefined>, declaration: any, compute: () => string | undefined): string | undefined;
    goSafeDictLocalUnbox(declaration: any): string | undefined;
    goDeclaredLocalTypeIfSafe(declaration: any, goType: string, readsTheValue: (n: any) => boolean, skipUse?: (n: any) => boolean): string | undefined;
    goSafeDictLocalUnboxUncached(declaration: any): string | undefined;
    goSafeDictLocalUnboxStandard(declaration: any): string | undefined;
    goSafeDictUnboxValue(declaration: any, identation: number): string | undefined;
    goBaseMapCalleeName(name: string): boolean;
    goNodeIsInPredictionTree(node: any): boolean;
    GO_MARKET_TABLES: {
        [name: string]: {
            add: string;
        };
    };
    goMarketTable(node: any): {
        add: string;
    } | undefined;
    goMarketTableWriteTarget(node: any): {
        add: string;
        owner: any;
    } | undefined;
    goMarketTableWriteText(node: any): string | undefined;
    goBookAccessorRead(initializer: any): boolean;
    goIsBaseMapResultLocal(node: any): boolean;
    goBaseMapResultLocal(initializer: any): boolean;
    goSafeDictMapLocalCache: Map<any, string>;
    goSafeDictCallArgs(initializer: any): {
        call: any;
        family: 'SafeDict' | 'SafeDict2';
        keys: number;
        fallback: any;
    } | undefined;
    goNodeContainsThis(node: any): boolean;
    goIsStructTypedValue(node: any): boolean;
    goPlainMapContainer(container: any, ws: boolean, noDefault: boolean): boolean;
    goNeverNilDict(call: any, ws: boolean): boolean;
    goSourceTreeKind(node: any): 'rest' | 'ws' | 'skip';
    goTopFunction(node: any): any;
    goGuardsNonNil(condition: any, name: string): boolean;
    goInsideNonNilBlock(use: any, name: string): boolean;
    goMapLocalUseKeepsMap(ref: any, rebinds: Set<any>, noDefault: boolean, ws: boolean, name: string): boolean;
    goSafeDictMapLocal(declaration: any): string | undefined;
    goSafeDictMapLocalUncached(declaration: any): string | undefined;
    goMapLocalRebindWrites: Map<any, Set<any>>;
    goSafeDictMapValue(declaration: any, identation: number): string | undefined;
    goSafeDictRebind(node: any, identation: number): string | undefined;
    goMapLocalKeyIsString(key: any, printed: string): boolean;
    goIsPointerFreeValue(value: any): boolean;
    goMapWritesArePointerFree(scope: any, name: string): boolean;
    goNativeMapLocalRead(access: any, baseExpr: any, keyNode: any, keyStr: string): boolean;
    goAwaitedMapLocal(decl: any): boolean;
    goMarketCallReturnsDict(initializer: any): boolean;
    goMarketProducerMethods: string[];
    goMarketMapCalls: string[];
    goMethodReturnsMapCache: Map<any, boolean>;
    goFunctionLevelReturns(body: any): any[];
    goMethodBodyReturnsMap(method: any): boolean;
    goMarketReturnIsMap(expr: any): boolean;
    goMarketCallIsMap(call: any): boolean;
    goMarketCalleePrintsMap(call: any): boolean;
    goMethodDeclarationOfCallee(callee: any): any;
    goMethodDeclarationByName(callee: any): any;
    goMarketLocalInitializerIsMap(identifier: any, knownDeclaration?: any): boolean;
    goNonceReturnCache: WeakMap<object, string>;
    goNonceReturnType(node: any): string | undefined;
    goIsBaseNonceMethod(fn: any): boolean;
    goNonceReturnIsInt64(expression: any): boolean;
    goInt64SumOperands(call: any): any[] | undefined;
    goNonceSumText(node: any): string | undefined;
    goBasePairReturnType(node: any): string | undefined;
    goBasePairReturnIsPair(node: any): boolean;
    goBasePairReturnText(node: any, identation: any): string | undefined;
    goMarketProducerReturnType(node: any): string | undefined;
    goMarketLocalUnboxCache: Map<any, string>;
    goMarketLocalUnbox(declaration: any): string | undefined;
    goIdentifierRefersToDeclaration(node: any, declaration: any): boolean;
    goMarketUseReadsTheValue(node: any, throwingAccessor: boolean, keepsMap?: boolean, handsOn?: boolean): boolean;
    goMarketUseKeepsMap(node: any, handsOn?: boolean): boolean;
    goMarketUseHandsTheMapOn(node: any, parent: any): boolean;
    goMarketLocalUnboxUncached(declaration: any): string | undefined;
    goMarketUnboxValue(declaration: any, parsedValue: string): string | undefined;
    goDeclarationOfIdentifier(node: any): any;
    goMarketComparisonElementRead(node: any): boolean;
    goIsComparedOperand(node: any): boolean;
    goSafeListLocalArgs(initializer: any): {
        container: any;
        key: any;
    };
    goSafeListUseReadsTheList(node: any): boolean;
    goSafeListLocalUnboxCache: Map<any, string>;
    goSafeListLocalUnbox(declaration: any): string | undefined;
    goSafeListLocalUnboxUncached(declaration: any): string | undefined;
    GO_LIST_SINK_CALLEES: string[];
    goListLocalSinkReadsAsList(node: any, nilTestSafe: boolean): boolean;
    goListLocalCopyTargetIsList(left: any): boolean;
    goSafeListUnboxValue(declaration: any, identation: number): string | undefined;
    goContainerTypeOfTsType(type: any): string | undefined;
    goContainerCandidateType(declaration: any): string | undefined;
    goContainerInitializerConversion(initializer: any, goType: string): 'direct' | undefined;
    goStringListLiteralIsProven(node: any): boolean;
    goPrintsAsPlainString(node: any): boolean;
    goContainerUseReadsAs(node: any, goType: string): boolean;
    goStringListUseReadsAs(node: any): boolean;
    goContainerWriteConversion(right: any, goType: string): 'direct' | undefined;
    goContainerLocalCache: Map<any, string>;
    goContainerLocalType(declaration: any): string | undefined;
    goContainerLocalTypeUncached(declaration: any): string | undefined;
    goStringListLiteralNode: any;
    goNilInitPointerTypes: Set<string>;
    goNilInitLocalTypeCache: Map<any, string>;
    goNilInitLocalTypeInProgress: Set<any>;
    goNilInitInitializer(initializer: any): boolean;
    goNilInitLocalType(declaration: any): string | undefined;
    goNilInitLocalTypeScan(declaration: any): string | undefined;
    goNilInitListLocalType(declaration: any): string | undefined;
    goNilInitStringLocalType(declaration: any): string | undefined;
    goNilInitStringScanCache: WeakMap<object, string>;
    goNilInitStringScanInProgress: Set<any>;
    goNilInitStringLocalTypeScan(declaration: any): string | undefined;
    goFieldStringLocalType(declaration: any): string | undefined;
    goFieldStringLocalTypeCache: WeakMap<object, string>;
    goFieldStringLocalTypeScan(declaration: any): string | undefined;
    goFieldStringLocalReadIsSafe(node: any): boolean;
    goNilInitWrittenHelperCall(printed: string): boolean;
    goNilInitReadIsConcatOperand(node: any): boolean;
    goNilInitEnclosingStatement(node: any): any;
    goNilInitWriteDominates(writes: any[], read: any): boolean;
    goNilInitReadIsStringSafe(node: any): boolean;
    goNilInitComparedToNonNil(parent: any, current: any): boolean;
    goNilInitReadIsPointerSafe(node: any): boolean;
    getGoLocalType(declaration: any, parsedValue: string): string;
    goLocalSafeVerdicts: WeakMap<object, Map<string, string>>;
    goAnnotatedStringLocal(declaration: any, goType: string, scope: any, name: string): boolean;
    goLiteralDefaultStringLocal(declaration: any, goType: string, scope: any, name: string): boolean;
    goLiteralDefaultStringLocalCache: WeakMap<object, boolean>;
    goLiteralDefaultStringCall(node: any, name: string | undefined): boolean;
    goLiteralDefaultStringLocalUsesAreSafe(scope: any, declaration: any, name: string): boolean;
    goLiteralDefaultStringLocalReadIsSafe(node: any): boolean;
    goLiteralDefaultStringCallArgument(call: any, argument: any): boolean;
    goLiteralDefaultStringWrite(left: any, right: any): boolean;
    goAnnotatedStringLocalHasNilShapedRead(scope: any, declaration: any, name: string): boolean;
    goDefaultedSafeStringCallOrTypedDefault(call: any): boolean;
    goAwaitReceiveUnbox(awaitNode: any, printedInitializer: string): {
        goType: string;
        wrap: (recv: string) => string;
        holder?: boolean;
    } | undefined;
    printVariableDeclarationList(node: any, identation: any): string;
    printObjectLiteralBody(node: any, identation: any): any;
    alignGoCompositeEntries(entries: any): any;
    parseGoCompositeEntry(entry: any): {
        indent: string;
        key: string;
        size: number;
        singleLine: boolean;
        value: any;
        comment: any;
    };
    findGoTrailingCommentStart(line: any): number;
    getGoCompositePaddings(parsedEntries: any): any;
    goLog2ish(x: number): number;
    goExp2ish(x: number): number;
    renderGoCompositeEntry(entry: any, parsed: any, padding: any): string;
    appendGoTrailingComma(entry: any): string;
    getGoRuneLength(text: any): number;
    getGoByteLength(text: any): number;
    printConstructorDeclaration(node: any, identation: any): string;
    printDynamicCall(node: any, identation: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): string;
    printWrappedUnknownThisProperty(node: any, identation?: number): string;
    transformMethodNameIfNeeded(name: string): string;
    transformCallExpressionName(name: string, nameNode?: any): string;
    transformPropertyAccessExpressionName(name: string, nameNode?: any): string;
    goWsOrderbooksField(node: any): boolean;
    goWsOrderbooksReadParts(node: any): {
        field: any;
        key: any;
        def?: any;
        safeDict?: boolean;
    } | undefined;
    goWsOrderbooksReadText(node: any): string | undefined;
    goOrderBookWriteKeepsType(goType: string, right: any): boolean;
    goOrderBookMemberText(node: any): string | undefined;
    goOrderBookCacheWrite(node: any): string | undefined;
    goOrderBookCacheAccessor(node: any): string | undefined;
    goBookDeclaredType(node: any): string | undefined;
    goInWsBookTree(node: any): boolean;
    goReceiverIsOrderBook(node: any): boolean;
    goOrderBookSetterText(baseExpr: any, containerStr: string, keyNode: any, valueNode: any, valueStr: string): string | undefined;
    goOrderBookLocalNeverNil(id: any): boolean;
    goWsCacheClassType(type: any): boolean;
    goWsCacheField(node: any): boolean;
    goWsCacheTypeOfNode(node: any): string | undefined;
    goWsCacheOperand(node: any): boolean;
    goWsTickersField(node: any): boolean;
    goWsCacheMapType(node: any): string | undefined;
    goWsCacheKey(keyNode: any): {
        index: string;
        pointer?: string;
        asserted?: string;
    };
    goWsTickersReadParts(node: any): {
        field: any;
        key: any;
    } | undefined;
    goWsCacheReadText(node: any): string | undefined;
    goWsCacheDefaultDeclaration(statement: any, declaration: any, identation: number): string | undefined;
    goWsCacheStoreText(containerNode: any, keyNode: any, valueText: string, node: any, identation: number): string | undefined;
    goWsCacheHasText(containerNode: any, keyNode: any): string | undefined;
    goWsCacheValue(containerNode: any, valueNode: any, valueText: string): string;
    goWsTickersFilterText(node: any): string | undefined;
    goWsTickersValueText(node: any): string | undefined;
    goWsCacheKeysText(argNode: any): string | undefined;
    goBalanceSafeBalanceWrite(node: any, identation: number): string | undefined;
    goBalanceKey(keyNode: any): {
        index: string;
        pointer?: string;
    } | undefined;
    goBalancePlainValue(valueNode: any): boolean;
    goIsWholeGetValueText(rhs: string): boolean;
    goBalanceIndexable(field: any): boolean;
    goBalanceStoreText(node: any, baseExpr: any, keys: any[], valueNode: any, rhs: string, identation: number): string | undefined;
    goBalanceChainStep(baseExpr: any, containerStr: string, keyNode: any): string | undefined;
    goBalanceDeleteText(node: any): string | undefined;
    goWsCacheEmptyLiteral(node: any): string | undefined;
    goWsTradesField(node: any): boolean;
    goWsTradesRead(node: any): boolean;
    goWsTradesReadText(node: any): string | undefined;
    goNilInitCacheLocalType(declaration: any): string | undefined;
    goNilInitOrderBookLocalType(declaration: any): string | undefined;
    goIsEqualityToken(kind: any): boolean;
    goNilInitInterfaceLocalType(declaration: any, goType: string): string | undefined;
    goWsCacheReceiverIsCallable(receiver: any, type: any): boolean;
    goWsAppendCall(node: any, identation: any): string | undefined;
    goWsCacheReturnType(node: any): string | undefined;
    goWsCacheParameterType(fn: any, param: any, index: number): string | undefined;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    goTypeOfHelpers: Map<string, string>;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    goScalarFamily(node: any): string | undefined;
    goScalarFamilyWithNil(node: any): string | undefined;
    goObjectBoxParameter(node: any): boolean;
    goTypeIsNilComparableObject(type: any): boolean;
    goPrintedCallee(printedValue: string): string | undefined;
    goIsAnyBoxExpression(node: any, printedText: string): boolean;
    goBoxedElementRead(node: any, printedText: string): boolean;
    goAnyLocalHoldsPointerCache: Map<any, boolean>;
    goAnyLocalHoldsPointer(decl: any): boolean;
    goAstCalleeName(call: any): string | undefined;
    goAstFieldGoName(node: any): string | undefined;
    goAwaitedCallIsImplicitEndpoint(expression: any): boolean;
    goIsNonPointerValueSource(expr: any): boolean;
    goAnyLocalHoldsNonPointerCache: Map<any, boolean>;
    goAnyLocalHoldsNonPointer(decl: any): boolean;
    goAssignmentWritesName(left: any, name: any): boolean;
    goAnyBoxLocalDeclaration(node: any): any;
    goGetArgBoundParameter(node: any): boolean;
    goParameterLaterWritesPointerBox(decl: any): boolean;
    goWritePrintsPointerBox(expr: any): boolean;
    goScalarFamilyOfType(type: any, allowNil?: boolean): string | undefined;
    goOrderBook: {
        classes: string[];
        constructors: string[];
        cacheReaders: string[];
        type: string;
        sideType: string;
        unbox: string;
        sides: {
            [side: string]: string;
        };
        setters?: {
            [field: string]: {
                method: string;
                value: string;
                type: string;
            };
        };
    } | undefined;
    goOrderBookLocalCache: Map<any, string>;
    goOrderBookEntryProven: Map<any, boolean>;
    goIsOrderBookType(type: any): boolean;
    goNodeIsOrderBook(node: any): boolean;
    goIsOrderBookProducer(node: any): boolean;
    goOrderBookCacheRead(node: any): {
        obj: any;
        key: any;
    } | undefined;
    goSameExpressionText(a: any, b: any): boolean;
    goConditionHasPresence(cond: any, read: {
        obj: any;
        key: any;
    }): boolean;
    goConditionIsNegatedPresence(cond: any, read: {
        obj: any;
        key: any;
    }): boolean;
    goBlockStatements(node: any): any[];
    goStatementExits(statement: any): boolean;
    goStoresBookInCache(statements: any[], read: {
        obj: any;
        key: any;
    }): boolean;
    goOrderBookEntryPresent(at: any, read: {
        obj: any;
        key: any;
    }): boolean;
    goIsProducerAssignment(statement: any, name: string): boolean;
    goDominatedByProducerWrite(at: any, name: string): boolean;
    goOrderBookRepairGuard(declaration: any, name: string): any;
    goOrderBookRefIsRead(id: any): boolean;
    goIsOrderBookSideAccess(node: any): boolean;
    goOrderBookLocalUnbox(declaration: any): string | undefined;
    goOrderBookLocalUnboxUncached(declaration: any): string | undefined;
    goOrderBookUnboxValue(declaration: any, parsedValue: string): string | undefined;
    goOrderBookSideLocalType(declaration: any): string | undefined;
    goOrderBookSideRead(node: any): string | undefined;
    goOrderBookParameterType(fn: any, param: any): string | undefined;
    goOrderBookForwardedToBookParameter(fn: any, param: any): boolean;
    goNativeParameterTypeCache: Map<any, string>;
    goSameFileCallCache: Map<any, Map<string, any[]>>;
    goTsSrcTreeCache: Map<string, any>;
    goNativeParameterType(param: any): string | undefined;
    goNativeParameterTypeOf(param: any): string | undefined;
    goSliceParameterType(fn: any, param: any, index: number): string | undefined;
    goAnnotatedSliceParameterType(param: any): string | undefined;
    goBodyReadsElement(body: any, name: string): boolean;
    goIsUnifiedBoolParameter(methodName: string, index: number): boolean;
    goIsUnifiedStringParameter(methodName: string, index: number): boolean;
    goIsUnifiedSliceParameter(methodName: string, index: number): boolean;
    goUnifiedSliceParameterType(fn: any, param: any): string | undefined;
    goUnifiedAnySliceParameterType(fn: any, param: any): string | undefined;
    goIsUnifiedAnySliceParameterNode(decl: any): boolean;
    goSliceTableRootParameter(fn: any, param: any): any;
    goAnnotatedParameterText(param: any): string | undefined;
    goSliceTableDeclarationsMatch(fn: any, annotation: string): boolean;
    goSliceTableCallSitesPass(fn: any, methodName: string, index: number, goType: string): boolean;
    goTextSliceArgumentMatches(argText: string, goType: string, file: string, tree: any, at?: number): boolean;
    goTextStringElementMatches(element: string, file: string, tree: any, at?: number): boolean;
    goTextEnclosingMethod(text: string, at?: number): {
        name: string;
        params: string[];
    } | undefined;
    goArrayLiteralSliceType(node: any, depth?: number): string | undefined;
    goSliceElementIsString(node: any): boolean;
    goSliceArgumentType(arg: any): string | undefined;
    goResolvedCallParameter(node: any, index: number): any;
    goCallSliceArgumentType(node: any, calleeName: string, index: number): string | undefined;
    goSliceCallArgs(node: any, identation: any): string | undefined;
    goUnifiedStringCallArgs(node: any, identation: any, flat?: boolean): string | undefined;
    goRequiredStringParameterType(param: any): string | undefined;
    goParameterKeepsNilCompareNative(body: any, param: any, goType: string): boolean;
    goWsFrameParameterType(fn: any, param: any): string | undefined;
    goWsFrameReadsStayNative(body: any, param: any): boolean;
    goWsFrameInOpHasInitClause(inNode: any, param: any): boolean;
    goWsFrameBooleanOperator(operator: any): boolean;
    goIsProHandlerMethod(fn: any): boolean;
    goParameterTypeIsDict(type: any): boolean;
    goNativeParameterTypeCandidates(param: any, isHandler?: boolean): string[];
    goMethodKeepsBaseSignature(fn: any): boolean;
    goHasTreeCallSite(fn: any): boolean;
    goParameterCallSitesPassType(fn: any, index: number, goType: string): boolean;
    goAsyncBooleanParameterType(fn: any, param: any, index: number): string | undefined;
    goCallSitesPassBooleanLiteral(fn: any, index: number): boolean;
    goArgumentIsSyntacticBool(arg: any, checker: any): boolean;
    goEnclosingClass(fn: any): any;
    goEnclosingClassName(fn: any): string | undefined;
    goIsPrivateKeyField(arg: any): boolean;
    goPrintedArgType(arg: any): string | undefined;
    goIsClientUrl(arg: any): boolean;
    goIsClientParameter(node: any): boolean;
    goBoundIdentifierType(arg: any): string | undefined;
    goUncalledStringParameterType(param: any): string | undefined;
    goSiblingPassesUnifiedString(argText: string, fileText: string, at: number | undefined): boolean;
    goNilProvenStringPtrArg(arg: any): boolean;
    goSafeStringLiteralDefaultCall(call: any): boolean;
    goHasExitingNilGuard(ident: any): boolean;
    goStatementExitsOnNil(statement: any, ident: any): boolean;
    goOrChainHasNilTestOf(node: any, ident: any): boolean;
    goIsNilTestOfIdentifier(node: any, ident: any): boolean;
    goIdentifierRefersTo(node: any, other: any): boolean;
    goSameFileCallsOf(fn: any, name: string): Array<any>;
    goTsSrcTree(file: any): any;
    goTsSrcTreeBuild(root: string): {
        callIndex: Map<string, any[]>;
        fileText: Map<string, string>;
        classBases: Map<string, string>;
        relativeOf: Map<string, string>;
    };
    goTsSrcFileDerivesFrom(tree: any, file: string, className: string | undefined): boolean;
    goTextArgMatchesType(argText: string, goType: string, file: string, tree: any, at?: number): boolean;
    goDeclaredTypeCache: Map<any, string>;
    goDeclaredTypeInProgress: Set<any>;
    goDeclaredTypeOfIdentifier(node: any): string | undefined;
    goPointerTypeOfExpression(node: any, printedText: string): string | undefined;
    goElementAssignmentContainerType(node: any, printedText: string): string | undefined;
    goFieldContainerTypeNative(node: any): string | undefined;
    goValueMayHoldPointer(valueNode: any): boolean;
    goIsPlainValuedMapField(node: any): boolean;
    goCacheField(node: any): boolean;
    goCacheNilCompare(left: any, right: any, leftText: string, rightText: string, isEq: boolean, lFam: any, rFam: any): string | undefined;
    goBalanceEntryNilCompare(left: any, right: any, leftText: string, rightText: string, isEq: boolean, lFam: any, rFam: any): string | undefined;
    goCacheKeyText(keyNode: any, keyStr: string): string | undefined;
    goIndexBoundedBy(index: any, list: any, use: any): boolean;
    goCacheKeysRange(declaration: any, declaredType: string, varName: string, identation: any): string | undefined;
    goCacheDuplicateNilTest(node: any): string | undefined;
    goCacheKeysElementRead(node: any, baseExpr: any, containerStr: string, keyNodes: any, keyStrs: string[]): string | undefined;
    goCacheRead(node: any, baseExpr: any, containerStr: string, keyNodes: any, keyStrs: string[]): string | undefined;
    goCacheWrite(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, compound: boolean, valueNode: any): string | undefined;
    goCacheInitializedBefore(access: any): boolean;
    goIsStringKeyExpression(node: any): boolean;
    goSliceIndexProvablyInRange(node: any, indexNode: any): boolean;
    goLocalIsRebound(scope: any, nameNode: any): boolean;
    goRebindingTargetOf(identifier: any): any;
    printNativeElementAssignment(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, compound?: boolean, valueNode?: any): string | undefined;
    printNativeGuardedPointerKeyAssignment(containerNode: any, containerStr: string, containerType: any, fieldType: any, keyNode: any, keyStr: string, valueStr: string, compound: boolean, valueNode: any): string | undefined;
    goGetArgMapParameterIsMapLocal(node: any): boolean;
    printNativeMapWriteOnProvenLocal(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, valueNode?: any, identation?: number): string | undefined;
    goStructBoxCallee(call: any): string | undefined;
    goStructBoxedLocalCache: Map<any, string>;
    goStructBoxedLocal(declaration: any): string | undefined;
    goStructNilLocalCache: Map<any, string>;
    goStructNilInitLocal(declaration: any): string | undefined;
    goStructLocalNameIsNotAUse(n: any): boolean;
    goStructLocalUseReadsTheMap(n: any): boolean;
    goStructBoxWrite(node: any, rightStr: string): string | undefined;
    goBaseTupleParamsSlot(element: any): boolean;
    goNilInitContainerLocal(node: any): boolean;
    goNilableMapLocal(node: any): boolean;
    goNilableMapStoreValue(valueNode: any, valueStr: string): string | undefined;
    goMapLocalIsNeverNil(node: any): boolean;
    goNilableMapLocalStore(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, valueNode: any, identation: number): string | undefined;
    printOptionDictFieldWrite(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueNode: any, identation: number): string | undefined;
    goMapWriteValueIsNotPointer(valueNode: any): boolean;
    nativeStoreFields: {
        [tsName: string]: any;
    } | undefined;
    goStoreFieldNeverNilCache: Map<any, Map<string, boolean>>;
    goStoreField(containerNode: any): any;
    goThisCallName(call: any): string | undefined;
    goStoreFieldNeverNil(sourceFile: any, name: string, field: any): boolean;
    goRunsOnMessageLoop(containerNode: any, field: any): boolean;
    goStoreValueIsPlain(valueNode: any, field: any): boolean;
    goEmptyDefaultCall(call: any, field: any): boolean;
    goFieldStoreAssignment(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, valueNode: any, identation?: number): string | undefined;
    goWsFieldName(node: any): string | undefined;
    goWsMapFieldType(node: any): string | undefined;
    goWsKey(keyNode: any): {
        index: string;
        pointer?: string;
    } | undefined;
    goWsFieldWrite(containerNode: any, containerStr: string, keyNode: any, valueNode: any, identation: number): string | undefined;
    goWsFieldDelete(node: any, identation: number): string | undefined;
    goWsInOpKeyDerefable(dictNode: any, keyNode: any): boolean;
    goOhlcvsField(node: any): boolean;
    goOhlcvsBookAccess(node: any): any;
    goOhlcvsBookCall(node: any): {
        call: any;
        key: any;
        withDefault: boolean;
    } | undefined;
    goOhlcvsSameKey(a: any, b: any): boolean;
    goOhlcvsReadKey(keyNode: any): {
        index: string;
    } | undefined;
    goOhlcvsBookLocal(declaration: any): boolean;
    goOhlcvsBookLocalOf(node: any): any;
    goOhlcvsCacheValue(valueNode: any): boolean;
    goOhlcvsFlatKeyNode(declaration: any): any;
    goOhlcvsGuarded(identation: number, guards: string[], lines: string[]): string;
    goOhlcvsAssignment(node: any, baseExpr: any, keys: any[], valueNode: any, identation: number): string | undefined;
    goOhlcvsReadText(node: any, baseExpr: any, keys: any[]): string | undefined;
    goOhlcvsReadDeclaration(statement: any, declaration: any, identation: number): string | undefined;
    goOhlcvsInRead(inNode: any, statement: any): {
        inNode: any;
        dictText: string;
        keyText: string;
    } | undefined;
    goIsNilGuardedStringPointerKey(keyNode: any): boolean;
    goInOpPointerKeyProvenNonNil(statement: any, ident: any): boolean;
    goBlockExitsOnNilTest(block: any, statement: any, ident: any): boolean;
    goIsNilTestOf(node: any, ident: any): boolean;
    goStatementAlwaysExits(statement: any): boolean;
    goIsFreshUnsharedMapLocal(node: any, writeSite: any): boolean;
    goUseMayPrecede(use: any, writeSite: any, scope: any): boolean;
    goIsNonPointerValue(valueNode: any): boolean;
    goPrintedTypeOfExpression(node: any, printedText: string): string | undefined;
    goPrintedLocalDeclarationType(node: any): string | undefined;
    sliceLengthTypes: string[];
    GO_NATIVE_LENGTH_FIELDS: string[];
    printInlineArrayLength(expression: any, printedText: string, lengthNode?: any): string | undefined;
    goNativeLengthFieldType(printedText: string): string | undefined;
    goLengthFeedsArithmeticClassifier(lengthNode: any): boolean;
    printInlineTernary(condition: string, whenTrue: string, whenFalse: string, resultType?: string): string | undefined;
    goTernaryArmType(node: any, printedText: string): string | undefined;
    goTernaryResultType(whenTrueNode: any, whenTrue: string, whenFalseNode: any, whenFalse: string): string | undefined;
    goStripControlClauseParens(text: string): string;
    goPrintTernaryBranch(node: any, levels: number): string;
    printInlineInOp(dictNode: any, keyNode: any, dictText: string, keyText: string): string | undefined;
    goBookReceiver(node: any): boolean;
    goBookEntryText(node: any): string | undefined;
    goUnderNegation(inNode: any): boolean;
    goInOpMapReceiver(node: any): boolean;
    goDefaultedDictLocal(node: any): boolean;
    goDefaultedDictDeclaration(declaration: any): boolean;
    goDictLocalBacksHoist(declaration: any): boolean;
    goPlainDictContainer(node: any): boolean;
    goDictUseKeepsMap(node: any): boolean;
    goPureLeaf(node: any): boolean;
    goOrHoistTerms(node: any, reads: any[]): boolean;
    goNameIsUsed(scope: any, name: string): boolean;
    goNilMapTermIsRedundant(condition: any, read: any): boolean;
    goInOpHoistShape(node: any): any;
    goOrHoistIf(node: any, identation: any): string | undefined;
    goInOpSubstitution: any;
    GO_IN_OP_SENTINEL: string;
    goInOpSubstitutedText(node: any): string | undefined;
    goInOpIfInitClause(node: any): string | undefined;
    goInOpGuardedNestedIf(node: any, identation: any): string | undefined;
    goIfInOpRead(condition: any, statement?: any): any;
    GO_NATIVE_MAP_FIELDS: {
        [name: string]: string;
    };
    GO_NATIVE_MAP_ACCESSORS: string[];
    goInOpDictMapType(dictNode: any, dictText?: string): string | undefined;
    goIfInOpBindingName(statement: any): string | undefined;
    comparisonHelpers: string[];
    printInlineOpNeg(node: any, printedText: string): string | undefined;
    printInlineTruthy(node: any): string | undefined;
    printInlineBoolBoxTruthy(node: any): string | undefined;
    printInlineBoolPointerTruthy(node: any, printedText: string): string | undefined;
    goIsRepeatSafePointerArgument(node: any): boolean;
    goNativeCondition(node: any): string | undefined;
    goControlClauseParens(node: any, expression: string): string;
    goEnclosedExpression(text: string): string | undefined;
    goIsControlClauseCondition(node: any): boolean;
    goHasTypeNameCompositeLiteral(text: string): boolean;
    goCompositeLitHasTypeName(text: string, braceIndex: number): boolean;
    goSkipBalanced(text: string, start: number, open: string, close: string): number;
    goSkipQuoted(text: string, start: number): number;
    printLeadingComments(node: any, identation: any): string;
    goStatementLevel: number;
    goStatement: any;
    goFileStdlibImports: Set<string>;
    goPrintedFileStdlibImports: string[];
    printSourceFileStatements(node: any, identation: any): string;
    goBinaryMemoized<T>(node: any, key: string, compute: () => T): T;
    goBinaryContextKey(): string;
    goPrintBinaryMemoized(node: any, identation: number): string;
    printNode(node: any, identation?: number): string;
    printObjectLiteralExpression(node: any, identation: any): string;
    goWsTickersPointerInIf(node: any, identation: any): string | undefined;
    printIfStatement(node: any, identation: any): string;
    printCondition(node: any, identation: any): any;
    goDerefComparableWith(ptrNode: any, ptrText: string, otherNode: any): boolean;
    goIsStringLiteralNode(node: any): boolean;
    goDerefRepeatableOperand(node: any, printedText: string): boolean;
    goIsReadOnlyCallArgument(node: any): boolean;
    goIsBareStringOperand(node: any): boolean;
    goDeclaredContainerOperand(node: any): string | undefined;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEq: boolean): string | undefined;
    goNativeNumericEqualityKind(left: any, leftText: string, right: any, rightText: string): string | undefined;
    goOperandNumericKind(node: any, printedText: string): string | undefined;
    goLiteralTypedLocalKind(node: any): string | undefined;
    goNumericLiteralKind(node: any): string | undefined;
    goIsSignedNumericLiteral(node: any): boolean;
    goIsNumericConstant(node: any): boolean;
    goNumericConstantValue(node: any): number;
    goLiteralFitsKind(node: any, kind: string): boolean;
    goComparisonKind(left: any, leftKind: string, right: any, rightKind: string): string | undefined;
    printInlineOrderedComparison(left: any, right: any, leftText: string, rightText: string, op: any): string | undefined;
    goOrderedComparisonPointerKind(node: any): string | undefined;
    printPointerOrderedComparison(left: any, right: any, leftText: string, rightText: string, operator: string, leftPointee: string | undefined, rightPointee: string | undefined): string | undefined;
    goIsNonNilTestOf(node: any, ident: any): boolean;
    goIsNilLiteral(node: any): boolean;
    goIsSameSymbol(a: any, b: any): boolean;
    goNilGuardFields: {
        [kind: number]: [string, string];
    };
    goHasEnclosingNilGuard(ident: any): boolean;
    goConditionProvesNonNil(condition: any, ident: any): boolean;
    goUnwrapParenthesizedNode(node: any): any;
    goIsPureComparisonOperand(node: any): boolean;
    printParenthesizedExpression(node: any, identation: any): string;
    goIsParenthesizedExpression(printed: string): boolean;
    goSkipGoLiteral(text: string, start: number): number;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    goGetArgLocalType(body: any, param: any, printedDefault: string): string | undefined;
    goGetArgBaseParamIsUnannotated(param: any): boolean;
    goGetArgNilMapUseOnlyReads(n: any): boolean;
    goGetArgNilStringSliceUseOnlyReads(n: any): boolean;
    goGetArgTypeOfShape(shape: string): string | undefined;
    goGetArgDeclaredTypeCandidates(param: any): string[];
    goGetArgPrimitiveType(declared: string): string | undefined;
    goGetArgTwinName(goType: string): string | undefined;
    goGetArgIsValueType(goType: string): boolean;
    goGetArgLocalIsSafe(body: any, param: any, goType: string, nilable?: boolean): boolean;
    goGetArgConsumersAreSafe(body: any, param: any, goType: string, nilable: boolean): boolean;
    goGetArgArmIsNilGuarded(n: any, cond: any): boolean;
    goGetArgWriteIsNativeArithmetic(rhs: any): boolean;
    goGetArgCopyTarget(use: any, body: any): any;
    goGetArgUsesAreSafe(body: any, param: any, name: string, goType: string, nilable: boolean, seen: Set<any>, boxed?: boolean): boolean;
    goGetArgPointerInHelperArithmetic(n: any): boolean;
    goGetArgPointerStoredAsValue(n: any, param: any): boolean;
    goTupleElementIsDict(right: any, index: number): boolean;
    goTupleSlotUnbox(element: any): {
        goType: string;
        conv: string;
    } | undefined;
    goTupleSlotPointerCache: Map<any, string>;
    goTupleSlotPointerType(element: any): string | undefined;
    goTupleSlotPointerTypeOf(element: any): string | undefined;
    goTupleSlotStoreText(valueNode: any, valueStr: string): string;
    goTupleSlotPointerLines(name: string, holder: string, index: number, iden: string): string;
    goTupleSlotNameIsSafe(nameNode: any, declaration: any): boolean;
    goTupleBindingProducerName(declaration: any): string | undefined;
    goTupleBindingIsSliceHolder(declaration: any): boolean;
    goTuplePointerSlotCallType(call: any): string | undefined;
    goTuplePointerSlotCallEntry(call: any): {
        goType: string;
        safe?: string;
    } | undefined;
    goTuplePointerSlotReadAdmissible(ident: any, allowStore: boolean, goType?: string): boolean;
    goTuplePointerSlotNilProven(ident: any): boolean;
    goTuplePointerSlotScan(declaration: any, name: string, scope: any, allowStore: boolean, writeType?: {
        goType: string | undefined;
    }, bindingType?: string): boolean;
    goTupleWriteRepeats(write: any, declaration: any): boolean;
    goTuplePointerSlotCache: WeakMap<object, string>;
    goTuplePointerSlotProbing: boolean;
    goTuplePointerSlotHookTypes(nameNode: any): boolean;
    goTuplePointerSlotWriteType(element: any): string | undefined;
    goTuplePointerSlotOfBinding(element: any): string | undefined;
    goTuplePointerSlotNilInitType(declaration: any): string | undefined;
    goTuplePointerSlotStoreText(right: any): string | undefined;
    goTupleSlotBindingLines(elements: any[], holder: string, identation: number, declaration: any): string;
    goParamsTupleHelperIndex(call: any): number;
    goGetArgTupleWriteIsDict(declaration: any, right: any, index: number): boolean;
    goGetArgBindsDictElement(leftElement: any, right: any, index: number): boolean;
    goGetArgParameterType(decl: any): string | undefined;
    goGetArgPositionIsDefaulted(callee: any, argIndex: number): boolean;
    goGetArgPassesIntoContainerDefault(callee: any, argIndex: number): boolean;
    printFunctionBody(node: any, identation: any, wrapInChannel?: boolean): string;
    printAwaitExpression(node: any, identation: any): string;
    printInstanceOfExpression(node: BinaryExpression, identation: number): string;
    getLineBasedSuffix(node: any): string;
    printExpressionStatement(node: any, identation: any): string;
    isInsideAsyncFunction(returnStatementNode: any): any;
    /**
     * Statement that terminates an async (channel returning) function body.
     *
     * The body is the trampoline's sibling method (`go this.fetchTickerBody(ch, ...)`),
     * and the synthetic try/catch closures nest inside it: in both cases `return` leaves
     * a function whose result is a plain `any`, never the channel. The trampoline itself
     * owns the single `return ch`, emitted by printFunctionBody.
     */
    getAsyncReturnStatement(node: any): string;
    printReturnStatement(node: any, identation: any): string;
    printArrayLiteralExpression(node: any, identation?: number): string;
    printArgsForCallExpression(node: any, identation: any): any;
    goCallParamAt(call: any, index: number): any;
    goDerefStringArgCall(node: any, identation: any): string | undefined;
    printIdentifier(node: any): string;
    isArraySliceTypes: string[];
    isArrayNonSliceTypes: string[];
    goIdentifierUsedElsewhere(nameNode: any): boolean;
    goLocalHoldsOnlyArrays(nameNode: any): boolean;
    goIsSafeContainerIsArray(call: any): boolean;
    printNegatedSafeContainerIsArray(operand: any): string | undefined;
    goSingleWriteSafeContainerKind(nameNode: any): 'list' | 'dict' | undefined;
    printNativeIsArray(node: any, parsedArg: string | undefined): string | undefined;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    goMapRangeLocalDeclaration(statement: any, declaration: any, identation: number): string | undefined;
    goIsRebindFreeMapReceiver(receiver: any): boolean;
    goObjectValuesLocalIsList(declaration: any, scope: any): boolean;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    goPrintCallArgument(argument: any, printedText: string | undefined): string | undefined;
    printArrayPushCall(node: CallExpression, identation: number, name?: string | undefined, parsedArg?: string | undefined): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    goIndexOfOperandType(node: any, printedText: string): string | undefined;
    goFileKeepsFileLevelImports(): boolean;
    goNativeIndexOf(node: any, name: any, parsedArg: any): string | undefined;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    goNativeStringOperandTexts(operands: any[], texts: string[], expected: string[]): string[] | undefined;
    goUnwrapPrintedAssertions(node: any): any;
    goNativeStringCallOr(node: any, texts: string[], expected: string[], nativeCall: (ops: string[]) => string, helperCall: string, unwrapReceiver?: boolean): string;
    goBaseFileStdlibImportSeamPaths: RegExp | undefined;
    goExcisedSpanMarkers: [string, string] | undefined;
    goExcisedSpans: WeakMap<object, [number, number][]>;
    goInsideExcisedSpan(): boolean;
    goStdlibImportIsPlaceable(): boolean;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): any;
    goToStringReceiverType(receiver: any, printedText: string): string | undefined;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    goSliceLiteralBound(node: any): number | undefined;
    goSliceSubscript(value: string, start: number, hasEnd: boolean, end: number | undefined): string;
    goSliceReceiverType(node: any): string | undefined;
    goSliceLiteralBounds(node: any): {
        start: number;
        hasEnd: boolean;
        end: number;
    } | undefined;
    goIsNativeSliceCall(node: any): boolean;
    printInlineSlice(node: any, receiverText: string): string | undefined;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printLengthProperty(node: any, identation: any, name?: any): string;
    printConditionalExpression(node: any, identation: any): string;
    printPropertyAccessExpression(node: any, identation: any): any;
    printDeleteExpression(node: any, identation: any): string;
    goClientsDeleteText(node: any): string | undefined;
    goNativeDelete(node: any): string | undefined;
    goDeleteReceiverText(node: any): string | undefined;
    goDeletableMapField(node: any): string | undefined;
    goDeleteKeyText(keyNode: any): string | undefined;
    printThrowStatement(node: any, identation: any): string;
    goExprDepth: number;
    goWithExprDepth<T>(depth: number, callback: () => T): T;
    goOperatorPrecedence(operator: string): number;
    goNativeBinaryOperator(node: any): string | undefined;
    goWalkBinary(operator: string, left: any, right: any, rightText: string): {
        has4: boolean;
        has5: boolean;
        maxProblem: number;
    };
    goBinarySeparator(operator: string, rightText: string, left: any, right: any): string;
    printBinaryExpression(node: any, identation: any): string;
    goDropRedundantNilGuard(leftVar: string, rightVar: string): string | undefined;
    printTryStatement(node: any, identation: number): string;
    /**
     * Strip the printer's own leading indentation from every line of a printed
     * statement block so the caller can re-place it at an explicit level. Only the
     * common prefix goes away: relative nesting (one tab per level) is preserved.
     */
    dedentBlock(block: string): string;
    /**
     * Re-place a printed statement block at `level` (a run of tabs): the block's own
     * leading indentation is dropped and every non-blank line is prefixed with `level`,
     * so relative nesting (one tab per level) survives the move.
     */
    indentBlock(block: string, level: string): string;
    /**
     * gofmt writes blank lines with no whitespace at all. A multi-line statement template
     * opens on a fresh line, so the inherited `getIden(identation) + <statement>` prefix
     * lands on a line that carries nothing else: drop that prefix instead of leaving a
     * whitespace-only line behind. Only blank lines are touched, never printed content.
     */
    stripWhitespaceOnlyLines(block: string): string;
    printPrefixUnaryExpression(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): string;
    /**
     * Override the default element-access printer with a version that walks the
     * entire `x[y][z]` chain and builds a properly nested sequence of helper
     * calls.  This removes the root cause of the unbalanced-parenthesis bug
     * without any post-processing or regex hacks.
     */
    goIndexableTypeOf(node: any, printed: string): string | undefined;
    goElementAccessChain(containerStr: string, keyStrs: string[]): string;
    goIsUrlsField(node: any): boolean;
    goUrlsApiIsDict(apiAccess: any): boolean;
    goUrlsViewRead(node: any, baseExpr: any, keys: any, keyStrs: string[]): string | undefined;
    goIsUrlsWrite(statement: any): boolean;
    goElementWriteChain(baseExpr: any, containerStr: string, keyNodes: any, keyStrs: string[]): string;
    goKeyIsString(node: any, printed: string): any;
    goIsDerefStringKeyExpression(node: any): boolean;
    printNilGuardedMapIndex(containerStr: string, keyStr: string): string;
    isGoThisPropertyAccessExpression(node: any): boolean;
    isGoElementAccessAssignmentTarget(node: any): boolean;
    goIntIndexExpression(node: any): boolean;
    goIntOperandIdentifier(node: any): boolean;
    goSafeListUnboxIdentifier(node: any): boolean;
    goDeclaredListIdentifier(node: any): boolean;
    goNameWriteSites(scope: any, name: string, declaration?: any): any[];
    goEnclosingLoopExcluding(loop: any, declaration: any): boolean;
    goBoundedLoopListRead(node: any): boolean;
    goSafeListContainerAdmitted(container: any): boolean;
    goListElementsArePointerFree(list: any, depth?: number): boolean;
    goNativeListElementRead(node: any, containerStr: string, keyNode: any, keyStr: string): string | undefined;
    generatedListCallees: Set<string>;
    goHostListCalleeType(callee: string, initializer: any): string | undefined;
    goWritesOrRebindsName(n: any, name: string, mutators: string[]): boolean;
    goLoopBoundedSliceRead(node: any, baseExpr: any, keyNode: any, containerStr: string, keyStr: string): string | undefined;
    goLoopBoundedIndexRead(node: any, baseExpr: any, keyNode: any, containerStr: string, keyStr: string): string | undefined;
    goAwaitedListLocal(base: any): boolean;
    asyncMapRowListCallees: Set<string>;
    asyncTickerMapCallees: Set<string>;
    goTickerRowCache: Map<any, {
        key: any;
        keyIsPointer: boolean;
        ret: any;
    } | null>;
    goTickerRowRead(declaration: any): {
        key: any;
        keyIsPointer: boolean;
        ret: any;
    } | undefined;
    goTickerRowReadUncached(declaration: any): {
        key: any;
        keyIsPointer: boolean;
        ret: any;
    } | undefined;
    goTickerRowReturn(node: any, identation: any): {
        lines: string;
        value: string;
    } | undefined;
    goAwaitedMapRowList(base: any): boolean;
    goListElementsAreObjects(baseExpr: any): boolean;
    goJsonOriginUseIsReadOnly(node: any, name: string): boolean;
    goJsonOriginBindingIsReadOnly(declaration: any, readOnlyUse: (n: any, name: string) => boolean): boolean;
    goAwaitedCallIsRequestStub(expression: any): boolean;
    goJsonOriginContainer(node: any, depth?: number): boolean;
    goJsonOriginListUseIsReadOnly(node: any, name: string): boolean;
    goJsonOriginList(baseExpr: any): boolean;
    goJsonOriginLoopRead(node: any, baseExpr: any, keyNode: any, containerStr: string, keyStr: string): string | undefined;
    goOtherBindingOfLoopBoundedElement(n: any, declaration: any): boolean;
    goBoundIsLengthOf(bound: any, baseExpr: any, loop: any): boolean;
    goLoopBoundedStringElementType(node: any, printedValue: string): string | undefined;
    goGb08PredictionFile(): boolean;
    goGb08IsDictExpression(expr: any): boolean;
    goGb08BoundedListRead(node: any, keyNode: any): 'native' | 'deref' | undefined;
    goAwaitedObjectListRead(node: any, keyNode: any): boolean;
    printElementAccessExpression(node: any, identation: any): string;
    isInsideVoidFunction(node: Node): boolean;
    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: Statement): boolean;
    /**
     * Check if the last statement in a block is a conditional with returns in all branches
     */
    blockEndsWithConditionalReturn(statements: NodeArray<Statement>): boolean;
    goMapParamType(node: any): string | undefined;
    goMapParamReadOk(receiver: any, access: any): string | undefined;
    goMapParamLiteralKey(key: any): boolean;
    goMapParamIsWriteValue(access: any): boolean;
    goMapParamMarketRow(node: any): boolean;
    goMapParamDerefConsumer(access: any): boolean;
    goNonPointerAccessorSource(expr: any): boolean;
    goLiteralDefaultArg(node: any): boolean;
    goDerefLength(expression: any, printedText: string, lengthNode: any): string | undefined;
    goDerefIndexOf(node: any, name: any, parsedArg: any): string | undefined;
    goLiteralUnionNarrowedStringDeref(node: any): boolean;
    GO_THIS_NUMERIC_FIELDS: {
        [tsName: string]: string;
    };
    goBaseFieldKind(node: any): string | undefined;
    goWideningOperandKind(node: any, text: string): [string, boolean] | undefined;
    printWideningComparison(left: any, right: any, leftText: string, rightText: string, op: any): string | undefined;
}
export interface GoTranspiler {
    goNativeIntWideningArithmetic(node: any, leftType: string, rightType: string, leftText: string, rightText: string): {
        goType: string;
        text: string;
    } | undefined;
}
export interface GoTranspiler {
    goStringLiteralUnionType(type: any): boolean;
}
export interface GoTranspiler {
    goConcatDerefableStringOperand(node: any): boolean;
}
export interface GoTranspiler {
    goCurrencyRowLocal(node: any): boolean;
}
export interface GoTranspiler {
    goRequiredParameterNativeType(fn: any, param: any, index: number): string | undefined;
    goParameterHasNullishDefault(body: any, param: any): boolean;
}
export interface GoTranspiler {
    goCallSiteParameterCandidates(fn: any, param: any, index: number): string[];
    goFeedsNullableSlot(fn: any, param: any): boolean;
    goHasDynamicCallee(fn: any, name: string): boolean;
    goAnnotateMethodTypes(methodsTypes: any[], file: any): void;
}
export interface GoTranspiler {
    goNumericParameterCandidates(param: any): string[];
}
export interface GoTranspiler {
    goBaseCacheField(node: any): string | undefined;
    goBaseCacheInitText(node: any): string | undefined;
}
