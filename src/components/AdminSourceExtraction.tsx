import React, { useState, useEffect } from "react";
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Collapse,
  CircularProgress,
  alpha,
} from "@mui/material";
import ScienceIcon from "@mui/icons-material/Science";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import ErrorIcon from "@mui/icons-material/Error";
import {
  getTrackedChemicals,
  SourceRecordWithFlags,
} from "../services/sourceManagerStore";
import { extractPdfText } from "../utils/pdfTextExtract";
import { extractChemicalFields } from "../utils/chemicalFieldExtraction";
import {
  saveExtraction,
  getLatestExtraction,
} from "../services/sourceExtractionStore";
import { SourceExtraction } from "../types/sourceExtraction";

// ─── Per-chemical state tracks label and SDS independently ──

interface ExtractionState {
  loading: "label" | "sds" | "both" | null;
  error: string | null;
  labelResult: SourceExtraction | null;
  sdsResult: SourceExtraction | null;
}

// ─── Shared UI helpers ──────────────────────────────────────

function statusIcon(status: SourceExtraction["extractionStatus"]) {
  switch (status) {
    case "success":
      return <CheckCircleIcon sx={{ fontSize: 16, color: "#2e7d32" }} />;
    case "partial":
      return <WarningIcon sx={{ fontSize: 16, color: "#e65100" }} />;
    case "failed":
      return <ErrorIcon sx={{ fontSize: 16, color: "#c62828" }} />;
  }
}

function statusChip(status: SourceExtraction["extractionStatus"]) {
  const config = {
    success: { label: "Success", bg: "#4caf50", color: "#2e7d32" },
    partial: { label: "Partial", bg: "#ff9800", color: "#e65100" },
    failed: { label: "Failed", bg: "#f44336", color: "#c62828" },
  }[status];
  return (
    <Chip
      icon={statusIcon(status)}
      label={config.label}
      size="small"
      sx={{
        bgcolor: alpha(config.bg, 0.1),
        color: config.color,
        fontWeight: 700,
        fontSize: "0.7rem",
      }}
    />
  );
}

function docTypeBadge(docType: "label" | "sds") {
  const isLabel = docType === "label";
  return (
    <Chip
      label={isLabel ? "LABEL" : "SDS"}
      size="small"
      sx={{
        bgcolor: isLabel ? alpha("#1565c0", 0.1) : alpha("#e65100", 0.1),
        color: isLabel ? "#1565c0" : "#e65100",
        fontWeight: 800,
        fontSize: "0.68rem",
        letterSpacing: "0.03em",
      }}
    />
  );
}

function miniStatus(extraction: SourceExtraction | null) {
  if (!extraction) {
    return (
      <Typography variant="caption" color="text.secondary">
        Not extracted
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {statusChip(extraction.extractionStatus)}
      <Typography variant="caption" color="text.secondary">
        {new Date(extraction.extractedAt).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
        })}
      </Typography>
    </Stack>
  );
}

// ─── Field display components ───────────────────────────────

function FieldRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "text.secondary" }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ ml: 0.5 }}>
        {value}
      </Typography>
    </Box>
  );
}

function ArrayField({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "text.secondary" }}
      >
        {label}
      </Typography>
      <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i}>
            <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
              {item}
            </Typography>
          </li>
        ))}
      </ul>
    </Box>
  );
}

// ─── Extraction detail panel ────────────────────────────────

