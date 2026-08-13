const fs = require('fs');
const file = 'e:/code/vshop/src/App.vue';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("@import './uni.scss';\n", '');
fs.writeFileSync(file, content, 'utf8');
console.log('Removed duplicate uni.scss import from App.vue');
