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

// Añadimos columnas de fecha/hora para excluir de la vista previa
const DATE_TIME_COLUMNS = [
  'marca temporal', 'fecha', 'hora', 'timestamp', 'time',
  'fecha de inicio', 'fecha de finalización', 'fecha inicio', 'fecha fin',
  'fecha de envío', 'fecha_envío', 'fecha envió'
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
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingFullReport, setIsGeneratingFullReport] = useState(false);
  const pieRef = useRef(null);
  const barRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);

      if (jsonData.length > 0) {
        let headersList = Object.keys(jsonData[0]);

        // Filtrar columnas de fecha/hora para no mostrarlas en la tabla
        headersList = headersList.filter(header => {
          const lower = header.toLowerCase();
          return !DATE_TIME_COLUMNS.some(dateCol => lower.includes(dateCol));
        });

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

        setOriginalData(jsonData);
        setFilteredData(jsonData);
        setHeaders(headersList);
        setActiveFilters({});
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
    Object.entries(filters).forEach(([col, val]) => {
      result = result.filter(row => row[col] === val);
    });
    setFilteredData(result);
  };

  const clearFilters = () => {
    setFilteredData(originalData);
    setActiveFilters({});
  };

  const getAvailableValuesForFilter = (column) => {
    if (!column) return [];
    let baseData = originalData;
    Object.entries(activeFilters).forEach(([col, val]) => {
      if (col !== column) {
        baseData = baseData.filter(row => row[col] === val);
      }
    });
    return [...new Set(baseData.map(row => row[column]))].filter(val => val !== undefined && val !== null);
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

  // Filtrar headers para excluir también las columnas de fecha/hora de los filtros
  const filterableHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    return !IGNORED_COLUMNS.some(w => lower.includes(w)) && !DATE_TIME_COLUMNS.some(d => lower.includes(d));
  });

  const demographicHeaders = headers.filter(h => {
    const lower = h.toLowerCase();
    return DEMOGRAPHIC_KEYWORDS.some(kw => lower.includes(kw)) && !DATE_TIME_COLUMNS.some(d => lower.includes(d));
  });

  const questionHeaders = filterableHeaders.filter(h => !demographicHeaders.includes(h) && h !== 'Metodología');

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

  // Plugin para mostrar etiquetas en las barras (SOLO PARA EL GRÁFICO DE BARRAS)
  const barDataLabelsPlugin = {
    id: 'barDataLabels',
    afterDraw: (chart) => {
      // Solo aplicar si es un gráfico de barras
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

  // Registrar solo el plugin de barras
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
        
        // Información general de filtros y muestra
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        const filterText = Object.keys(activeFilters).length > 0
          ? `Filtros aplicados: ${Object.entries(activeFilters).map(([k, v]) => `${k}: ${v}`).join(' | ')}`
          : 'Filtros: Ninguno (datos completos)';
        
        const filteredLines = doc.splitTextToSize(filterText, 180);
        doc.text(filteredLines, 15, currentY);
        currentY += (filteredLines.length * 5) + 8;
        
        // Muestra evaluada y metodología
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
        const responseRate = ((filteredData.length / 1173) * 100).toFixed(1);
        doc.text(`Tasa de respuesta: ${responseRate}% (sobre 1,173 matriculados)`, 20, currentY + 16);
        
        const tradicionalCount = filteredData.filter(r => r['Metodología'] === 'Tradicional').length;
        const protechCount = filteredData.filter(r => r['Metodología'] === 'Protech XP').length;
        const tradPercent = ((tradicionalCount / filteredData.length) * 100).toFixed(1);
        const protechPercent = ((protechCount / filteredData.length) * 100).toFixed(1);
        
        doc.setTextColor(59, 130, 246);
        doc.text(`Metodología Tradicional: ${tradicionalCount} (${tradPercent}%)`, 20, currentY + 23);
        doc.setTextColor(16, 185, 129);
        doc.text(`Metodología Protech XP: ${protechCount} (${protechPercent}%)`, 20, currentY + 30);
        
        currentY += 45;
        
        // Analizar cada pregunta
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
          
          // Tabla de frecuencias
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

        {/* Upload Area - Con color */}
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
                  XLSX, XLS o CSV
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

            {/* KPI Cards con colores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-md p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">Muestra evaluada</p>
                    <p className="text-3xl font-bold mt-1">{filteredData.length}</p>
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
                    <p className="text-3xl font-bold mt-1">{((filteredData.length / 1173) * 100).toFixed(1)}%</p>
                    <p className="text-xs text-emerald-100 mt-1">sobre 1,173 matriculados</p>
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
                    <span className="text-sm font-bold">
                      {filteredData.filter(r => r['Metodología'] === 'Tradicional').length} ({((filteredData.filter(r => r['Metodología'] === 'Tradicional').length / filteredData.length) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-100">Protech XP</span>
                    <span className="text-sm font-bold">
                      {filteredData.filter(r => r['Metodología'] === 'Protech XP').length} ({((filteredData.filter(r => r['Metodología'] === 'Protech XP').length / filteredData.length) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>

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
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">📋 Vista previa de datos</h2>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="min-w-full divide-y divide-blue-100">
                  <thead className="bg-blue-50 sticky top-0">
                    <tr>
                      {headers.map(header => (
                        <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-blue-600 uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-blue-50">
                    {filteredData.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition-colors">
                        {headers.map(header => {
                          let value = row[header];
                          // Si es una fecha/hora, formatearla o mostrarla de manera legible
                          if (value && (header.toLowerCase().includes('fecha') || header.toLowerCase().includes('hora') || header.toLowerCase().includes('timestamp'))) {
                            // Intentar formatear la fecha si es un número de Excel
                            if (typeof value === 'number') {
                              try {
                                const date = XLSX.SSF.parse_date_code(value);
                                if (date) {
                                  value = `${date.d}/${date.m}/${date.y}`;
                                }
                              } catch(e) {
                                value = String(value);
                              }
                            } else {
                              value = String(value);
                            }
                          } else if (value !== undefined && value !== null) {
                            value = String(value);
                          } else {
                            value = '-';
                          }
                          return (
                            <td key={header} className="px-4 py-2.5 text-sm text-slate-600">
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredData.length > 100 && (
                <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 text-center text-xs text-blue-500">
                  Mostrando 100 de {filteredData.length} registros
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
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-blue-600">Cantidad</th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-blue-600">Porcentaje</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                          {chartData.labels.map((label, idx) => {
                            const count = chartData.counts[label];
                            const percentage = ((count / chartData.total) * 100).toFixed(1);
                            const cleanLabel = cleanQuestionTitle(label);
                            return (
                              <tr key={label} className="hover:bg-blue-50 transition-colors">
                                <td className="px-4 py-2.5 text-sm text-slate-600">{cleanLabel}</td>
                                <td className="px-4 py-2.5 text-sm text-slate-600 text-right font-medium">{count}</td>
                                <td className="px-4 py-2.5 text-sm text-slate-600 text-right">
                                  <span className="text-blue-600 font-semibold">{percentage}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Charts - Las etiquetas solo aparecen en el gráfico de barras */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                        <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📊 Distribución circular</h4>
                        <div className="w-full max-w-[380px] mx-auto">
                          <Pie ref={pieRef} data={chartData} options={pieOptions} />
                        </div>
                      </div>
                      <div className="border border-blue-100 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white">
                        <h4 className="text-sm font-semibold text-blue-600 text-center mb-4">📈 Frecuencias analíticas</h4>
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
