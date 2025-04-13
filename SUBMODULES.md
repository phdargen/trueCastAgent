# Managing Git Submodules

This project uses Git submodules to include external repositories. Here's how to work with them:

## Initial Setup for New Clone

When you clone this repository for the first time, you need to initialize the submodules:

```bash
git clone <repository-url>
git submodule update --init --recursive
```

## Updating Submodules

To update all submodules to their latest commits:

```bash
git submodule update --remote --merge
```

## Working with the cdp-agentkit Submodule

The cdp-agentkit repository is included as a submodule. To switch branches:

1. Change to the submodule directory:
   ```bash
   cd cdp-agentkit
   ```

2. Check out the branch you want:
   ```bash
   git checkout <branch-name>
   ```
   Available branches include:
   - master (default)
   - across-executeQuote
   - across-ts
   - opensea
   - opensea-ts
   - safe-ts
   - truemarkets-ts

3. Return to the main project:
   ```bash
   cd ..
   ```

4. If you want to commit the submodule change to the main project:
   ```bash
   git add cdp-agentkit
   git commit -m "Update cdp-agentkit submodule to branch <branch-name>"
   ```

## Adding New Submodules

To add a new submodule:

```bash
git submodule add <repository-url> <path>
```

For example, to add another repository:
```bash
git submodule add https://github.com/username/repo.git external/repo
``` 