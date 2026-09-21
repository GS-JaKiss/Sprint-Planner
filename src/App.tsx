import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileInput,
  Gauge,
  GripVertical,
  Minus,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  color: string;
  softColor: string;
};

type PlannedIssue = ImportedJiraIssue & {
  assignments: Record<string, number>;
};

type StoredIssue = Partial<PlannedIssue> & ImportedJiraIssue & {
  assigneeId?: string | null;
  assigneeIds?: string[];
  days?: number;
};

type CapacityTooltip = {
  key: string;
  summary: string;
  personName: string;
  days: number;
  top: number;
  left: number;
};

const PEOPLE: Person[] = [
  { id: "janos-kiss", name: "Janos Kiss", initials: "JK", role: "Frontend", color: "#d75d3b", softColor: "#f8ddd3" },
  { id: "hornich-gergely", name: "Hornich Gergely", initials: "HG", role: "Frontend", color: "#287b67", softColor: "#d7ebe5" },
  { id: "licsauer-mark", name: "Licsauer Mark", initials: "LM", role: "Frontend", color: "#4169a1", softColor: "#dce6f4" },
  { id: "bodnar-erik", name: "Bodnar Erik", initials: "BE", role: "Backend", color: "#a76b18", softColor: "#f4e5c8" },
  { id: "kiss-renate", name: "Kiss Renate", initials: "KR", role: "QA", color: "#8a5575", softColor: "#ecdde7" },
  { id: "hajder-kinga", name: "Hajder Kinga", initials: "HK", role: "QA", color: "#39758f", softColor: "#dceaf0" },
  { id: "pocs-david", name: "Pocs David", initials: "PD", role: "QA", color: "#68733d", softColor: "#e5e9d5" },
];

const ISSUE_COLORS = [
  "#b84e32",
  "#287b67",
  "#4169a1",
  "#9a651b",
  "#82516f",
  "#35758e",
  "#65723b",
  "#7657a0",
  "#a34458",
  "#3f716c",
];

const issueColor = (key: string) => {
  const hash = [...key.toUpperCase()].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return ISSUE_COLORS[hash % ISSUE_COLORS.length];
};

const DEMO_ISSUES: PlannedIssue[] = [
  { id: "10001", key: "WEB-241", summary: "Streamline the checkout address flow", type: "Story", priority: "High", status: "To Do", assignments: {} },
  { id: "10002", key: "WEB-238", summary: "Add audit events to account changes", type: "Story", priority: "Medium", status: "To Do", assignments: {} },
  { id: "10003", key: "WEB-252", summary: "Empty states for saved payment methods", type: "Task", priority: "Medium", status: "Selected", assignments: {} },
  { id: "10004", key: "WEB-247", summary: "Retry failed invoice notifications", type: "Bug", priority: "Highest", status: "To Do", assignments: {} },
  { id: "10005", key: "WEB-255", summary: "Keyboard navigation in plan selector", type: "Bug", priority: "High", status: "Selected", assignments: {} },
  { id: "10006", key: "WEB-260", summary: "Document support escalation states", type: "Task", priority: "Low", status: "To Do", assignments: {} },
];

const readStoredIssues = () => {
  try {
    const value = localStorage.getItem("sprint-planner:issues");
    const stored: StoredIssue[] = value ? JSON.parse(value) as StoredIssue[] : DEMO_ISSUES;
    const personIds = new Set(PEOPLE.map((person) => person.id));
    return stored.map((issue) => {
      const savedIds = Array.isArray(issue.assigneeIds) ? issue.assigneeIds : issue.assigneeId ? [issue.assigneeId] : [];
      const assignments = issue.assignments
        ? Object.fromEntries(Object.entries(issue.assignments).filter(([id]) => personIds.has(id)).map(([id, days]) => [id, clampDays(days)]))
        : Object.fromEntries(savedIds.filter((id) => personIds.has(id)).map((id) => [id, clampDays(issue.days ?? 1)]));
      const { assigneeId: _legacyAssigneeId, assigneeIds: _legacyAssigneeIds, days: _legacyDays, ...currentIssue } = issue;
      return { ...currentIssue, assignments } as PlannedIssue;
    });
  } catch {
    return DEMO_ISSUES;
  }
};

