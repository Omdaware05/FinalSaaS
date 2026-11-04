import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Business } from '../app/providers/BusinessProvider';
import { AgentDocument, CallDocument } from '../types/api';

export interface BusinessPdfData {
  business: Business;
  assignedAgents: AgentDocument[];
  stats?: {
    total_calls?: number;
    completed_calls?: number;
    failed_calls?: number;
    active_calls?: number;
    queued_calls?: number;
    average_duration_seconds?: number;
    total_duration_seconds?: number;
    total_leads?: number;
    qualified_leads?: number;
    interested_count?: number;
    not_interested_count?: number;
    uncertain_count?: number;
  };
  recentCalls?: CallDocument[];
}

/**
 * Generates and downloads an executive-grade PDF telemetry report
 * for a Client Business Dashboard containing operational metrics,
 * AI agent fleet status, lead conversions, and recent call activity.
 */
export function generateBusinessDashboardPdf(data: BusinessPdfData): void {
  const { business, assignedAgents, stats = {}, recentCalls = [] } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // -------------------------------------------------------------
  // 1. Header Banner
  // -------------------------------------------------------------
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 85, 'F');

  // Emerald accent bar
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 80, pageWidth, 5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('ARB SOFTTECH · CLIENT BUSINESS TELEMETRY', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('Client Account Operational Performance & AI Telemetry Audit', margin, 52);

  const reportDateStr = format(new Date(), 'MMMM dd, yyyy · HH:mm:ss');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Generated: ${reportDateStr}`, pageWidth - margin, 52, { align: 'right' });

  let y = 108;

  // -------------------------------------------------------------
  // 2. Client Business Profile Summary Card
  // -------------------------------------------------------------
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 92, 6, 6, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(business.name, margin + 14, y + 24);

  // Status Badge
  const statusStr = (business.status || 'ACTIVE').toUpperCase();
  const isAct = business.status === 'active';
  doc.setFillColor(isAct ? 16 : 245, isAct ? 185 : 158, isAct ? 129 : 11);
  doc.roundedRect(margin + contentWidth - 85, y + 12, 70, 16, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(statusStr, margin + contentWidth - 50, y + 23, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600

  const col1X = margin + 14;
  const col2X = margin + 265;

  const createdDateStr = business.createdAt
    ? format(new Date(business.createdAt), 'MMM dd, yyyy')
    : 'Registered Account';

  // Row 1: Account ID & Contact Phone
  doc.text(`Account ID: ${business.id}`, col1X, y + 44);
  doc.text(`Contact Phone: ${business.contactPhone || 'N/A'}`, col2X, y + 44);

  // Row 2: Industry & Assigned Agents
  doc.text(`Industry: ${business.industry || 'General Enterprise'}`, col1X, y + 59);
  doc.text(`Assigned Agents: ${assignedAgents.length} Active AI Agent(s)`, col2X, y + 59);

  // Row 3: Contact Email & Client Since
  doc.text(`Contact Email: ${business.contactEmail || 'N/A'}`, col1X, y + 74);
  doc.text(`Client Since: ${createdDateStr}`, col2X, y + 74);

  y += 108;

  // -------------------------------------------------------------
  // 3. Operational Performance KPI Cards
  // -------------------------------------------------------------
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Key Operational KPIs', margin, y + 10);
  y += 18;

  const totalCalls = stats.total_calls || 0;
  const completedCalls = stats.completed_calls || 0;
  const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const totalLeads = stats.total_leads || 0;
  const qualLeads = stats.qualified_leads || 0;
  const conversionRate = totalLeads > 0 ? Math.round((qualLeads / totalLeads) * 100) : 0;

  const avgDuration = (stats.average_duration_seconds || 0).toFixed(1);
  const totalVoiceSecs = stats.total_duration_seconds ?? (completedCalls * (stats.average_duration_seconds || 0));
  const totalMinutes = (totalVoiceSecs / 60).toFixed(1);

  const kpis = [
    { label: 'Total Calls', value: `${totalCalls}`, sub: 'Telephony history' },
    { label: 'Completed Sessions', value: `${completedCalls}`, sub: `${completionRate}% Success Rate` },
    { label: 'Leads Captured', value: `${totalLeads}`, sub: `${qualLeads} Qualified` },
    { label: 'Conversion Rate', value: `${conversionRate}%`, sub: 'Lead efficiency' },
  ];

  const cardWidth = (contentWidth - 30) / 4;
  kpis.forEach((kpi, idx) => {
    const cardX = margin + idx * (cardWidth + 10);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, y, cardWidth, 54, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label.toUpperCase(), cardX + 8, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, cardX + 8, y + 33);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(kpi.sub, cardX + 8, y + 46);
  });

  y += 66;

  // -------------------------------------------------------------
  // 4. Secondary Telemetry & Lead Intelligence Breakdown
  // -------------------------------------------------------------
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 56, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Voice Telemetry & Customer Intent Intelligence', margin + 12, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  const interestedCount = stats.interested_count ?? qualLeads;
  const notInterestedCount = stats.not_interested_count ?? 0;
  const uncertainCount = stats.uncertain_count ?? 0;

  const t1 = margin + 12;
  const t2 = margin + 140;
  const t3 = margin + 270;
  const t4 = margin + 400;

  doc.text(`Avg Duration: ${avgDuration}s`, t1, y + 38);
  doc.text(`Total Voice Time: ${totalMinutes} mins`, t2, y + 38);
  doc.text(`Interested: ${interestedCount} (${totalLeads > 0 ? Math.round((interestedCount / totalLeads) * 100) : 0}%)`, t3, y + 38);
  doc.text(`Uncertain / Not Interested: ${uncertainCount} / ${notInterestedCount}`, t4, y + 38);

  y += 70;

  // -------------------------------------------------------------
  // 5. Assigned Voice Agents Fleet Table
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Assigned AI Agent Fleet (${assignedAgents.length})`, margin, y + 6);
  y += 14;

  const agentTableRows = assignedAgents.map((ag, index) => [
    (index + 1).toString(),
    ag.name,
    (ag.provider || 'vobiz').toUpperCase(),
    ag.default_language || 'Hindi',
    `${ag.concurrency || 1} Channel(s)`,
    ag.is_enabled ? 'Active' : 'Disabled',
  ]);

  if (agentTableRows.length === 0) {
    agentTableRows.push(['1', 'No dedicated agent assigned', 'VOBIZ', 'English', '1 Channel', 'Unassigned']);
  }

  autoTable(doc, {
    startY: y,
    head: [['#', 'Agent Name', 'Telephony Provider', 'Primary Language', 'Concurrency', 'Status']],
    body: agentTableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 8,
      cellPadding: 4.5,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 155 },
      2: { cellWidth: 90 },
      3: { cellWidth: 90 },
      4: { cellWidth: 80 },
      5: { cellWidth: 75, halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // -------------------------------------------------------------
  // 6. Recent Calls Telemetry Table (if present)
  // -------------------------------------------------------------
  if (recentCalls.length > 0) {
    // If not enough space on current page, add new page
    if (y > pageHeight - 160) {
      doc.addPage();
      y = 50;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Recent Calls Telemetry (${recentCalls.length})`, margin, y + 6);
    y += 14;

    const callTableRows = recentCalls.slice(0, 15).map((call, index) => [
      (index + 1).toString(),
      call.phone_number || 'Unknown',
      (call.state || 'completed').toUpperCase(),
      `${(call.duration || 0).toFixed(1)}s`,
      (call.provider || 'vobiz').toUpperCase(),
      call.created_at ? format(new Date(call.created_at), 'MM/dd HH:mm:ss') : 'N/A',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Phone Number', 'Call State', 'Duration', 'Provider', 'Timestamp']],
      body: callTableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 4,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 120 },
        2: { cellWidth: 90, halign: 'center' },
        3: { cellWidth: 70, halign: 'right' },
        4: { cellWidth: 80 },
        5: { cellWidth: 130 },
      },
      margin: { left: margin, right: margin },
    });
  }

  // -------------------------------------------------------------
  // 7. Page Footer on All Pages
  // -------------------------------------------------------------
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, pageHeight - 30, contentWidth, 0.5, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ARB SoftTech Telemetry Intelligence · ${business.name} · Confidential`,
      margin,
      pageHeight - 16
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 16,
      { align: 'right' }
    );
  }

  // -------------------------------------------------------------
  // 8. Trigger File Download
  // -------------------------------------------------------------
  const sanitizedBizName = business.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
  doc.save(`arb_softtech_business_${sanitizedBizName}_dashboard_${dateStr}.pdf`);
}
