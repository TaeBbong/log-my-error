# Issue Logger

![Issue Logger Icon](./icon.png)

**Log troublesome code snippets, errors, and their solutions without ever leaving your VS Code environment.**

Issue Logger is a powerful VS Code extension designed to streamline your debugging and code-review process. It allows you to instantly capture code snippets, add descriptive details, and track their resolution, all within your editor. Keep your workflow focused and efficient by managing a log of issues for your current project or across all your projects with a global log.

## Features

- **Effortless Issue Logging**: Quickly log any code snippet as an issue directly from your editor's context menu or the command palette.
- **Detailed Issue Tracking**: Enrich your logs by adding titles, descriptions, and custom tags to each issue.
- **Project-Specific & Global Views**:
  - View all issues logged specifically for the current workspace.
  - Access a global list to see all your issues from every project in one place.
- **Track Resolutions**: Mark issues as resolved and attach the solution, including the fixed code snippet, to maintain a clear history of your work.
- **Flexible Markdown Exports**: Easily share or document your findings.
  - Export a single issue to Markdown.
  - Export all issues for the current project into a single Markdown file.
  - Export your entire global issue log to Markdown.
- **Customizable Tags**: Create and manage your own set of tags for better organization and filtering of issues.

## Commands

You can access the following commands through the VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- `IssueLogger: Log`: Log a new issue from the selected code.
- `IssueLogger: Show Issues`: Show all issues for the current project.
- `IssueLogger: Show Issues(Global)`: Show all issues from all projects.
- `IssueLogger: Register Tag`: Register a new tag for organizing issues.
- `IssueLogger: Export Issue to Markdown`: Exports a single project issue to Markdown and displays it in a new editor window.
- `IssueLogger: Export All Issues in Project to Markdown`: Exports all issues in the current project to a single Markdown document and displays it in a new editor window.
- `IssueLogger: Export All Global Issues to Markdown`: Exports all global issues to a single Markdown document and displays it in a new editor window.

You can also right-click on a selection in the editor and choose **IssueLogger: Log** from the context menu.

## Extension Settings

This extension contributes the following settings:

- `myErrorLogger.globalLogPath`: Specify an absolute path for the global issue log JSON file. If left empty, it will be stored in a default location managed by the extension.

---

**Enjoy a more organized and efficient debugging workflow with Issue Logger!**
