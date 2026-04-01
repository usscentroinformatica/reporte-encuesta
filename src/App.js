import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  ArcElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

const IGNORED_COLUMNS = [
  'marca temporal', 'fecha', 'hora', 'timestamp', 'time',
  'nombre', 'apellido', 'correo', 'email', 'dni', 'documento', 'identificación', 'id',
  'puntuación', 'score'
];

const DEMOGRAPHIC_KEYWORDS = [
  'metodología', 'metodologia', 'docente', 'profesor', 'curso', 'asignatura', 'materia',
  'pead', 'modalidad', 'sede', 'carrera', 'programa',
  'turno', 'facultad', 'grupo', 'ciclo'
];

function App() {
  const [originalData, setOriginalData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [activeFilters, setActiveFilters] = useState({});
  const [chartColumn, setChartColumn] = useState('');
  const [mainFileName, setMainFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingFullReport, setIsGeneratingFullReport] = useState(false);

  // Estados para comparación
  const [secondFileData, setSecondFileData] = useState(null);
  const [secondFileName, setSecondFileName] = useState('');
  const [secondFileTotal, setSecondFileTotal] = useState(0);
  const [secondFileHeaders, setSecondFileHeaders] = useState([]);
  const [filteredSecondData, setFilteredSecondData] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);

  // Variables dinámicas para el cálculo de tasas
  const [totalStudentsMain, setTotalStudentsMain] = useState(1173);
  const [totalStudentsComp, setTotalStudentsComp] = useState(1173);

  const pieRef = useRef(null);
  const barRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setMainFileName(file.name);
    processFile(file, true);
  };

  const handleSecondFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setSecondFileName(file.name);
    processFile(file, false);
  };

  const processFile = (file, isFirstFile) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);

      if (jsonData.length > 0) {
        let headersList = Object.keys(jsonData[0]);

        let courseCol = headersList.find(h => {
          const l = h.toLowerCase();
          return l.includes('curso') || l.includes('módulo') || l.includes('modulo') || l.includes('asignatura') || l.includes('programa') || l.includes('materia') || l.includes('especialidad');
        });

        if (!courseCol && jsonData.length > 0) {
          for (let h of headersList) {
            for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
              const val = (jsonData[i][h] || '').toString().toLowerCase();
              if (val.includes('computacion') || val.includes('computación') || val.includes('word') || val.includes('excel') || val.includes('protech')) {
                courseCol = h;
                break;
              }
            }
            if (courseCol) break;
          }
        }

        if (courseCol) {
          jsonData.forEach(row => {
            const val = (row[courseCol] || '').toString().toLowerCase();
            const isTraditional = val.includes('computación') || val.includes('computacion');

            if (isTraditional) {
              row['Metodología'] = 'Tradicional';
            } else {
              row['Metodología'] = 'Protech XP';
            }
          });

          if (!headersList.includes('Metodología')) {
            headersList.unshift('Metodología');
          }
        } else {
          jsonData.forEach(row => { row['Metodología'] = 'Protech XP'; });
          if (!headersList.includes('Metodología')) { headersList.unshift('Metodología'); }
        }

        if (isFirstFile) {
          setOriginalData(jsonData);
          setFilteredData(jsonData);
          setHeaders(headersList);
          setActiveFilters({});
          setChartColumn('');
        } else {
          setSecondFileData(jsonData);
          let compResult = jsonData;
          Object.entries(activeFilters).forEach(([col, val]) => {
            compResult = compResult.filter(row => row[col] === val);
          });
          setFilteredSecondData(compResult);
          setSecondFileTotal(jsonData.length);
          setSecondFileHeaders(headersList);
        }
      } else {
        alert('El archivo está vacío o no tiene datos válidos');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      processFile(file, true);
    } else {
      alert('Por favor sube un archivo Excel o CSV válido');
    }
  };

  const applyFilter = (column, value) => {
    if (!column || value === undefined) return;
    const newFilters = { ...activeFilters, [column]: value };
    setActiveFilters(newFilters);
    applyAllFilters(newFilters);
  };

  const removeFilter = (column) => {
    const newFilters = { ...activeFilters };
    delete newFilters[column];
    setActiveFilters(newFilters);
    applyAllFilters(newFilters);
  };

  const applyAllFilters = (filters) => {
    let result = originalData;
    let result2 = secondFileData;
    Object.entries(filters).forEach(([col, val]) => {
      result = result.filter(row => row[col] === val);
      if (result2) {
        result2 = result2.filter(row => row[col] === val);
      }
    });
    setFilteredData(result);
    if (result2) {
      setFilteredSecondData(result2);
    }
  };

  const clearFilters = () => {
    setFilteredData(originalData);
    if (secondFileData) setFilteredSecondData(secondFileData);
    setActiveFilters({});
  };

  const getAvailableValuesForFilter = (column) => {
    if (!column) return [];

    let baseData = originalData;
    let baseCompData = secondFileData || [];

    Object.entries(activeFilters).forEach(([col, val]) => {
      if (col !== column) {
        baseData = baseData.filter(row => row[col] === val);
        baseCompData = baseCompData.filter(row => row[col] === val);
      }
    });

    const baseVals = baseData.map(row => row[column]);
    const compVals = baseCompData.map(row => row[column]);

    return [...new Set([...baseVals, ...compVals])].filter(val => val !== undefined && val !== null);
  };

  const generateColors = (count) => {
    const palette = [
      '#4361ee', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
      '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
      '#6366f1', '#a855f7'
    ];
    let colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(palette[i % palette.length]);
    }
    return colors;
  };

  const getChartDataForColumn = (column, data) => {
    if (!column || !data || data.length === 0) return null;

    const ObjectCounts = {};
    data.forEach(row => {
      let value = row[column];
      if (value === undefined || value === null) {
        value = '(vacío)';
      }
      value = String(value);
      ObjectCounts[value] = (ObjectCounts[value] || 0) + 1;
    });

    const sortedEntries = Object.entries(ObjectCounts).sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(e => e[0]);
    const values = sortedEntries.map(e => e[1]);

    return {
      labels: labels,
      columnName: column,
      counts: ObjectCounts,
      total: values.reduce((a, b) => a + b, 0)
    };
  };

  const getChartData = () => {
    if (filteredData.length === 0 || headers.length === 0) return null;

    let categoricalColumn = chartColumn;

    const availableHeaders = headers.filter(h => {
      const lower = h.toLowerCase();
      return !IGNORED_COLUMNS.some(w => lower.includes(w)) && !DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw));
    });

    if (!categoricalColumn) {
      categoricalColumn = availableHeaders.find(header => {
        const values = filteredData.map(row => row[header]);
        const unique = new Set(values);
        return unique.size <= 15 && unique.size > 1;
      });
    }

    if (!categoricalColumn && availableHeaders.length > 0) {
      categoricalColumn = availableHeaders[0];
    }
    if (!categoricalColumn) return null;

    const chartData = getChartDataForColumn(categoricalColumn, filteredData);
    if (!chartData) return null;

    return {
      ...chartData,
      datasets: [{
        label: 'Frecuencia',
        data: Object.values(chartData.counts),
        backgroundColor: generateColors(chartData.labels.length),
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    };
  };

  const chartData = getChartData();

  const getCombinedBarData = () => {
    if (!chartData) return null;
    if (!secondFileData || !filteredSecondData) return chartData;

    const secondData = getChartDataForColumn(chartData.columnName, filteredSecondData);
    if (!secondData) return chartData;

    const allLabels = [...new Set([...chartData.labels, ...secondData.labels])];

    const data1 = allLabels.map(l => chartData.counts[l] || 0);
    const data2 = allLabels.map(l => secondData.counts[l] || 0);

    return {
      labels: allLabels,
      datasets: [
        {
          label: mainFileName ? mainFileName.split('.')[0] : 'Encuesta 1',
          data: data1,
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        {
          label: secondFileName ? secondFileName.split('.')[0] : 'Encuesta 2',
          data: data2,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };
  };
  const combinedBarData = getCombinedBarData();

  const getSecondPieData = () => {
    if (!chartData || !secondFileData || !filteredSecondData) return null;
    const secondData = getChartDataForColumn(chartData.columnName, filteredSecondData);
    if (!secondData) return null;
    return {
      ...secondData,
      datasets: [{
        label: 'Frecuencia',
        data: Object.values(secondData.counts),
        backgroundColor: generateColors(secondData.labels.length),
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    };
  };
  const secondPieData = getSecondPieData();

  const filterableHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    return !IGNORED_COLUMNS.some(w => lower.includes(w));
  });

  const demographicHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    return DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw));
  });

  const questionHeaders = filterableHeaders.filter(h => !demographicHeaders.includes(h) && h !== 'Metodología');

  const performComparison = () => {
    if (!secondFileData) {
      alert('Primero debes cargar el segundo archivo para comparar');
      return;
    }

    // Obtener TODAS las preguntas de AMBOS archivos (unión)
    const firstQuestions = questionHeaders;
    const secondQuestions = secondFileHeaders.filter(h => {
      const lower = h.toLowerCase();
      return !IGNORED_COLUMNS.some(w => lower.includes(w)) &&
        !DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw)) &&
        h !== 'Metodología';
    });

    // Unión de todas las preguntas de ambos archivos
    const allQuestions = [...new Set([...firstQuestions, ...secondQuestions])];

    const results = [];

    allQuestions.forEach(question => {
      const firstData = getChartDataForColumn(question, filteredData);
      const secondData = getChartDataForColumn(question, filteredSecondData);

      // Si la pregunta existe en al menos un archivo
      if (firstData || secondData) {
        // Obtener todas las opciones de ambos archivos
        const allLabels = [...new Set([
          ...(firstData ? firstData.labels : []),
          ...(secondData ? secondData.labels : [])
        ])];

        const comparison = {
          question: cleanQuestionTitle(question),
          labels: allLabels,
          firstExists: !!firstData,
          secondExists: !!secondData,
          firstPercentages: {},
          secondPercentages: {},
          firstCounts: {},
          secondCounts: {},
          firstTotal: firstData ? firstData.total : 0,
          secondTotal: secondData ? secondData.total : 0
        };

        allLabels.forEach(label => {
          const firstCount = firstData ? (firstData.counts[label] || 0) : 0;
          const secondCount = secondData ? (secondData.counts[label] || 0) : 0;
          comparison.firstCounts[label] = firstCount;
          comparison.secondCounts[label] = secondCount;
          comparison.firstPercentages[label] = firstData ? ((firstCount / firstData.total) * 100).toFixed(1) : '0.0';
          comparison.secondPercentages[label] = secondData ? ((secondCount / secondData.total) * 100).toFixed(1) : '0.0';
        });

        results.push(comparison);
      }
    });

    setComparisonResults(results);
  };

  const generateComparisonPDF = () => {
    if (!comparisonResults) return;

    setIsGeneratingFullReport(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(20);
        doc.setTextColor(67, 97, 238);
        doc.text("Reporte Comparativo de Encuestas", 15, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const rate1 = ((filteredData.length / totalStudentsMain) * 100).toFixed(1);
        const rate2 = ((filteredSecondData.length / totalStudentsComp) * 100).toFixed(1);
        doc.text(`Encuesta 1: ${filteredData.length} resp. (${rate1}% de ${totalStudentsMain}) vs Encuesta 2: ${filteredSecondData.length} resp. (${rate2}% de ${totalStudentsComp})`, 15, 28);
        doc.text(`Generado por Centro de Informática USS`, 15, 36);

        let currentY = 48;

        comparisonResults.forEach((item, idx) => {
          if (currentY > pageHeight - 100) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(12);
          doc.setTextColor(67, 97, 238);
          doc.setFont(undefined, 'bold');

          // Indicar si la pregunta existe en ambas encuestas
          let titleText = `${idx + 1}. ${item.question}`;
          if (!item.firstExists) {
            titleText += ` (Solo en Encuesta 2)`;
          } else if (!item.secondExists) {
            titleText += ` (Solo en Encuesta 1)`;
          }

          const questionLines = doc.splitTextToSize(titleText, 180);
          doc.text(questionLines, 15, currentY);
          currentY += (questionLines.length * 6) + 6;

          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.setFont(undefined, 'bold');
          doc.text("Comparativa de porcentajes:", 15, currentY);
          currentY += 5;

          // Encabezados
          doc.setFillColor(241, 245, 249);
          doc.rect(15, currentY, 180, 7, 'F');
          doc.setFont(undefined, 'bold');
          doc.setTextColor(67, 97, 238);
          doc.text("Opción", 18, currentY + 5);
          doc.text("Encuesta 1", 110, currentY + 5);
          doc.text("Encuesta 2", 150, currentY + 5);
          if (item.firstExists && item.secondExists) {
            doc.text("Diferencia", 175, currentY + 5);
          }
          currentY += 7;

          doc.setFont(undefined, 'normal');
          doc.setTextColor(44, 62, 80);

          for (let i = 0; i < item.labels.length; i++) {
            const label = item.labels[i];
            const p1 = item.firstPercentages[label];
            const p2 = item.secondPercentages[label];
            const diff = (parseFloat(p2) - parseFloat(p1)).toFixed(1);

            if (currentY > pageHeight - 40 && i < item.labels.length - 1) {
              doc.addPage();
              currentY = 20;
              doc.setFillColor(241, 245, 249);
              doc.rect(15, currentY, 180, 7, 'F');
              doc.setFont(undefined, 'bold');
              doc.setTextColor(67, 97, 238);
              doc.text("Opción", 18, currentY + 5);
              doc.text("Encuesta 1", 110, currentY + 5);
              doc.text("Encuesta 2", 150, currentY + 5);
              if (item.firstExists && item.secondExists) {
                doc.text("Diferencia", 175, currentY + 5);
              }
              currentY += 7;
              doc.setFont(undefined, 'normal');
              doc.setTextColor(44, 62, 80);
            }

            if (i % 2 === 0) {
              doc.setFillColor(248, 250, 252);
              doc.rect(15, currentY, 180, 5.5, 'F');
            }

            const cleanLabel = cleanQuestionTitle(label);
            const labelText = cleanLabel.length > 35 ? cleanLabel.substring(0, 32) + '...' : cleanLabel;
            doc.text(labelText, 18, currentY + 4);
            doc.text(`${p1}%`, 110, currentY + 4);
            doc.text(`${p2}%`, 150, currentY + 4);

            if (item.firstExists && item.secondExists) {
              if (diff > 0) {
                doc.setTextColor(16, 185, 129);
                doc.text(`+${diff}%`, 175, currentY + 4);
              } else if (diff < 0) {
                doc.setTextColor(239, 68, 68);
                doc.text(`${diff}%`, 175, currentY + 4);
              } else {
                doc.setTextColor(100, 116, 139);
                doc.text(`0%`, 175, currentY + 4);
              }
              doc.setTextColor(44, 62, 80);
            }

            currentY += 5.5;
          }

          currentY += 8;

          // Mostrar totales de respuestas para esta pregunta
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`Total respuestas Encuesta 1: ${item.firstTotal} | Total respuestas Encuesta 2: ${item.secondTotal}`, 15, currentY);
          currentY += 5;

          if (idx < comparisonResults.length - 1) {
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.line(15, currentY, 195, currentY);
            currentY += 6;
          }
        });

        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');

        setTimeout(() => {
          URL.revokeObjectURL(pdfUrl);
        }, 100);

      } catch (e) {
        console.error("Error al generar reporte comparativo: ", e);
        alert("Ocurrió un error al generar el reporte comparativo.");
      }
      setIsGeneratingFullReport(false);
    }, 100);
  };

  const customTooltip = {
    callbacks: {
      label: (context) => {
        const label = context.label || '';
        const value = context.parsed;
        const total = chartData?.total || 1;
        const percentage = ((value / total) * 100).toFixed(1);
        return `${label}: ${value} (${percentage}%)`;
      }
    }
  };

  const barDataLabelsPlugin = {
    id: 'barDataLabels',
    afterDraw: (chart) => {
      if (chart.config.type !== 'bar') return;

      const ctx = chart.ctx;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            const value = dataset.data[index];
            const total = chartData?.total || 1;
            const percentage = ((value / total) * 100).toFixed(1);
            const label = `${value} (${percentage}%)`;

            ctx.save();
            ctx.font = '500 11px "Inter", system-ui';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            const position = element.tooltipPosition();
            ctx.fillText(label, position.x, position.y - 8);
            ctx.restore();
          });
        }
      });
    }
  };

  ChartJS.register(barDataLabelsPlugin);

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: 2,
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 12, weight: '500' } }
      },
      tooltip: customTooltip
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e2e8f0', drawBorder: true },
        title: {
          display: true,
          text: 'Cantidad de respuestas',
          font: { weight: '500', size: 11 }
        }
      },
      x: {
        grid: { display: false },
        title: {
          display: true,
          text: 'Opciones',
          font: { weight: '500', size: 11 }
        }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: true,
    devicePixelRatio: 2,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 11, weight: '500' },
          padding: 12,
          generateLabels: (chart) => {
            const data = chart.data;
            const total = chartData?.total || 1;
            return data.labels.map((label, i) => {
              const value = data.datasets[0].data[i];
              const percentage = ((value / total) * 100).toFixed(1);
              return {
                text: `${label}: ${value} (${percentage}%)`,
                fillStyle: data.datasets[0].backgroundColor[i],
                index: i
              };
            });
          }
        }
      },
      tooltip: customTooltip
    }
  };

  const cleanQuestionTitle = (title) => {
    if (!title) return title;
    let cleaned = title.replace(/^\d+[).-]\s*/, '');
    cleaned = cleaned.replace(/^\d+\s+/, '');
    return cleaned.trim();
  };

  const generateFullReport = () => {
    if (questionHeaders.length === 0) {
      alert('No hay preguntas para analizar');
      return;
    }

    setIsGeneratingFullReport(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(20);
        doc.setTextColor(67, 97, 238);
        doc.text("Reporte de Resultados", 15, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Generado por Centro de Informática USS", 15, 28);

        let currentY = 40;

        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        const filterText = Object.keys(activeFilters).length > 0
          ? `Filtros aplicados: ${Object.entries(activeFilters).map(([k, v]) => `${k}: ${v}`).join(' | ')}`
          : 'Filtros: Ninguno (datos completos)';

        const filteredLines = doc.splitTextToSize(filterText, 180);
        doc.text(filteredLines, 15, currentY);
        currentY += (filteredLines.length * 5) + 8;

        doc.setFillColor(238, 242, 255);
        doc.rect(15, currentY - 3, 180, 38, 'F');
        doc.setDrawColor(67, 97, 238);
        doc.setLineWidth(0.5);
        doc.rect(15, currentY - 3, 180, 38);

        doc.setFont(undefined, 'bold');
        doc.setTextColor(67, 97, 238);
        doc.text("Resumen General", 20, currentY + 2);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(44, 62, 80);
        doc.text(`Muestra evaluada: ${filteredData.length} respuestas válidas`, 20, currentY + 9);
        const responseRate = ((filteredData.length / totalStudentsMain) * 100).toFixed(1);
        doc.text(`Tasa de respuesta: ${responseRate}% (sobre ${totalStudentsMain} matriculados)`, 20, currentY + 16);

        const tradicionalCount = filteredData.filter(r => r['Metodología'] === 'Tradicional').length;
        const protechCount = filteredData.filter(r => r['Metodología'] === 'Protech XP').length;
        const tradPercent = ((tradicionalCount / filteredData.length) * 100).toFixed(1);
        const protechPercent = ((protechCount / filteredData.length) * 100).toFixed(1);

        doc.setTextColor(59, 130, 246);
        doc.text(`Metodología Tradicional: ${tradicionalCount} (${tradPercent}%)`, 20, currentY + 23);
        doc.setTextColor(16, 185, 129);
        doc.text(`Metodología Protech XP: ${protechCount} (${protechPercent}%)`, 20, currentY + 30);

        currentY += 45;

        for (let i = 0; i < questionHeaders.length; i++) {
          const question = questionHeaders[i];
          const questionData = getChartDataForColumn(question, filteredData);

          if (!questionData || questionData.labels.length === 0) continue;

          if (currentY > pageHeight - 100) {
            doc.addPage();
            currentY = 20;
          }

          const cleanTitle = cleanQuestionTitle(question);

          doc.setFontSize(12);
          doc.setTextColor(67, 97, 238);
          doc.setFont(undefined, 'bold');
          const questionLines = doc.splitTextToSize(cleanTitle, 180);
          doc.text(questionLines, 15, currentY);
          currentY += (questionLines.length * 6) + 6;

          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.setFont(undefined, 'bold');
          doc.text("Distribución de respuestas:", 15, currentY);
          currentY += 5;

          doc.setFillColor(241, 245, 249);
          doc.rect(15, currentY, 180, 6, 'F');
          doc.setFont(undefined, 'bold');
          doc.setTextColor(67, 97, 238);
          doc.text("Opción", 18, currentY + 4);
          doc.text("Cantidad", 130, currentY + 4);
          doc.text("Porcentaje", 170, currentY + 4);
          currentY += 6;

          doc.setFont(undefined, 'normal');
          doc.setTextColor(44, 62, 80);
          for (let j = 0; j < questionData.labels.length; j++) {
            const label = questionData.labels[j];
            const count = questionData.counts[label];
            const percentage = ((count / filteredData.length) * 100).toFixed(1);

            if (currentY > pageHeight - 40 && j < questionData.labels.length - 1) {
              doc.addPage();
              currentY = 20;
              doc.setFillColor(241, 245, 249);
              doc.rect(15, currentY, 180, 6, 'F');
              doc.setFont(undefined, 'bold');
              doc.setTextColor(67, 97, 238);
              doc.text("Opción", 18, currentY + 4);
              doc.text("Cantidad", 130, currentY + 4);
              doc.text("Porcentaje", 170, currentY + 4);
              currentY += 6;
              doc.setFont(undefined, 'normal');
              doc.setTextColor(44, 62, 80);
            }

            if (j % 2 === 0) {
              doc.setFillColor(248, 250, 252);
              doc.rect(15, currentY, 180, 5.5, 'F');
            }

            const cleanLabel = cleanQuestionTitle(label);
            const labelText = cleanLabel.length > 50 ? cleanLabel.substring(0, 47) + '...' : cleanLabel;
            doc.text(labelText, 18, currentY + 4);
            doc.text(count.toString(), 130, currentY + 4);
            doc.text(percentage + "%", 170, currentY + 4);

            currentY += 5.5;
          }

          currentY += 8;

          if (i < questionHeaders.length - 1) {
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.line(15, currentY, 195, currentY);
            currentY += 6;
          }
        }

        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');

        setTimeout(() => {
          URL.revokeObjectURL(pdfUrl);
        }, 100);

      } catch (e) {
        console.error("Error al generar reporte: ", e);
        alert("Ocurrió un error al generar el reporte.");
      }
      setIsGeneratingFullReport(false);
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-slate-700 font-sans antialiased">
      <div className="container mx-auto px-6 py-8 max-w-7xl">

        {/* Upload Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            onClick={() => document.getElementById('fileInput').click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer p-6
              ${isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="text-4xl text-blue-500">📊</div>
              <div className="text-center">
                <h3 className="text-base font-semibold text-slate-700">
                  Encuesta Principal
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  XLSX, XLS o CSV
                </p>
                {originalData.length > 0 && (
                  <p className="text-green-600 text-xs mt-2 font-medium">
                    ✓ {filteredData.length} respuestas cargadas
                  </p>
                )}
              </div>
            </div>
            <input
              id="fileInput"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div
            onClick={() => document.getElementById('secondFileInput').click()}
            className="relative rounded-xl border-2 border-dashed border-purple-300 bg-white hover:border-purple-400 hover:bg-purple-50 transition-all duration-200 cursor-pointer p-6"
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="text-4xl text-purple-500">📈</div>
              <div className="text-center">
                <h3 className="text-base font-semibold text-slate-700">
                  Encuesta para Comparar
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  XLSX, XLS o CSV
                </p>
                {secondFileData && (
                  <p className="text-green-600 text-xs mt-2 font-medium">
                    ✓ {secondFileTotal} respuestas cargadas
                  </p>
                )}
              </div>
            </div>
            <input
              id="secondFileInput"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleSecondFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Botones de acción */}
        {originalData.length > 0 && (
          <div className="flex flex-wrap justify-end gap-3 mb-6">
            <button
              onClick={generateFullReport}
              disabled={isGeneratingFullReport || questionHeaders.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              <span>📑</span>
              {isGeneratingFullReport ? 'Generando...' : `Reporte individual`}
            </button>

            {secondFileData && (
              <>
                <button
                  onClick={performComparison}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                >
                  <span>📊</span>
                  Comparar encuestas
                </button>

                {comparisonResults && (
                  <button
                    onClick={generateComparisonPDF}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <span>📄</span>
                    Reporte comparativo
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Main Content */}
        {originalData.length > 0 && (
          <div className="space-y-6">

            {/* Filters Section */}
            <div className="bg-white rounded-xl shadow-md border border-blue-100 overflow-hidden">
              <div className="border-b border-blue-100 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">🎯 Filtros de segmentación</h2>
              </div>

              {demographicHeaders.length > 0 && (
                <div className="p-6 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {demographicHeaders.map(header => (
                      <div key={header}>
                        <label className="block text-xs font-medium text-blue-600 mb-1.5 uppercase tracking-wider">
                          {header}
                        </label>
                        <select
                          value={activeFilters[header] || ''}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              removeFilter(header);
                            } else {
                              applyFilter(header, e.target.value);
                            }
                          }}
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm bg-white text-slate-700"
                        >
                          <option value="">Todos</option>
                          {getAvailableValuesForFilter(header).map(val => (
                            <option key={val} value={val}>{val || '(vacío)'}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(activeFilters).length > 0 && (
                <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-blue-600">Filtros activos:</span>
                    {Object.entries(activeFilters).map(([col, val]) => (
                      <span key={col} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                        {col}: {val}
                        <button
                          onClick={() => removeFilter(col)}
                          className="ml-1 text-blue-400 hover:text-blue-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={clearFilters}
                    className="text-xs font-medium text-blue-500 hover:text-blue-700"
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">Muestra evaluada</p>
                    <div className="mt-1 flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-3xl font-bold">{filteredData.length}</span>
                        {mainFileName && <span className="text-[10px] text-blue-100/80 uppercase mt-0.5 truncate max-w-[100px]" title={mainFileName}>{mainFileName.split('.')[0]}</span>}
                      </div>
                      {secondFileData && filteredSecondData && (
                        <>
                          <span className="text-base font-medium opacity-80 pl-2">vs</span>
                          <div className="flex flex-col">
                            <span className="text-3xl font-bold text-blue-200">{filteredSecondData.length}</span>
                            {secondFileName && <span className="text-[10px] text-blue-300 uppercase mt-0.5 truncate max-w-[100px]" title={secondFileName}>{secondFileName.split('.')[0]}</span>}
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-blue-100 mt-1">respuestas válidas</p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <span className="text-2xl">📋</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">Tasa de respuesta</p>
                    <div className="mt-1 flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-3xl font-bold">{((filteredData.length / totalStudentsMain) * 100).toFixed(1)}%</span>
                        {mainFileName && <span className="text-[10px] text-emerald-100/80 uppercase mt-0.5 truncate max-w-[100px]" title={mainFileName}>{mainFileName.split('.')[0]}</span>}
                      </div>
                      {secondFileData && filteredSecondData && (
                        <>
                          <span className="text-base font-medium opacity-80 pl-2">vs</span>
                          <div className="flex flex-col">
                            <span className="text-3xl font-bold text-emerald-200">{((filteredSecondData.length / totalStudentsComp) * 100).toFixed(1)}%</span>
                            {secondFileName && <span className="text-[10px] text-emerald-300 uppercase mt-0.5 truncate max-w-[100px]" title={secondFileName}>{secondFileName.split('.')[0]}</span>}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-1 mt-1 text-[10px] text-emerald-100">
                      <span>sobre</span>
                      <input
                        type="number"
                        value={totalStudentsMain}
                        onChange={(e) => setTotalStudentsMain(Number(e.target.value) || 1)}
                        className="w-12 h-5 px-1 py-0 text-emerald-900 rounded bg-white/90 border-0 focus:ring-1 focus:ring-white outline-none font-bold"
                      />
                      <span>mats. E1</span>

                      {secondFileData && (
                        <>
                          <span className="text-emerald-200 mx-1">|</span>
                          <input
                            type="number"
                            value={totalStudentsComp}
                            onChange={(e) => setTotalStudentsComp(Number(e.target.value) || 1)}
                            className="w-12 h-5 px-1 py-0 text-emerald-900 rounded bg-emerald-50 border-0 focus:ring-1 focus:ring-white outline-none font-bold"
                          />
                          <span>E2</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <span className="text-2xl">📈</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-purple-100 uppercase tracking-wider">Metodología</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-100">Tradicional</span>
                    <div className="text-right">
                      <div className="text-sm font-bold flex items-center justify-end gap-2">
                        {mainFileName && <span className="text-[9px] font-normal uppercase text-purple-200/70" title={mainFileName}>{mainFileName.split('.')[0]}</span>}
                        <span>{filteredData.filter(r => r['Metodología'] === 'Tradicional').length} <span className="font-normal opacity-80">({filteredData.length > 0 ? ((filteredData.filter(r => r['Metodología'] === 'Tradicional').length / filteredData.length) * 100).toFixed(1) : '0.0'}%)</span></span>
                      </div>
                      {secondFileData && filteredSecondData && (
                        <div className="text-sm font-bold text-purple-200 mt-0.5 flex items-center justify-end gap-2">
                          <span className="text-xs font-normal mr-1 opacity-80">vs</span>
                          {secondFileName && <span className="text-[9px] font-normal uppercase text-purple-300/80" title={secondFileName}>{secondFileName.split('.')[0]}</span>}
                          <span>{filteredSecondData.filter(r => r['Metodología'] === 'Tradicional').length} <span className="font-normal opacity-80">({filteredSecondData.length > 0 ? ((filteredSecondData.filter(r => r['Metodología'] === 'Tradicional').length / filteredSecondData.length) * 100).toFixed(1) : '0.0'}%)</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-100">Protech XP</span>
                    <div className="text-right">
                      <div className="text-sm font-bold flex items-center justify-end gap-2">
                        {mainFileName && <span className="text-[9px] font-normal uppercase text-purple-200/70" title={mainFileName}>{mainFileName.split('.')[0]}</span>}
                        <span>{filteredData.filter(r => r['Metodología'] === 'Protech XP').length} <span className="font-normal opacity-80">({filteredData.length > 0 ? ((filteredData.filter(r => r['Metodología'] === 'Protech XP').length / filteredData.length) * 100).toFixed(1) : '0.0'}%)</span></span>
                      </div>
                      {secondFileData && filteredSecondData && (
                        <div className="text-sm font-bold text-purple-200 mt-0.5 flex items-center justify-end gap-2">
                          <span className="text-xs font-normal mr-1 opacity-80">vs</span>
                          {secondFileName && <span className="text-[9px] font-normal uppercase text-purple-300/80" title={secondFileName}>{secondFileName.split('.')[0]}</span>}
                          <span>{filteredSecondData.filter(r => r['Metodología'] === 'Protech XP').length} <span className="font-normal opacity-80">({filteredSecondData.length > 0 ? ((filteredSecondData.filter(r => r['Metodología'] === 'Protech XP').length / filteredSecondData.length) * 100).toFixed(1) : '0.0'}%)</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="bg-white rounded-xl shadow-md border border-blue-100 overflow-hidden">
              <div className="border-b border-blue-100 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">📊 Visualización de resultados</h2>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <label className="block text-xs font-medium text-blue-600 mb-2 uppercase tracking-wider">
                    Seleccionar pregunta
                  </label>
                  <select
                    value={chartColumn || (chartData ? chartData.columnName : '')}
                    onChange={(e) => setChartColumn(e.target.value)}
                    className="w-full max-w-md px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm bg-white text-slate-700"
                  >
                    {filterableHeaders.filter(h => !demographicHeaders.includes(h)).map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                {chartData && (
                  <div>
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-blue-700">{cleanQuestionTitle(chartData.columnName)}</h3>
                    </div>

                    {/* Summary Table */}
                    <div className="mb-8 border border-blue-100 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-blue-100">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-blue-600">Respuesta</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-blue-600">Cant. {mainFileName ? `(${mainFileName.split('.')[0]})` : ''}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-blue-600">% {mainFileName ? `(${mainFileName.split('.')[0]})` : ''}</th>
                            {secondPieData && (
                              <>
                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600">Cant. {secondFileName ? `(${secondFileName.split('.')[0]})` : ''}</th>
                                <th className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600">% {secondFileName ? `(${secondFileName.split('.')[0]})` : ''}</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                          {(combinedBarData || chartData).labels.map((label, idx) => {
                            const count1 = chartData.counts[label] || 0;
                            const percentage1 = chartData.total > 0 ? ((count1 / chartData.total) * 100).toFixed(1) : '0.0';
                            const cleanLabel = cleanQuestionTitle(label);

                            let count2 = 0;
                            let percentage2 = '0.0';
                            if (secondPieData) {
                              count2 = secondPieData.counts[label] || 0;
                              percentage2 = secondPieData.total > 0 ? ((count2 / secondPieData.total) * 100).toFixed(1) : '0.0';
                            }

                            return (
                              <tr key={label} className="hover:bg-blue-50 transition-colors">
                                <td className="px-4 py-2.5 text-sm text-slate-600">{cleanLabel}</td>
                                <td className="px-4 py-2.5 text-sm text-slate-600 text-right font-medium">{count1}</td>
                                <td className="px-4 py-2.5 text-sm text-slate-600 text-right">
                                  <span className="text-blue-600 font-semibold">{percentage1}%</span>
                                </td>
                                {secondPieData && (
                                  <>
                                    <td className="px-4 py-2.5 text-sm text-emerald-700 text-right font-medium">{count2}</td>
                                    <td className="px-4 py-2.5 text-sm text-emerald-700 text-right">
                                      <span className="text-emerald-600 font-semibold">{percentage2}%</span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                        <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📊 Distribución circular</h4>
                        <div className={`w-full mx-auto flex ${secondPieData ? 'flex-col sm:flex-row gap-6' : 'max-w-[380px]'} items-center justify-center`}>
                          <div className={secondPieData ? 'w-full sm:w-1/2 max-w-[280px]' : 'w-full'}>
                            {secondPieData && mainFileName && <p className="text-xs font-bold text-blue-500 text-center mb-2 uppercase">{mainFileName.split('.')[0]}</p>}
                            <Pie ref={pieRef} data={chartData} options={pieOptions} />
                          </div>
                          {secondPieData && (
                            <div className="w-full sm:w-1/2 max-w-[280px]">
                              {secondFileName && <p className="text-xs font-bold text-emerald-500 text-center mb-2 uppercase">{secondFileName.split('.')[0]}</p>}
                              <Pie data={secondPieData} options={pieOptions} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                        <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📈 Frecuencias analíticas</h4>
                        <div style={{ height: '380px' }}>
                          <Bar ref={barRef} data={combinedBarData || chartData} options={barOptions} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