function ExtractionDetail({
  extraction,
}: {
  extraction: SourceExtraction;
}) {
  const isLabel = extraction.sourceDocumentType === "label";
  const borderColor = isLabel ? "#1565c0" : "#e65100";

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: alpha(isLabel ? "#e3f2fd" : "#fff3e0", 0.4),
        borderRadius: "10px",
        border: `1px solid ${alpha(borderColor, 0.2)}`,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 1.5 }}
      >
        {docTypeBadge(extraction.sourceDocumentType)}
        {statusChip(extraction.extractionStatus)}
        <Typography variant="caption" color="text.secondary">
          Extracted{" "}
          {new Date(extraction.extractedAt).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Typography>
      </Stack>

      <FieldRow label="Product Name:" value={extraction.productName} />
      <FieldRow
        label="Application Method:"
        value={extraction.applicationMethod}
      />
      <FieldRow
        label="Aerial Min Water Rate:"
        value={extraction.aerialMinWaterRate}
      />
      <FieldRow
        label="Droplet Requirement:"
        value={extraction.dropletRequirement}
      />
      <FieldRow label="Wind Limits:" value={extraction.windLimits} />
      <FieldRow
        label="Temperature Limits:"
        value={extraction.temperatureLimits}
      />
      <FieldRow label="Withholding:" value={extraction.withholding} />
      <FieldRow
        label="Buffer Requirements:"
        value={extraction.bufferRequirements}
      />
      <ArrayField
        label="Operational DO NOT Statements:"
        items={extraction.operationalDoNotStatements}
      />
      <ArrayField
        label="General DO NOT Statements:"
        items={extraction.generalDoNotStatements}
      />
      <ArrayField
        label="Waterway Warnings:"
        items={extraction.waterwayWarnings}
      />
      <ArrayField
        label="Susceptible Crop Warnings:"
        items={extraction.susceptibleCropWarnings}
      />

      {extraction.confidenceNotes.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: "text.secondary" }}
          >
            Confidence Notes:
          </Typography>
          <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
            {extraction.confidenceNotes.map((note, i) => (
              <li key={i}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontSize: "0.75rem" }}
                >
                  {note}
                </Typography>
              </li>
            ))}
          </ul>
        </Box>
      )}

      {extraction.rawExtractedTextPreview && (
        <Box sx={{ mt: 1.5 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: "text.secondary" }}
          >
            Raw Text Preview:
          </Typography>
          <Box
            sx={{
              mt: 0.5,
              p: 1.5,
              bgcolor: "#f5f5f5",
              borderRadius: "8px",
              maxHeight: 160,
              overflow: "auto",
              fontSize: "0.72rem",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              color: "#555",
            }}
          >
            {extraction.rawExtractedTextPreview}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function AdminSourceExtraction() {
  const [chemicals, setChemicals] = useState<SourceRecordWithFlags[]>([]);
  const [states, setStates] = useState<Record<string, ExtractionState>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    const tracked = getTrackedChemicals();
    const withDocs = tracked.filter((r) => r.labelUrl || r.sdsUrl);
    setChemicals(withDocs);

    const initial: Record<string, ExtractionState> = {};
    for (const r of withDocs) {
      initial[r.chemical] = {
        loading: null,
        error: null,
        labelResult: getLatestExtraction(r.chemical, "label"),
        sdsResult: getLatestExtraction(r.chemical, "sds"),
      };
    }
    setStates(initial);
  }, []);

  const runExtraction = async (
    chemical: string,
    docType: "label" | "sds",
    url: string
  ) => {
    setStates((prev) => ({
      ...prev,
      [chemical]: { ...prev[chemical], loading: docType, error: null },
    }));

    try {
      const text = await extractPdfText(url);
      const fields = extractChemicalFields(chemical, docType, text);
      const record: SourceExtraction = {
        ...fields,
        id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        extractedAt: new Date().toISOString(),
        sourceUrl: url,
      };
      saveExtraction(record);

      setStates((prev) => {
        const current = prev[chemical] || {
          loading: null,
          error: null,
          labelResult: null,
          sdsResult: null,
        };
        return {
          ...prev,
          [chemical]: {
            ...current,
            loading: null,
            error: null,
            [docType === "label" ? "labelResult" : "sdsResult"]: record,
          },
        };
      });
      setExpandedKey(chemical);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setStates((prev) => ({
        ...prev,
        [chemical]: { ...prev[chemical], loading: null, error: msg },
      }));
    }
  };

  const runBoth = async (record: SourceRecordWithFlags) => {
    setStates((prev) => ({
      ...prev,
      [record.chemical]: {
        ...prev[record.chemical],
        loading: "both",
        error: null,
      },
    }));

    const errors: string[] = [];
    let newLabel: SourceExtraction | null = null;
    let newSds: SourceExtraction | null = null;

    if (record.labelUrl) {
      try {
        const text = await extractPdfText(record.labelUrl);
        const fields = extractChemicalFields(record.chemical, "label", text);
        const ext: SourceExtraction = {
          ...fields,
          id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          extractedAt: new Date().toISOString(),
          sourceUrl: record.labelUrl,
        };
        saveExtraction(ext);
        newLabel = ext;
      } catch (err) {
        errors.push(
          `Label: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    if (record.sdsUrl) {
      try {
        const text = await extractPdfText(record.sdsUrl);
        const fields = extractChemicalFields(record.chemical, "sds", text);
        const ext: SourceExtraction = {
          ...fields,
          id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          extractedAt: new Date().toISOString(),
          sourceUrl: record.sdsUrl,
        };
        saveExtraction(ext);
        newSds = ext;
      } catch (err) {
        errors.push(
          `SDS: ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    setStates((prev) => {
      const current = prev[record.chemical] || {
        loading: null,
        error: null,
        labelResult: null,
        sdsResult: null,
      };
      return {
        ...prev,
        [record.chemical]: {
          loading: null,
          error: errors.length > 0 ? errors.join("; ") : null,
          labelResult: newLabel || current.labelResult,
          sdsResult: newSds || current.sdsResult,
        },
      };
    });
    if (newLabel || newSds) setExpandedKey(record.chemical);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "12px",
            bgcolor: alpha("#9c27b0", 0.08),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ScienceIcon sx={{ fontSize: 24, color: "#9c27b0" }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: "primary.dark" }}
          >
            Source Extraction
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Run structured extraction against real label and SDS PDFs to
            populate Fly The Farm source data.
          </Typography>
        </Box>
      </Box>

      {/* Table */}
      <Card
        elevation={0}
        sx={{
          mt: 2,
          border: "1px solid",
          borderColor: alpha("#000", 0.08),
          borderRadius: "14px",
        }}
      >
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    "& th": {
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      color: "text.secondary",
                      py: 1.5,
                      borderBottom: "2px solid",
                      borderColor: alpha("#000", 0.06),
                    },
                  }}
                >
                  <TableCell>Chemical</TableCell>
                  <TableCell align="center">Label Extraction</TableCell>
                  <TableCell align="center">SDS Extraction</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {chemicals.map((r) => {
                  const state = states[r.chemical] || {
                    loading: null,
                    error: null,
                    labelResult: null,
                    sdsResult: null,
                  };
                  const isExpanded = expandedKey === r.chemical;
                  const isLoading = state.loading !== null;
                  const hasAnyResult = !!(
                    state.labelResult || state.sdsResult
                  );

                  return (
                    <React.Fragment key={r.chemical}>
                      <TableRow
                        sx={{
                          "& td": { py: 1.5 },
                          cursor: hasAnyResult ? "pointer" : "default",
                        }}
                        onClick={() => {
                          if (hasAnyResult) {
                            setExpandedKey(
                              isExpanded ? null : r.chemical
                            );
                          }
                        }}
                      >
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              {r.chemical}
                            </Typography>
                            {hasAnyResult &&
                              (isExpanded ? (
                                <ExpandLessIcon
                                  sx={{ fontSize: 16, color: "#999" }}
                                />
                              ) : (
                                <ExpandMoreIcon
                                  sx={{ fontSize: 16, color: "#999" }}
                                />
                              ))}
                          </Stack>
                          {state.error && (
                            <Typography
                              variant="caption"
                              sx={{ color: "#c62828", display: "block", mt: 0.5 }}
                            >
                              {state.error}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {r.labelUrl
                            ? miniStatus(state.labelResult)
                            : (
                              <Chip
                                label="No PDF"
                                size="small"
                                sx={{
                                  bgcolor: alpha("#9e9e9e", 0.1),
                                  color: "#616161",
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                }}
                              />
                            )}
                        </TableCell>
                        <TableCell align="center">
                          {r.sdsUrl
                            ? miniStatus(state.sdsResult)
                            : (
                              <Chip
                                label="No PDF"
                                size="small"
                                sx={{
                                  bgcolor: alpha("#9e9e9e", 0.1),
                                  color: "#616161",
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                }}
                              />
                            )}
                        </TableCell>
                        <TableCell align="right">
                          <Stack
                            direction="row"
                            spacing={0.5}
                            justifyContent="flex-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.labelUrl && (
                              <Button
                                size="small"
                                disabled={isLoading}
                                onClick={() =>
                                  runExtraction(
                                    r.chemical,
                                    "label",
                                    r.labelUrl
                                  )
                                }
                                sx={{
                                  textTransform: "none",
                                  fontWeight: 600,
                                  fontSize: "0.72rem",
                                  borderRadius: "8px",
                                  minWidth: 0,
                                  px: 1.5,
                                }}
                              >
                                {state.loading === "label" ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  "Extract Label"
                                )}
                              </Button>
                            )}
                            {r.sdsUrl && (
                              <Button
                                size="small"
                                disabled={isLoading}
                                onClick={() =>
                                  runExtraction(
                                    r.chemical,
                                    "sds",
                                    r.sdsUrl
                                  )
                                }
                                sx={{
                                  textTransform: "none",
                                  fontWeight: 600,
                                  fontSize: "0.72rem",
                                  borderRadius: "8px",
                                  minWidth: 0,
                                  px: 1.5,
                                }}
                              >
                                {state.loading === "sds" ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  "Extract SDS"
                                )}
                              </Button>
                            )}
                            {r.labelUrl && r.sdsUrl && (
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={isLoading}
                                onClick={() => runBoth(r)}
                                sx={{
                                  textTransform: "none",
                                  fontWeight: 700,
                                  fontSize: "0.72rem",
                                  borderRadius: "8px",
                                  minWidth: 0,
                                  px: 1.5,
                                }}
                              >
                                {state.loading === "both" ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  "Extract Both"
                                )}
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail — separate label and SDS sections */}
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          sx={{
                            py: 0,
                            px: 2,
                            borderBottom: isExpanded ? undefined : "none",
                          }}
                        >
                          <Collapse
                            in={isExpanded}
                            timeout="auto"
                            unmountOnExit
                          >
                            <Stack spacing={2} sx={{ my: 2 }}>
                              {state.labelResult && (
                                <Box>
                                  <Typography
                                    variant="subtitle2"
                                    sx={{
                                      fontWeight: 700,
                                      color: "#1565c0",
                                      mb: 1,
                                    }}
                                  >
                                    Label Extraction Result
                                  </Typography>
                                  <ExtractionDetail
                                    extraction={state.labelResult}
                                  />
                                </Box>
                              )}
                              {state.sdsResult && (
                                <Box>
                                  <Typography
                                    variant="subtitle2"
                                    sx={{
                                      fontWeight: 700,
                                      color: "#e65100",
                                      mb: 1,
                                    }}
                                  >
                                    SDS Extraction Result
                                  </Typography>
                                  <ExtractionDetail
                                    extraction={state.sdsResult}
                                  />
                                </Box>
                              )}
                              {!state.labelResult && !state.sdsResult && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ py: 2 }}
                                >
                                  No extractions available yet.
                                </Typography>
                              )}
                            </Stack>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
                {chemicals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No chemicals with PDF documents found in Source
                        Manager. Add label/SDS URLs first.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
