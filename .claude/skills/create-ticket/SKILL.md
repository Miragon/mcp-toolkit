# Skill: create-ticket

**Purpose:** Create or update GitHub issues for the mcp-toolkit repository using the `gh` CLI.

**Key Workflow:**

1. **Determine mode** – Check if updating an existing issue or creating a new one
2. **Gather information** – Extract issue type (feat/fix/refactor) and relevant details from the user
3. **Research (optional)** – Search for technical details in the codebase if needed
4. **Draft** – Read templates from `.github/ISSUE_TEMPLATE/` and populate sections
5. **Confirm** – Present draft to user for approval/edits
6. **Create/Update** – Execute `gh` commands to post or modify the issue
7. **Report** – Display final issue state and URL

**Critical Requirements:**

- Always use `gh` CLI (never call the GitHub API directly)
- Abort if `gh` is unavailable; ask user to install and restart
- Ask user for guidance if any `gh` call fails
