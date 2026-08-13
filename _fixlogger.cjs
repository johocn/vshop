const fs = require('fs');

// Fix recharge-card.service.ts: Logger from @nestjs/common -> @vendure/core
let svc = fs.readFileSync('../vendure/packages/recharge-card-plugin/src/recharge-card.service.ts', 'utf-8');
svc = svc.replace(
    "import { Injectable, Logger } from '@nestjs/common';",
    "import { Injectable } from '@nestjs/common';"
);
// Add Logger to the @vendure/core import
svc = svc.replace(
    "import {\n    CustomerService,\n    ID,",
    "import {\n    CustomerService,\n    ID,\n    Logger,"
);
fs.writeFileSync('../vendure/packages/recharge-card-plugin/src/recharge-card.service.ts', svc, 'utf-8');
console.log('Fixed recharge-card.service.ts Logger import');

// Also fix balance-payment-handler.ts - check its import
let bph = fs.readFileSync('../vendure/packages/recharge-card-plugin/src/balance-payment-handler.ts', 'utf-8');
if (bph.includes("Logger") && bph.includes("from '@vendure/core'")) {
    console.log('balance-payment-handler.ts already imports Logger from @vendure/core');
} else if (bph.includes("Logger")) {
    console.log('WARNING: balance-payment-handler.ts has Logger but may be from wrong source');
}

// Fix plugin.ts which also imports Logger
let plugin = fs.readFileSync('../vendure/packages/recharge-card-plugin/src/plugin.ts', 'utf-8');
if (plugin.includes("import { Inject, OnApplicationBootstrap, Type } from '@nestjs/common';")) {
    // Check if Logger is from nestjs
    if (plugin.includes('Logger') && !plugin.includes("Logger, PluginCommonModule") && !plugin.includes("PluginCommonModule, Logger")) {
        // Logger might be imported from nestjs
        console.log('Checking plugin.ts Logger import...');
    }
}
// The plugin.ts already imports Logger from @vendure/core based on original code
console.log('=== Logger fix done ===');
