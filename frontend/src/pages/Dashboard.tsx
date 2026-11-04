import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  agentsApi,
  callsApi,
  contactsApi,
  errorMessage,
  leadsApi,
  settingsApi,
  type Call,
  type SettingsStatus,
} from "../api";
import { Badge, formatDate, formatDuration } from "../components";

export default function Dashboard() {
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [callsToday, setCallsToday] = useState<number | null>(null);
  const [interested, setInterested] = useState<number | null>(null);
  const [recent, setRecent] = useState<Call[]>([]);
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [agents, contacts, calls, leads, st] = await Promise.all([
          agentsApi.list(),
          contactsApi.list(),
          callsApi.list(),
          leadsApi.list(),
          settingsApi.status().catch(() => null),
        ]);
        setAgentCount(agents.length);
        setContactCount(contacts.length);
        const today = new Date().toDateString();
        setCallsToday(
          calls.filter((c) => c.created_at && new Date(c.created_at).toDateString() === today).length
        );
        setRecent(calls.slice(0, 8));
        setInterested(
          leads.filter((l) => {
            const d = (l.disposition ?? l.interest ?? l.status ?? "").toLowerCase();
            return d === "interested" || d === "qualified";
          }).length
        );
        setStatus(st);
      } catch (err) {
        setError(errorMessage(err, "Could not load dashboard data"));
      }
    })();
  }, []);

  const callingReady = status?.telephony_configured && status?.public_url_configured;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-sub">Overview of your AI calling operation.</p>

      {error && <div className="inline-error">{error}</div>}

      {status && (
        <div className={`status-strip ${callingReady ? "ok" : "warn"}`}>
          <strong>System status</strong>
          <ul>
            <li>
              Telephony (VoBiz): {status.telephony_configured ? "configured" : "NOT configured"}
              {status.from_number_masked ? ` · Caller ID ${status.from_number_masked}` : ""}
            </li>
            <li>Public webhook URL: {status.public_url_configured ? "configured" : "NOT configured"}</li>
            <li>
              Voice provider: {status.voice_provider} (
              {status.voice_provider_configured ? "configured" : "NOT configured"})
            </li>
            <li>Calling hours: {status.calling_hours} · Storage: {status.storage_backend}</li>
          </ul>
          {!callingReady && (
            <p style={{ marginBottom: 0 }}>
              <strong>
                Calls are disabled until VoBiz and PUBLIC_BASE_URL are configured in .env.
              </strong>{" "}
              See <Link to="/settings">Settings</Link> for what to set.
            </p>
          )}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{agentCount ?? "—"}</div>
          <div className="stat-label">Agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{contactCount ?? "—"}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{callsToday ?? "—"}</div>
          <div className="stat-label">Calls today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{interested ?? "—"}</div>
          <div className="stat-label">Interested leads</div>
        </div>
      </div>

      <h2>Recent calls</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Phone</th>
              <th>Status</th>
              <th>Disposition</th>
              <th>Duration</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((c) => (
              <tr key={c.id}>
                <td>{c.phone}</td>
                <td>
                  <Badge value={c.status} />
                </td>
                <td>{c.disposition ? <Badge value={c.disposition} /> : "—"}</td>
                <td>{formatDuration(c.duration_seconds)}</td>
                <td>{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No calls yet. Make a test call from the Agents page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
