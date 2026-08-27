let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    process.exit(0);
  }
  const cmd = (data.tool_input && data.tool_input.command) || '';
  if (/git\s+commit/i.test(cmd)) {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'A git commit was just made. Standing instruction: update the two commit-ledger documents with this new commit before moving on - (1) Documents/Mansakha_Commit_Ledger.docx and (2) the published "Mansakha Commit Ledger" HTML artifact. Add the commit hash, its branch, and a plain-language description of what changed, grouped under the right branch section like the existing entries, then regenerate the docx and republish the artifact.',
      },
    };
    process.stdout.write(JSON.stringify(output));
  }
});
