import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { AgentDocument, AgentDashboardResponse } from '../types/api';

/**
 * Generates and downloads a multi-page, executive-grade PDF report
 * of an Agent's Dashboard containing complete performance metrics,
 * telephony configuration, lead conversions, and recent call telemetry logs.
 */
export function generateAgentDashboardPdf(
  agent: AgentDocument,
  dashboard: AgentDashboardResponse,
  businessName?: string
): void {
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

  // Accent bar
  doc.setFillColor(249, 115, 22); // orange-500
  doc.rect(0, 80, pageWidth, 5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ARB SOFTTECH · AGENT DASHBOARD TELEMETRY', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('Executive Intelligence & Voice Agent Performance Report', margin, 52);

  const reportDateStr = format(new Date(), 'MMMM dd, yyyy · HH:mm:ss');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Generated: ${reportDateStr}`, pageWidth - margin, 52, { align: 'right' });

  let y = 110;

  // -------------------------------------------------------------
  // 2. Agent Profile Summary Card
  // -------------------------------------------------------------
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 90, 6, 6, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(agent.name, margin + 14, y + 24);

  // Status Badge
  const statusStr = agent.is_enabled ? 'ACTIVE' : 'INACTIVE';
  doc.setFillColor(agent.is_enabled ? 16 : 244, agent.is_enabled ? 185 : 63, agent.is_enabled ? 129 : 94);
  doc.roundedRect(margin + contentWidth - 75, y + 12, 60, 16, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(statusStr, margin + contentWidth - 45, y + 23, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  const col1X = margin + 14;
  const col2X = margin + 265;

  // Row 1: Agent ID & Provider
  doc.text(`Agent ID: ${agent.agent_id}`, col1X, y + 44);
  doc.text(`Provider: ${(agent.provider || 'vobiz').toUpperCase()}`, col2X, y + 44);

  // Row 2: Assigned Business & Language
  doc.text(`Assigned Business: ${businessName || 'Default Account'}`, col1X, y + 59);
  doc.text(`Language: ${agent.default_language || 'Marathi'}`, col2X, y + 59);

  // Row 3: Concurrency Limit & Trigger Path
  doc.text(`Concurrency Limit: ${agent.concurrency || 2}x Channels`, col1X, y + 74);
  doc.text(`Trigger Path: ${(agent as any).dograh_trigger_path || '/voice'}`, col2X, y + 74);

  y += 108;

  // -------------------------------------------------------------
  // 3. Operational Performance KPI Cards
  // -------------------------------------------------------------
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Key Operational KPIs', margin, y + 10);
  y += 18;

  const totalCalls = dashboard.total_calls || 0;
  const completedCalls = dashboard.completed_calls || 0;
  const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const avgDuration = (dashboard.average_duration_seconds || 0).toFixed(1);
  const totalVoiceSecs = (dashboard as any).total_duration_seconds ?? (completedCalls * (dashboard.average_duration_seconds || 0));
  const totalMinutes = (totalVoiceSecs / 60).toFixed(1);

  const kpis = [
    { label: 'Total Calls', value: `${totalCalls}`, sub: 'Telemetry history' },
    { label: 'Completed Calls', value: `${completedCalls}`, sub: `${completionRate}% Success Rate` },
    { label: 'Avg Duration', value: `${avgDuration}s`, sub: 'Per connected session' },
    { label: 'Total Minutes', value: `${totalMinutes}m`, sub: 'Voice time consumed' },
  ];

  const cardWidth = (contentWidth - 30) / 4;
  kpis.forEach((kpi, idx) => {
    const cardX = margin + idx * (cardWidth + 10);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, y, cardWidth, 54, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, cardX + 8, y + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, cardX + 8, y + 33);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, cardX + 8, y + 46);
  });

  y += 68;

  // -------------------------------------------------------------
  // 4. Lead Intelligence & Conversion Breakdown
  // -------------------------------------------------------------
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Customer Intent & Lead Intelligence Classification', margin, y + 10);
  y += 18;

  const interestedCount = dashboard.interested_count || 0;
  const notInterestedCount = dashboard.not_interested_count || 0;
  const uncertainCount = dashboard.uncertain_count || 0;
  const conversionRate = completedCalls > 0 ? Math.round((interestedCount / completedCalls) * 100) : 0;

  const intentKpis = [
    { label: 'Interested Leads', value: `${interestedCount}`, color: [16, 185, 129] },
    { label: 'Not Interested', value: `${notInterestedCount}`, color: [244, 63, 94] },
    { label: 'Uncertain / Pending', value: `${uncertainCount}`, color: [245, 158, 11] },
    { label: 'Conversion Ratio', value: `${conversionRate}%`, color: [99, 102, 241] },
  ];

  intentKpis.forEach((item, idx) => {
    const cardX = margin + idx * (cardWidth + 10);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, y, cardWidth, 48, 4, 4, 'FD');

    // Colored left accent bar
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.rect(cardX, y, 4, 48, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, cardX + 10, y + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(item.value, cardX + 10, y + 36);
  });

  y += 62;

  // -------------------------------------------------------------
  // 5. System Prompt & Directive Preview
  // -------------------------------------------------------------
  if (agent.system_prompt) {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Voice Persona & Directive Prompt', margin, y + 10);
    y += 18;

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(226, 232, 240);

    const promptText = agent.system_prompt.trim();
    const promptLines = doc.splitTextToSize(promptText, contentWidth - 20).slice(0, 4);
    const boxHeight = promptLines.length * 13 + 16;

    doc.roundedRect(margin, y, contentWidth, boxHeight, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(promptLines, margin + 10, y + 16);

    y += boxHeight + 16;
  }

  // -------------------------------------------------------------
  // 6. Recent Telemetry Calls Table
  // -------------------------------------------------------------
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Recent Call Telemetry Logs', margin, y + 10);
  y += 16;

  const recentCalls = dashboard.recent_calls || [];
  const tableData = recentCalls.length > 0
    ? recentCalls.map((call, idx) => [
        `#${idx + 1}`,
        call.phone_number || 'N/A',
        (call.state || 'COMPLETED').toUpperCase(),
        `${call.duration ? call.duration.toFixed(1) : '0.0'}s`,
        call.provider ? call.provider.toUpperCase() : 'VOBIZ',
        call.created_at ? format(new Date(call.created_at), 'yyyy-MM-dd HH:mm') : 'N/A',
      ])
    : [
        ['—', 'No recent calls recorded', '—', '—', '—', '—'],
      ];

  autoTable(doc, {
    startY: y,
    head: [['#', 'Phone Number', 'Call State', 'Duration', 'Provider', 'Timestamp']],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: [51, 65, 85],
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Footer on all pages
      const str = `Page ${data.pageNumber}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, pageWidth - margin, pageHeight - 20, { align: 'right' });
      doc.text('ARB SoftTech AI Voice Platform · Strictly Confidential', margin, pageHeight - 20);
    },
  });

  // Save the PDF
  const cleanName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dateStamp = format(new Date(), 'yyyyMMdd');
  doc.save(`${cleanName}_dashboard_${dateStamp}.pdf`);
}
