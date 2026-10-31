import { jsPDF } from 'jspdf';
import { BlockCategory, DayPlan } from '../types';
import { calculateWindowMinutes, formatDurationHuman } from './calendar';
import { resolveBlockTags } from './tags';

function normalizePdfPunctuation(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2212]/g, '-')
    .replace(/\u2014/g, ' -- ')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
}

function hasNonLatin1Glyphs(plan: DayPlan): boolean {
  const samplePool = [
    plan.dateLabel,
    plan.summaryNote,
    plan.detectedLanguage,
    ...plan.blocks.flatMap((b) => [b.title, b.note, ...(b.tags ?? [])]),
    ...plan.deferred.flatMap((d) => [d.title, d.reason]),
  ]
    .map((s) => normalizePdfPunctuation(s || ''))
    .join(' ');

  return /[^\u0000-\u00FF]/.test(samplePool);
}

function buildPdfFileName(dateLabel: string): string {
  const slug = dateLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `dayline-schedule-${slug || 'today'}.pdf`;
}

function triggerPdfBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function capitalize(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text.trim()) return [];
  const tokens = text.includes(' ') ? text.split(/\s+/) : Array.from(text);
  const joiner = text.includes(' ') ? ' ' : '';
  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current}${joiner}${token}` : token;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = token;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function generateMultilingualCanvasPdf(plan: DayPlan): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidthPx = 1240; // ~150 DPI A4 width
  const pageHeightPx = 1754;
  const marginX = 106;
  const contentWidth = pageWidthPx - marginX * 2;
  const bottomLimit = pageHeightPx - 120;

  const pages: HTMLCanvasElement[] = [];
  let canvas = document.createElement('canvas');
  canvas.width = pageWidthPx;
  canvas.height = pageHeightPx;
  let ctx = canvas.getContext('2d')!;

  const initPage = (targetCanvas: HTMLCanvasElement) => {
    const context = targetCanvas.getContext('2d')!;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, pageWidthPx, pageHeightPx);
    return context;
  };

  ctx = initPage(canvas);
  pages.push(canvas);
  let y = 104;

  const startNewPage = () => {
    canvas = document.createElement('canvas');
    canvas.width = pageWidthPx;
    canvas.height = pageHeightPx;
    ctx = initPage(canvas);
    pages.push(canvas);
    y = 100;
  };

  const totalMinutes = plan.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const breakMinutes = plan.blocks
    .filter((b) => b.category === BlockCategory.Break)
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const workMinutes = totalMinutes - breakMinutes;
  const completedCount = plan.blocks.filter((b) => b.completed).length;
  const windowMins = calculateWindowMinutes(plan.startWindow, plan.finishWindow);

  // Overline
  ctx.fillStyle = '#1D4ED8';
  ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('DAYLINE · DAILY SCHEDULE', marginX, y);
  y += 42;

  // Title
  ctx.fillStyle = '#0B192C';
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Daily Schedule — ${plan.dateLabel}`, marginX, y);
  y += 34;

  // Metadata line
  ctx.fillStyle = '#475569';
  ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const metaLine = `Window: ${plan.startWindow} – ${plan.finishWindow} (${formatDurationHuman(windowMins)})   ·   Energy: ${capitalize(plan.energy)}   ·   ${formatDurationHuman(workMinutes)} tasks, ${formatDurationHuman(breakMinutes)} breaks   ·   ${completedCount}/${plan.blocks.length} done`;
  ctx.fillText(metaLine, marginX, y);
  y += 28;

  if (plan.summaryNote) {
    ctx.font = '400 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    const noteLines = wrapCanvasLines(ctx, plan.summaryNote, contentWidth);
    for (const line of noteLines) {
      y += 26;
      ctx.fillText(line, marginX, y);
    }
    y += 18;
  }

  // Table header divider
  y += 18;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(marginX, y, contentWidth, 44);
  ctx.strokeStyle = '#0B192C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, y + 44);
  ctx.lineTo(marginX + contentWidth, y + 44);
  ctx.stroke();

  ctx.fillStyle = '#0B192C';
  ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('DONE', marginX + 12, y + 29);
  ctx.fillText('TIME', marginX + 94, y + 29);
  ctx.fillText('TASK & DETAILS', marginX + 310, y + 29);
  y += 56;

  for (const block of plan.blocks) {
    const isBreak = block.category === BlockCategory.Break;
    ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const titleLines = wrapCanvasLines(ctx, block.title, contentWidth - 324);

    ctx.font = '400 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const noteLines = block.note
      ? wrapCanvasLines(ctx, block.note, contentWidth - 324)
      : [];

    const rowHeight =
      Math.max(66, 28 + titleLines.length * 28 + 24 + noteLines.length * 24) + 12;

    if (y + rowHeight > bottomLimit) {
      startNewPage();
    }

    if (isBreak) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(marginX, y - 8, contentWidth, rowHeight);
    }

    // Checkbox
    const boxX = marginX + 18;
    const boxY = y + 8;
    ctx.strokeStyle = block.completed ? '#15803D' : '#64748B';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, 22, 22);
    if (block.completed) {
      ctx.beginPath();
      ctx.moveTo(boxX + 4, boxY + 11);
      ctx.lineTo(boxX + 9, boxY + 17);
      ctx.lineTo(boxX + 18, boxY + 5);
      ctx.stroke();
    }

    // Time & duration
    ctx.fillStyle = block.completed ? '#64748B' : '#0B192C';
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.fillText(`${block.startTime} – ${block.endTime}`, marginX + 94, y + 25);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 17px "JetBrains Mono", monospace';
    ctx.fillText(`${block.durationMinutes}m`, marginX + 94, y + 50);

    // Task title
    let textY = y + 25;
    ctx.fillStyle = block.completed ? '#64748B' : '#0B192C';
    ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    for (const line of titleLines) {
      ctx.fillText(line, marginX + 310, textY);
      textY += 28;
    }

    // Meta line
    const tags = resolveBlockTags(block).map((t) => `#${t}`).join('  ');
    const subMeta = [
      capitalize(block.category),
      !isBreak ? `${block.energyDemand} energy` : 'Recovery',
      tags,
    ]
      .filter(Boolean)
      .join(' · ');

    ctx.fillStyle = '#475569';
    ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(subMeta, marginX + 310, textY - 2);
    textY += 24;

    if (noteLines.length > 0) {
      ctx.fillStyle = '#64748B';
      ctx.font = '400 18px "Plus Jakarta Sans", system-ui, sans-serif';
      for (const nLine of noteLines) {
        ctx.fillText(nLine, marginX + 310, textY - 2);
        textY += 24;
      }
    }

    y += rowHeight;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX, y - 6);
    ctx.lineTo(marginX + contentWidth, y - 6);
    ctx.stroke();
  }

  // Deferred section
  if (plan.deferred.length > 0) {
    if (y + 130 > bottomLimit) {
      startNewPage();
    }
    y += 32;
    ctx.fillStyle = '#0B192C';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`Deferred for Tomorrow (${plan.deferred.length})`, marginX, y);
    y += 28;

    for (const item of plan.deferred) {
      ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
      const dLines = wrapCanvasLines(
        ctx,
        `${item.title} (~${item.estimatedMinutes}m) — ${item.reason}`,
        contentWidth - 48
      );
      const needed = dLines.length * 26 + 18;
      if (y + needed > bottomLimit) {
        startNewPage();
      }
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2;
      ctx.strokeRect(marginX + 10, y - 16, 18, 18);

      ctx.fillStyle = '#334155';
      ctx.font = '500 19px "Plus Jakarta Sans", system-ui, sans-serif';
      for (const dl of dLines) {
        ctx.fillText(dl, marginX + 42, y);
        y += 26;
      }
      y += 8;
    }
  }

  // Footers & assemble PDF pages
  pages.forEach((pCanvas, idx) => {
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.strokeStyle = '#CBD5E1';
    pCtx.lineWidth = 1.5;
    pCtx.beginPath();
    pCtx.moveTo(marginX, pageHeightPx - 82);
    pCtx.lineTo(marginX + contentWidth, pageHeightPx - 82);
    pCtx.stroke();

    pCtx.fillStyle = '#64748B';
    pCtx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
    pCtx.fillText(
      `Dayline Daily Schedule · ${plan.dateLabel}`,
      marginX,
      pageHeightPx - 50
    );
    const pageStr = `Page ${idx + 1} of ${pages.length}`;
    const w = pCtx.measureText(pageStr).width;
    pCtx.fillText(pageStr, marginX + contentWidth - w, pageHeightPx - 50);

    if (idx > 0) doc.addPage();
    const dataUrl = pCanvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
  });

  return doc.output('blob');
}

