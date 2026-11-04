import { useEffect, useState, type FormEvent } from "react";
import {
  agentsApi,
  callsApi,
  errorMessage,
  type Agent,
  type AgentInput,
} from "../api";
import { Modal, useToast } from "../components";

const EMPTY: AgentInput = {
  name: "",
  purpose: "",
  company_name: "",
  company_description: "",
  greeting_message: "",
  instructions: "",
  voice_id: "",
  language: "en-IN",
  enabled: true,
  concurrency: 1,
};

export default function Agents() {
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AgentInput>(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [callingId, setCallingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setAgents(await agentsApi.list());
    } catch (err) {
      toast.error(errorMessage(err, "Could not load agents"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(EMPTY);
    setFormError("");
    setCreating(true);
  };

  const openEdit = (a: Agent) => {
    setForm({
      name: a.name,
      purpose: a.purpose,
      company_name: a.company_name,
      company_description: a.company_description,
      greeting_message: a.greeting_message,
      instructions: a.instructions,
      voice_id: a.voice_id,
      language: a.language,
      enabled: a.enabled,
      concurrency: a.concurrency,
    });
    setFormError("");
    setEditing(a);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      if (editing) {
        await agentsApi.update(editing.id, form);
        toast.success(`Agent "${form.name}" updated`);
      } else {
        await agentsApi.create(form);
        toast.success(`Agent "${form.name}" created`);
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Could not save agent"));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (a: Agent) => {
    try {
      const updated = await agentsApi.update(a.id, { enabled: !a.enabled });
      setAgents((list) => list.map((x) => (x.id === a.id ? updated : x)));
    } catch (err) {
      toast.error(errorMessage(err, "Could not update agent"));
    }
  };

  const remove = async (a: Agent) => {
    if (!window.confirm(`Delete agent "${a.name}"?`)) return;
    try {
      await agentsApi.remove(a.id);
      toast.success(`Agent "${a.name}" deleted`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete agent"));
    }
  };

  const testCall = async (a: Agent) => {
    const phone = window.prompt(`Test call with "${a.name}" — enter a phone number (e.g. +919876543210):`);
    if (!phone) return;
    setCallingId(a.id);
    try {
      const call = await callsApi.initiate(a.id, phone.trim());
      toast.success(`Call started (status: ${call.status}). See the Calls page.`);
    } catch (err) {
      toast.error(errorMessage(err, "Test call failed"));
    } finally {
      setCallingId(null);
    }
  };

  const set = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const showModal = creating || editing !== null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agents</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Voice agents that make your calls.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New agent
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Company</th>
              <th>Voice</th>
              <th>Language</th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.name}</strong>
                </td>
                <td>{a.purpose || "—"}</td>
                <td>{a.company_name || "—"}</td>
                <td>{a.voice_id || "—"}</td>
                <td>{a.language || "—"}</td>
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={() => toggleEnabled(a)}
                      aria-label={`Enable ${a.name}`}
                    />
                    <span className="track" />
                  </label>
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => testCall(a)}
                      disabled={callingId === a.id || !a.enabled}
                      title={a.enabled ? "Place a test call" : "Enable the agent first"}
                    >
                      {callingId === a.id ? "Calling…" : "Test call"}
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(a)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No agents yet. Create one, or check that the backend seeded the demo agents.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title={editing ? `Edit agent — ${editing.name}` : "New agent"}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        >
          <form onSubmit={submit}>
            {formError && <div className="inline-error">{formError}</div>}
            <div className="form-row">
              <label className="field">
                <span>Name *</span>
                <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <label className="field">
                <span>Purpose</span>
                <input type="text" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Company name</span>
                <input type="text" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              </label>
              <label className="field">
                <span>Voice ID</span>
                <input type="text" value={form.voice_id} onChange={(e) => set("voice_id", e.target.value)} placeholder="e.g. shubh" />
              </label>
            </div>
            <label className="field">
              <span>Company description</span>
              <textarea value={form.company_description} onChange={(e) => set("company_description", e.target.value)} />
            </label>
            <label className="field">
              <span>Greeting message</span>
              <textarea value={form.greeting_message} onChange={(e) => set("greeting_message", e.target.value)} />
            </label>
            <label className="field">
              <span>Instructions (system prompt)</span>
              <textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
            </label>
            <div className="form-row">
              <label className="field">
                <span>Language</span>
                <input type="text" value={form.language} onChange={(e) => set("language", e.target.value)} placeholder="en-IN / hi-IN" />
              </label>
              <label className="field">
                <span>Concurrency</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.concurrency}
                  onChange={(e) => set("concurrency", Number(e.target.value) || 1)}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
              Enabled (can place calls)
            </label>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save agent"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
