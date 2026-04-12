import React, { useState, useCallback } from "react";
import { runEngineChain } from "../ai/orchestrator/runEngineChain";
import { InvokeInput } from "../ai/types/invoke";
import {
  generateClientReport,
  ClientReport,
  generateOperatorBriefing,
  OperatorBriefing,
  OperatorIssue,
} from "../ai/orchestrator/generateClientReport";
import { generateClientReportPdf } from "../utils/clientReportPdf";
import { extractContextFromQuestion } from "../features/ask-ftf/extractContextFromQuestion";
import { saveReport, getAllReports } from "../services/askFtfReportStore";
import { getSimilarReports, SimilarReportMatch } from "../utils/presetSimilarity";
import {
  explainCategory,
  explainRequiresNumeric,
  explainRequiresCompliance,
  explainChallenger,
} from "../features/ask-ftf/routingExplanation";

/* ── Styles ── */

const pageStyle: React.CSSProperties = {
  padding: "32px 24px",
  maxWidth: 860,
  margin: "0 auto",
  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
};

const introStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "15px",
  marginTop: 4,
  marginBottom: 28,
  lineHeight: 1.5,
};

const cardStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 20,
  border: "1px solid #e4e4e4",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const headingColor = "#2c3e2c";

const h1Style: React.CSSProperties = {
  color: headingColor,
  fontWeight: 700,
  marginBottom: 2,
};

const h2Style: React.CSSProperties = {
  color: headingColor,
  fontWeight: 600,
  fontSize: "18px",
  marginTop: 0,
  marginBottom: 12,
};

const h3Style: React.CSSProperties = {
  color: "#4a5a4a",
  fontWeight: 600,
  fontSize: "15px",
  marginBottom: 6,
  marginTop: 16,
};

const mutedStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "13px",
  marginTop: 2,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "15px",
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  fontSize: "16px",
  resize: "vertical",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 28px",
  fontSize: "15px",
  fontWeight: 600,
  background: "#2e7d32",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "13px",
  fontWeight: 500,
  background: "#e8f5e9",
  color: "#2e7d32",
  border: "1px solid #c8e6c9",
  borderRadius: 8,
  cursor: "pointer",
};

const pillButton = (active: boolean): React.CSSProperties => ({
  padding: "8px 22px",
  fontSize: "14px",
  fontWeight: active ? 700 : 500,
  background: active ? "#2e7d32" : "#f0f0f0",
  color: active ? "#fff" : "#555",
  border: active ? "1px solid #2e7d32" : "1px solid #d0d0d0",
  borderRadius: 20,
  cursor: "pointer",
  transition: "all 0.15s ease",
});

/* ── Helpers ── */

function renderOperatorIssue(issue: OperatorIssue) {
  return (
    <div style={{
      padding: "16px",
      background: "#f8f9fa",
      border: "1px solid #e9ecef",
      borderRadius: "12px",
      marginBottom: "12px"
    }}>
      <div style={{
        fontWeight: 700,
        fontSize: "15px",
        color: "#2c3e2c",
        marginBottom: "8px"
      }}>
        {issue.title}
      </div>
      <div style={{ marginBottom: "6px" }}>
        <span style={{ fontWeight: 600, color: "#666", fontSize: "13px" }}>WHY: </span>
        <span style={{ fontSize: "14px", lineHeight: 1.4 }}>{issue.why}</span>
      </div>
      <div style={{ marginBottom: "6px" }}>
        <span style={{ fontWeight: 600, color: "#666", fontSize: "13px" }}>WHAT'S MISSING: </span>
        <span style={{ fontSize: "14px", lineHeight: 1.4 }}>{issue.whatsMissing}</span>
      </div>
      <div>
        <span style={{ fontWeight: 600, color: "#2e7d32", fontSize: "13px" }}>ACTION: </span>
        <span style={{ fontSize: "14px", lineHeight: 1.4, fontWeight: 500 }}>{issue.actionToResolve}</span>
      </div>
    </div>
  );
}

function renderRequirementLine(label: string, value: string) {
  const isPending = value.toLowerCase().includes("review label") || value.toLowerCase().includes("pending");
  return (
    <div style={{
      display: "flex",
      padding: "8px 12px",
      background: isPending ? "#fffbeb" : "#f0f9ff",
      border: `1px solid ${isPending ? "#fcd34d" : "#bae6fd"}`,
      borderRadius: "8px",
      marginBottom: "6px"
    }}>
      <div style={{
        minWidth: "140px",
        fontWeight: 600,
        fontSize: "13px",
        color: "#374151",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }}>
        {label}:
      </div>
      <div style={{
        fontSize: "14px",
        lineHeight: 1.4,
        color: isPending ? "#92400e" : "#1e293b",
        fontWeight: isPending ? 400 : 500
      }}>
        {value}
      </div>
    </div>
  );
}

