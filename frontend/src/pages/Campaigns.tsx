import { useEffect, useState, type FormEvent } from "react";
import {
  agentsApi,
  campaignsApi,
  contactsApi,
  errorMessage,
  type Agent,
  type Campaign,
  type CampaignStartResult,
  type Contact,
} from "../api";
import { Badge, Modal, useToast } from "../components";

export default function Campaigns() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CampaignStartResult>>({});
  const [details, setDetails] = useState<Record<string, Campaign>>({});

  const load = async () => {
    try {
      const [c, a, ct] = await Promise.all([
        campaignsApi.list(),
        agentsApi.list(),
        contactsApi.list(),
      ]);
      setCampaigns(c);
      setAgents(a);
      setContacts(ct);
    } catch (err) {
      toast.error(errorMessage(err, "Could not load campaigns"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  const toggleContact = (id: string) =>
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!agentId) {
      setFormError("Choose an agent");
      return;
    }
    if (selectedContacts.size === 0) {
      setFormError("Select at least one contact");
      return;
    }
    setSaving(true);
    try {
      await campaignsApi.create({
        name: name.trim(),
        agent_id: agentId,
        contact_ids: [...selectedContacts],
      });
      toast.success("Campaign created");
      setShowForm(false);
      setName("");
      setSelectedContacts(new Set());
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Could not create campaign"));
    } finally {
      setSaving(false);
    }
  };

  const start = async (c: Campaign) => {
    setStartingId(c.id);
    try {
      const result = await campaignsApi.start(c.id);
      setResults((r) => ({ ...r, [c.id]: result }));
      if (result.errors && result.errors.length > 0) {
        toast.error(`Started with issues: ${result.created} created, ${result.blocked} blocked`);
      } else {
        toast.success(`Campaign started: ${result.created} calls created, ${result.blocked} blocked`);
      }
      const detail = await campaignsApi.get(c.id).catch(() => null);
      if (detail) setDetails((d) => ({ ...d, [c.id]: detail }));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not start campaign"));
    } finally {
      setStartingId(null);
    }
  };

  const refreshCounts = async (c: Campaign) => {
    try {
      const detail = await campaignsApi.get(c.id);
      setDetails((d) => ({ ...d, [c.id]: detail }));
    } catch (err) {
      toast.error(errorMessage(err, "Could not refresh campaign"));
    }
  };

  const countsText = (c: Campaign): string => {
    const d = details[c.id] ?? c;
    const parts: string[] = [];
    const counts = d.counts ?? {};
    const total = d.total_contacts ?? d.contact_ids?.length;
    if (total !== undefined) parts.push(`${total} contacts`);
    if (d.calls_created !== undefined) parts.push(`${d.calls_created} calls created`);
    if (d.completed !== undefined) parts.push(`${d.completed} completed`);
    if (d.interested !== undefined) parts.push(`${d.interested} interested`);
    for (const [k, v] of Object.entries(counts)) parts.push(`${k}: ${v}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
  };

  const callableContacts = contacts.filter((c) => c.status !== "do_not_call");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Call a list of contacts with one agent. Do-not-call contacts are blocked at start.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setFormError("");
            setShowForm(true);
          }}
        >
          + New campaign
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  {results[c.id] && (
                    <div className="small" style={{ marginTop: 6 }}>
                      Last start: {results[c.id].created} created, {results[c.id].blocked} blocked
                      {results[c.id].errors.length > 0 && (
                        <div className="inline-error" style={{ marginTop: 6 }}>
                          {results[c.id].errors.map((e, i) => (
                            <div key={i}>{e}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td>{agentName(c.agent_id)}</td>
                <td>
                  <Badge value={c.status} />
                </td>
                <td className="muted">{countsText(c)}</td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => start(c)}
                      disabled={startingId === c.id}
                    >
                      {startingId === c.id ? "Starting…" : "Start"}
                    </button>
                    <button className="btn btn-sm" onClick={() => refreshCounts(c)}>
                      Refresh counts
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No campaigns yet. Create one from your contacts.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="New campaign" onClose={() => setShowForm(false)}>
          <form onSubmit={submit}>
            {formError && <div className="inline-error">{formError}</div>}
            <label className="field">
              <span>Campaign name *</span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Agent *</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Select an agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.enabled}>
                    {a.name}
                    {!a.enabled ? " (disabled)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Contacts ({selectedContacts.size} selected)</span>
            </label>
            <div className="contact-picker">
              {callableContacts.map((c) => (
                <label key={c.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedContacts.has(c.id)}
                    onChange={() => toggleContact(c.id)}
                  />
                  {c.name} — {c.phone}
                  <span className="muted small">consent: {c.consent_status}</span>
                </label>
              ))}
              {callableContacts.length === 0 && (
                <p className="muted">No callable contacts. Add contacts first.</p>
              )}
              {contacts.some((c) => c.status === "do_not_call") && (
                <p className="small muted">
                  Do-not-call contacts are hidden here and are blocked again when the campaign
                  starts.
                </p>
              )}
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create campaign"}
              </button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
