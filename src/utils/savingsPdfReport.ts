import { jsPDF } from 'jspdf';
import { SavingsAnalysisResult, SavingsInputs } from '../types';

function formatZar(val: number): string {
  return `R ${val.toLocaleString('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function formatZarDecimal(val: number): string {
  return `R ${val.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDriveMins(mins: number): string {
  const abs = Math.round(Math.abs(mins));
  const hrs = Math.floor(abs / 60);
  const rem = abs % 60;
  const sign = mins < 0 ? '-' : '';
  return hrs > 0 ? `${sign}${hrs}h ${rem}m` : `${sign}${rem} min`;
}

function baselineModeLabel(mode: SavingsInputs['baselineMode']): string {
  if (mode === 'suburb') return 'Stops ordered by suburb (A-Z)';
  if (mode === 'alphabetical') return 'Stops ordered alphabetically (A-Z)';
  return 'Pasted customer stop order';
}

export function downloadOnePageSavingsPdf(params: {
  businessName: string;
  inputs: SavingsInputs;
  analysis: SavingsAnalysisResult;
}): void {
  const { businessName, inputs, analysis } = params;
  const cleanBusiness = (businessName || 'Hamba Routes').trim() || 'Hamba Routes';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(245, 158, 11); // Amber 500
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('HAMBA ROUTES  |  WEEKLY RAND SAVINGS PROOF REPORT', margin, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(`${cleanBusiness} — Route Savings Summary`, margin, 18);

  const nowSast = new Date().toLocaleDateString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Generated: ${nowSast} (SAST)   ·   Selected week: ${analysis.visitCount} visits across ${analysis.fleetSize} vehicles (Mon–Fri)`,
    margin,
    24
  );

  y = 35;

  // SECTION 1: Inputs & Assumptions (Every input listed; user-entered labelled "your assumption")
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. Inputs & Assumptions', margin, y);
  y += 4;

  const inputRows: Array<{ label: string; value: string; origin: string }> = [
    {
      label: 'Current way of working (baseline)',
      value: baselineModeLabel(inputs.baselineMode),
      origin: 'your assumption'
    },
    {
      label: 'Fuel price per litre',
      value: `${formatZarDecimal(inputs.fuelPricePerLitre)} / L`,
      origin: 'your assumption'
    },
    {
      label: 'Vehicle fuel consumption',
      value: `${inputs.fuelConsumptionLPer100Km.toFixed(1)} L / 100 km (${formatZarDecimal(analysis.fuelCostPerKmZar)}/km)`,
      origin: 'your assumption'
    },
    {
      label: 'Working days per month',
      value: `${inputs.workingDaysPerMonth} working days`,
      origin: 'your assumption'
    },
    {
      label: 'Average price per visit',
      value: formatZarDecimal(inputs.avgPricePerVisitZar),
      origin: 'your assumption'
    },
    {
      label: 'Gross margin %',
      value: `${inputs.grossMarginPercent.toFixed(0)}%`,
      origin: 'your assumption'
    },
    {
      label: 'Monthly fee tested for break-even',
      value: formatZarDecimal(inputs.breakEvenMonthlyFeeZar),
      origin: 'your assumption'
    },
    {
      label: 'Selected week visits & fleet scope',
      value: `${analysis.visitCount} scheduled visits, ${analysis.fleetSize} vehicles (avg ${Math.round(analysis.avgVisitLengthMinutes)} min/visit)`,
      origin: 'from route schedule'
    }
  ];

  // Draw table header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Input Parameter', margin + 2, y + 4.2);
  doc.text('Value', margin + 74, y + 4.2);
  doc.text('Basis', margin + 148, y + 4.2);
  y += 6;

  doc.setFontSize(8);
  inputRows.forEach((row, idx) => {
    const rowH = 5.6;
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, rowH);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(row.label, margin + 2, y + 3.9);

    doc.setFont('helvetica', 'bold');
    doc.text(row.value, margin + 74, y + 3.9);

    if (row.origin === 'your assumption') {
      doc.setTextColor(180, 83, 9); // Amber 700
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
    }
    doc.text(row.origin, margin + 148, y + 3.9);
    y += rowH;
  });

  y += 7;

  // SECTION 2: BEFORE vs AFTER Route Comparison (Selected Week)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('2. Selected Week: BEFORE (Baseline) vs AFTER (Hamba Order)', margin, y);
  y += 4;

  const colW = contentWidth / 5;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 6.2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 6.2);
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Metric', margin + 2, y + 4.3);
  doc.text('BEFORE (Baseline)', margin + colW, y + 4.3);
  doc.text('AFTER (Hamba)', margin + colW * 2, y + 4.3);
  doc.text('Saved / Week', margin + colW * 3, y + 4.3);
  doc.text(`Saved / ${inputs.workingDaysPerMonth} Days`, margin + colW * 4, y + 4.3);
  y += 6.2;

  const beforeAfterRows = [
    [
      'Fleet Distance',
      `${analysis.beforeWeekKm.toFixed(1)} km`,
      `${analysis.afterWeekKm.toFixed(1)} km`,
      `${analysis.kmSavedWeek.toFixed(1)} km`,
      `${analysis.kmSavedPerMonth.toFixed(1)} km`
    ],
    [
      'Drive Time',
      formatDriveMins(analysis.beforeWeekDriveMinutes),
      formatDriveMins(analysis.afterWeekDriveMinutes),
      formatDriveMins(analysis.driveMinutesSavedWeek),
      formatDriveMins(analysis.driveMinutesSavedPerMonth)
    ]
  ];

  beforeAfterRows.forEach((cols) => {
    const rowH = 6.2;
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, rowH);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(cols[0], margin + 2, y + 4.3);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(cols[1], margin + colW, y + 4.3);

    doc.setTextColor(15, 23, 42);
    doc.text(cols[2], margin + colW * 2, y + 4.3);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105); // Emerald 600
    doc.text(cols[3], margin + colW * 3, y + 4.3);
    doc.text(cols[4], margin + colW * 4, y + 4.3);
    y += rowH;
  });

  y += 7;

  // SECTION 3: Three Separate Numbers (Never Added Together)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('3. Three Separate Monthly Value Proof Numbers (Never Added Together)', margin, y);
  y += 4;

  const gap = 4;
  const boxW = (contentWidth - gap * 2) / 3;
  const boxH = 30;

  // Box (a)
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.rect(margin, y, boxW, boxH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(6, 95, 70);
  doc.text('(a) Fuel saved / month', margin + 3, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(4, 120, 87);
  doc.text(formatZar(analysis.fuelSavedPerMonthZar), margin + 3, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`${Math.max(0, analysis.kmSavedPerMonth).toFixed(0)} km saved / mo`, margin + 3, y + 21);
  doc.text(`${analysis.litresSavedPerMonth.toFixed(0)} L @ ${formatZarDecimal(inputs.fuelPricePerLitre)}/L`, margin + 3, y + 25.5);

  // Box (b)
  const bx2 = margin + boxW + gap;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.rect(bx2, y, boxW, boxH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('(b) Extra visits possible', bx2 + 3, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text(`${analysis.extraVisitsPossiblePerMonth.toFixed(1)} visits/mo`, bx2 + 3, y + 14.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(180, 83, 9);
  doc.text('only if you have customers to fill them', bx2 + 3, y + 20.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Extra profit: ${formatZar(analysis.extraProfitPerMonthZar)}/mo`, bx2 + 3, y + 25.5);

  // Box (c)
  const bx3 = margin + (boxW + gap) * 2;
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.rect(bx3, y, boxW, boxH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(146, 64, 14);
  doc.text('(c) Fee check (25% of fuel)', bx3 + 3, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(180, 83, 9);
  doc.text(`${formatZar(analysis.maxFeeAt25PctZar)} / mo`, bx3 + 3, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Highest monthly fee at 25%', bx3 + 3, y + 21);
  doc.text('of monthly fuel saving alone', bx3 + 3, y + 25.5);

  y += boxH + 7;

  // SECTION 4: Low / Base / High (-30% / 0% / +30%)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('4. Sensitivity Range: Low (-30%) / Base (0%) / High (+30%)', margin, y);
  y += 4;

  const sColW = contentWidth / 5;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 6.2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 6.2);
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Scenario', margin + 2, y + 4.3);
  doc.text('Km Saved / Mo', margin + sColW, y + 4.3);
  doc.text('(a) Fuel Saved', margin + sColW * 2, y + 4.3);
  doc.text('(b) Extra Visits & Profit*', margin + sColW * 3, y + 4.3);
  doc.text('(c) Fee Check (25%)', margin + sColW * 4, y + 4.3);
  y += 6.2;

  analysis.scenarios.forEach((sc, idx) => {
    const rowH = 6.2;
    if (idx === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, rowH);

    doc.setFont('helvetica', idx === 1 ? 'bold' : 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(sc.label, margin + 2, y + 4.3);
    doc.text(`${sc.kmSavedPerMonth.toFixed(0)} km`, margin + sColW, y + 4.3);
    doc.setTextColor(4, 120, 87);
    doc.text(`${formatZar(sc.fuelSavedPerMonthZar)}/mo`, margin + sColW * 2, y + 4.3);
    doc.setTextColor(29, 78, 216);
    doc.text(
      `${sc.extraVisitsPossiblePerMonth.toFixed(1)} (${formatZar(sc.extraProfitPerMonthZar)})`,
      margin + sColW * 3,
      y + 4.3
    );
    doc.setTextColor(180, 83, 9);
    doc.text(`${formatZar(sc.maxFeeAt25PctZar)}/mo`, margin + sColW * 4, y + 4.3);
    y += rowH;
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  doc.text('* Extra visits & extra profit apply only if you have customers to fill them.', margin, y + 4);
  y += 10;

  // SECTION 5: Break-even line
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 18, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Break-Even Line (Fuel Saving Only)', margin + 3, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `To cover a monthly fee of ${formatZarDecimal(inputs.breakEvenMonthlyFeeZar)} (your assumption), the fleet must save ${analysis.breakEvenKmPerDay.toFixed(1)} km per day`,
    margin + 3,
    y + 11.5
  );
  doc.text(
    `(${analysis.breakEvenKmPerMonth.toFixed(0)} km/month at ${formatZarDecimal(analysis.fuelCostPerKmZar)}/km over ${inputs.workingDaysPerMonth} days). Current week saves ${Math.max(0, analysis.kmSavedPerDay).toFixed(1)} km/day.`,
    margin + 3,
    y + 15.8
  );

  // Required closing disclaimer footer on single page
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, 276, pageWidth - margin, 276);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Figures are estimates based on the inputs shown.', margin, 282);

  const safeSlug = cleanBusiness.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hamba-routes';
  doc.save(`${safeSlug}-savings-report.pdf`);
}