function renderStringList(items?: string[]) {
  if (!items || items.length === 0) return <div style={{ color: "#999" }}>None</div>;
  return (
    <ul style={{ margin: "6px 0", paddingLeft: 22 }}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} style={{ marginBottom: 5, lineHeight: 1.5 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function renderObjectList(obj?: Record<string, any>) {
  if (!obj) return <div style={{ color: "#999" }}>None</div>;
  return (
    <div>
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <strong>{key}:</strong>{" "}
          {Array.isArray(value) ? (
            <ul style={{ margin: "4px 0", paddingLeft: 22 }}>
              {value.map((item, index) => (
                <li key={`${key}-${index}`}>{String(item)}</li>
              ))}
            </ul>
          ) : value && typeof value === "object" ? (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(value, null, 2)}
            </pre>
          ) : (
            <span>{String(value)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function renderExtractedSourceFields(sourceFields?: Record<string, any>, extractionMeta?: any) {
  if (!sourceFields) return <div style={{ color: "#999" }}>None</div>;

  const extractedFields = extractionMeta?.extractedFields || [];
  const isPartialExtraction = extractionMeta?.extractionStatus === "partial";

  return (
    <div>
      {Object.entries(sourceFields).map(([key, value]) => {
        // Skip metadata field and keyDoNotStatements (shown in Critical Label Extract)
        if (key === 'extractionMeta' || key === 'keyDoNotStatements') return null;

        const isExtracted = extractedFields.includes(key);
        const sourceNote = isExtracted ?
          " (extracted from label document)" :
          " (fallback data)";
        const confidence = isPartialExtraction && isExtracted ?
          " [pending verification]" : "";

        return (
          <div key={key} style={{ marginBottom: 8 }}>
            <strong>{key}:</strong>{" "}
            {Array.isArray(value) ? (
              <>
                <span style={{ color: '#666', fontSize: '0.9em' }}>
                  {value.length} item(s){sourceNote}{confidence}
                </span>
                <ul style={{ margin: "4px 0", paddingLeft: 22 }}>
                  {value.map((item, index) => (
                    <li key={`${key}-${index}`}>{String(item)}</li>
                  ))}
                </ul>
              </>
            ) : value ? (
              <span>
                {String(value)}
                <span style={{ color: '#666', fontSize: '0.9em' }}>
                  {sourceNote}{confidence}
                </span>
              </span>
            ) : (
              <span style={{ color: '#999' }}>
                Pending verification
                <span style={{ color: '#666', fontSize: '0.9em' }}>
                  {sourceNote}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Types ── */

type ViewMode = "briefing" | "operator" | "client";

const reportSections: { key: keyof ClientReport; label: string }[] = [
  { key: "jobOverview", label: "Job Overview" },
  { key: "quickStatusSummary", label: "Quick Status Summary" },
  { key: "applicationSummary", label: "Application Summary" },
  { key: "labelRequirements", label: "Label Requirements" },
  { key: "siteRisks", label: "Site Risks" },
  { key: "riskManagementPlan", label: "Risk Management Plan" },
  { key: "applicationSettings", label: "Application Settings" },
  { key: "complianceNotes", label: "Compliance Notes" },
  { key: "finalRecommendation", label: "Final Recommendation" },
];

/* ── Critical flags extraction ── */

interface CriticalFlag {
  text: string;
  level: "blocker" | "caution";
  source: string;
}

interface CriticalFlags {
  blockers: CriticalFlag[];
  cautions: CriticalFlag[];
}

const BLOCKER_PATTERNS = [
  /conflict/i,
  /must resolve/i,
  /must be resolved/i,
  /not finalised/i,
  /not finalized/i,
  /cannot proceed/i,
  /do not proceed/i,
  /aircraft.*must be specified/i,
  /water rate.*not/i,
  /label minimum exceeds/i,
  /buffer.*not verified.*waterway/i,
];

const CAUTION_PATTERNS = [
  /waterway/i,
  /susceptible crop/i,
  /uav|drone permission/i,
  /boundary.*protection/i,
  /boundary.*verif/i,
  /provisional/i,
  /pending verification/i,
  /manual.*review/i,
  /label.*review.*required/i,
  /elevated risk/i,
  /high risk/i,
];

function extractCriticalFlags(result: any, clientReport: ClientReport | null): CriticalFlags {
  const blockers: CriticalFlag[] = [];
  const cautions: CriticalFlag[] = [];
  const seen = new Set<string>();

  const addUnique = (list: CriticalFlag[], flag: CriticalFlag) => {
    const key = flag.text.toLowerCase().replace(/^[^\w]+/, "").trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      list.push(flag);
    }
  };

  // Gather candidate strings with their source labels
  const candidates: { text: string; source: string }[] = [];

  if (result?.challenger?.flags) {
    for (const f of result.challenger.flags) candidates.push({ text: f, source: "Challenger Review" });
  }
  if (result?.v3?.manualReview) {
    for (const m of result.v3.manualReview) candidates.push({ text: m, source: "Execution Bands" });
  }
  if (result?.v4?.manualReview) {
    for (const m of result.v4.manualReview) candidates.push({ text: m, source: "Numeric Presets" });
  }
  if (result?.v1?.notFound) {
    for (const n of result.v1.notFound) candidates.push({ text: n, source: "Chemical Intelligence" });
  }
  if (result?.v2?.manualReview) {
    for (const m of result.v2.manualReview) candidates.push({ text: m, source: "Spray Planning" });
  }

  // Client report compliance notes and final recommendation
  if (clientReport) {
    for (const c of clientReport.complianceNotes) candidates.push({ text: c, source: "Compliance Notes" });
    for (const r of clientReport.finalRecommendation) candidates.push({ text: r, source: "Final Recommendation" });
  }

  for (const candidate of candidates) {
    // Strip leading emoji/symbols for cleaner display
    const cleaned = candidate.text.replace(/^[\u2705\u26A0\uFE0F\u26D4\s]+/, "").trim();
    if (!cleaned) continue;
    // Skip section separator lines
    if (cleaned.startsWith("---")) continue;

    // Normalise UAV/drone permission variants to a single canonical line
    const isUav = /uav|drone permission/i.test(cleaned);
    const displayText = isUav
      ? "UAV/drone permissions must be confirmed before spraying."
      : cleaned;

    const isBlocker = BLOCKER_PATTERNS.some((p) => p.test(candidate.text));
    const isCaution = CAUTION_PATTERNS.some((p) => p.test(candidate.text));

    if (isBlocker) {
      addUnique(blockers, { text: displayText, level: "blocker", source: candidate.source });
    } else if (isCaution) {
      addUnique(cautions, { text: displayText, level: "caution", source: candidate.source });
    }
  }

  return { blockers, cautions };
}

/* ── Component ── */

const AskFTF: React.FC = () => {
  const [question, setQuestion] = useState("");
  const [chemical, setChemical] = useState("");
  const [aircraft, setAircraft] = useState("");
  const [target, setTarget] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [terrain, setTerrain] = useState("");
  const [boundaries, setBoundaries] = useState("");
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [clientReport, setClientReport] = useState<ClientReport | null>(null);
  const [operatorBriefing, setOperatorBriefing] = useState<OperatorBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("briefing");
  const [saveMessage, setSaveMessage] = useState("");
  const [similarJobs, setSimilarJobs] = useState<SimilarReportMatch[]>([]);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [expandedConstraints, setExpandedConstraints] = useState(false);

  const applyExtraction = useCallback(
    (q: string) => {
      const extracted = extractContextFromQuestion(q);
      if (extracted.chemical && !chemical) setChemical(extracted.chemical);
      if (extracted.aircraft && !aircraft) setAircraft(extracted.aircraft);
      if (extracted.target && !target) setTarget(extracted.target);
      if (extracted.state && !stateValue) setStateValue(extracted.state);
      if (extracted.terrain && !terrain) setTerrain(extracted.terrain);
      if (extracted.boundaries && !boundaries)
        setBoundaries(extracted.boundaries);
    },
    [chemical, aircraft, target, stateValue, terrain, boundaries]
  );

  const handleAutoFill = () => {
    const extracted = extractContextFromQuestion(question);
    if (extracted.chemical) setChemical(extracted.chemical);
    if (extracted.aircraft) setAircraft(extracted.aircraft);
    if (extracted.target) setTarget(extracted.target);
    if (extracted.state) setStateValue(extracted.state);
    if (extracted.terrain) setTerrain(extracted.terrain);
    if (extracted.boundaries) setBoundaries(extracted.boundaries);
  };

  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setQuestion(value);
    applyExtraction(value);
  };

  const handleSaveReport = () => {
    if (!clientReport) return;
    const timestamp = Date.now();
    const key = `ftf-report-${timestamp}`;
    localStorage.setItem(key, JSON.stringify(clientReport));

    const indexRaw = localStorage.getItem("ftf-report-index");
    const index: any[] = indexRaw ? JSON.parse(indexRaw) : [];
    index.push({
      key,
      product: chemical || "Unknown",
      aircraft: aircraft || "Unknown",
      target: target || "Unknown",
      createdAt: new Date(timestamp).toISOString(),
    });
    localStorage.setItem("ftf-report-index", JSON.stringify(index));

    setSaveMessage("Report saved locally.");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleRun = async () => {
    setLoading(true);
    setSaveMessage("");
    try {
      const input: InvokeInput = {
        question,
        chemical: chemical || undefined,
        aircraft: aircraft || undefined,
        target: target || undefined,
        state: stateValue || undefined,
        terrain: terrain || undefined,
        boundaries: boundaries || undefined,
      };

      const output = await runEngineChain(input);
      setResult(output);

      const report = generateClientReport(input, output);
      setClientReport(report);

      const briefing = generateOperatorBriefing(input, output);
      setOperatorBriefing(briefing);

      // Load similar past jobs
      const allReports = getAllReports();
      const matches = getSimilarReports(input, allReports, 3);
      setSimilarJobs(matches);
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Unknown error",
      });
      setClientReport(null);
      setOperatorBriefing(null);
      setSimilarJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUseAsStartingPoint = (match: SimilarReportMatch) => {
    const hasExisting = !!(chemical || aircraft || target || stateValue || terrain || boundaries);

    if (hasExisting) {
      const confirmed = window.confirm(
        "Replace current Ask FTF inputs with this prior job context?"
      );
      if (!confirmed) return;
    }

    const ctx = match.context;
    if (ctx.chemical) setChemical(ctx.chemical);
    if (ctx.aircraft) setAircraft(ctx.aircraft);
    if (ctx.target) setTarget(ctx.target);
    if (ctx.state) setStateValue(ctx.state);
    if (ctx.terrain) setTerrain(ctx.terrain);
    if (ctx.boundaries) setBoundaries(ctx.boundaries);
    if (!question && match.question) setQuestion(match.question);

    setSaveMessage("Prior job context loaded. Review inputs and run when ready.");
    setTimeout(() => setSaveMessage(""), 4000);

    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={pageStyle}>
      <h1 style={h1Style}>Ask Fly The Farm</h1>
      <p style={introStyle}>
        Ask Fly The Farm a spray, compliance, or execution question. You can
        type naturally and review the auto-filled job details below.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <textarea
          placeholder="Ask your Fly The Farm question..."
          value={question}
          onChange={handleQuestionChange}
          rows={5}
          style={textareaStyle}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            style={secondaryButtonStyle}
            onClick={handleAutoFill}
            type="button"
          >
            Auto-fill from question
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <input
            placeholder="Chemical"
            value={chemical}
            onChange={(e) => setChemical(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Aircraft"
            value={aircraft}
            onChange={(e) => setAircraft(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="State"
            value={stateValue}
            onChange={(e) => setStateValue(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Terrain"
            value={terrain}
            onChange={(e) => setTerrain(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Boundaries"
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Job ID (optional — link report to job)"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <button
            onClick={handleRun}
            disabled={loading || !question.trim()}
            style={{
              ...primaryButtonStyle,
              opacity: loading || !question.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Running..." : "Run Fly The Farm"}
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      <div style={{ marginTop: 32 }}>
        {result && !result.error && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <button
              style={pillButton(viewMode === "briefing")}
              onClick={() => setViewMode("briefing")}
            >
              Operator Briefing
            </button>
            <button
              style={pillButton(viewMode === "operator")}
              onClick={() => setViewMode("operator")}
            >
              Technical View
            </button>
            <button
              style={pillButton(viewMode === "client")}
              onClick={() => setViewMode("client")}
            >
              Legacy Report
            </button>
          </div>
        )}

        {!result && (
          <div style={{ color: "#999", fontSize: 15 }}>No result yet</div>
        )}

        {result?.error && (
          <div style={{ ...cardStyle, borderColor: "#e57373" }}>
            <h2 style={{ ...h2Style, color: "#c62828" }}>Error</h2>
            <div>{result.error}</div>
          </div>
        )}

        {/* === CRITICAL FLAGS === */}
        {result && !result.error && (() => {
          const flags = extractCriticalFlags(result, clientReport);
          if (flags.blockers.length === 0 && flags.cautions.length === 0) return null;
          return (
            <div style={{
              ...cardStyle,
              background: flags.blockers.length > 0 ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${flags.blockers.length > 0 ? "#fca5a5" : "#fcd34d"}`,
            }}>
              <h2 style={{
                ...h2Style,
                color: flags.blockers.length > 0 ? "#991b1b" : "#92400e",
              }}>
                Critical Flags
              </h2>

              {flags.blockers.length > 0 && (
                <div style={{ marginBottom: flags.cautions.length > 0 ? 16 : 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#991b1b",
                    marginBottom: 8,
                  }}>
                    Blockers
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {flags.blockers.map((flag, i) => (
                      <div key={i} style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "#fee2e2",
                        border: "1px solid #fca5a5",
                      }}>
                        <div style={{ fontSize: 14, lineHeight: 1.5, color: "#7f1d1d" }}>
                          {flag.text}
                        </div>
                        <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 3 }}>
                          Source: {flag.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {flags.cautions.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: 8,
                  }}>
                    Cautions
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {flags.cautions.map((flag, i) => (
                      <div key={i} style={{
                        padding: "7px 12px",
                        borderRadius: 10,
                        background: "#fef3c7",
                        border: "1px solid #fcd34d",
                      }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: "#78350f", fontWeight: 500 }}>
                          {flag.text}
                        </div>
                        <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>
                          Source: {flag.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* === OPERATOR BRIEFING VIEW === */}
        {result && !result.error && viewMode === "briefing" && operatorBriefing && (
          <>
            {/* Product Name Header */}
            <div style={{
              ...cardStyle,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              marginTop: 16
            }}>
              <div style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#1e293b",
                textAlign: "center"
              }}>
                {operatorBriefing.cleanProductName || chemical || "Unknown Product"}
              </div>
            </div>

            {/* Mission Status */}
            <div style={{
              ...cardStyle,
              background: operatorBriefing.missionStatus.status === "GO" ? "#f0f9ff" :
                          operatorBriefing.missionStatus.status === "CONDITIONAL" ? "#fffbeb" : "#fef2f2",
              border: `2px solid ${operatorBriefing.missionStatus.status === "GO" ? "#3b82f6" :
                                  operatorBriefing.missionStatus.status === "CONDITIONAL" ? "#f59e0b" : "#ef4444"}`
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "12px"
              }}>
                <div style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: operatorBriefing.missionStatus.status === "GO" ? "#1d4ed8" :
                         operatorBriefing.missionStatus.status === "CONDITIONAL" ? "#d97706" : "#dc2626",
                  marginRight: "12px"
                }}>
                  MISSION STATUS: {operatorBriefing.missionStatus.status}
                </div>
              </div>
              <div style={{
                fontSize: "16px",
                lineHeight: 1.5,
                color: operatorBriefing.missionStatus.status === "GO" ? "#1e40af" :
                       operatorBriefing.missionStatus.status === "CONDITIONAL" ? "#b45309" : "#b91c1c",
                fontWeight: 500
              }}>
                {operatorBriefing.missionStatus.reason}
              </div>
            </div>

            {/* Critical Blockers */}
            {operatorBriefing.criticalBlockers.length > 0 && (
              <div style={{
                ...cardStyle,
                background: "#fef2f2",
                border: "2px solid #ef4444"
              }}>
                <h2 style={{
                  ...h2Style,
                  color: "#dc2626",
                  fontSize: "20px",
                  marginBottom: "16px"
                }}>
                  Critical Blockers
                </h2>
                {operatorBriefing.criticalBlockers.map((blocker, i) => (
                  <div key={i}>
                    {renderOperatorIssue(blocker)}
                  </div>
                ))}
              </div>
            )}

            {/* Key Cautions */}
            {operatorBriefing.keyCautions.length > 0 && (
              <div style={{
                ...cardStyle,
                background: "#fffbeb",
                border: "2px solid #f59e0b"
              }}>
                <h2 style={{
                  ...h2Style,
                  color: "#d97706",
                  fontSize: "20px",
                  marginBottom: "16px"
                }}>
                  Key Cautions
                </h2>
                {operatorBriefing.keyCautions.map((caution, i) => (
                  <div key={i}>
                    {renderOperatorIssue(caution)}
                  </div>
                ))}
              </div>
            )}

            {/* Operator Requirements Summary */}
            <div style={cardStyle}>
              <h2 style={{
                ...h2Style,
                fontSize: "20px",
                marginBottom: "16px"
              }}>
                Operator Requirements Summary
              </h2>
              {renderRequirementLine("Water Rate", operatorBriefing.operatorRequirements.waterRate)}
              {renderRequirementLine("Droplet Class", operatorBriefing.operatorRequirements.dropletClass)}
              {renderRequirementLine("Wind Limits", operatorBriefing.operatorRequirements.windLimits)}
              {renderRequirementLine("Temperature", operatorBriefing.operatorRequirements.temperatureLimits)}
              {renderRequirementLine("Withholding", operatorBriefing.operatorRequirements.withholding)}
              {renderRequirementLine("Crop Sensitivity", operatorBriefing.operatorRequirements.cropSensitivity)}
              {renderRequirementLine("Waterway Protection", operatorBriefing.operatorRequirements.waterwayProtection)}
              {renderRequirementLine("Buffer Status", operatorBriefing.operatorRequirements.bufferStatus)}
            </div>

            {/* Legal / Compliance Actions Required */}
            <div style={{
              ...cardStyle,
              background: "#f0fdf4",
              border: "1px solid #22c55e"
            }}>
              <h2 style={{
                ...h2Style,
                color: "#166534",
                fontSize: "20px",
                marginBottom: "16px"
              }}>
                Legal / Compliance Actions Required
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {operatorBriefing.legalComplianceActions.map((action, i) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    background: "#dcfce7",
                    border: "1px solid #86efac",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#15803d"
                  }}>
                    ✓ {action}
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Operational Constraints */}
            <div style={cardStyle}>
              <h2 style={{
                ...h2Style,
                fontSize: "20px",
                marginBottom: "16px"
              }}>
                Priority Operational Constraints
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {operatorBriefing.priorityConstraints.map((constraint, i) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    borderRadius: "8px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    color: "#92400e"
                  }}>
                    {constraint}
                  </div>
                ))}
              </div>
            </div>

            {/* Full Label Constraints (Expandable) */}
            {operatorBriefing.fullLabelConstraints.length > 0 && (
              <div style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    marginBottom: expandedConstraints ? "16px" : "0"
                  }}
                  onClick={() => setExpandedConstraints(!expandedConstraints)}
                >
                  <h2 style={{
                    ...h2Style,
                    fontSize: "18px",
                    margin: 0,
                    color: "#6b7280"
                  }}>
                    Full Label Constraints (Detailed)
                  </h2>
                  <span style={{ fontSize: "20px", color: "#9ca3af" }}>
                    {expandedConstraints ? "▲" : "▼"}
                  </span>
                </div>

                {expandedConstraints && (
                  <div style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "12px"
                  }}>
                    <div style={{ color: "#6b7280", fontSize: "13px", marginBottom: "12px" }}>
                      Complete list of extracted label constraints and warnings:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {operatorBriefing.fullLabelConstraints.map((constraint, i) => (
                        <div key={i} style={{
                          padding: "8px 12px",
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          fontSize: "13px",
                          lineHeight: 1.4,
                          color: "#374151"
                        }}>
                          {constraint}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleSaveReport}
                style={primaryButtonStyle}
              >
                Save Report
              </button>
              <button
                onClick={() => {
                  if (!clientReport || !jobId.trim()) return;
                  saveReport({
                    jobId: jobId.trim(),
                    question,
                    context: {
                      chemical: chemical || undefined,
                      aircraft: aircraft || undefined,
                      target: target || undefined,
                      state: stateValue || undefined,
                      terrain: terrain || undefined,
                      boundaries: boundaries || undefined,
                    },
                    operatorResult: result,
                    clientReport,
                    operatorBriefing: operatorBriefing || undefined, // Include operator briefing
                    product: chemical || "Unknown",
                    aircraft: aircraft || "Unknown",
                    target: target || "Unknown",
                    finalRecommendation: clientReport.finalRecommendation,
                  });
                  setSaveMessage("Report saved to job.");
                  setTimeout(() => setSaveMessage(""), 3000);
                }}
                disabled={!clientReport || !jobId.trim()}
                style={{
                  ...primaryButtonStyle,
                  background: !clientReport || !jobId.trim() ? "#ccc" : "#1565c0",
                  cursor: !clientReport || !jobId.trim() ? "default" : "pointer",
                }}
              >
                Save to Job
              </button>
              <button
                onClick={async () => {
                  if (!clientReport) return;
                  const input: InvokeInput = {
                    question,
                    chemical: chemical || undefined,
                    aircraft: aircraft || undefined,
                    target: target || undefined,
                    state: stateValue || undefined,
                    terrain: terrain || undefined,
                    boundaries: boundaries || undefined,
                  };
                  await generateClientReportPdf(clientReport, input, operatorBriefing || undefined);
                }}
                style={secondaryButtonStyle}
              >
                Export PDF
              </button>
              {saveMessage && (
                <span style={{ color: "#2e7d32", fontSize: 14, fontWeight: 500 }}>
                  {saveMessage}
                </span>
              )}
            </div>
          </>
        )}

        {/* === CLIENT REPORT VIEW === */}
        {result && !result.error && viewMode === "client" && clientReport && (
          <>
            {reportSections.map(({ key, label }) => (
              <div key={key} style={cardStyle}>
                <h2 style={h2Style}>{label}</h2>
                {renderStringList(clientReport[key])}
              </div>
            ))}
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={handleSaveReport}
                style={primaryButtonStyle}
              >
                Save Report
              </button>
              <button
                onClick={() => {
                  if (!clientReport || !jobId.trim()) return;
                  saveReport({
                    jobId: jobId.trim(),
                    question,
                    context: {
                      chemical: chemical || undefined,
                      aircraft: aircraft || undefined,
                      target: target || undefined,
                      state: stateValue || undefined,
                      terrain: terrain || undefined,
                      boundaries: boundaries || undefined,
                    },
                    operatorResult: result,
                    clientReport,
                    operatorBriefing: operatorBriefing || undefined, // Include operator briefing
                    product: chemical || "Unknown",
                    aircraft: aircraft || "Unknown",
                    target: target || "Unknown",
                    finalRecommendation: clientReport.finalRecommendation,
                  });
                  setSaveMessage("Report saved to job.");
                  setTimeout(() => setSaveMessage(""), 3000);
                }}
                disabled={!clientReport || !jobId.trim()}
                style={{
                  ...primaryButtonStyle,
                  background: !clientReport || !jobId.trim() ? "#ccc" : "#1565c0",
                  cursor: !clientReport || !jobId.trim() ? "default" : "pointer",
                }}
              >
                Save to Job
              </button>
              <button
                onClick={async () => {
                  if (!clientReport) return;
                  const input: InvokeInput = {
                    question,
                    chemical: chemical || undefined,
                    aircraft: aircraft || undefined,
                    target: target || undefined,
                    state: stateValue || undefined,
                    terrain: terrain || undefined,
                    boundaries: boundaries || undefined,
                  };
                  await generateClientReportPdf(clientReport, input, operatorBriefing || undefined);
                }}
                style={secondaryButtonStyle}
              >
                Export PDF
              </button>
              {saveMessage && (
                <span style={{ color: "#2e7d32", fontSize: 14, fontWeight: 500 }}>
                  {saveMessage}
                </span>
              )}
            </div>
          </>
        )}

        {/* === PAST SIMILAR JOBS === */}
        {result && !result.error && similarJobs.length > 0 && (
          <div style={{
            ...cardStyle,
            background: "#f3e5f5",
            border: "1px solid #ce93d8",
          }}>
            <h2 style={{ ...h2Style, color: "#6a1b9a" }}>Past Similar Jobs</h2>
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px 0" }}>
              Based on product, aircraft, target, terrain, and boundary overlap with saved reports.
            </p>
            {similarJobs.map((match) => {
              const isExpanded = expandedMatchId === match.reportId;
              const pct = Math.round(match.score * 100);
              return (
                <div key={match.reportId} style={{
                  marginBottom: 10,
                  padding: 14,
                  background: "#fff",
                  border: "1px solid #e0c0e8",
                  borderRadius: 10,
                }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedMatchId(isExpanded ? null : match.reportId)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#333" }}>
                        {match.product}
                      </div>
                      <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                        {new Date(match.createdAt).toLocaleDateString("en-AU", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                        {" \u2022 "}Aircraft: {match.aircraft}
                        {" \u2022 "}Target: {match.target}
                      </div>
                    </div>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 700,
                        background: pct >= 70 ? "#e8f5e9" : pct >= 40 ? "#fff3e0" : "#f3e5f5",
                        color: pct >= 70 ? "#2e7d32" : pct >= 40 ? "#e65100" : "#6a1b9a",
                        border: `1px solid ${pct >= 70 ? "#c8e6c9" : pct >= 40 ? "#ffe0b2" : "#ce93d8"}`,
                      }}>
                        {pct}% match
                      </span>
                      <span style={{ fontSize: 18, color: "#999" }}>
                        {isExpanded ? "\u25B2" : "\u25BC"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid #eee",
                    }}>
                      {match.matchReasons.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <h3 style={{ ...h3Style, color: "#6a1b9a", marginTop: 0 }}>
                            Match Reasons
                          </h3>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {match.matchReasons.map((reason, i) => (
                              <span key={i} style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "#f3e5f5",
                                color: "#6a1b9a",
                                border: "1px solid #ce93d8",
                              }}>
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {match.finalRecommendation.length > 0 && (
                        <div>
                          <h3 style={{ ...h3Style, color: "#1565c0", marginTop: 0 }}>
                            Final Recommendation
                          </h3>
                          <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                            {match.finalRecommendation.map((item, i) => (
                              <li key={i} style={{ marginBottom: 4, lineHeight: 1.5, fontSize: 14 }}>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {match.applicationSettings.length > 0 && (
                        <div>
                          <h3 style={{ ...h3Style, color: "#2e7d32" }}>
                            Application Settings
                          </h3>
                          <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                            {match.applicationSettings.map((item, i) => (
                              <li key={i} style={{ marginBottom: 4, lineHeight: 1.5, fontSize: 14 }}>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseAsStartingPoint(match);
                          }}
                          style={{
                            padding: "7px 18px",
                            fontSize: 13,
                            fontWeight: 600,
                            background: "#6a1b9a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                          }}
                        >
                          Use as Starting Point
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* === OPERATOR VIEW === */}
        {result && !result.error && viewMode === "operator" && (
          <>
            {result.routing && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Routing Summary</h2>
                <div style={{ marginBottom: 10 }}>
                  <strong>Category:</strong> {result.routing.category}
                  <div style={mutedStyle}>
                    {explainCategory(result.routing.category)}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Requires Numeric:</strong>{" "}
                  {result.routing.requiresNumeric ? "Yes" : "No"}
                  <div style={mutedStyle}>
                    {explainRequiresNumeric(result.routing.requiresNumeric)}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Requires Compliance:</strong>{" "}
                  {result.routing.requiresCompliance ? "Yes" : "No"}
                  <div style={mutedStyle}>
                    {explainRequiresCompliance(
                      result.routing.requiresCompliance
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Challenger:</strong>{" "}
                  {result.routing.challenger ? "Yes" : "No"}
                  <div style={mutedStyle}>
                    {explainChallenger(result.routing.challenger)}
                  </div>
                </div>
              </div>
            )}

            {result.v1 && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Chemical Intelligence (v1)</h2>
                <div>
                  <strong>Product:</strong> {operatorBriefing?.cleanProductName || result.v1.product || "Unknown"}
                </div>

                <h3 style={h3Style}>Files Used</h3>
                {renderStringList(result.v1.filesUsed)}

                {result.v1.criticalLabelExtract && result.v1.criticalLabelExtract.length > 0 && (
                  <div style={{
                    marginTop: 16,
                    padding: 16,
                    background: "#f9fbe7",
                    border: "1px solid #e6ee9c",
                    borderRadius: 10,
                  }}>
                    <h3 style={{ ...h3Style, marginTop: 0, color: "#33691e", fontSize: "15px" }}>
                      Critical Label Extract
                    </h3>
                    <ul style={{ margin: "6px 0", paddingLeft: 22 }}>
                      {result.v1.criticalLabelExtract.map((item: string, i: number) => {
                        if (item.startsWith("---") && item.endsWith("---")) {
                          const label = item.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
                          return (
                            <li key={i} style={{
                              listStyle: "none",
                              marginLeft: -22,
                              marginTop: 10,
                              marginBottom: 4,
                              fontWeight: 600,
                              color: "#33691e",
                              fontSize: "13px",
                            }}>
                              {label}
                            </li>
                          );
                        }
                        const isPending = item.includes("Pending verification");
                        return (
                          <li key={i} style={{
                            marginBottom: 4,
                            lineHeight: 1.5,
                            fontSize: "14px",
                            color: isPending ? "#999" : "#333",
                            fontStyle: isPending ? "italic" : "normal",
                          }}>
                            {item}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* REFINED: Cleanly separated display sections */}
                {result.v1.extractedSourceFields && (
                  <>
                    <h3 style={h3Style}>Extracted Source Fields</h3>
                    <div style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 6, marginBottom: 16 }}>
                      {renderExtractedSourceFields(result.v1.extractedSourceFields, result.v1.sourceFields?.extractionMeta)}
                    </div>
                  </>
                )}

                {result.v1.fallbackNotes && result.v1.fallbackNotes.length > 0 && (
                  <>
                    <h3 style={h3Style}>Fallback / Supplementary Notes</h3>
                    <div style={{ backgroundColor: '#fff3cd', padding: 12, borderRadius: 6, marginBottom: 16 }}>
                      {renderStringList(result.v1.fallbackNotes)}
                    </div>
                  </>
                )}

                {result.v1.boundaryContext && result.v1.boundaryContext.length > 0 && (
                  <>
                    <h3 style={h3Style}>Boundary Context</h3>
                    <div style={{ backgroundColor: '#e7f3ff', padding: 12, borderRadius: 6, marginBottom: 16 }}>
                      {renderStringList(result.v1.boundaryContext)}
                    </div>
                  </>
                )}

                {result.v1.labelWarnings && result.v1.labelWarnings.length > 0 && (
                  <>
                    <h3 style={h3Style}>Label Warnings</h3>
                    <div style={{ backgroundColor: '#ffe6e6', padding: 12, borderRadius: 6, marginBottom: 16 }}>
                      {renderStringList(result.v1.labelWarnings)}
                    </div>
                  </>
                )}

                {/* Legacy fallback for older structure */}
                {!result.v1.extractedSourceFields && (
                  <>
                    <h3 style={h3Style}>Extracted Fields</h3>
                    {renderObjectList(result.v1.extractedFields)}
                  </>
                )}

                <h3 style={h3Style}>Not Found</h3>
                {renderStringList(result.v1.notFound)}
              </div>
            )}

            {result.v2 && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Spray Planning (v2)</h2>

                <h3 style={h3Style}>Risk Assessment</h3>
                {renderStringList(result.v2.riskAssessment)}

                <h3 style={h3Style}>Planning Notes</h3>
                {renderStringList(result.v2.planningNotes)}

                <h3 style={h3Style}>Manual Review</h3>
                {renderStringList(result.v2.manualReview)}
              </div>
            )}

            {result.v3 && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Execution Bands (v3)</h2>
                <div>
                  <strong>Execution Readiness:</strong>{" "}
                  {result.v3.executionReadiness}
                </div>

                <h3 style={h3Style}>Execution Bands</h3>
                {renderStringList(result.v3.executionBands)}

                <h3 style={h3Style}>Execution Notes</h3>
                {renderStringList(result.v3.executionNotes)}

                <h3 style={h3Style}>Manual Review</h3>
                {renderStringList(result.v3.manualReview)}
              </div>
            )}

            {result.v4 && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Numeric Presets (v4)</h2>
                <div>
                  <strong>Readiness:</strong>{" "}
                  {result.v4.numericPresetReadiness}
                </div>

                <h3 style={h3Style}>Numeric Preset</h3>
                {renderObjectList(result.v4.numericPreset || undefined)}

                <h3 style={h3Style}>Preset Modifiers</h3>
                {renderStringList(result.v4.presetModifiers)}

                <h3 style={h3Style}>Manual Review</h3>
                {renderStringList(result.v4.manualReview)}
              </div>
            )}

            {result.challenger && (
              <div style={cardStyle}>
                <h2 style={h2Style}>Challenger Review</h2>

                <h3 style={h3Style}>Flags</h3>
                {renderStringList(result.challenger.flags)}

                <h3 style={h3Style}>Recommendations</h3>
                {renderStringList(result.challenger.recommendations)}
              </div>
            )}

            <div style={cardStyle}>
              <h2 style={h2Style}>Raw Debug Output</h2>
              <pre
                style={{
                  background: "#1a1a1a",
                  color: "#4caf50",
                  padding: 16,
                  overflowX: "auto",
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                  fontSize: 13,
                  margin: 0,
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AskFTF;
