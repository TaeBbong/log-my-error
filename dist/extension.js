"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const commands_1 = require("./commands");
async function activate(context) {
    await (0, commands_1.registerCommands)(context);
}
function deactivate() { }