const clampDays = (days: number) => Math.max(0.5, Math.min(30, Math.round((days || 0.5) * 2) / 2));

const normalizeName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const findPersonId = (value: string) => {
  const candidateTokens = new Set(normalizeName(value).split(" "));
  return PEOPLE.find((person) => normalizeName(person.name).split(" ").every((token) => candidateTokens.has(token)))?.id;
};

const parseTextIssues = (text: string) => {
  const issues: PlannedIssue[] = [];
  const ignoredLines: string[] = [];
  const priorities = new Set(["low", "medium", "high", "highest", "critical"]);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-Z][A-Z0-9]+-\d+)\s+-\s+(.+)\s+\[([^\]]+)\]\s*$/i);
    if (!match) {
      ignoredLines.push(line);
      continue;
    }

    const [, key, summary, metadata] = match;
    const parts = metadata.split(";").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) {
      ignoredLines.push(line);
      continue;
    }

    const assigneeIds: string[] = [];
    let days = 1;
    let priority = "Medium";
    for (const part of parts.slice(2)) {
      const storyPoints = part.match(/^(\d+(?:\.\d+)?)\s*SP$/i);
      if (storyPoints) {
        days = clampDays(Number(storyPoints[1]));
      } else if (priorities.has(part.toLowerCase())) {
        priority = part;
      } else if (part.toLowerCase() !== "unassigned") {
        const personId = findPersonId(part);
        if (personId) assigneeIds.push(personId);
      }
    }

    issues.push({
      id: `text-${key.toLowerCase()}`,
      key: key.toUpperCase(),
      summary: summary.trim(),
      type: parts[0],
      status: parts[1],
      priority,
      assignments: Object.fromEntries(assigneeIds.map((personId) => [personId, days])),
    });
  }

  return { issues, ignoredLines };
};

const readStoredOrders = () => {
  try {
    return JSON.parse(localStorage.getItem("sprint-planner:person-orders") ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
};

const readHiddenPeople = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("sprint-planner:hidden-people") ?? "[]") as string[];
    const personIds = new Set(PEOPLE.map((person) => person.id));
    return stored.filter((id) => personIds.has(id));
  } catch {
    return [];
  }
};

