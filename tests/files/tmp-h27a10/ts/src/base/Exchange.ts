export type Dict = { [key: string]: any };
export class Exchange {
    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return d; }
    safeString (o: any, k: any, d: any = undefined): string { return d; }
    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], params: Dict = {}): Promise<any> { return undefined; }
}
export default Exchange;
