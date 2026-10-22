export interface Dict { [key: string]: any }
const omit = (x: Dict | undefined, ...args: any) => x;
const toArray = (object: Dict | any[] | undefined) => Object.values (object);
export default class Exchange {
    options: Dict = {};
    omit = omit;
    toArray = toArray;
    safeValue (d: any, k: any, dflt: any = undefined): any {
        return d === undefined ? dflt : d[k];
    }
    safeList (d: any, k: any, dflt: any[]): any[];
    safeList (d: any, k: any, dflt?: any[]): any[] | undefined;
    safeList (d: any, k: any, dflt: any[] = undefined): any[] | undefined {
        const v = this.safeValue (d, k);
        return Array.isArray (v) ? v : dflt;
    }
    account (): any {
        return { 'free': undefined };
    }
}
