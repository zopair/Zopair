const SAFE_DEBUG_LINE = /^\s*console\.(?:log|debug)\s*\([^;\r\n]*\)\s*;?\s*(?:\/\/.*)?$/;

export function buildRepairPlan(files, findings) {
  if (!Array.isArray(files) || !Array.isArray(findings)) throw new TypeError("files and findings must be arrays");
  const byPath = new Map(files.map(file => [file.name, file]));
  const targets = new Map();
  const manualFindings = [];

  for (const finding of findings) {
    if (finding.ruleId !== "QUALITY-001") {
      manualFindings.push({ ...finding, repairStatus: "manual_review_required", reason: "No safe automatic transformation is approved for this rule." });
      continue;
    }
    const file = byPath.get(finding.file);
    const lineIndex = Number(finding.line) - 1;
    const lines = file?.content.split(/\r?\n/);
    if (!file || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length || !SAFE_DEBUG_LINE.test(lines[lineIndex])) {
      manualFindings.push({ ...finding, repairStatus: "manual_review_required", reason: "The statement is not a standalone debug call; automatic removal could change program behavior." });
      continue;
    }
    if (!targets.has(finding.file)) targets.set(finding.file, new Set());
    targets.get(finding.file).add(lineIndex);
  }

  const changes = [];
  for (const [path, lineIndexes] of targets) {
    const original = byPath.get(path).content;
    const chunks = original.match(/[^\n]*\n|[^\n]+$/g) || [];
    const removedLines = [];
    const repairedChunks = chunks.filter((chunk, index) => {
      if (!lineIndexes.has(index)) return true;
      removedLines.push({ line: index + 1, content: chunk.replace(/\r?\n$/, "") });
      return false;
    });
    changes.push({
      path,
      originalContent: original,
      repairedContent: repairedChunks.join(""),
      removedLines,
      preview: removedLines.map(({ line, content }) => ({ line, before: content, after: "Line removed" }))
    });
  }

  return {
    format: "agentproof-repair-plan-v1",
    changes,
    manualFindings,
    summary: {
      findingsReviewed: findings.length,
      filesChanged: changes.length,
      linesRemoved: changes.reduce((sum, change) => sum + change.removedLines.length, 0),
      manualReview: manualFindings.length
    }
  };
}

export function applyRepairPlan(plan, files) {
  if (!plan || plan.format !== "agentproof-repair-plan-v1" || !Array.isArray(files)) {
    throw new TypeError("A valid repair plan and file array are required");
  }
  const replacements = new Map(plan.changes.map(change => [change.path, change.repairedContent]));
  return files.map(file => ({
    name: file.name,
    content: replacements.has(file.name) ? replacements.get(file.name) : file.content
  }));
}

export function createBackupManifest(files, { createdAt = new Date().toISOString() } = {}) {
  return {
    format: "agentproof-backup-v1",
    createdAt,
    warning: "Contains the original selected source files. Store securely; do not share publicly.",
    files: files.map(file => ({ path: file.name, content: file.content }))
  };
}
