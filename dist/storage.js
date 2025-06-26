"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadIssues = loadIssues;
exports.loadGlobalIssues = loadGlobalIssues;
exports.saveIssues = saveIssues;
const vscode = __importStar(require("vscode"));
const util_1 = require("util");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const types_1 = require("./types");
function getIssuesFileUri() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    return vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'issue-logger.json');
}
function getGlobalIssuesFileUri() {
    let p = vscode.workspace
        .getConfiguration('myErrorLogger')
        .get('globalLogPath');
    if (!p) {
        const home = os.homedir();
        if (process.platform === 'win32') {
            const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
            p = path.join(base, 'issue-logger', 'global-log.json');
        }
        else if (process.platform === 'darwin') {
            p = path.join(home, 'Library', 'Application Support', 'issue-logger', 'global-log.json');
        }
        else {
            p = path.join(home, '.config', 'issue-logger', 'global-log.json');
        }
    }
    return vscode.Uri.file(p);
}
async function loadFileIssues(fileUri) {
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const decoded = new util_1.TextDecoder().decode(raw);
        const plainArr = JSON.parse(decoded);
        return plainArr.map(types_1.fromPlain);
    }
    catch {
        return [];
    }
}
async function loadIssues(context) {
    const fileUri = getIssuesFileUri();
    if (fileUri) {
        const issues = await loadFileIssues(fileUri);
        if (issues.length) {
            return issues;
        }
    }
    return context.workspaceState.get('issues', []);
}
async function saveFileIssues(fileUri, issues) {
    const dir = vscode.Uri.joinPath(fileUri, '..');
    try {
        await vscode.workspace.fs.stat(dir);
    }
    catch {
        await vscode.workspace.fs.createDirectory(dir);
    }
    const plainArr = issues.map(types_1.toPlain);
    const encoded = new util_1.TextEncoder().encode(JSON.stringify(plainArr, null, 2));
    await vscode.workspace.fs.writeFile(fileUri, encoded);
}
async function loadGlobalIssues() {
    const fileUri = getGlobalIssuesFileUri();
    if (!fileUri)
        return [];
    return loadFileIssues(fileUri);
}
async function mergeIssuesToGlobal(issues) {
    const fileUri = getGlobalIssuesFileUri();
    if (!fileUri)
        return;
    const globalIssues = await loadGlobalIssues();
    for (const issue of issues) {
        const idx = globalIssues.findIndex((g) => g.id === issue.id);
        if (idx === -1) {
            globalIssues.push(issue);
        }
        else {
            globalIssues[idx] = issue;
        }
    }
    await saveFileIssues(fileUri, globalIssues);
}
async function saveIssues(context, issues) {
    await context.workspaceState.update('issues', issues);
    const fileUri = getIssuesFileUri();
    if (fileUri) {
        await saveFileIssues(fileUri, issues);
    }
    await mergeIssuesToGlobal(issues);
}
