export type Str = string | undefined;
export class Exchange {
    id: string = 'x';
    safeString (o: any, k: string): Str {
        return o[k];
    }
    safeValue (o: any, k: string): any {
        return o[k];
    }
}
