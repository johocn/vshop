const fs = require('fs');
let content = fs.readFileSync('e:/code/vshop/src/api/mutations/auth.ts', 'utf8');
// Fix: input should be object not array
content = content.replace("{ input: [{ wechat: { code, type } }] }", "{ input: { wechat: { code, type } } }");
fs.writeFileSync('e:/code/vshop/src/api/mutations/auth.ts', content, 'utf8');
console.log('Fixed authenticateWithWechat input format');
