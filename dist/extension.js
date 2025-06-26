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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const util_1 = require("util");
const uuid_1 = require("uuid");
function toPlain(issue) {
    return {
        ...issue,
        range: [
            issue.range.start.line,
            issue.range.start.character,
            issue.range.end.line,
            issue.range.end.character
        ]
    };
}
function fromPlain(obj) {
    const [sl, sc, el, ec] = obj.range;
    return {
        ...obj,
        range: new vscode.Range(sl, sc, el, ec)
    };
}
/*****************************
 * File system utils
 *****************************/
function getIssuesFileUri() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    return vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "my-error-logger.json");
}
async function loadIssues(context) {
    const fileUri = getIssuesFileUri();
    if (fileUri) {
        try {
            const raw = await vscode.workspace.fs.readFile(fileUri);
            const decoded = new util_1.TextDecoder().decode(raw);
            const plainArr = JSON.parse(decoded);
            return plainArr.map(fromPlain);
        }
        catch (err) {
            // 파일이 없거나 JSON 파싱 오류 → workspaceState fallback
        }
    }
    return context.workspaceState.get("issues", []);
}
async function saveIssues(context, issues) {
    // 1) VS Code 내부 Memento에 보존
    await context.workspaceState.update("issues", issues);
    // 2) 사람이 읽을 수 있는 JSON 파일로 보존
    const fileUri = getIssuesFileUri();
    if (!fileUri)
        return;
    // .vscode 디렉터리 보장
    const vscodeDir = vscode.Uri.joinPath(fileUri, "..");
    try {
        await vscode.workspace.fs.stat(vscodeDir);
    }
    catch {
        await vscode.workspace.fs.createDirectory(vscodeDir);
    }
    const plainArr = issues.map(toPlain);
    const encoded = new util_1.TextEncoder().encode(JSON.stringify(plainArr, null, 2));
    await vscode.workspace.fs.writeFile(fileUri, encoded);
}
/*****************************
 * Extension entry
 *****************************/
async function activate(context) {
    let issues = await loadIssues(context);
    /********************
     * Log / Resolve CMD
     ********************/
    const logCmd = vscode.commands.registerCommand("myErrorLogger.log", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage("선택된 코드가 없습니다.");
            return;
        }
        // Quick Pick – new vs existing unresolved issues
        const pickItems = [
            { label: "➕ 새 이슈 만들기", id: "new" },
            ...issues.filter((i) => !i.resolved).map((i) => ({
                label: `🔧 ${i.title}`,
                id: i.id
            }))
        ];
        const picked = await vscode.window.showQuickPick(pickItems, {
            title: "이슈 선택",
            placeHolder: "새 이슈이거나 해결할 이슈를 고르세요"
        });
        if (!picked)
            return;
        const selectionText = editor.document.getText(editor.selection);
        const range = editor.selection;
        const filePath = editor.document.uri.fsPath;
        if (picked.id === "new") {
            // 새 이슈 생성
            const title = await vscode.window.showInputBox({
                title: "이슈 제목",
                placeHolder: "ex) NullReferenceException in UserService"
            });
            if (!title)
                return;
            const description = await vscode.window.showInputBox({
                title: "이슈 설명",
                placeHolder: "무슨 상황에서 오류가 났나요?"
            });
            const issue = {
                id: (0, uuid_1.v4)(),
                title,
                description: description ?? "",
                snippet: selectionText,
                filePath,
                range,
                resolved: false
            };
            issues.push(issue);
            await saveIssues(context, issues);
            vscode.window.showInformationMessage(`이슈 “${title}”가 기록되었습니다.`);
        }
        else {
            // 기존 이슈 해결
            const issue = issues.find((i) => i.id === picked.id);
            const fixDesc = await vscode.window.showInputBox({
                title: "해결 방법 설명",
                placeHolder: "어떻게 수정했나요?"
            });
            if (!fixDesc)
                return;
            issue.resolved = true;
            issue.resolution = fixDesc;
            await saveIssues(context, issues);
            vscode.window.showInformationMessage(`이슈 “${issue.title}” 해결 완료!`);
        }
    });
    /********************
     * Show Issues CMD
     ********************/
    const showCmd = vscode.commands.registerCommand("myErrorLogger.showIssues", async () => {
        if (!issues.length) {
            vscode.window.showInformationMessage("저장된 이슈가 없습니다.");
            return;
        }
        const picked = await vscode.window.showQuickPick(issues.map((i) => ({
            label: i.resolved ? `✅ ${i.title}` : `❗ ${i.title}`,
            detail: `${i.filePath}:${i.range.start.line + 1}`,
            description: i.resolved ? "resolved" : "open",
            issue: i
        })), { title: "My-Extension Issues", matchOnDetail: true });
        if (!picked)
            return;
        const issue = picked.issue;
        const uri = vscode.Uri.file(issue.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const ed = await vscode.window.showTextDocument(doc);
        ed.selection = new vscode.Selection(issue.range.start, issue.range.end);
        ed.revealRange(issue.range, vscode.TextEditorRevealType.InCenter);
        if (issue.resolved) {
            vscode.window.showInformationMessage(`Resolution: ${issue.resolution}`);
        }
    });
    context.subscriptions.push(logCmd, showCmd);
}
function deactivate() { }