function App() {
  const capacityPanelRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<PlannedIssue[]>(readStoredIssues);
  const [sprintName, setSprintName] = useState(() => localStorage.getItem("sprint-planner:name") ?? "August checkout sprint");
  const [sprintDays, setSprintDays] = useState(() => Number(localStorage.getItem("sprint-planner:days")) || 10);
  const [fillerDays, setFillerDays] = useState(() => Number(localStorage.getItem("sprint-planner:filler-days")) || 0);
  const [fillerDaysDraft, setFillerDaysDraft] = useState(() => String(Number(localStorage.getItem("sprint-planner:filler-days")) || 0));
  const [personOrders, setPersonOrders] = useState<Record<string, string[]>>(readStoredOrders);
  const [hiddenPersonIds, setHiddenPersonIds] = useState<string[]>(readHiddenPeople);
  const [draggedSegment, setDraggedSegment] = useState("");
  const [capacityTooltip, setCapacityTooltip] = useState<CapacityTooltip | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [peopleMenuPosition, setPeopleMenuPosition] = useState<Record<string, { top: number; left: number }>>({});
  const [query, setQuery] = useState("");
  const [isManualOpen, setManualOpen] = useState(false);
  const [isTextImportOpen, setTextImportOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importCount, setImportCount] = useState<number | null>(null);
  const [connection, setConnection] = useState<JiraConnection>({ boardUrl: "", email: "", apiToken: "" });
  const [manualIssue, setManualIssue] = useState({ key: "", summary: "", type: "Task", priority: "Medium", assignments: {} as Record<string, number> });
  const [textImport, setTextImport] = useState("");

  useEffect(() => {
    localStorage.setItem("sprint-planner:issues", JSON.stringify(issues));
  }, [issues]);

  useEffect(() => {
    localStorage.setItem("sprint-planner:person-orders", JSON.stringify(personOrders));
  }, [personOrders]);

  useEffect(() => {
    localStorage.setItem("sprint-planner:hidden-people", JSON.stringify(hiddenPersonIds));
  }, [hiddenPersonIds]);

  useEffect(() => {
    const closeDropdownsOutside = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (event.target instanceof Node && !details.contains(event.target)) details.open = false;
      });
    };
    const closeDropdownsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => { details.open = false; });
      }
    };
    document.addEventListener("pointerdown", closeDropdownsOutside);
    document.addEventListener("keydown", closeDropdownsOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeDropdownsOutside);
      document.removeEventListener("keydown", closeDropdownsOnEscape);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("sprint-planner:name", sprintName);
    localStorage.setItem("sprint-planner:days", String(sprintDays));
    localStorage.setItem("sprint-planner:filler-days", String(fillerDays));
  }, [fillerDays, sprintDays, sprintName]);

  const filteredIssues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return issues;
    return issues.filter((issue) => `${issue.key} ${issue.summary}`.toLowerCase().includes(normalizedQuery));
  }, [issues, query]);

  const parsedTextImport = useMemo(() => parseTextIssues(textImport), [textImport]);

  const assignedDays = issues.reduce((total, issue) => total + Object.values(issue.assignments).reduce((sum, days) => sum + days, 0), 0) + fillerDays * PEOPLE.length;
  const unassignedCount = issues.filter((issue) => Object.keys(issue.assignments).length === 0).length;
  const availableDays = PEOPLE.length * sprintDays;
  const visiblePeople = PEOPLE.filter((person) => !hiddenPersonIds.includes(person.id));
  const visibleAssignedDays = visiblePeople.reduce((total, person) => total + fillerDays + issues.reduce(
    (personTotal, issue) => personTotal + (issue.assignments[person.id] ?? 0),
    0,
  ), 0);
  const visibleAvailableDays = visiblePeople.length * sprintDays;

  const togglePersonVisibility = (personId: string) => {
    setHiddenPersonIds((current) => current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]);
  };

  const copyCapacityImage = async () => {
    if (!capacityPanelRef.current || copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      const dataUrl = await toPng(capacityPanelRef.current, {
        backgroundColor: "#fbfaf6",
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("export-capacity-button")),
      });
      if (window.sprintPlanner?.copyImageToClipboard) {
        await window.sprintPlanner.copyImageToClipboard(dataUrl);
      } else {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch (error) {
      console.error("Could not copy Team Capacity image.", error);
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    }
  };

  const updateIssue = <Key extends keyof PlannedIssue>(id: string, field: Key, value: PlannedIssue[Key]) => {
    setIssues((current) => current.map((issue) => issue.id === id ? { ...issue, [field]: value } : issue));
  };

  const toggleAssignment = (assignments: Record<string, number>, personId: string) => {
    if (!(personId in assignments)) return { ...assignments, [personId]: 1 };
    const { [personId]: _removed, ...remaining } = assignments;
    return remaining;
  };

  const updateAssignmentDays = (issueId: string, personId: string, days: number) => {
    setIssues((current) => current.map((issue) => issue.id === issueId
      ? { ...issue, assignments: { ...issue.assignments, [personId]: clampDays(days) } }
      : issue));
  };

  const commitAssignmentDays = (issueId: string, personId: string, fallback: number) => {
    const draftKey = `${issueId}:${personId}`;
    const draft = assignmentDrafts[draftKey];
    updateAssignmentDays(issueId, personId, draft?.trim() ? Number(draft) : fallback);
    setAssignmentDrafts((current) => {
      const { [draftKey]: _committed, ...remaining } = current;
      return remaining;
    });
  };

  const orderedIssuesFor = (personId: string) => {
    const assigned = issues.filter((issue) => personId in issue.assignments);
    const order = personOrders[personId] ?? [];
    return [...assigned].sort((left, right) => {
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
  };

  const reorderForPerson = (personId: string, draggedId: string, targetId: string, placeAfter: boolean) => {
    if (draggedId === targetId) return;
    const currentIds = orderedIssuesFor(personId).map((issue) => issue.id);
    const withoutDragged = currentIds.filter((id) => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(targetId);
    withoutDragged.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
    setPersonOrders((current) => ({ ...current, [personId]: withoutDragged }));
  };

  const addManualIssue = (event: React.FormEvent) => {
    event.preventDefault();
    const key = manualIssue.key.trim().toUpperCase() || `WORK-${issues.length + 1}`;
    const assignments = Object.fromEntries(Object.entries(manualIssue.assignments).map(([personId, days]) => {
      const draft = assignmentDrafts[`manual:${personId}`];
      return [personId, clampDays(draft?.trim() ? Number(draft) : days)];
    }));
    setIssues((current) => [{
      id: `manual-${crypto.randomUUID()}`,
      key,
      summary: manualIssue.summary.trim(),
      type: manualIssue.type,
      priority: manualIssue.priority,
      status: "To Do",
      assignments,
    }, ...current]);
    setManualIssue({ key: "", summary: "", type: "Task", priority: "Medium", assignments: {} });
    setAssignmentDrafts({});
    setManualOpen(false);
  };

  const importTextIssues = (event: React.FormEvent) => {
    event.preventDefault();
    if (parsedTextImport.issues.length === 0) return;
    setIssues((current) => {
      const existingByKey = new Map(current.map((issue) => [issue.key.toUpperCase(), issue]));
      const imported = parsedTextImport.issues.map((issue) => {
        const existing = existingByKey.get(issue.key);
        return existing ? { ...issue, id: existing.id, assignments: existing.assignments } : issue;
      });
      const importedKeys = new Set(imported.map((issue) => issue.key));
      return [...imported, ...current.filter((issue) => !importedKeys.has(issue.key.toUpperCase()))];
    });
    setTextImport("");
    setTextImportOpen(false);
  };

  const importIssues = async (event: React.FormEvent) => {
    event.preventDefault();
    setImporting(true);
    setImportError("");
    setImportCount(null);
    try {
      if (!window.sprintPlanner) throw new Error("Jira import is available in the Electron desktop app.");
      const imported = await window.sprintPlanner.importJiraBoard(connection);
      setIssues((current) => {
        const existing = new Map(current.map((issue) => [issue.id, issue]));
        const merged = imported.map((issue) => ({
          ...issue,
          assignments: existing.get(issue.id)?.assignments ?? {},
        }));
        return merged;
      });
      setImportCount(imported.length);
      setConnection((current) => ({ ...current, apiToken: "" }));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import the Jira board.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="titlebar-drag" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <span>Sprint Planner</span>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" onClick={() => { setImportOpen(true); setImportCount(null); setImportError(""); }}>
            <ArrowDownToLine size={17} /> Import from Jira
          </button>
          <button className="secondary-button" onClick={() => setTextImportOpen(true)}>
            <FileInput size={17} /> Import from text
          </button>
        </div>
      </header>

      <main>
        <section className="sprint-heading">
          <div>
            <p className="eyebrow">Current sprint</p>
            <input
              className="sprint-name"
              value={sprintName}
              onChange={(event) => setSprintName(event.target.value)}
              aria-label="Sprint name"
            />
            <p className="subtitle">Shape the workload before the sprint starts.</p>
          </div>
          <label className="duration-control">
            <CalendarDays size={18} />
            <span>Sprint length</span>
            <select value={sprintDays} onChange={(event) => setSprintDays(Number(event.target.value))}>
              <option value={5}>5 days</option>
              <option value={10}>10 days</option>
              <option value={15}>15 days</option>
              <option value={20}>20 days</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </section>

        <section className="summary-strip" aria-label="Sprint summary">
          <div className="summary-item"><span className="summary-icon rust"><Clock3 size={18} /></span><div><strong>{assignedDays}</strong><span>days planned</span></div></div>
          <div className="summary-item"><span className="summary-icon green"><Gauge size={18} /></span><div><strong>{availableDays - assignedDays}</strong><span>days remaining</span></div></div>
          <div className="summary-item"><span className="summary-icon blue"><Users size={18} /></span><div><strong>{PEOPLE.length}</strong><span>people</span></div></div>
          <div className="summary-item"><span className="summary-icon gold"><CircleAlert size={18} /></span><div><strong>{unassignedCount}</strong><span>unassigned</span></div></div>
        </section>

        <section className="workspace-grid">
          <div className="issues-panel">
            <div className="section-header">
              <div><h2>Issue plan</h2><span>{issues.length} work items</span></div>
              <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issues" /></label>
            </div>
            <div className="issue-table-header"><span>Issue</span><span>People &amp; days</span><span>Allocation</span><span /></div>
            <div className="issue-list">
              {filteredIssues.map((issue) => (
                <div className="issue-row" key={issue.id}>
                  <div className="issue-main">
                    <div className={`type-icon ${issue.type.toLowerCase()}`}>{issue.type === "Bug" ? "B" : issue.type === "Story" ? "S" : "T"}</div>
                    <div><div className="issue-key">{issue.key}<span className={`priority ${issue.priority.toLowerCase()}`}>{issue.priority}</span></div><p>{issue.summary}</p></div>
                  </div>
                  <details className="people-picker">
                    <summary
                      aria-label={`People for ${issue.key}`}
                      onClick={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const menuHeight = 266;
                        const top = bounds.bottom + menuHeight > window.innerHeight - 8
                          ? Math.max(8, bounds.top - menuHeight - 4)
                          : bounds.bottom + 4;
                        setPeopleMenuPosition((current) => ({ ...current, [issue.id]: { top, left: Math.max(8, bounds.right - 270) } }));
                      }}
                    >
                      <span className="avatar-stack">{Object.keys(issue.assignments).slice(0, 3).map((id) => <Avatar key={id} person={PEOPLE.find((person) => person.id === id)!} small />)}{Object.keys(issue.assignments).length === 0 && <span className="empty-avatar">?</span>}</span>
                      <span>{Object.keys(issue.assignments).length ? `${Object.keys(issue.assignments).length} selected` : "Unassigned"}</span><ChevronDown size={14} />
                    </summary>
                    <div className="people-menu" style={peopleMenuPosition[issue.id]}>{PEOPLE.map((person) => { const draftKey = `${issue.id}:${person.id}`; return <div className="assignment-row" key={person.id}><label><input type="checkbox" checked={person.id in issue.assignments} onChange={() => updateIssue(issue.id, "assignments", toggleAssignment(issue.assignments, person.id))} /><Avatar person={person} small /><span>{person.name}<small>{person.role}</small></span></label>{person.id in issue.assignments && <label className="assignment-days"><input type="number" min="0.5" max="30" step="0.5" value={assignmentDrafts[draftKey] ?? String(issue.assignments[person.id])} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [draftKey]: event.target.value }))} onBlur={() => commitAssignmentDays(issue.id, person.id, issue.assignments[person.id])} aria-label={`Days for ${person.name} on ${issue.key}`} /><span>d</span></label>}</div>; })}</div>
                  </details>
                  <div className="allocation-total"><strong>{Object.values(issue.assignments).reduce((total, days) => total + days, 0)}d</strong><span>total</span></div>
                  <button className="remove-button" onClick={() => setIssues((current) => current.filter((item) => item.id !== issue.id))} aria-label={`Remove ${issue.key}`} title="Remove issue"><Trash2 size={16} /></button>
                </div>
              ))}
              {filteredIssues.length === 0 && <div className="empty-state"><Search size={22} /><span>No issues match “{query}”.</span></div>}
            </div>
            <button className="add-work-row" type="button" onClick={() => setManualOpen(true)}>
              <Plus size={16} /><span>Add work item</span>
            </button>
          </div>

          <div className="capacity-panel" ref={capacityPanelRef}>
            <div className="section-header capacity-heading">
              <div><h2>Team capacity</h2><span>Each column is one whole day</span></div>
              <div className="capacity-tools">
                <button className={`export-capacity-button ${copyStatus}`} type="button" onClick={copyCapacityImage} disabled={copyStatus === "copying"} title="Copy Team Capacity as an image">
                  {copyStatus === "copied" ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copyStatus === "copying" ? "Copying..." : copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy image"}</span>
                </button>
                <details className="capacity-visibility">
                  <summary><Users size={14} /><span>{visiblePeople.length} shown</span><ChevronDown size={12} /></summary>
                  <div className="capacity-visibility-menu">
                    <div className="visibility-menu-header"><strong>Visible people</strong><button type="button" onClick={() => setHiddenPersonIds([])}>Show all</button></div>
                    {PEOPLE.map((person) => <label key={person.id}><input type="checkbox" checked={!hiddenPersonIds.includes(person.id)} onChange={() => togglePersonVisibility(person.id)} /><Avatar person={person} small /><span>{person.name}<small>{person.role}</small></span></label>)}
                  </div>
                </details>
                <label>Filler <input type="number" min="0" max={sprintDays} step="0.5" value={fillerDaysDraft} onChange={(event) => setFillerDaysDraft(event.target.value)} onBlur={() => { const nextDays = fillerDaysDraft.trim() ? Number(fillerDaysDraft) : fillerDays; const normalized = Math.max(0, Math.min(sprintDays, Math.round(nextDays * 2) / 2)); setFillerDays(normalized); setFillerDaysDraft(String(normalized)); }} aria-label="Filler days per person" />d each</label>
                <span className="capacity-total">{visibleAssignedDays} / {visibleAvailableDays} days</span>
              </div>
            </div>
            <div className="day-ruler" style={{ "--days": sprintDays } as React.CSSProperties}>
              {Array.from({ length: sprintDays }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <div className="capacity-list">
              {visiblePeople.map((person) => {
                const personIssues = orderedIssuesFor(person.id);
                const totalDays = fillerDays + personIssues.reduce((total, issue) => total + issue.assignments[person.id], 0);
                return (
                  <div className="person-capacity" key={person.id}>
                    <div className="person-meta">
                      <Avatar person={person} />
                      <div><strong>{person.name}</strong><span>{person.role}</span></div>
                    </div>
                    <div className={`capacity-track ${totalDays > sprintDays ? "is-over" : ""}`} style={{ "--days": sprintDays } as React.CSSProperties}>
                      <div className="capacity-segments">
                        {personIssues.map((issue) => (
                          <div
                            className={`capacity-segment draggable ${draggedSegment === `${person.id}:${issue.id}` ? "is-dragging" : ""}`}
                            key={issue.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", issue.id);
                              setDraggedSegment(`${person.id}:${issue.id}`);
                              setCapacityTooltip(null);
                            }}
                            onDragEnd={() => setDraggedSegment("")}
                            onMouseEnter={(event) => {
                              const bounds = event.currentTarget.getBoundingClientRect();
                              setCapacityTooltip({
                                key: issue.key,
                                summary: issue.summary,
                                personName: person.name,
                                days: issue.assignments[person.id],
                                top: bounds.top - 8,
                                left: Math.max(170, Math.min(window.innerWidth - 170, bounds.left + bounds.width / 2)),
                              });
                            }}
                            onMouseLeave={() => setCapacityTooltip(null)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const draggedId = event.dataTransfer.getData("text/plain");
                              const bounds = event.currentTarget.getBoundingClientRect();
                              reorderForPerson(person.id, draggedId, issue.id, event.clientX > bounds.left + bounds.width / 2);
                              setDraggedSegment("");
                            }}
                            style={{ width: `${(issue.assignments[person.id] / sprintDays) * 100}%`, backgroundColor: issueColor(issue.key), color: "white" }}
                            aria-label={`${issue.key}: ${issue.summary}, ${issue.assignments[person.id]} days for ${person.name}. Drag left or right to reorder.`}
                          >
                            <GripVertical className="drag-grip" size={11} /><span>{issue.key.replace("-", "-\u200b")}</span><small>{issue.assignments[person.id]}d</small>
                          </div>
                        ))}
                        {fillerDays > 0 && <div className="capacity-segment filler" style={{ width: `${(fillerDays / sprintDays) * 100}%` }} title={`Filler: ${fillerDays} days`}><span>Filler</span><small>{fillerDays}d</small></div>}
                      </div>
                      <div className="day-grid" />
                    </div>
                    <div className="capacity-stat">
                      <b className={totalDays > sprintDays ? "over" : ""}>{totalDays}d</b>
                      <span>{personIssues.length} {personIssues.length === 1 ? "issue" : "issues"}</span>
                      <span className={totalDays > sprintDays ? "over" : ""}>{totalDays > sprintDays ? `${totalDays - sprintDays}d over` : `${sprintDays - totalDays}d free`}</span>
                    </div>
                  </div>
                );
              })}
              {visiblePeople.length === 0 && <div className="capacity-empty"><Users size={18} /><span>No people shown</span><button type="button" onClick={() => setHiddenPersonIds([])}>Show everyone</button></div>}
            </div>
          </div>
        </section>
      </main>

      {capacityTooltip && (
        <div className="capacity-tooltip" role="tooltip" style={{ top: capacityTooltip.top, left: capacityTooltip.left }}>
          <div><strong>{capacityTooltip.key}</strong><span>{capacityTooltip.days}d · {capacityTooltip.personName}</span></div>
          <p>{capacityTooltip.summary}</p>
        </div>
      )}

      {isTextImportOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTextImportOpen(false); }}>
          <div className="modal text-import-modal" role="dialog" aria-modal="true" aria-labelledby="text-import-title">
            <button className="modal-close" onClick={() => setTextImportOpen(false)} aria-label="Close"><X size={19} /></button>
            <div className="modal-icon text-import"><FileInput size={22} /></div>
            <p className="eyebrow">Pasted backlog</p>
            <h2 id="text-import-title">Import from text</h2>
            <p className="modal-copy">Paste Jira issue lines in the exported format. Story points become initial day estimates; recognized team names are assigned automatically.</p>
            <form onSubmit={importTextIssues}>
              <label>Issue text<textarea autoFocus required value={textImport} onChange={(event) => setTextImport(event.target.value)} placeholder={'BIMC-28466 - Show project version [Bug; To Do; 5 SP; Unassigned; High]\nBIMC-28845 - Implementation [Sub-task; To Do; Erik Bodnár]'} /></label>
              <div className="text-import-summary">
                <span className={parsedTextImport.issues.length ? "ready" : ""}><Check size={15} />{parsedTextImport.issues.length} issues recognized</span>
                <span><CircleAlert size={15} />{parsedTextImport.ignoredLines.length} non-issue lines ignored</span>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setTextImportOpen(false)}>Cancel</button><button className="primary-button" disabled={parsedTextImport.issues.length === 0}>Import {parsedTextImport.issues.length || ""} issues</button></div>
            </form>
          </div>
        </div>
      )}

      {isManualOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="manual-title">
            <button className="modal-close" onClick={() => setManualOpen(false)} aria-label="Close"><X size={19} /></button>
            <div className="modal-icon manual"><Plus size={22} /></div>
            <p className="eyebrow">Sprint backlog</p>
            <h2 id="manual-title">Add work item</h2>
            <p className="modal-copy">Create an item directly and include it in team capacity immediately.</p>
            <form onSubmit={addManualIssue}>
              <label>Summary<input autoFocus required value={manualIssue.summary} onChange={(event) => setManualIssue({ ...manualIssue, summary: event.target.value })} placeholder="What needs to be done?" /></label>
              <div className="form-row manual-key-row">
                <label>Key (optional)<input value={manualIssue.key} onChange={(event) => setManualIssue({ ...manualIssue, key: event.target.value })} placeholder="BIMC-123" /></label>
                <fieldset className="manual-people"><legend>People &amp; days</legend>{PEOPLE.map((person) => { const draftKey = `manual:${person.id}`; return <div className="assignment-row" key={person.id}><label><input type="checkbox" checked={person.id in manualIssue.assignments} onChange={() => setManualIssue({ ...manualIssue, assignments: toggleAssignment(manualIssue.assignments, person.id) })} /><Avatar person={person} small /><span>{person.name}<small>{person.role}</small></span></label>{person.id in manualIssue.assignments && <label className="assignment-days"><input type="number" min="0.5" max="30" step="0.5" value={assignmentDrafts[draftKey] ?? String(manualIssue.assignments[person.id])} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [draftKey]: event.target.value }))} onBlur={() => { const draft = assignmentDrafts[draftKey]; setManualIssue((current) => ({ ...current, assignments: { ...current.assignments, [person.id]: clampDays(draft?.trim() ? Number(draft) : current.assignments[person.id]) } })); setAssignmentDrafts((current) => { const { [draftKey]: _committed, ...remaining } = current; return remaining; }); }} aria-label={`Days for ${person.name}`} /><span>d</span></label>}</div>; })}</fieldset>
              </div>
              <div className="form-row manual-options-row">
                <label>Type<select value={manualIssue.type} onChange={(event) => setManualIssue({ ...manualIssue, type: event.target.value })}><option>Task</option><option>Story</option><option>Bug</option></select></label>
                <label>Priority<select value={manualIssue.priority} onChange={(event) => setManualIssue({ ...manualIssue, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Highest</option></select></label>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setManualOpen(false)}>Cancel</button><button className="primary-button">Add to sprint</button></div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Close"><X size={19} /></button>
            <div className="modal-icon"><ArrowDownToLine size={22} /></div>
            <p className="eyebrow">Jira Cloud</p>
            <h2 id="import-title">Import a board</h2>
            <p className="modal-copy">Paste a Jira board link to bring in its first 500 visible issues. Existing estimates and assignments are kept when issues match.</p>
            <form onSubmit={importIssues}>
              <label>Board link<input type="url" required value={connection.boardUrl} onChange={(event) => setConnection({ ...connection, boardUrl: event.target.value })} placeholder="https://team.atlassian.net/jira/software/c/projects/PROJ/boards/42/backlog" /></label>
              <div className="form-row">
                <label>Account email (optional)<input type="email" value={connection.email} onChange={(event) => setConnection({ ...connection, email: event.target.value })} placeholder="Uses JIRA_EMAIL" /></label>
                <label>API token (optional)<input type="password" value={connection.apiToken} onChange={(event) => setConnection({ ...connection, apiToken: event.target.value })} placeholder="Uses JIRA_API_TOKEN" /></label>
              </div>
              <div className="token-note"><Check size={15} /><span>Leave credentials blank to use .env. Scoped tokens need board and issue read scopes.</span><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Manage tokens <ExternalLink size={12} /></a></div>
              {importError && <div className="form-message error"><CircleAlert size={16} />{importError}</div>}
              {importCount !== null && <div className="form-message success"><Check size={16} />Imported {importCount} issues successfully.</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setImportOpen(false)}>Cancel</button><button className="primary-button" disabled={importing}>{importing ? "Importing…" : "Import issues"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <span className={`avatar ${small ? "small" : ""}`} style={{ backgroundColor: person.softColor, color: person.color }}>{person.initials}</span>;
}

export default App;