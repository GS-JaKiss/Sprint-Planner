# Sprint Planner

Sprint Planner is a Windows desktop app for turning a Jira backlog into a practical, capacity-aware sprint plan. Import issues, assign work across the team, estimate effort in half-day increments, and see overloads before the sprint begins.

## Features

- Import up to 500 issues from a Jira board
- Paste issues from structured text or create them manually
- Assign one issue to multiple team members with individual estimates
- Compare planned work with sprint capacity by person and across the team
- Reorder work per person and hide unavailable team members
- Add shared filler time for ceremonies, support, and other overhead
- Copy the team capacity view as an image
- Keep the current plan locally between sessions

## Install

Download `Sprint-Planner-Windows-x64.zip` from the latest [GitHub Release](https://github.com/GS-JaKiss/Sprint-Planner/releases), extract it, and run **Sprint Planner.exe**.

The application is currently unsigned, so Windows SmartScreen may ask you to confirm that you want to run it.

## Jira import

Open **Import from Jira** and paste the complete board URL, for example:

```text
https://team.atlassian.net/jira/software/c/projects/PROJ/boards/42/backlog
```

Enter your Atlassian account email and API token in the dialog. For reusable local credentials, create a `.env` file in the project root before starting the app:

```dotenv
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-token
```

Create tokens from [Atlassian account security](https://id.atlassian.com/manage-profile/security/api-tokens). A classic API token works without selecting scopes. A scoped token requires:

- `read:board-scope:jira-software`
- `read:issue-details:jira`

Credentials entered in the dialog override `.env` for that import. The token stays in Electron's main process and is not stored in browser storage or sent to the renderer. Existing assignments and estimates are retained when an imported issue ID already exists in the plan.

## Text import

Use one issue per line in this format:

```text
WEB-241 - Streamline the checkout address flow [Story; To Do; Janos Kiss; 3 SP; High]
```

The issue type and status are required. Assignee, story points, and priority are optional. Story points are used as the initial day estimate.

## Development

Prerequisites:

- Node.js 22 or later
- npm
- Windows for building the NSIS installer

Install dependencies and start Vite with Electron:

```powershell
npm ci
npm run dev
```

Useful commands:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server and desktop app |
| `npm run build` | Type-check Electron and build the renderer |
| `npm run start` | Open the latest local production build |
| `npm run dist` | Build a Windows installer in `release/` |

Sprint plans and UI preferences are stored locally by Electron. The `.env` file, build output, dependencies, and installers are excluded from Git.

## Publishing a release

The **Build release** GitHub Actions workflow runs automatically whenever a commit is pushed to `main`. It can also be run on demand without entering a tag:

1. Open **Actions** in GitHub and select **Build release**.
2. Choose **Run workflow**.
3. Start the workflow.

The workflow installs locked dependencies, packages the x64 Windows application, and publishes `Sprint-Planner-Windows-x64.zip` as both a workflow artifact and a GitHub Release asset. It creates a unique tag automatically from the package version and workflow run number, such as `v1.0.0-build.2`, so no release tag input is required.