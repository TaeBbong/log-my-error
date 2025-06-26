import * as vscode from 'vscode';
import { TextEncoder, TextDecoder } from 'util';
import { Issue, PlainIssue, toPlain, fromPlain } from './types';

function getIssuesFileUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'issue-logs.json');
}

function getGlobalIssuesFileUri(): vscode.Uri | undefined {
  const p = vscode.workspace
    .getConfiguration('myErrorLogger')
    .get<string>('globalLogPath');
  return p ? vscode.Uri.file(p) : undefined;
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

async function loadGlobalIssues(): Promise<Issue[]> {
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
