import { useEffect, useState } from "react";
import { errorMessage, settingsApi, type SettingsStatus } from "../api";
import { useToast } from "../components";

function Row({
  label,
  ok,
  value,
  fix,
}: {
  label: string;
  ok: boolean;
  value: string;
  fix?: string;
}) {
  return (
    <tr>
      <td>
        <strong>{label}</strong>
      </td>
      <td>
        <span className={`badge ${ok ? "badge-green" : "badge-red"}`}>
          {ok ? "Configured" : "Missing"}
        </span>
      </td>
      <td>{value}</td>
      <td className="muted">{ok ? "—" : fix}</td>
    </tr>
  );
}

export default function Settings() {
  const toast = useToast();
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setStatus(await settingsApi.status());
      } catch (err) {
        toast.error(errorMessage(err, "Could not load configuration status"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1>Settings</h1>
      <p className="page-sub">
        Configuration status. This page is read-only:{" "}
        <strong>API keys and secrets live only in the backend <code>.env</code> file</strong> —
        they are never entered or shown in the browser. Edit <code>.env</code> on the server and
        restart the backend to apply changes.
      </p>

      {loading && <p className="muted">Loading…</p>}

      {status && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Status</th>
                  <th>Current value</th>
                  <th>Set in .env</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Telephony (VoBiz)"
                  ok={status.telephony_configured}
                  value={
                    status.telephony_configured
                      ? `Caller ID ${status.from_number_masked || "(set)"}`
                      : "No carrier credentials"
                  }
                  fix="VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN, VOBIZ_FROM_NUMBER"
                />
                <Row
                  label="Public webhook URL"
                  ok={status.public_url_configured}
                  value={status.public_url_configured ? "Set" : "Not set — carrier cannot reach this server"}
                  fix="PUBLIC_BASE_URL=https://your-domain.example"
                />
                <Row
                  label={`Voice provider (${status.voice_provider})`}
                  ok={status.voice_provider_configured}
                  value={status.voice_provider}
                  fix={
                    status.voice_provider === "local"
                      ? "LOCAL_AI_BASE_URL (local model server must be running)"
                      : "SARVAM_API_KEY"
                  }
                />
              </tbody>
            </table>
          </div>

          <div className="panel mt">
            <h2 style={{ marginTop: 0 }}>Current configuration</h2>
            <dl className="kv">
              <dt>Calling hours</dt>
              <dd>{status.calling_hours}</dd>
              <dt>Storage backend</dt>
              <dd>{status.storage_backend}</dd>
              <dt>Voice provider</dt>
              <dd>{status.voice_provider}</dd>
              <dt>Caller ID</dt>
              <dd>{status.from_number_masked || "—"}</dd>
            </dl>
          </div>

          <div className="panel mt">
            <h2 style={{ marginTop: 0 }}>Switching to local models (optional)</h2>
            <p>
              The default voice provider is Sarvam (cloud). To run speech and language models on
              your own machine/GPU instead, set these in the backend <code>.env</code> and restart:
            </p>
            <pre
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                overflowX: "auto",
              }}
            >
{`VOICE_PROVIDER=local
LOCAL_AI_BASE_URL=http://127.0.0.1:8002/v1`}
            </pre>
            <p className="muted">
              The local AI server is a separate, optional service (OpenAI-compatible API). The
              platform works fully without it — nothing else changes, and you can switch back by
              setting <code>VOICE_PROVIDER=sarvam</code> again.
            </p>
          </div>

          <div className="panel mt">
            <h2 style={{ marginTop: 0 }}>Before real campaigns</h2>
            <ul>
              <li>Set a strong <code>JWT_SECRET</code> and change the seeded admin password.</li>
              <li>Only upload contacts who have consented to be called — consent is recorded per contact.</li>
              <li>Do-not-call contacts are blocked on single calls and campaigns automatically.</li>
              <li>Calls are only placed inside the configured calling hours.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
