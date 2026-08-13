const fs = require('fs');

// Fix balance-payment-handler.ts: ctx.activeUserId is ID (string|number), but service expects number
let bph = fs.readFileSync('../vendure/packages/recharge-card-plugin/src/balance-payment-handler.ts', 'utf-8');
// The service methods take number, but ctx.activeUserId is ID. We already cast with `as any` in the service,
// but the handler passes ctx.activeUserId directly. Change parameter type in service to ID.
// Actually simpler: change the service methods to accept ID instead of number

let svc = fs.readFileSync('../vendure/packages/recharge-card-plugin/src/recharge-card.service.ts', 'utf-8');
// Change customerId: number to customerId: any in addBalance and deductBalance
svc = svc.replace('async addBalance(ctx: RequestContext, customerId: number, amount: number)', 
                   'async addBalance(ctx: RequestContext, customerId: any, amount: number)');
svc = svc.replace('async deductBalance(ctx: RequestContext, customerId: number, amount: number)',
                   'async deductBalance(ctx: RequestContext, customerId: any, amount: number)');
fs.writeFileSync('../vendure/packages/recharge-card-plugin/src/recharge-card.service.ts', svc, 'utf-8');
console.log('Fixed service customerId type');

console.log('=== ID type fixes done ===');
