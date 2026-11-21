export type Dict = { [key: string]: any };
export class Exchange {
    id: string = 'x';
    options: any = {};
    safeList (o: any, k: any, d: any = undefined): any[] { return d; }
    safeString (o: any, k: any, d: any = undefined): string { return d; }
    parseTicker (t: Dict, market: any = undefined): Dict { return t; }
    async publicGet (p: Dict = {}): Promise<any> { return p; }
}
export default Exchange;
