const fs = require('fs');

// Fix recharge-card-plugin tsconfig.json - remove "include" to match working plugins
const rc = {
    extends: "../../tsconfig.json",
    compilerOptions: {
        declaration: true,
        removeComments: false,
        noLib: false,
        skipLibCheck: true,
        sourceMap: true
    }
};
fs.writeFileSync('../vendure/packages/recharge-card-plugin/tsconfig.json', JSON.stringify(rc, null, 2), 'utf-8');
console.log('Fixed recharge-card-plugin/tsconfig.json');

// Fix after-sales-plugin tsconfig.json - same
const as = {
    extends: "../../tsconfig.json",
    compilerOptions: {
        declaration: true,
        removeComments: false,
        noLib: false,
        skipLibCheck: true,
        sourceMap: true
    }
};
fs.writeFileSync('../vendure/packages/after-sales-plugin/tsconfig.json', JSON.stringify(as, null, 2), 'utf-8');
console.log('Fixed after-sales-plugin/tsconfig.json');
