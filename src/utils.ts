

function regexAll (text: string, array: any[]): string {
    for (const i in array) {
        let regex = array[i][0];
        const flags = (typeof regex === 'string') ? 'g' : undefined;
        regex = new RegExp (regex, flags);
        text = text.replace (regex, array[i][1]);
    }
    return text;
}

function unCamelCase (s: string): string | undefined {
    return s.match (/[A-Z]/) ? s.replace (/[a-z0-9][A-Z]/g, x => x[0] + '_' + x[1]).replace(/[A-Z0-9][A-Z0-9][a-z][^$]/g, x => x[0] + '_' + x[1] + x[2] + x[3]).replace(/[a-z][0-9]$/g, x=> x[0] + '_' + x[1]).toLowerCase () : undefined;
}

// function extend (...args) {
//     Object.assign ({}, ...args);
// }
function isUpperCase(x) {
    return x && x.length > 0 && x[0] === x.toUpperCase()[0];
}
export {
    regexAll,
    unCamelCase,
    isUpperCase
};
