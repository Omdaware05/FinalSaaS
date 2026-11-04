import { useEffect, useRef, useState, type FormEvent } from "react";
import { contactsApi, errorMessage, type Contact } from "../api";
import { Badge, Modal, useToast } from "../components";

const EMPTY = { name: "", phone: "", email: "", notes: "" };

export default function Contacts() {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setContacts(await contactsApi.list());
    } catch (err) {
      toast.error(errorMessage(err, "Could not load contacts"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setForm(EMPTY);
    setEditing(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setForm({ name: c.name, phone: c.phone, email: c.email, notes: c.notes });
    setEditing(c);
    setFormError("");
    setShowForm(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      if (editing) {
        await contactsApi.update(editing.id, form);
        toast.success("Contact updated");
      } else {
        await contactsApi.create({ ...form, consent_status: "granted", consent_source: "manual_entry" });
        toast.success("Contact added");
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Could not save contact"));
    } finally {
      setSaving(false);
    }
  };

  const optOut = async (c: Contact) => {
    if (!window.confirm(`Mark ${c.name} (${c.phone}) as do-not-call? They will be blocked from all future calls and campaigns.`)) return;
    try {
      await contactsApi.optOut(c.id);
      toast.success(`${c.phone} marked do-not-call`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Opt-out failed"));
    }
  };

  const onImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await contactsApi.importCsv(file);
      const created = result.created ?? result.imported ?? result.count;
      toast.success(
        created !== undefined ? `Imported ${String(created)} contacts` : "Import finished"
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "CSV import failed"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            People you can call. Contacts marked do-not-call are blocked everywhere.
          </p>
        </div>
        <div className="actions">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            + Add contact
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th>Consent</th>
              <th>Consent source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  {c.status === "do_not_call" && (
                    <span className="badge badge-red" style={{ marginLeft: 8 }}>
                      DNC — DO NOT CALL
                    </span>
                  )}
                </td>
                <td>{c.phone}</td>
                <td>{c.email || "—"}</td>
                <td>
                  <Badge value={c.status} />
                </td>
                <td>
                  <Badge value={c.consent_status} />
                </td>
                <td className="muted">{c.consent_source || "—"}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-sm" onClick={() => openEdit(c)}>
                      Edit
                    </button>
                    {c.status !== "do_not_call" && (
                      <button className="btn btn-sm btn-danger" onClick={() => optOut(c)}>
                        Opt out (DNC)
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No contacts yet. Add one manually or import a CSV (columns: name, phone, email).
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

      {showForm && (
        <Modal title={editing ? "Edit contact" : "Add contact"} onClose={() => setShowForm(false)}>
          <form onSubmit={submit}>
            {formError && <div className="inline-error">{formError}</div>}
            <label className="field">
              <span>Name *</span>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Phone *</span>
              <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {!editing && (
              <p className="small muted">
                Manually added contacts are recorded with consent status "granted" and source
                "manual_entry". Only add people who have agreed to be called.
              </p>
            )}
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
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
