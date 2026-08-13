const fs = require('fs');

const files = [
    'e:/code/vshop/src/templates/default/theme.scss',
    'e:/code/vshop/src/templates/fresh/theme.scss'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\$brand-color:([^;]+);/g, '$brand-color:$1 !default;');
    content = content.replace(/\$brand-color-light:([^;]+);/g, '$brand-color-light:$1 !default;');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed: ' + file);
});
