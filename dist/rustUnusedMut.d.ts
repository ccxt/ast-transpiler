/** `let mut x` -> `let x` for every binding the rest of its block never mutates. */
export declare function rustDropUnusedMut(text: string): string;