export function generatePlanPdfBlob(plan: DayPlan): Blob {
  if (hasNonLatin1Glyphs(plan)) {
    return generateMultilingualCanvasPdf(plan);
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2; // 178mm
  const bottomLimit = pageHeight - 22;

  const colCheckX = marginX + 2.5;
  const colTimeX = marginX + 12;
  const colTaskX = marginX + 49;
  const taskMaxWidth = marginX + contentWidth - colTaskX - 2; // 127mm

  let y = 18;

  const totalMinutes = plan.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const breakMinutes = plan.blocks
    .filter((b) => b.category === BlockCategory.Break)
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const workMinutes = totalMinutes - breakMinutes;
  const completedCount = plan.blocks.filter((b) => b.completed).length;
  const windowMins = calculateWindowMinutes(plan.startWindow, plan.finishWindow);

  // Header Overline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(29, 78, 216); // Royal Cobalt #1D4ED8
  doc.text('DAYLINE  |  DAILY SCHEDULE', marginX, y);
  y += 7;

  // Main Schedule Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(11, 25, 44); // Oxford Navy #0B192C
  doc.text(
    normalizePdfPunctuation(`Daily Schedule - ${plan.dateLabel}`),
    marginX,
    y
  );
  y += 6.5;

  // Metadata Summary Strip
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105); // Slate 600
  const metaSummary = normalizePdfPunctuation(
    `Window: ${plan.startWindow} - ${plan.finishWindow} (${formatDurationHuman(windowMins)})   |   Energy: ${capitalize(plan.energy)}   |   Workload: ${formatDurationHuman(workMinutes)} tasks, ${formatDurationHuman(breakMinutes)} breaks   |   Completed: ${completedCount}/${plan.blocks.length}`
  );
  doc.text(metaSummary, marginX, y);
  y += 5.5;

  // Summary Note if available
  if (plan.summaryNote && plan.summaryNote.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const wrappedSummary: string[] = doc.splitTextToSize(
      normalizePdfPunctuation(plan.summaryNote.trim()),
      contentWidth
    );
    doc.text(wrappedSummary, marginX, y);
    y += wrappedSummary.length * 4.5 + 2;
  } else {
    y += 2;
  }

  const drawTableHeader = (topY: number): number => {
    doc.setFillColor(241, 245, 249); // Soft Slate #F1F5F9
    doc.rect(marginX, topY, contentWidth, 7.5, 'F');

    doc.setDrawColor(11, 25, 44);
    doc.setLineWidth(0.4);
    doc.line(marginX, topY + 7.5, marginX + contentWidth, topY + 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(11, 25, 44);
    doc.text('DONE', marginX + 1.5, topY + 5);
    doc.text('TIME', colTimeX, topY + 5);
    doc.text('TASK & DETAILS', colTaskX, topY + 5);

    return topY + 10.5;
  };

  y = drawTableHeader(y);

  // Schedule Rows
  for (const block of plan.blocks) {
    const isBreak = block.category === BlockCategory.Break;
    const cleanTitle = normalizePdfPunctuation(block.title);
    const cleanNote = block.note ? normalizePdfPunctuation(block.note.trim()) : '';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const titleLines: string[] = doc.splitTextToSize(cleanTitle, taskMaxWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const noteLines: string[] = cleanNote
      ? doc.splitTextToSize(cleanNote, taskMaxWidth)
      : [];

    const titleHeight = titleLines.length * 4.6;
    const metaHeight = 4.2;
    const noteHeight = noteLines.length > 0 ? noteLines.length * 3.9 + 0.8 : 0;
    const rowContentHeight = Math.max(9.5, titleHeight + metaHeight + noteHeight);
    const rowTotalHeight = rowContentHeight + 4.5;

    if (y + rowTotalHeight > bottomLimit) {
      doc.addPage();
      y = 18;
      y = drawTableHeader(y);
    }

    // Subtle printable shading for Break rows
    if (isBreak) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y - 2, contentWidth, rowTotalHeight, 'F');
    }

    // Printable Checkbox
    const boxSize = 3.8;
    const boxY = y + 0.4;
    if (block.completed) {
      doc.setDrawColor(21, 128, 61); // Emerald #15803D
      doc.setLineWidth(0.35);
      doc.rect(colCheckX, boxY, boxSize, boxSize);
      // Crisp vector checkmark
      doc.setLineWidth(0.45);
      doc.line(colCheckX + 0.8, boxY + 2.0, colCheckX + 1.6, boxY + 2.9);
      doc.line(colCheckX + 1.6, boxY + 2.9, colCheckX + 3.1, boxY + 0.9);
    } else {
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.3);
      doc.rect(colCheckX, boxY, boxSize, boxSize);
    }

    // Start - End Time & Duration
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    if (block.completed) {
      doc.setTextColor(100, 116, 139);
    } else if (isBreak) {
      doc.setTextColor(51, 65, 85);
    } else {
      doc.setTextColor(11, 25, 44);
    }
    doc.text(`${block.startTime} - ${block.endTime}`, colTimeX, y + 3.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${block.durationMinutes} min`, colTimeX, y + 7.4);

    // Task Title
    let cursorY = y + 3.4;
    doc.setFont('helvetica', isBreak ? 'normal' : 'bold');
    doc.setFontSize(10.5);
    if (block.completed) {
      doc.setTextColor(100, 116, 139);
    } else {
      doc.setTextColor(11, 25, 44);
    }
    const displayTitleLines =
      block.completed && titleLines.length > 0
        ? [titleLines[0] + (titleLines.length === 1 ? '  [Done]' : ''), ...titleLines.slice(1)]
        : titleLines;
    doc.text(displayTitleLines, colTaskX, cursorY);
    cursorY += titleHeight + 0.3;

    // Task Category, Energy & Tags
    const tags = resolveBlockTags(block)
      .map((t) => `#${normalizePdfPunctuation(t)}`)
      .join('  ');
    const detailMeta = [
      capitalize(block.category),
      isBreak ? 'Recovery' : `${block.energyDemand} energy`,
      tags,
    ]
      .filter(Boolean)
      .join('  |  ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(29, 78, 216);
    doc.text(detailMeta, colTaskX, cursorY + 2.8);
    cursorY += metaHeight;

    // Optional Task Note
    if (noteLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(noteLines, colTaskX, cursorY + 2.8);
    }

    y += rowTotalHeight;

    // Row Bottom Hairline Rule
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, y - 2, marginX + contentWidth, y - 2);
  }

  // Deferred Overflow Section (if present)
  if (plan.deferred.length > 0) {
    if (y + 24 > bottomLimit) {
      doc.addPage();
      y = 18;
    } else {
      y += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(11, 25, 44);
    doc.text(
      `Deferred for Tomorrow (${plan.deferred.length})`,
      marginX,
      y
    );
    y += 2.5;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 5;

    for (const item of plan.deferred) {
      const itemHeading = normalizePdfPunctuation(
        `${item.title} (~${item.estimatedMinutes}m)`
      );
      const itemReason = item.reason
        ? normalizePdfPunctuation(item.reason.trim())
        : '';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const headingLines: string[] = doc.splitTextToSize(
        itemHeading,
        contentWidth - 9
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const reasonLines: string[] = itemReason
        ? doc.splitTextToSize(itemReason, contentWidth - 9)
        : [];

      const itemHeight =
        headingLines.length * 4.2 +
        (reasonLines.length > 0 ? reasonLines.length * 3.8 + 1 : 0) +
        3;

      if (y + itemHeight > bottomLimit) {
        doc.addPage();
        y = 18;
      }

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.28);
      doc.rect(colCheckX, y - 2.8, 3.3, 3.3);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(11, 25, 44);
      doc.text(headingLines, marginX + 9, y);
      y += headingLines.length * 4.2;

      if (reasonLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(reasonLines, marginX + 9, y);
        y += reasonLines.length * 3.8 + 1;
      }

      y += 2;
    }
  }

  // Page Footers with Page X of Y
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 14, marginX + contentWidth, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      normalizePdfPunctuation(`Dayline Daily Schedule  |  ${plan.dateLabel}`),
      marginX,
      pageHeight - 9.5
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      marginX + contentWidth,
      pageHeight - 9.5,
      { align: 'right' }
    );
  }

  return doc.output('blob');
}

export function exportPlanToPdf(plan: DayPlan): void {
  const blob = generatePlanPdfBlob(plan);
  const fileName = buildPdfFileName(plan.dateLabel);
  triggerPdfBlobDownload(blob, fileName);
}
