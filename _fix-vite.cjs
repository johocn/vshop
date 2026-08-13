const fs = require('fs');
const file = 'e:/code/vshop/vite.config.ts';
let content = fs.readFileSync(file, 'utf8');

// Remove the entire css.preprocessorOptions block
content = content.replace(
    /    css: \{[\s\S]*?    \},\n/,
    ''
);

fs.writeFileSync(file, content, 'utf8');
console.log('Removed additionalData from vite.config.ts');
console.log('--- New content ---');
console.log(fs.readFileSync(file, 'utf8'));
