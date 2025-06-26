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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
const storage_1 = require("./storage");
function issueToMarkdown(issue) {
    const parts = [
        `### ${issue.title}`,
        '',
        issue.description,
        '',
        '```',
        issue.snippet,
        '```',
        '',
        `File: ${issue.filePath}:${issue.range.start.line + 1}`,
    ];
    if (issue.tags.length) {
        parts.push('', `Tags: ${issue.tags.join(', ')}`);
    }
    if (issue.resolved) {
        parts.push('', `**Resolved**: ${issue.resolution}`);
    }
    return parts.join('\n');
}
async function registerCommands(context) {
    let issues = await (0, storage_1.loadIssues)(context);
    const logCmd = vscode.commands.registerCommand('myErrorLogger.log', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('선택된 코드가 없습니다.');
            return;
        }
        const pickItems = [
            { label: '➕ 새 이슈 만들기', id: 'new' },
            ...issues.filter((i) => !i.resolved).map((i) => ({
                label: `🔧 ${i.title}`,
                id: i.id,
            })),
        ];
        const picked = await vscode.window.showQuickPick(pickItems, {
            title: '이슈 선택',
            placeHolder: '새 이슈이거나 해결할 이슈를 고르세요',
        });
        if (!picked)
            return;
        const selectionText = editor.document.getText(editor.selection);
        const range = editor.selection;
        const filePath = editor.document.uri.fsPath;
        if (picked.id === 'new') {
            const title = await vscode.window.showInputBox({
                title: '이슈 제목',
                placeHolder: 'ex) NullReferenceException in UserService',
            });
            if (!title)
                return;
            const description = await vscode.window.showInputBox({
                title: '이슈 설명',
                placeHolder: '무슨 상황에서 오류가 났나요?',
            });
            const existingTags = context.globalState.get('tags', []);
            let tags = [];
            if (existingTags.length) {
                const tagPicks = await vscode.window.showQuickPick(existingTags.map((t) => ({ label: t })), { title: '태그 선택', canPickMany: true });
                if (tagPicks)
                    tags = tagPicks.map((p) => p.label);
            }
            const moreTags = await vscode.window.showInputBox({
                title: '추가 태그 (콤마 구분, 생략 가능)',
            });
            if (moreTags) {
                tags.push(...moreTags
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t));
            }
            tags = Array.from(new Set(tags));
            const newTags = tags.filter((t) => !existingTags.includes(t));
            if (newTags.length) {
                await context.globalState.update('tags', [...existingTags, ...newTags]);
            }
            const issue = {
                id: (0, uuid_1.v4)(),
                title,
                description: description ?? '',
                snippet: selectionText,
                filePath,
                range,
                resolved: false,
                tags,
            };
            issues.push(issue);
            await (0, storage_1.saveIssues)(context, issues);
            vscode.window.showInformationMessage(`이슈 “${title}”가 기록되었습니다.`);
        }
        else {
            const issue = issues.find((i) => i.id === picked.id);
            const fixDesc = await vscode.window.showInputBox({
                title: '해결 방법 설명',
                placeHolder: '어떻게 수정했나요?',
            });
            if (!fixDesc)
                return;
            issue.resolved = true;
            issue.resolution = fixDesc;
            await (0, storage_1.saveIssues)(context, issues);
            vscode.window.showInformationMessage(`이슈 “${issue.title}” 해결 완료!`);
        }
    });
    const showCmd = vscode.commands.registerCommand('myErrorLogger.showIssues', async () => {
        if (!issues.length) {
            vscode.window.showInformationMessage('저장된 이슈가 없습니다.');
            return;
        }
        const picked = await vscode.window.showQuickPick(issues.map((i) => ({
            label: i.resolved ? `✅ ${i.title}` : `❗ ${i.title}`,
            detail: `${i.filePath}:${i.range.start.line + 1}`,
            description: i.resolved ? 'resolved' : 'open',
            issue: i,
        })), { title: 'My-Extension Issues', matchOnDetail: true });
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
    const addTagCmd = vscode.commands.registerCommand('myErrorLogger.addTag', async () => {
        const tag = await vscode.window.showInputBox({
            title: '새 태그 이름',
        });
        if (!tag)
            return;
        const tags = context.globalState.get('tags', []);
        if (!tags.includes(tag)) {
            tags.push(tag);
            await context.globalState.update('tags', tags);
            vscode.window.showInformationMessage(`태그 “${tag}”가 등록되었습니다.`);
        }
    });
    const exportCmd = vscode.commands.registerCommand('myErrorLogger.exportIssue', async () => {
        if (!issues.length) {
            vscode.window.showInformationMessage('저장된 이슈가 없습니다.');
            return;
        }
        const picked = await vscode.window.showQuickPick(issues.map((i) => ({ label: i.title, issue: i })), { title: 'Markdown으로 내보낼 이슈 선택' });
        if (!picked)
            return;
        const issue = picked.issue;
        const md = issueToMarkdown(issue);
        await vscode.env.clipboard.writeText(md);
        vscode.window.showInformationMessage('Markdown이 클립보드에 복사되었습니다.');
    });
    context.subscriptions.push(logCmd, showCmd, addTagCmd, exportCmd);
}
