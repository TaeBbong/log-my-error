import * as vscode from 'vscode';

export interface Issue {
  id: string;
  title: string;
  description: string;
  snippet: string;
  filePath: string;
  range: vscode.Range;
  resolved: boolean;
  resolution?: string;
  tags: string[];
}

export interface PlainIssue extends Omit<Issue, 'range'> {
  range: [number, number, number, number];
}

export function toPlain(issue: Issue): PlainIssue {
  return {
    ...issue,
    range: [
      issue.range.start.line,
      issue.range.start.character,
      issue.range.end.line,
      issue.range.end.character,
    ],
  };
}

export function fromPlain(obj: PlainIssue): Issue {
  const [sl, sc, el, ec] = obj.range;
  return {
    ...obj,
    range: new vscode.Range(sl, sc, el, ec),
  };
}
