import { useEffect, useState } from "react";
import { errorMessage, leadsApi, type Lead } from "../api";
import { Badge, formatDate, useToast } from "../components";

export default function Leads() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLeads(await leadsApi.list());
      } catch (err) {
        toast.error(errorMessage(err, "Could not load leads"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const blob = await leadsApi.exportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leads.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Leads exported");
    } catch (err) {
      toast.error(errorMessage(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  const dispositionOf = (l: Lead) => l.disposition ?? l.interest ?? l.status ?? "";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Calls that ended with a disposition — interested, callback, not interested and more.
          </p>
        </div>
        <button className="btn btn-primary" onClick={exportXlsx} disabled={exporting}>
          {exporting ? "Exporting…" : "Export XLSX"}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Phone</th>
              <th>Disposition</th>
              <th>Confidence</th>
              <th>Summary</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>{l.contact_name || "—"}</td>
                <td>{l.phone || "—"}</td>
                <td>
                  {dispositionOf(l) ? <Badge value={dispositionOf(l)} /> : "—"}
                </td>
                <td>
                  {l.confidence_score !== null && l.confidence_score !== undefined
                    ? `${Math.round(l.confidence_score <= 1 ? l.confidence_score * 100 : l.confidence_score)}%`
                    : "—"}
                </td>
                <td className="muted">{l.summary || "—"}</td>
                <td>{formatDate(l.created_at)}</td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No leads yet. Leads appear here after calls finish with a disposition.
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
    </div>
  );
}
