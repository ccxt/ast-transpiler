
// assuming this is the "non transpilable" code, isolated in a separated
// file and imported by the main file
function nonTranspilableFeature() {
    return 1;
}

export {
    nonTranspilableFeature
}