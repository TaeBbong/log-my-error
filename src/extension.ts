import * as vscode from "vscode";
import { TextEncoder, TextDecoder } from "util";
import { v4 as uuidv4 } from "uuid";

/*****************************
 * Types
 *****************************/
interface Issue {
  id: string;
  title: string;
  description: string;
  snippet: string;
  filePath: string;
  range: vscode.Range;
  resolved: boolean;
  resolution?: string;
}

/*****************************
 * Helpers for JSON ⇄ Issue
 *****************************/
interface PlainIssue extends Omit<Issue, "range"> {
  range: [number, number, number, number]; // [sLine, sChar, eLine, eChar]
}

function toPlain(issue: Issue): PlainIssue {
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

function fromPlain(obj: PlainIssue): Issue {
  const [sl, sc, el, ec] = obj.range;
  return {
    ...obj,
    range: new vscode.Range(sl, sc, el, ec)
  };
}

/*****************************
 * File system utils
 *****************************/
function getIssuesFileUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "my-error-logger.json");
}

async function loadIssues(context: vscode.ExtensionContext): Promise<Issue[]> {
  const fileUri = getIssuesFileUri();
  if (fileUri) {
    try {
      const raw = await vscode.workspace.fs.readFile(fileUri);
      const decoded = new TextDecoder().decode(raw);
      const plainArr = JSON.parse(decoded) as PlainIssue[];
      return plainArr.map(fromPlain);
    } catch (err) {
      // 파일이 없거나 JSON 파싱 오류 → workspaceState fallback
    }
  }
  return context.workspaceState.get<Issue[]>("issues", []);
}

async function saveIssues(
  context: vscode.ExtensionContext,
  issues: Issue[]
): Promise<void> {
  // 1) VS Code 내부 Memento에 보존
  await context.workspaceState.update("issues", issues);

  // 2) 사람이 읽을 수 있는 JSON 파일로 보존
  const fileUri = getIssuesFileUri();
  if (!fileUri) return;

  // .vscode 디렉터리 보장
  const vscodeDir = vscode.Uri.joinPath(fileUri, ".." as any);
  try {
    await vscode.workspace.fs.stat(vscodeDir);
  } catch {
    await vscode.workspace.fs.createDirectory(vscodeDir);
  }

  const plainArr = issues.map(toPlain);
  const encoded = new TextEncoder().encode(JSON.stringify(plainArr, null, 2));
  await vscode.workspace.fs.writeFile(fileUri, encoded);
}

/*****************************
 * Extension entry
 *****************************/
export async function activate(context: vscode.ExtensionContext) {
  let issues: Issue[] = await loadIssues(context);

  /********************
   * Log / Resolve CMD
   ********************/
  const logCmd = vscode.commands.registerCommand(
    "myErrorLogger.log",
    async () => {
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
      if (!picked) return;

      const selectionText = editor.document.getText(editor.selection);
      const range = editor.selection;
      const filePath = editor.document.uri.fsPath;

      if (picked.id === "new") {
        // 새 이슈 생성
        const title = await vscode.window.showInputBox({
          title: "이슈 제목",
          placeHolder: "ex) NullReferenceException in UserService"
        });
        if (!title) return;

        const description = await vscode.window.showInputBox({
          title: "이슈 설명",
          placeHolder: "무슨 상황에서 오류가 났나요?"
        });

        const issue: Issue = {
          id: uuidv4(),
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
      } else {
        // 기존 이슈 해결
        const issue = issues.find((i) => i.id === picked.id)!;
        const fixDesc = await vscode.window.showInputBox({
          title: "해결 방법 설명",
          placeHolder: "어떻게 수정했나요?"
        });
        if (!fixDesc) return;

        issue.resolved = true;
        issue.resolution = fixDesc;
        await saveIssues(context, issues);
        vscode.window.showInformationMessage(`이슈 “${issue.title}” 해결 완료!`);
      }
    }
  );

  /********************
   * Show Issues CMD
   ********************/
  const showCmd = vscode.commands.registerCommand(
    "myErrorLogger.showIssues",
    async () => {
      if (!issues.length) {
        vscode.window.showInformationMessage("저장된 이슈가 없습니다.");
        return;
      }

      const picked = await vscode.window.showQuickPick(
        issues.map((i) => ({
          label: i.resolved ? `✅ ${i.title}` : `❗ ${i.title}`,
          detail: `${i.filePath}:${i.range.start.line + 1}`,
          description: i.resolved ? "resolved" : "open",
          issue: i
        })),
        { title: "My-Extension Issues", matchOnDetail: true }
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

  context.subscriptions.push(logCmd, showCmd);
}

export function deactivate() {}
