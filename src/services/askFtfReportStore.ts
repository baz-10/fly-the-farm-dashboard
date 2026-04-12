import { ClientReport, OperatorBriefing } from '../ai/orchestrator/generateClientReport';

export interface AskFtfReportRecord {
  id: string;
  createdAt: string;
  jobId: string;
  question: string;
  context: {
    chemical?: string;
    aircraft?: string;
    target?: string;
    state?: string;
    terrain?: string;
    boundaries?: string;
  };
  operatorResult: any;
  clientReport: ClientReport;
  operatorBriefing?: OperatorBriefing; // Optional for backward compatibility
  product: string;
  aircraft: string;
  target: string;
  finalRecommendation: string[];
}

const STORAGE_KEY = 'ftf-askftf-reports';

function loadRecords(): AskFtfReportRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(records: AskFtfReportRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveReport(report: Omit<AskFtfReportRecord, 'id' | 'createdAt'>): AskFtfReportRecord {
  const records = loadRecords();
  const record: AskFtfReportRecord = {
    ...report,
    id: `ftf-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  records.push(record);
  persist(records);
  return record;
}

export function getReportsForJob(jobId: string): AskFtfReportRecord[] {
  return loadRecords().filter((r) => r.jobId === jobId);
}

export function getAllReports(): AskFtfReportRecord[] {
  return loadRecords();
}

export function getReportById(id: string): AskFtfReportRecord | null {
  return loadRecords().find((r) => r.id === id) ?? null;
}
