import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Issue } from './types';
import { loadIssues, saveIssues, loadGlobalIssues } from './storage';

function issueToMarkdown(issue: Issue, includeProjectName = false): string {
  const parts = [
    `### ${issue.title}`,
    '',
  ];

  if (includeProjectName && issue.projectName) {
      parts.push(`**Project**: ${issue.projectName}`, '');
  }

  parts.push(
    issue.description,
    '',
    '```',
    issue.snippet,
    '```',
    '',
    `File: ${issue.filePath}:${issue.range.start.line + 1}`
  );

  if (issue.tags.length) {
    parts.push('', `Tags: ${issue.tags.join(', ')}`);
  }
  if (issue.resolved) {
    parts.push('', `**Resolved**: ${issue.resolution}`);
    if (issue.resolvedSnippet) {
      parts.push('', '```', issue.resolvedSnippet, '```');
    }
  }
  return parts.join('\n');
}

function showMarkdownInWebView(context: vscode.ExtensionContext, title: string, mdContent: string) {
    const panel = vscode.window.createWebviewPanel(
        'markdownExport',
        title,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: []
        }
    );

    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'copyToClipboard':
                    vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('Markdown copied to clipboard!');
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    panel.webview.html = getWebviewContent(panel.webview, mdContent);
}

function getWebviewContent(webview: vscode.Webview, mdContent: string): string {
    const nonce = getNonce();

    // Escape the markdown content for safe inclusion in the HTML pre tag
    const escapedMdContent = escapeHtml(mdContent);
    const jsonContent = JSON.stringify(mdContent);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Export</title>
    <style>
        body {
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            background-color: var(--vscode-text-block-quote-background);
            border: 1px solid var(--vscode-text-block-quote-border);
            padding: 10px;
            border-radius: 4px;
        }
        button {
            margin-top: 15px;
            padding: 10px 15px;
            border: none;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            border-radius: 4px;
        }
        button:hover {
            background-color: var(--vscode-button-hover-background);
        }
    </style>
</head>
<body>
    <h1>Markdown Preview</h1>
    <pre><code>${escapedMdContent}</code></pre>
    <button id="copyButton">Copy to Clipboard</button>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const copyButton = document.getElementById('copyButton');
        const markdownContent = JSON.parse(${jsonContent});

        copyButton.addEventListener('click', () => {
            vscode.postMessage({
                command: 'copyToClipboard',
                text: markdownContent
            });
        });
    </script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function escapeHtml(unsafe: string) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

export async function registerCommands(
  context: vscode.ExtensionContext
): Promise<void> {
  let issues: Issue[] = await loadIssues(context);

  const logCmd = vscode.commands.registerCommand('myErrorLogger.log', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('활성 편집기가 없습니다.');
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
    if (!picked) return;

    const selectionText = editor.document.getText(editor.selection);
    const range = editor.selection.isEmpty
      ? new vscode.Range(editor.selection.start, editor.selection.start)
      : editor.selection;
    const filePath = editor.document.uri.fsPath;

    if (picked.id === 'new') {
      const title = await vscode.window.showInputBox({
        title: '이슈 제목',
        placeHolder: 'ex) NullReferenceException in UserService',
      });
      if (!title) return;

      const description = await vscode.window.showInputBox({
        title: '이슈 설명',
        placeHolder: '무슨 상황에서 오류가 났나요?',
      });

      const existingTags = context.globalState.get<string[]>('tags', []);
      let tags: string[] = [];
      if (existingTags.length) {
        const tagPicks = await vscode.window.showQuickPick(
          existingTags.map((t) => ({ label: t })),
          { title: '태그 선택', canPickMany: true }
        );
        if (tagPicks) tags = tagPicks.map((p) => p.label);
      }
      const moreTags = await vscode.window.showInputBox({
        title: '추가 태그 (콤마 구분, 생략 가능)',
      });
      if (moreTags) {
        tags.push(
          ...moreTags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t)
        );
      }
      tags = Array.from(new Set(tags));
      const newTags = tags.filter((t) => !existingTags.includes(t));
      if (newTags.length) {
        await context.globalState.update('tags', [...existingTags, ...newTags]);
      }

      const issue: Issue = {
        id: uuidv4(),
        title,
        description: description ?? '',
        snippet: selectionText,
        filePath,
        range,
        resolved: false,
        tags,
        projectName: vscode.workspace.name,
      };
      issues.push(issue);
      await saveIssues(context, issues);
      vscode.window.showInformationMessage(`이슈 “${title}”가 기록되었습니다.`);
    } else {
      const issue = issues.find((i) => i.id === picked.id)!;
      const fixDesc = await vscode.window.showInputBox({
        title: '해결 방법 설명',
        placeHolder: '어떻게 수정했나요?',
      });
      if (!fixDesc) return;

      issue.resolved = true;
      issue.resolution = fixDesc;
      issue.resolvedSnippet = selectionText;
      await saveIssues(context, issues);
      vscode.window.showInformationMessage(`이슈 “${issue.title}” 해결 완료!`);
    }
  });

  const showCmd = vscode.commands.registerCommand(
    'myErrorLogger.showIssues',
    async () => {
      if (!issues.length) {
        vscode.window.showInformationMessage('저장된 이슈가 없습니다.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        issues.map((i) => ({
          label: i.resolved ? `✅ ${i.title}` : `❗ ${i.title}`,
          detail: `${i.filePath}:${i.range.start.line + 1}`,
          description: i.projectName ? `Project: ${i.projectName}` : (i.resolved ? 'resolved' : 'open'),
          issue: i,
        })),
        { title: 'My-Extension Issues', matchOnDetail: true, matchOnDescription: true }
      );
      if (!picked) return;

      const issue = (picked as any).issue as Issue;
      const uri = vscode.Uri.file(issue.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const ed = await vscode.window.showTextDocument(doc);
      ed.selection = new vscode.Selection(issue.range.start, issue.range.end);
      ed.revealRange(issue.range, vscode.TextEditorRevealType.InCenter);

      if (issue.resolved) {
        vscode.window.showInformationMessage(`Resolution: ${issue.resolution}`);
      }
    }
  );

  const showGlobalCmd = vscode.commands.registerCommand(
    'myErrorLogger.showGlobalIssues',
    async () => {
      const globalIssues = await loadGlobalIssues();
      if (!globalIssues.length) {
        vscode.window.showInformationMessage('글로벌 로그가 없습니다.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        globalIssues.map((i) => ({
          label: i.resolved ? `✅ ${i.title}` : `❗ ${i.title}`,
          detail: `${i.filePath}:${i.range.start.line + 1}`,
          description: i.projectName ? `Project: ${i.projectName}` : (i.resolved ? 'resolved' : 'open'),
          issue: i,
        })),
        { title: 'Global My-Extension Issues', matchOnDetail: true, matchOnDescription: true }
      );
      if (!picked) return;
      const issue = (picked as any).issue as Issue;
      const uri = vscode.Uri.file(issue.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const ed = await vscode.window.showTextDocument(doc);
      ed.selection = new vscode.Selection(issue.range.start, issue.range.end);
      ed.revealRange(issue.range, vscode.TextEditorRevealType.InCenter);
      if (issue.resolved) {
        vscode.window.showInformationMessage(`Resolution: ${issue.resolution}`);
      }
    }
  );
  const addTagCmd = vscode.commands.registerCommand(
    'myErrorLogger.addTag',
    async () => {
      const tag = await vscode.window.showInputBox({
        title: '새 태그 이름',
      });
      if (!tag) return;
      const tags = context.globalState.get<string[]>('tags', []);
      if (!tags.includes(tag)) {
        tags.push(tag);
        await context.globalState.update('tags', tags);
        vscode.window.showInformationMessage(`태그 “${tag}”가 등록되었습니다.`);
      }
    }
  );

  const exportCmd = vscode.commands.registerCommand(
    'myErrorLogger.exportIssue',
    async () => {
      if (!issues.length) {
        vscode.window.showInformationMessage('저장된 이슈가 없습니다.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        issues.map((i) => ({
          label: i.title,
          description: i.projectName ? `Project: ${i.projectName}` : '',
          issue: i
        })),
        { title: 'Markdown으로 내보낼 이슈 선택', matchOnDescription: true }
      );
      if (!picked) return;
      const issue = (picked as any).issue as Issue;
      const md = issueToMarkdown(issue, true);
      showMarkdownInWebView(context, `Export: ${issue.title}`, md);
    }
  );

  const exportAllCmd = vscode.commands.registerCommand(
    'myErrorLogger.exportAllIssuesToMarkdown',
    async () => {
      if (!issues.length) {
        vscode.window.showInformationMessage('저장된 이슈가 없습니다.');
        return;
      }
      const projectName = vscode.workspace.name ?? 'Current Project';
      const title = `# ${projectName} Issues\n\n`;
      const md = title + issues.map(issue => issueToMarkdown(issue, false)).join('\n\n---\n\n');
      showMarkdownInWebView(context, `${projectName} Issues`, md);
    }
  );

  const exportGlobalCmd = vscode.commands.registerCommand(
    'myErrorLogger.exportGlobalIssuesToMarkdown',
    async () => {
      const globalIssues = await loadGlobalIssues();
      if (!globalIssues.length) {
        vscode.window.showInformationMessage('글로벌 로그가 없습니다.');
        return;
      }
      const title = `# Global Issues\n\n`;
      const md = title + globalIssues.map(issue => issueToMarkdown(issue, true)).join('\n\n---\n\n');
      showMarkdownInWebView(context, 'Global Issues', md);
    }
  );

  context.subscriptions.push(
    logCmd,
    showCmd,
    showGlobalCmd,
    addTagCmd,
    exportCmd,
    exportAllCmd,
    exportGlobalCmd
  );
}
