import { useCallback, useEffect, useState } from "react";
import { callsApi, errorMessage, type Call } from "../api";
import { ACTIVE_CALL_STATUSES, Badge, formatDate, formatDuration, useToast } from "../components";

const STATUS_FILTERS = [
  "",
  "queued",
  "initiating",
  "ringing",
  "in_progress",
  "completed",
  "failed",
  "busy",
  "no_answer",
];

export default function Calls() {
  const toast = useToast();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Call | null>(null);

  const load = useCallback(async () => {
    try {
      setCalls(await callsApi.list(statusFilter ? { status: statusFilter } : {}));
    } catch (err) {
      toast.error(errorMessage(err, "Could not load calls"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1>Calls</h1>
      <p className="page-sub">Every call, its outcome, transcript and recording. Click a row for details.</p>

      <div className="toolbar">
        <label>
          Status:{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All" : s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Phone</th>
              <th>Status</th>
              <th>Disposition</th>
              <th>Duration</th>
              <th>Recording</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
                <td>{c.phone}</td>
                <td>
                  <Badge value={c.status} />
                </td>
                <td>{c.disposition ? <Badge value={c.disposition} /> : "—"}</td>
                <td>{formatDuration(c.duration_seconds)}</td>
                <td>
                  {c.recording_status === "ready" && <Badge value="ready" />}
                  {c.recording_status === "synthesized" && <Badge value="synthesized" />}
                  {(!c.recording_status || c.recording_status === "none") && "—"}
                </td>
                <td>{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {!loading && calls.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No calls match. Make a test call from the Agents page.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <CallDrawer
          callId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CallDrawer({
  callId,
  onClose,
  onChanged,
}: {
  callId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hangingUp, setHangingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const detail = await callsApi.get(callId);
        if (cancelled) return;
        setCall(detail);
        if (detail.recording_status === "ready" || detail.recording_status === "synthesized") {
          try {
            const blob = await callsApi.recordingBlob(callId);
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setAudioUrl(objectUrl);
          } catch {
            // Recording listed but not fetchable — show the status text only.
          }
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Could not load call details"));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [callId]);

  const hangup = async () => {
    setHangingUp(true);
    try {
      await callsApi.hangup(callId);
      toast.success("Hangup requested");
      const detail = await callsApi.get(callId);
      setCall(detail);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Hangup failed"));
    } finally {
      setHangingUp(false);
    }
  };

  const isActive = call ? ACTIVE_CALL_STATUSES.includes(call.status) : false;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h2 style={{ margin: 0 }}>Call detail</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {!call && !error && <p className="muted">Loading…</p>}

        {call && (
          <>
            <dl className="kv">
              <dt>Phone</dt>
              <dd>{call.phone}</dd>
              <dt>Status</dt>
              <dd>
                <Badge value={call.status} />
              </dd>
              <dt>Disposition</dt>
              <dd>{call.disposition ? <Badge value={call.disposition} /> : "—"}</dd>
              <dt>Duration</dt>
              <dd>{formatDuration(call.duration_seconds)}</dd>
              <dt>Failure reason</dt>
              <dd>{call.failure_reason || "—"}</dd>
              <dt>Recording</dt>
              <dd>
                {call.recording_status === "ready" && "Ready"}
                {call.recording_status === "synthesized" &&
                  "Synthesized (rebuilt from the transcript — not the original carrier audio)"}
                {(!call.recording_status || call.recording_status === "none") && "None"}
                {call.recording_status === "pending" && "Pending"}
              </dd>
              <dt>Started</dt>
              <dd>{formatDate(call.created_at)}</dd>
            </dl>

            {isActive && (
              <button className="btn btn-danger" onClick={hangup} disabled={hangingUp}>
                {hangingUp ? "Hanging up…" : "Hang up this call"}
              </button>
            )}

            {(call.recording_status === "ready" || call.recording_status === "synthesized") && (
              <div className="mt">
                <strong>Recording</strong>
                {call.recording_status === "synthesized" && (
                  <div className="small muted">
                    Note: this audio was synthesized from the transcript because the original
                    recording was not available.
                  </div>
                )}
                {audioUrl ? (
                  <audio controls src={audioUrl} />
                ) : (
                  <div className="small muted">Loading audio…</div>
                )}
              </div>
            )}

            <h2 className="mt">Transcript</h2>
            {call.transcript && call.transcript.length > 0 ? (
              <div>
                {call.transcript.map((seg, i) => {
                  const isAgent = seg.speaker.toLowerCase().startsWith("agent");
                  return (
                    <div key={i} className={`bubble-row ${isAgent ? "agent" : "customer"}`}>
                      <div className="bubble">
                        <div className="bubble-meta">
                          {isAgent ? "Agent" : "Customer"} · {formatDuration(seg.offset_seconds)}
                        </div>
                        {seg.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No transcript available for this call.</p>
            )}
          </>
        )}
      </aside>
    </>
  );
}
