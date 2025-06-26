import * as vscode from 'vscode';
import { TextEncoder, TextDecoder } from 'util';
import * as os from 'os';
import * as path from 'path';
import { Issue, PlainIssue, toPlain, fromPlain } from './types';

function getIssuesFileUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'issue-logger.json');
}

function getGlobalIssuesFileUri(): vscode.Uri | undefined {
  let p = vscode.workspace
    .getConfiguration('myErrorLogger')
    .get<string>('globalLogPath');
  if (!p) {
    const home = os.homedir();
    if (process.platform === 'win32') {
      const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      p = path.join(base, 'my-error-logger', 'global-log.json');
    } else if (process.platform === 'darwin') {
      p = path.join(
        home,
        'Library',
        'Application Support',
        'my-error-logger',
        'global-log.json'
      );
    } else {
      p = path.join(home, '.config', 'my-error-logger', 'global-log.json');
    }
  }
  return vscode.Uri.file(p);
}

async function loadFileIssues(fileUri: vscode.Uri): Promise<Issue[]> {
  try {
    const raw = await vscode.workspace.fs.readFile(fileUri);
    const decoded = new TextDecoder().decode(raw);
    const plainArr = JSON.parse(decoded) as PlainIssue[];
    return plainArr.map(fromPlain);
  } catch {
    return [];
  }
}

export async function loadIssues(
  context: vscode.ExtensionContext
): Promise<Issue[]> {
  const fileUri = getIssuesFileUri();
  if (fileUri) {
    const issues = await loadFileIssues(fileUri);
    if (issues.length) {
      return issues;
    }
  }
  return context.workspaceState.get<Issue[]>('issues', []);
}

async function saveFileIssues(fileUri: vscode.Uri, issues: Issue[]): Promise<void> {
  const dir = vscode.Uri.joinPath(fileUri, '..' as any);
  try {
    await vscode.workspace.fs.stat(dir);
  } catch {
    await vscode.workspace.fs.createDirectory(dir);
  }
  const plainArr = issues.map(toPlain);
  const encoded = new TextEncoder().encode(JSON.stringify(plainArr, null, 2));
  await vscode.workspace.fs.writeFile(fileUri, encoded);
}

export async function loadGlobalIssues(): Promise<Issue[]> {
  const fileUri = getGlobalIssuesFileUri();
  if (!fileUri) return [];
  return loadFileIssues(fileUri);
}

async function mergeIssuesToGlobal(issues: Issue[]): Promise<void> {
  const fileUri = getGlobalIssuesFileUri();
  if (!fileUri) return;
  const globalIssues = await loadGlobalIssues();
  for (const issue of issues) {
    const idx = globalIssues.findIndex((g) => g.id === issue.id);
    if (idx === -1) {
      globalIssues.push(issue);
    } else {
      globalIssues[idx] = issue;
    }
  }
  await saveFileIssues(fileUri, globalIssues);
}

export async function saveIssues(
  context: vscode.ExtensionContext,
  issues: Issue[]
): Promise<void> {
  await context.workspaceState.update('issues', issues);
  const fileUri = getIssuesFileUri();
  if (fileUri) {
    await saveFileIssues(fileUri, issues);
  }
  await mergeIssuesToGlobal(issues);
}
