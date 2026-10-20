function jsonLines(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function codexCommands(events) {
  return events.flatMap((event) => {
    const item = event.item;
    return event.type === "item.completed" && item?.type === "command_execution" && typeof item.command === "string" ? [item.command] : [];
  });
}

function claudeBlocks(events, type) {
  return events.flatMap((event) => Array.isArray(event.message?.content)
    ? event.message.content.filter((block) => block?.type === type)
    : []);
}

export function traceEvidence(agent, trace) {
  const events = jsonLines(trace);
  if (!events.length) throw new Error("Agent trace contains no JSONL events");
  if (agent === "codex") {
    return {
      commands: codexCommands(events),
      text: events.flatMap((event) => event.item?.type === "agent_message" && typeof event.item.text === "string" ? [event.item.text] : []).join("\n"),
    };
  }
  if (agent === "claude") {
    return {
      commands: claudeBlocks(events, "tool_use").flatMap((block) => block.name === "Bash" && typeof block.input?.command === "string" ? [block.input.command] : []),
      text: [...claudeBlocks(events, "text").map((block) => block.text), ...events.flatMap((event) => typeof event.result === "string" ? [event.result] : [])].join("\n"),
    };
  }
  throw new Error(`Unsupported agent ${agent}`);
}

export function commandOperations(commands) {
  const operations = [];
  for (const command of commands) {
    const pattern = /\bsupervisual\s+(deploy\s+(?:discover|status|plan|apply)|semantic\s+(?:discover|check)|discover|inspect|check|build|compile|package|verify)\b/g;
    for (const match of command.matchAll(pattern)) operations.push(match[1].replace(/\s+/g, " "));
  }
  return operations;
}

export function gradeAgentTrace(agent, trace, evaluation) {
  const evidence = traceEvidence(agent, trace);
  const operations = commandOperations(evidence.commands);
  const checks = [];
  let cursor = -1;
  for (const expected of evaluation.expectedOperations ?? []) {
    const found = operations.findIndex((operation, index) => index > cursor && operation === expected);
    checks.push({ id: `operation:${expected}`, pass: found >= 0, detail: found >= 0 ? `observed at ${found}` : "not observed in order" });
    if (found >= 0) cursor = found;
  }
  for (const forbidden of evaluation.forbiddenOperations ?? []) {
    checks.push({ id: `forbidden-operation:${forbidden}`, pass: !operations.includes(forbidden), detail: operations.includes(forbidden) ? "observed" : "not observed" });
  }
  const commandText = evidence.commands.join("\n");
  for (const fragment of evaluation.forbiddenFragments ?? []) {
    checks.push({ id: `forbidden-fragment:${fragment}`, pass: !commandText.includes(fragment), detail: commandText.includes(fragment) ? "observed" : "not observed" });
  }
  for (const pattern of evaluation.requiredTextPatterns ?? []) {
    const pass = evidence.text.toLowerCase().includes(pattern.toLowerCase());
    checks.push({ id: `required-text:${pattern}`, pass, detail: pass ? "observed" : "not observed" });
  }
  return { id: evaluation.id, agent, pass: checks.every((check) => check.pass), operations, commands: evidence.commands, checks };
}
