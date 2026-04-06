import React, { useState, useRef, useMemo } from 'react';
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

// Columnas que NO deben aparecer en selector de preguntas ni en PDF
const IGNORED_COLUMNS = [
  'marca temporal', 'fecha', 'hora', 'timestamp', 'time',
  'puntuación', 'score', 'correo', 'email', 'e-mail',
  'correo institucional', 'nombre', 'apellido', 'nombre completo',
  'dni', 'documento', 'identificación', 'id', 'matrícula', 'matricula'
];

const DEMOGRAPHIC_KEYWORDS = [
  'metodología', 'metodologia', 'docente', 'profesor', 'curso', 'asignatura', 'materia',
  'pead', 'modalidad', 'sede', 'carrera', 'programa',
  'turno', 'facultad', 'grupo', 'ciclo'
];

function App() {
  const [datasets, setDatasets] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [activeFilters, setActiveFilters] = useState({});
  const [chartColumn, setChartColumn] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingFullReport, setIsGeneratingFullReport] = useState(false);
  const [showEnrollmentDetail, setShowEnrollmentDetail] = useState(false);
  const pieRef = useRef(null);
  const barRef = useRef(null);

  const findEmailColumn = (dataArray) => {
    if (!dataArray || dataArray.length === 0) return null;
    const sample = dataArray[0];
    const possibleNames = [
      'correo institucional', 'correo', 'email', 'e-mail',
      'correo electronico', 'correo electrónico', 'mail'
    ];
    for (const key of Object.keys(sample)) {
      const lowerKey = key.toLowerCase().trim();
      for (const possible of possibleNames) {
        if (lowerKey === possible || lowerKey.includes(possible)) {
          return key;
        }
      }
    }
    return null;
  };

  const findCourseColumn = (dataArray) => {
    if (!dataArray || dataArray.length === 0) return null;
    const sample = dataArray[0];
    const possibleNames = ['curso', 'asignatura', 'materia', 'programa'];
    for (const key of Object.keys(sample)) {
      const lowerKey = key.toLowerCase().trim();
      for (const possible of possibleNames) {
        if (lowerKey === possible || lowerKey.includes(possible)) {
          return key;
        }
      }
    }
    return null;
  };

  const findTeacherColumn = (dataArray) => {
    if (!dataArray || dataArray.length === 0) return null;
    const sample = dataArray[0];
    const possibleNames = ['docente', 'profesor', 'teacher'];
    for (const key of Object.keys(sample)) {
      const lowerKey = key.toLowerCase().trim();
      for (const possible of possibleNames) {
        if (lowerKey === possible || lowerKey.includes(possible)) {
          return key;
        }
      }
    }
    return null;
  };

  const findPeadColumn = (dataArray) => {
    if (!dataArray || dataArray.length === 0) return null;
    const sample = dataArray[0];
    const possibleNames = ['pead', 'sección', 'seccion', 'grupo', 'section'];
    for (const key of Object.keys(sample)) {
      const lowerKey = key.toLowerCase().trim();
      for (const possible of possibleNames) {
        if (lowerKey === possible || lowerKey.includes(possible)) {
          return key;
        }
      }
    }
    return null;
  };

  const applyMethodology = (dataArray, headersArray) => {
    let courseCol = headersArray.find(h => {
      const l = h.toLowerCase();
      return l.includes('curso') || l.includes('módulo') || l.includes('modulo') ||
        l.includes('asignatura') || l.includes('programa') || l.includes('materia');
    });

    if (courseCol) {
      dataArray.forEach(row => {
        const val = (row[courseCol] || '').toString().toLowerCase();
        if (val.includes('computación') || val.includes('computacion') ||
          val.includes('office') || val.includes('tradicional')) {
          row['Metodología'] = 'Tradicional';
        } else if (val.includes('protech') || val.includes('innovación') ||
          val.includes('moderna') || val.includes('agile')) {
          row['Metodología'] = 'Protech XP';
        } else {
          row['Metodología'] = 'Protech XP';
        }
      });
    } else {
      dataArray.forEach(row => {
        row['Metodología'] = 'Protech XP';
      });
    }

    if (!headersArray.includes('Metodología')) {
      headersArray.unshift('Metodología');
    }
  };

  // ========== FUNCIÓN PRINCIPAL FILTRADA - CORREGIDA ==========
  const filteredDatasets = useMemo(() => {
    return datasets.map(dataset => {
      // 1. APLICAR FILTROS A LAS RESPUESTAS
      let filteredResponses = [...dataset.originalData];
      Object.entries(activeFilters).forEach(([col, val]) => {
        filteredResponses = filteredResponses.filter(row => row[col] === val);
      });

      // 2. MATRÍCULA COMPLETA (SIN FILTRAR) - para el denominador de la tasa
      const allEnrollment = dataset.enrollmentData ? [...dataset.enrollmentData] : null;
      let totalEnrollmentAll = allEnrollment ? allEnrollment.length : 0;

      // 3. MATRÍCULA FILTRADA (para el desglose por docente/curso/pead)
      let filteredEnrollment = allEnrollment ? [...allEnrollment] : null;
      Object.entries(activeFilters).forEach(([col, val]) => {
        const colLower = col.toLowerCase();
        if (colLower.includes('docente') || colLower.includes('profesor') ||
          colLower.includes('curso') || colLower.includes('asignatura') ||
          colLower.includes('pead')) {
          if (filteredEnrollment) {
            filteredEnrollment = filteredEnrollment.filter(row => row[col] === val);
          }
        }
      });

      // 4. ESTADÍSTICAS
      let courseStats = {};
      let teacherStats = {};
      let teacherCoursePeadStats = {};
      let totalResponses = filteredResponses.length;

      if (allEnrollment && allEnrollment.length > 0) {
        const emailColResponses = findEmailColumn(filteredResponses);
        const emailColEnrollment = findEmailColumn(allEnrollment);
        const courseCol = findCourseColumn(allEnrollment);
        const teacherCol = findTeacherColumn(allEnrollment);
        const peadCol = findPeadColumn(allEnrollment);

        const studentCourseMap = new Map();
        const studentTeacherMap = new Map();
        const studentPeadMap = new Map();

        // Mapear estudiantes desde la matrícula COMPLETA
        allEnrollment.forEach(student => {
          let studentEmail = null;
          if (emailColEnrollment) {
            studentEmail = student[emailColEnrollment];
            if (studentEmail) {
              studentEmail = String(studentEmail).trim().toLowerCase();
              if (courseCol) {
                studentCourseMap.set(studentEmail, student[courseCol] || 'Sin curso');
              }
              if (teacherCol) {
                studentTeacherMap.set(studentEmail, student[teacherCol] || 'Sin docente');
              }
              if (peadCol) {
                studentPeadMap.set(studentEmail, student[peadCol] || 'Sin PEAD');
              }
            }
          }
        });

        // Inicializar estadísticas por curso (con totales de matrícula COMPLETA)
        if (courseCol) {
          allEnrollment.forEach(student => {
            const course = student[courseCol] || 'Sin curso';
            if (!courseStats[course]) {
              courseStats[course] = { total: 0, responded: 0, respondedEmails: new Set() };
            }
            courseStats[course].total++;
          });
        } else {
          courseStats['Todos los cursos'] = { total: totalEnrollmentAll, responded: 0, respondedEmails: new Set() };
        }

        // Inicializar estadísticas por docente (con totales de matrícula COMPLETA)
        if (teacherCol) {
          allEnrollment.forEach(student => {
            const teacher = student[teacherCol] || 'Sin docente';
            if (!teacherStats[teacher]) {
              teacherStats[teacher] = { total: 0, responded: 0, respondedEmails: new Set() };
            }
            teacherStats[teacher].total++;
          });
        }

        // Inicializar estadísticas DOCENTE + CURSO + PEAD (con totales de matrícula COMPLETA)
        if (courseCol && teacherCol && peadCol) {
          allEnrollment.forEach(student => {
            const course = student[courseCol] || 'Sin curso';
            const teacher = student[teacherCol] || 'Sin docente';
            const pead = student[peadCol] || 'Sin PEAD';
            const key = `${teacher}|${course}|${pead}`;
            if (!teacherCoursePeadStats[key]) {
              teacherCoursePeadStats[key] = {
                teacher: teacher,
                course: course,
                pead: pead,
                total: 0,
                responded: 0,
                respondedEmails: new Set()
              };
            }
            teacherCoursePeadStats[key].total++;
          });
        }

        // CONTAR RESPUESTAS (estudiantes únicos que respondieron)
        filteredResponses.forEach(row => {
          let email = null;
          if (emailColResponses) {
            email = row[emailColResponses];
            if (email) {
              email = String(email).trim().toLowerCase();
            }
          }

          if (!email) return;

          let course = 'Sin curso (no matriculado)';
          let teacher = 'Sin docente (no matriculado)';
          let pead = 'Sin PEAD (no matriculado)';

          if (studentCourseMap.has(email)) {
            course = studentCourseMap.get(email);
          }
          if (studentTeacherMap.has(email)) {
            teacher = studentTeacherMap.get(email);
          }
          if (studentPeadMap.has(email)) {
            pead = studentPeadMap.get(email);
          }

          // Solo contar si el docente coincide con el filtro (si hay filtro activo)
          let shouldCount = true;
          const teacherFilter = activeFilters['Docente'] || activeFilters['docente'] || activeFilters['Profesor'] || activeFilters['profesor'];
          if (teacherFilter && teacher !== teacherFilter) {
            shouldCount = false;
          }

          if (shouldCount) {
            if (courseStats[course] && !courseStats[course].respondedEmails.has(email)) {
              courseStats[course].respondedEmails.add(email);
              courseStats[course].responded = courseStats[course].respondedEmails.size;
            }

            if (teacherStats[teacher] && !teacherStats[teacher].respondedEmails.has(email)) {
              teacherStats[teacher].respondedEmails.add(email);
              teacherStats[teacher].responded = teacherStats[teacher].respondedEmails.size;
            }

            const teacherCoursePeadKey = `${teacher}|${course}|${pead}`;
            if (teacherCoursePeadStats[teacherCoursePeadKey] && !teacherCoursePeadStats[teacherCoursePeadKey].respondedEmails.has(email)) {
              teacherCoursePeadStats[teacherCoursePeadKey].respondedEmails.add(email);
              teacherCoursePeadStats[teacherCoursePeadKey].responded = teacherCoursePeadStats[teacherCoursePeadKey].respondedEmails.size;
            }
          }
        });

        // Limpiar los Sets
        Object.values(courseStats).forEach(stat => delete stat.respondedEmails);
        Object.values(teacherStats).forEach(stat => delete stat.respondedEmails);
        Object.values(teacherCoursePeadStats).forEach(stat => delete stat.respondedEmails);
      }

      return {
        ...dataset,
        filteredData: filteredResponses,
        filteredEnrollment: filteredEnrollment,
        enrollmentCount: totalEnrollmentAll,  // ← USA LA MATRÍCULA COMPLETA (SIN FILTRAR)
        responseCount: totalResponses,
        hasEnrollmentData: allEnrollment && allEnrollment.length > 0,
        courseStats,
        teacherStats,
        teacherCoursePeadStats
      };
    });
  }, [datasets, activeFilters]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    processFile(file);
    event.target.value = '';
  };

  const processFile = (file) => {
    if (datasets.length >= 2) {
      alert('Solo se pueden comparar un máximo de 2 archivos.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      let responseSheetName = workbook.SheetNames[0];

      let baseSheetName = workbook.SheetNames.find(s =>
        s.toLowerCase() === 'baseunificada' ||
        s.toLowerCase().includes('baseunificada') ||
        s.toLowerCase() === 'base unificada'
      );

      if (!baseSheetName && workbook.SheetNames.length > 1) {
        baseSheetName = workbook.SheetNames[1];
      }

      const responseSheet = workbook.Sheets[responseSheetName];
      const jsonData = XLSX.utils.sheet_to_json(responseSheet);

      let enrollmentData = null;
      if (baseSheetName) {
        const baseSheet = workbook.Sheets[baseSheetName];
        enrollmentData = XLSX.utils.sheet_to_json(baseSheet);
      }

      if (jsonData.length > 0) {
        let headersList = Object.keys(jsonData[0]);

        applyMethodology(jsonData, headersList);
        if (enrollmentData && enrollmentData.length > 0) {
          applyMethodology(enrollmentData, Object.keys(enrollmentData[0]));
        }

        let displayName = file.name;
        const monthMatch = file.name.match(/(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/i);
        if (monthMatch) {
          displayName = monthMatch[0].toUpperCase();
        } else {
          displayName = file.name.substring(0, 15) + (file.name.length > 15 ? '...' : '');
        }

        const newDataset = {
          id: Date.now(),
          name: displayName,
          originalData: jsonData,
          enrollmentData: enrollmentData
        };

        if (datasets.length === 0) {
          setHeaders(headersList);
        }

        setDatasets(prev => [...prev, newDataset]);
        setChartColumn('');
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
      processFile(file);
    } else {
      alert('Por favor sube un archivo Excel o CSV válido');
    }
  };

  const applyFilter = (column, value) => {
    if (!column || value === undefined) return;
    setActiveFilters(prev => ({ ...prev, [column]: value }));
  };

  const removeFilter = (column) => {
    const newFilters = { ...activeFilters };
    delete newFilters[column];
    setActiveFilters(newFilters);
  };

  const clearFilters = () => {
    setActiveFilters({});
  };

  const getAvailableValuesForFilter = (column) => {
    if (!column) return [];
    let allValues = new Set();
    datasets.forEach(ds => {
      let baseData = [...ds.originalData];
      Object.entries(activeFilters).forEach(([col, val]) => {
        if (col !== column) {
          baseData = baseData.filter(row => row[col] === val);
        }
      });
      baseData.forEach(row => {
        if (row[column] !== undefined && row[column] !== null && row[column] !== '') {
          allValues.add(row[column]);
        }
      });
    });
    return [...allValues].sort();
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
    if (!column || data.length === 0) return null;

    const ObjectCounts = {};
    data.forEach(row => {
      let value = row[column] || '(vacío)';
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
    if (filteredDatasets.length === 0 || headers.length === 0) return null;

    let categoricalColumn = chartColumn;

    const availableHeaders = headers.filter(h => {
      const lower = h.toLowerCase();
      const isIgnored = IGNORED_COLUMNS.some(w => lower.includes(w));
      const isDemographic = DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw));
      return !isIgnored && !isDemographic && h !== 'Metodología';
    });

    if (!categoricalColumn && availableHeaders.length > 0) {
      categoricalColumn = availableHeaders.find(header => {
        const unique = new Set();
        filteredDatasets[0]?.filteredData.forEach(r => unique.add(r[header]));
        return unique.size <= 15 && unique.size > 1;
      });
    }

    if (!categoricalColumn && availableHeaders.length > 0) {
      categoricalColumn = availableHeaders[0];
    }
    if (!categoricalColumn) return null;

    let allLabels = new Set();
    const chartDataArray = [];

    filteredDatasets.forEach(ds => {
      const cd = getChartDataForColumn(categoricalColumn, ds.filteredData);
      if (cd) {
        cd.labels.forEach(l => allLabels.add(l));
        chartDataArray.push({ ds, cd });
      }
    });

    if (chartDataArray.length === 0) return null;

    const labels = Array.from(allLabels);
    const datasetsConfigs = [];
    const baseColors = ['#e63946', '#2a9d8f', '#f4a261', '#e76f51', '#264653'];

    chartDataArray.forEach(({ ds, cd }, index) => {
      const dataValues = labels.map(label => {
        const count = cd.counts[label] || 0;
        return cd.total > 0 ? parseFloat(((count / cd.total) * 100).toFixed(1)) : 0;
      });
      const originalCounts = labels.map(label => cd.counts[label] || 0);

      const bgColors = chartDataArray.length === 1
        ? generateColors(labels.length)
        : baseColors[index % baseColors.length];

      datasetsConfigs.push({
        label: ds.name,
        data: dataValues,
        originalCounts: originalCounts,
        backgroundColor: bgColors,
        borderColor: '#ffffff',
        borderWidth: 2
      });
    });

    return {
      labels: labels,
      columnName: categoricalColumn,
      datasets: datasetsConfigs,
      chartDataArray: chartDataArray
    };
  };

  const chartData = getChartData();

  const filterableHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    const isIgnored = IGNORED_COLUMNS.some(w => lower.includes(w));
    return !isIgnored;
  });

  const demographicHeaders = filterableHeaders.filter(h => {
    const lower = h.toLowerCase();
    return DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw));
  });

  const questionHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    const isIgnored = IGNORED_COLUMNS.some(w => lower.includes(w));
    const isDemographic = DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw));
    return !isIgnored && !isDemographic && h !== 'Metodología';
  });

  const customTooltip = {
    callbacks: {
      label: (context) => {
        const dataset = context.chart.data.datasets[context.datasetIndex];
        const valPercent = context.parsed.y;
        const count = dataset.originalCounts[context.dataIndex];
        return `${dataset.label}: ${count} respuestas (${valPercent}%)`;
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
            const valPercent = dataset.data[index] || 0;
            const count = dataset.originalCounts[index] || 0;
            const label = chart.data.datasets.length > 1 ? `${valPercent}%` : `${count} (${valPercent}%)`;

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
        max: datasets.length > 1 ? 100 : undefined,
        grid: { color: '#e2e8f0', drawBorder: true },
        title: {
          display: true,
          text: datasets.length > 1 ? 'Porcentaje (%)' : 'Cantidad de respuestas',
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
            return data.labels.map((label, i) => {
              const dataset = data.datasets[0];
              const value = dataset.data[i];
              const count = dataset.originalCounts ? dataset.originalCounts[i] : value;
              return {
                text: `${label}: ${count} (${value}%)`,
                fillStyle: dataset.backgroundColor[i],
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
    if (questionHeaders.length === 0 || filteredDatasets.length === 0) {
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
        currentY += (filteredLines.length * 5) + 6;

        const isComparing = filteredDatasets.length > 1;

        filteredDatasets.forEach((ds) => {
          doc.setFillColor(238, 242, 255);
          doc.rect(15, currentY - 3, 180, 35, 'F');
          doc.setDrawColor(67, 97, 238);
          doc.setLineWidth(0.5);
          doc.rect(15, currentY - 3, 180, 35);

          doc.setFont(undefined, 'bold');
          doc.setTextColor(67, 97, 238);
          doc.text(`Resumen: ${ds.name}`, 20, currentY + 2);
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(44, 62, 80);

          const responseRate = ds.enrollmentCount > 0
            ? ((ds.responseCount / ds.enrollmentCount) * 100).toFixed(1)
            : 0;

          doc.text(`📊 Respuestas totales: ${ds.responseCount}`, 20, currentY + 9);
          doc.text(`👥 Estudiantes matriculados: ${ds.enrollmentCount}`, 20, currentY + 16);
          doc.text(`📈 Tasa de respuesta: ${responseRate}%`, 20, currentY + 23);

          const tCount = ds.filteredData.filter(r => r['Metodología'] === 'Tradicional').length;
          const pCount = ds.filteredData.filter(r => r['Metodología'] === 'Protech XP').length;
          const tP = ds.filteredData.length ? ((tCount / ds.filteredData.length) * 100).toFixed(1) : 0;
          const pP = ds.filteredData.length ? ((pCount / ds.filteredData.length) * 100).toFixed(1) : 0;

          doc.text(`🎓 Tradicional: ${tCount} (${tP}%)  |  🚀 Protech XP: ${pCount} (${pP}%)`, 20, currentY + 30);
          currentY += 42;
        });

        currentY += 4;

        for (let i = 0; i < questionHeaders.length; i++) {
          const question = questionHeaders[i];

          const allData = filteredDatasets.map(ds => getChartDataForColumn(question, ds.filteredData));

          let allLabels = new Set();
          allData.forEach(qd => {
            if (qd && qd.labels) qd.labels.forEach(l => allLabels.add(l));
          });
          const labelsArray = Array.from(allLabels);

          if (labelsArray.length === 0) continue;

          if (currentY > pageHeight - (isComparing ? 60 : 50)) {
            doc.addPage();
            currentY = 20;
          }

          const cleanTitle = cleanQuestionTitle(question);

          doc.setFontSize(12);
          doc.setTextColor(67, 97, 238);
          doc.setFont(undefined, 'bold');
          const questionLines = doc.splitTextToSize(cleanTitle, 180);
          doc.text(questionLines, 15, currentY);
          currentY += (questionLines.length * 6) + 4;

          doc.setFillColor(241, 245, 249);
          doc.rect(15, currentY, 180, 6, 'F');
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(67, 97, 238);
          doc.text("Opción", 17, currentY + 4);

          if (isComparing) {
            doc.text(filteredDatasets[0].name.substring(0, 10), 100, currentY + 4);
            doc.text("Cant / %", 125, currentY + 4);
            doc.text(filteredDatasets[1].name.substring(0, 10), 150, currentY + 4);
            doc.text("Cant / %", 175, currentY + 4);
          } else {
            doc.text("Cantidad", 130, currentY + 4);
            doc.text("Porcentaje", 170, currentY + 4);
          }
          currentY += 6;

          doc.setFont(undefined, 'normal');
          doc.setTextColor(44, 62, 80);
          for (let j = 0; j < labelsArray.length; j++) {
            const label = labelsArray[j];

            if (currentY > pageHeight - 20) {
              doc.addPage();
              currentY = 20;
              doc.setFillColor(241, 245, 249);
              doc.rect(15, currentY, 180, 6, 'F');
              doc.setFontSize(8);
              doc.setFont(undefined, 'bold');
              doc.setTextColor(67, 97, 238);
              doc.text("Opción", 17, currentY + 4);
              if (isComparing) {
                doc.text(filteredDatasets[0].name.substring(0, 10), 100, currentY + 4);
                doc.text("Cant / %", 125, currentY + 4);
                doc.text(filteredDatasets[1].name.substring(0, 10), 150, currentY + 4);
                doc.text("Cant / %", 175, currentY + 4);
              } else {
                doc.text("Cantidad", 130, currentY + 4);
                doc.text("Porcentaje", 170, currentY + 4);
              }
              currentY += 6;
              doc.setFont(undefined, 'normal');
              doc.setTextColor(44, 62, 80);
            }

            if (j % 2 === 0) {
              doc.setFillColor(248, 250, 252);
              doc.rect(15, currentY, 180, 5.5, 'F');
            }

            const cleanLabel = cleanQuestionTitle(label);
            const labelText = cleanLabel.length > (isComparing ? 40 : 50) ? cleanLabel.substring(0, isComparing ? 37 : 47) + '...' : cleanLabel;
            doc.text(labelText, 17, currentY + 4);

            if (isComparing) {
              const count0 = allData[0] && allData[0].counts[label] ? allData[0].counts[label] : 0;
              const perc0 = filteredDatasets[0].filteredData.length ? ((count0 / filteredDatasets[0].filteredData.length) * 100).toFixed(1) : 0;
              const count1 = allData[1] && allData[1].counts[label] ? allData[1].counts[label] : 0;
              const perc1 = filteredDatasets[1].filteredData.length ? ((count1 / filteredDatasets[1].filteredData.length) * 100).toFixed(1) : 0;

              doc.text(count0.toString(), 105, currentY + 4);
              doc.text(perc0 + "%", 125, currentY + 4);
              doc.text(count1.toString(), 155, currentY + 4);
              doc.text(perc1 + "%", 175, currentY + 4);
            } else {
              const count0 = allData[0] && allData[0].counts[label] ? allData[0].counts[label] : 0;
              const perc0 = filteredDatasets[0].filteredData.length ? ((count0 / filteredDatasets[0].filteredData.length) * 100).toFixed(1) : 0;
              doc.text(count0.toString(), 130, currentY + 4);
              doc.text(perc0 + "%", 170, currentY + 4);
            }

            currentY += 5.5;
          }

          const positiveKeywords = ['totalmente de acuerdo', 'de acuerdo', 'excelente', 'bueno', 'muy bueno', 'satisfecho', 'muy satisfecho', 'siempre', 'casi siempre'];

          if (isComparing) {
            let pos0 = 0; let total0 = 0; let pos1 = 0; let total1 = 0;
            labelsArray.forEach(label => {
              const lowerLabel = String(label).toLowerCase().trim();
              const isPositive = positiveKeywords.some(kw => lowerLabel === kw || (lowerLabel.length > 5 && lowerLabel.includes(kw)));
              const c0 = allData[0] && allData[0].counts[label] ? allData[0].counts[label] : 0;
              const c1 = allData[1] && allData[1].counts[label] ? allData[1].counts[label] : 0;
              if (isPositive) { pos0 += c0; pos1 += c1; }
              total0 += c0; total1 += c1;
            });

            if (total0 > 0 || total1 > 0) {
              const sat0 = total0 > 0 ? ((pos0 / total0) * 100).toFixed(1) : 0;
              const sat1 = total1 > 0 ? ((pos1 / total1) * 100).toFixed(1) : 0;
              if (parseFloat(sat0) > 0 || parseFloat(sat1) > 0) {
                currentY += 3;
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(16, 185, 129);
                doc.text(`✅ Satisfacción (${filteredDatasets[0].name.substring(0, 10)}): ${sat0}%`, 17, currentY);
                doc.text(`✅ Satisfacción (${filteredDatasets[1].name.substring(0, 10)}): ${sat1}%`, 100, currentY);
                currentY += 2;
              }
            }
          } else {
            let pos0 = 0; let total0 = 0;
            labelsArray.forEach(label => {
              const lowerLabel = String(label).toLowerCase().trim();
              const isPositive = positiveKeywords.some(kw => lowerLabel === kw || (lowerLabel.length > 5 && lowerLabel.includes(kw)));
              const c0 = allData[0] && allData[0].counts[label] ? allData[0].counts[label] : 0;
              if (isPositive) pos0 += c0;
              total0 += c0;
            });

            if (total0 > 0) {
              const sat0 = ((pos0 / total0) * 100).toFixed(1);
              if (parseFloat(sat0) > 0) {
                currentY += 3;
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(16, 185, 129);
                doc.text(`✅ Nivel de Satisfacción Positiva: ${sat0}%`, 17, currentY);
                currentY += 2;
              }
            }
          }

          currentY += 7;

          if (i < questionHeaders.length - 1) {
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.line(15, currentY, 195, currentY);
            currentY += 5;
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

        <div className="mb-8 max-w-2xl mx-auto">
          <div
            onClick={() => document.getElementById('fileInput').click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer p-8
              ${isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="text-5xl text-blue-500">📊</div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-700">
                  Arrastra tu archivo Excel aquí
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  XLSX, XLS o CSV (debe contener hoja "BaseUnificada")
                </p>
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
        </div>

        {datasets.length > 0 && (
          <div className="space-y-6">

            {/* Filters Section */}
            <div className="bg-white rounded-xl shadow-md border border-blue-100 overflow-hidden">
              <div className="border-b border-blue-100 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">🎯 Filtros de segmentación</h2>
                <p className="text-xs text-blue-500 mt-1">Los filtros afectan solo a las respuestas, no al total de matriculados</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredDatasets.map(ds => {
                const responseRate = ds.enrollmentCount > 0
                  ? ((ds.responseCount / ds.enrollmentCount) * 100).toFixed(1)
                  : 0;

                const validResponseRate = parseFloat(responseRate).toFixed(1);
                const responseColor = validResponseRate >= 70
                  ? 'text-green-600'
                  : validResponseRate >= 40
                    ? 'text-yellow-600'
                    : 'text-red-600';

                const tCount = ds.filteredData.filter(r => r['Metodología'] === 'Tradicional').length;
                const pCount = ds.filteredData.filter(r => r['Metodología'] === 'Protech XP').length;

                return (
                  <div key={ds.id} className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
                      <h3 className="text-sm font-bold text-white">{ds.name}</h3>
                    </div>
                    <div className="p-5">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 text-center">
                        <p className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">
                          📊 Total de Respuestas
                        </p>
                        <p className="text-4xl font-bold text-blue-600">{ds.responseCount}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {ds.enrollmentCount} estudiantes matriculados (total)
                        </p>
                        <p className={`text-sm font-semibold mt-2 ${responseColor}`}>
                          Tasa: {validResponseRate}%
                        </p>
                        {Object.keys(activeFilters).length > 0 && (
                          <p className="text-xs text-blue-500 mt-2">
                            🔍 Filtro aplicado a respuestas
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="text-center p-2 bg-green-50 rounded-lg">
                          <p className="text-xs font-medium text-green-600">🚀 Protech XP</p>
                          <p className="text-xl font-bold text-green-700">{pCount}</p>
                          <p className="text-xs text-slate-500">{ds.filteredData.length ? ((pCount / ds.filteredData.length) * 100).toFixed(1) : 0}%</p>
                        </div>
                        <div className="text-center p-2 bg-orange-50 rounded-lg">
                          <p className="text-xs font-medium text-orange-600">📚 Tradicional</p>
                          <p className="text-xl font-bold text-orange-700">{tCount}</p>
                          <p className="text-xs text-slate-500">{ds.filteredData.length ? ((tCount / ds.filteredData.length) * 100).toFixed(1) : 0}%</p>
                        </div>
                      </div>

                      {ds.hasEnrollmentData && Object.keys(ds.courseStats).length > 0 && (
                        <button
                          onClick={() => setShowEnrollmentDetail(!showEnrollmentDetail)}
                          className="w-full text-xs font-medium text-blue-600 hover:text-blue-800 py-2 border-t border-blue-100 mt-2"
                        >
                          {showEnrollmentDetail ? '▲ Ocultar desglose' : '▼ Ver desglose por curso y docente'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desglose detallado - 3 TABLAS: CURSO, DOCENTE, DOCENTE+CURSO+PEAD */}
            {showEnrollmentDetail && filteredDatasets.map((ds, idx) => {
              if (!ds.courseStats || Object.keys(ds.courseStats).length === 0) return null;

              // Filtrar estadísticas por docente si hay filtro activo
              let filteredCourseStats = { ...ds.courseStats };
              let filteredTeacherStats = { ...ds.teacherStats };
              let filteredTeacherCoursePeadStats = { ...ds.teacherCoursePeadStats };

              const teacherFilter = activeFilters['Docente'] || activeFilters['docente'] || activeFilters['Profesor'] || activeFilters['profesor'];
              if (teacherFilter) {
                // Filtrar courseStats - solo cursos de ese docente
                const newCourseStats = {};
                Object.entries(filteredTeacherCoursePeadStats).forEach(([key, value]) => {
                  if (value.teacher === teacherFilter) {
                    if (!newCourseStats[value.course]) {
                      newCourseStats[value.course] = { total: 0, responded: 0 };
                    }
                    newCourseStats[value.course].total += value.total;
                    newCourseStats[value.course].responded += value.responded;
                  }
                });
                filteredCourseStats = newCourseStats;

                // Filtrar teacherStats
                const newTeacherStats = {};
                if (filteredTeacherStats[teacherFilter]) {
                  newTeacherStats[teacherFilter] = filteredTeacherStats[teacherFilter];
                }
                filteredTeacherStats = newTeacherStats;

                // Filtrar teacherCoursePeadStats
                const newTeacherCoursePeadStats = {};
                Object.entries(filteredTeacherCoursePeadStats).forEach(([key, value]) => {
                  if (value.teacher === teacherFilter) {
                    newTeacherCoursePeadStats[key] = value;
                  }
                });
                filteredTeacherCoursePeadStats = newTeacherCoursePeadStats;
              }

              return (
                <div key={`detail-${ds.id}`} className="bg-white rounded-xl shadow-md border border-blue-100 overflow-hidden">
                  <div className="border-b border-blue-100 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">
                      📋 Desglose de participación - {ds.name}
                    </h2>
                    <p className="text-xs text-blue-500 mt-1">
                      {Object.keys(activeFilters).length > 0
                        ? `📌 Mostrando datos del docente filtrado`
                        : `📌 Datos completos (sin filtros)`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">⚠️ Las respuestas cuentan estudiantes únicos (una persona = un voto por curso/PEAD)</p>
                  </div>

                  <div className="p-6 space-y-8">

                    {/* TABLA 1: Por CURSO */}
                    {Object.keys(filteredCourseStats).length > 0 && (
                      <div>
                        <h3 className="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <span className="text-lg">📚</span> Participación por CURSO (estudiantes únicos)
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-blue-100">
                            <thead className="bg-blue-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-600">Curso</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Total Estudiantes</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Respondieron</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Tasa</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Barra</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-50">
                              {Object.entries(filteredCourseStats)
                                .sort((a, b) => b[1].total - a[1].total)
                                .map(([course, stats]) => {
                                  const rate = stats.total > 0 ? ((stats.responded / stats.total) * 100).toFixed(1) : 0;
                                  const rateValue = parseFloat(rate);
                                  const barColor = rateValue >= 70 ? 'bg-green-500' : rateValue >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                                  return (
                                    <tr key={course} className="hover:bg-blue-50 transition-colors">
                                      <td className="px-4 py-2 text-sm text-slate-600 font-medium">{course}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-bold">{stats.total}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-semibold text-green-600">{stats.responded}</td>
                                      <td className="px-4 py-2 text-sm text-center">
                                        <span className={`font-semibold ${rateValue >= 70 ? 'text-green-600' : rateValue >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                          {rate}%
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div
                                            className={`h-2 rounded-full ${barColor}`}
                                            style={{ width: `${rate}%` }}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TABLA 2: Por DOCENTE */}
                    {Object.keys(filteredTeacherStats).length > 0 && (
                      <div>
                        <h3 className="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <span className="text-lg">👨‍🏫</span> Participación por DOCENTE (estudiantes únicos)
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-blue-100">
                            <thead className="bg-blue-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-600">Docente</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Total Estudiantes</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Respondieron</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Tasa</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Barra</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-50">
                              {Object.entries(filteredTeacherStats)
                                .sort((a, b) => b[1].total - a[1].total)
                                .map(([teacher, stats]) => {
                                  const rate = stats.total > 0 ? ((stats.responded / stats.total) * 100).toFixed(1) : 0;
                                  const rateValue = parseFloat(rate);
                                  const barColor = rateValue >= 70 ? 'bg-green-500' : rateValue >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                                  return (
                                    <tr key={teacher} className="hover:bg-blue-50 transition-colors">
                                      <td className="px-4 py-2 text-sm text-slate-600 font-medium">{teacher}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-bold">{stats.total}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-semibold text-green-600">{stats.responded}</td>
                                      <td className="px-4 py-2 text-sm text-center">
                                        <span className={`font-semibold ${rateValue >= 70 ? 'text-green-600' : rateValue >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                          {rate}%
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div
                                            className={`h-2 rounded-full ${barColor}`}
                                            style={{ width: `${rate}%` }}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TABLA 3: Por DOCENTE + CURSO + PEAD */}
                    {Object.keys(filteredTeacherCoursePeadStats).length > 0 && (
                      <div>
                        <h3 className="text-md font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <span className="text-lg">👨‍🏫📚📋</span> Participación por DOCENTE + CURSO + PEAD
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">Un mismo docente con el mismo curso aparece en múltiples filas si tiene diferentes PEAD (secciones)</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-blue-100">
                            <thead className="bg-blue-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-600">Docente</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-600">Curso</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-blue-600">PEAD</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Total Estudiantes</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Respondieron</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Tasa</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600">Barra</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-50">
                              {Object.entries(filteredTeacherCoursePeadStats)
                                .sort((a, b) => b[1].total - a[1].total)
                                .map(([key, stats]) => {
                                  const rate = stats.total > 0 ? ((stats.responded / stats.total) * 100).toFixed(1) : 0;
                                  const rateValue = parseFloat(rate);
                                  const barColor = rateValue >= 70 ? 'bg-green-500' : rateValue >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                                  return (
                                    <tr key={key} className="hover:bg-blue-50 transition-colors">
                                      <td className="px-4 py-2 text-sm text-slate-600 font-medium">{stats.teacher}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600">{stats.course}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600">{stats.pead}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-bold">{stats.total}</td>
                                      <td className="px-4 py-2 text-sm text-slate-600 text-center font-semibold text-green-600">{stats.responded}</td>
                                      <td className="px-4 py-2 text-sm text-center">
                                        <span className={`font-semibold ${rateValue >= 70 ? 'text-green-600' : rateValue >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                          {rate}%
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div
                                            className={`h-2 rounded-full ${barColor}`}
                                            style={{ width: `${rate}%` }}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Botón Reporte General */}
            <div className="flex justify-end">
              <button
                onClick={generateFullReport}
                disabled={isGeneratingFullReport || questionHeaders.length === 0}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                <span className="text-lg">📑</span>
                {isGeneratingFullReport ? 'Generando...' : `Generar reporte completo`}
              </button>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-md border border-blue-100 overflow-hidden">
              <div className="border-b border-blue-100 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">📋 Vista previa de respuestas ({filteredDatasets[0].name})</h2>
                {Object.keys(activeFilters).length > 0 && (
                  <p className="text-xs text-blue-500 mt-1">Mostrando respuestas con filtros aplicados</p>
                )}
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="min-w-full divide-y divide-blue-100">
                  <thead className="bg-blue-50 sticky top-0">
                    <tr>
                      {headers.filter(h => {
                        const lower = h.toLowerCase();
                        return !IGNORED_COLUMNS.some(w => lower.includes(w));
                      }).map(header => (
                        <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-blue-600 uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-blue-50">
                    {filteredDatasets[0].filteredData.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition-colors">
                        {headers.filter(h => {
                          const lower = h.toLowerCase();
                          return !IGNORED_COLUMNS.some(w => lower.includes(w));
                        }).map(header => (
                          <td key={header} className="px-4 py-2.5 text-sm text-slate-600">
                            {row[header] !== undefined && row[header] !== null ? String(row[header]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredDatasets[0].filteredData.length > 100 && (
                <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 text-center text-xs text-blue-500">
                  Mostrando 100 de {filteredDatasets[0].filteredData.length} registros
                </div>
              )}
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
                    <option value="">Seleccione una pregunta...</option>
                    {questionHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                {chartData && (
                  <div>
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-blue-700">{cleanQuestionTitle(chartData.columnName)}</h3>
                    </div>

                    <div className="mb-8 border border-blue-100 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-blue-100">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-blue-600" rowSpan={2}>Respuesta</th>
                            {chartData.datasets.map((ds, idx) => (
                              <th key={idx} className="px-4 py-2.5 text-center text-xs font-semibold text-blue-600 border-l border-blue-100" colSpan={2}>
                                {ds.label}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {chartData.datasets.map((ds, idx) => (
                              <React.Fragment key={idx}>
                                <th className="px-4 py-2.5 text-right text-xs text-blue-500 bg-white border-t border-l border-blue-100">Cantidad</th>
                                <th className="px-4 py-2.5 text-right text-xs text-blue-500 bg-white border-t border-blue-100">%</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                          {chartData.labels.map((label, idx) => {
                            const cleanLabel = cleanQuestionTitle(label);
                            return (
                              <tr key={label} className="hover:bg-blue-50 transition-colors">
                                <td className="px-4 py-2.5 text-sm text-slate-600">{cleanLabel}</td>
                                {chartData.datasets.map((ds, dsIdx) => {
                                  const count = ds.originalCounts[idx] || 0;
                                  const percentage = ds.data[idx] || 0;
                                  return (
                                    <React.Fragment key={dsIdx}>
                                      <td className="px-4 py-2.5 text-sm text-slate-600 text-right font-medium border-l border-blue-50">{count}</td>
                                      <td className="px-4 py-2.5 text-sm text-slate-600 text-right bg-blue-50/30">
                                        <span className="text-blue-600 font-semibold">{percentage}%</span>
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className={`grid grid-cols-1 gap-8 ${datasets.length === 1 ? 'lg:grid-cols-2' : ''}`}>
                      {datasets.length === 1 && (
                        <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                          <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📊 Distribución circular</h4>
                          <div className="w-full max-w-[380px] mx-auto">
                            <Pie ref={pieRef} data={chartData} options={pieOptions} />
                          </div>
                        </div>
                      )}
                      <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                        <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📈 Comparativa Porcentual</h4>
                        <div style={{ height: '380px' }}>
                          <Bar ref={barRef} data={chartData} options={barOptions} />
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
