# Recording an Obsidian freeze on Linux

1. Open the affected vault with Miro Canvas disabled. Go to **Settings → Community plugins**. Leave Obsidian open.
2. Open [diagnose_freeze.py](diagnose_freeze.py), choose **Download raw file**, and save it in Downloads. In a terminal, run the following command with your vault folder. Python 3 is the only requirement.

   ```sh
   python3 ~/Downloads/diagnose_freeze.py "/path/to/your/vault"
   ```

   If the vault uses a custom configuration folder, add `--config-dir "folder name"`.
3. Wait for the prompt. Press Enter in the terminal, then enable Miro Canvas in Obsidian. The terminal records for 30 seconds even if the Obsidian window stops responding. If you close Obsidian during the recording, leave the terminal open.
4. Review the `miro-freeze-*.txt` file at the path printed in the terminal. Attach it to [issue #20](https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/issues/20). Mention whether a note or a Canvas was open, whether the welcome dialog appeared, whether Esc restored input, and whether the same thing happens in a fresh vault with only Miro Canvas installed. If known, include the Obsidian version and whether you installed the Arch package, Flatpak, or AppImage.

The report contains aggregate file sizes and counts, process CPU and memory, and changes in two saved plugin flags. Each CPU percentage uses one core as 100%. Process memory is grouped by role and can include shared pages more than once. All Obsidian windows for your Linux user are measured together.

The script skips hidden directories, symlinks and the selected configuration folder when measuring the vault. It counts native nodes and connector edges by reading up to 200 eligible Canvas files, at most 64 MiB in total. It reports how many boards contributed to those counts. These edges connect items within a Canvas. The report contains no file paths, filenames, note text, link destinations or process arguments. The script writes a local temporary report and sends nothing over the network.

**Optional link counts.** If the vault is large or the Backlinks pane was open, run this expression in the Obsidian developer console **before enabling** Miro Canvas. It reads the in-memory link index once. Share just the three numbers. They describe the index at the time of capture and can be incomplete while Obsidian is indexing.

```js
(() => {
  let pairs = 0, occurrences = 0;
  for (const targets of Object.values(app.metadataCache.resolvedLinks)) {
    for (const count of Object.values(targets)) {
      pairs++;
      occurrences += count;
    }
  }
  return { resolvedSourceTargetPairs: pairs, resolvedLinkOccurrences: occurrences,
    backlinksPanes: app.workspace.getLeavesOfType("backlink").length };
})()
```

If an error already appears in **Ctrl+Shift+I → Console**, the first error and its first few stack frames are enough. If the freeze repeats and Developer Tools still responds, open **Sources** before enabling the plugin, click **Pause script execution** during the freeze, then copy the top few function names and line numbers from **Call Stack**. Press **Resume** afterward. Remove private paths and note text before sharing. The saved flags show when changes reached disk. The stack can show where JavaScript was running when the freeze occurred.
