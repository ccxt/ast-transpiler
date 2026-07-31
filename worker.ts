import { Transpiler } from './src/transpiler.js'

// one cache per worker thread, reused by every task this worker handles: a
// ts.Program cannot cross the isolate boundary, but the parse work it needs can
// at least be done once per worker instead of once per task
const programCache = Transpiler.createProgramCache();

// expected files config
// const filesConfig = [
//     {
//         name: string,  ????
//         content: string,
//         [config: {
//             language: string,
//             async: boolean
//         }]
//     }
// ];

export default async ({transpilerConfig, filesConfig}) => {
    const transpiler = new Transpiler(transpilerConfig, programCache);

    const result = [] as any[];
    for (const fileConfig of filesConfig) {
        const transpiled = transpiler.transpileDifferentLanguages(fileConfig.config, fileConfig.content);
        const transpiledFile = {
            name: fileConfig.name,
            result: transpiled
        };
        result.push(transpiledFile);
    }
    return result;
}