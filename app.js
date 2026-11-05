let datasetPrincipal = null;
let datasetExterno = null;

document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const inputFileData = document.getElementById('input_filedata');
    const inputArchivoExterno = document.getElementById('input_Archivo_Externo');
    const btnAnalizar = document.getElementById('btnAnalizar');
    const contenedorValidacion = document.getElementById('Mensajes_Validacion');

    const spanNombrePrincipal = document.getElementById('nombre_archivo_principal');
    const btnQuitarPrincipal = document.getElementById('btn_quitar_principal');
    const spanNombreExterno = document.getElementById('nombre_archivo_externo');
    const btnQuitarExterno = document.getElementById('btn_quitar_externo');

    // Manejo de carga del Dataset Principal
    inputFileData.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (spanNombrePrincipal) spanNombrePrincipal.textContent = file.name;
        if (btnQuitarPrincipal) btnQuitarPrincipal.style.display = 'flex';

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                datasetPrincipal = parseDataset(event.target.result);
                ocultarAlerta();
            } catch (err) {
                mostrarAlerta("Error al procesar el dataset principal: " + esc(err.message));
                datasetPrincipal = null;
                inputFileData.value = '';
                if (spanNombrePrincipal) spanNombrePrincipal.textContent = 'Ningún archivo seleccionado';
                if (btnQuitarPrincipal) btnQuitarPrincipal.style.display = 'none';
            }
        };
        reader.readAsText(file);
    });

    // Botón X Principal
    if (btnQuitarPrincipal) {
        btnQuitarPrincipal.addEventListener('click', () => {
            inputFileData.value = '';
            datasetPrincipal = null;
            spanNombrePrincipal.textContent = 'Ningún archivo seleccionado';
            btnQuitarPrincipal.style.display = 'none';
            ocultarAlerta();
        });
    }

    // Manejo de carga del Dataset Externo
    inputArchivoExterno.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (spanNombreExterno) spanNombreExterno.textContent = file.name;
        if (btnQuitarExterno) btnQuitarExterno.style.display = 'flex';

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                // Se lee con el mismo parser; la compatibilidad con el dataset principal se valida al analizar
                datasetExterno = parseDataset(event.target.result, { esExterno: true });
                ocultarAlerta();
            } catch (err) {
                mostrarAlerta("Error al procesar el archivo externo: " + esc(err.message));
                datasetExterno = null;
                inputArchivoExterno.value = '';
                if (spanNombreExterno) spanNombreExterno.textContent = 'Ningún archivo seleccionado';
                if (btnQuitarExterno) btnQuitarExterno.style.display = 'none';
            }
        };
        reader.readAsText(file);
    });

    // Botón X Externo
    if (btnQuitarExterno) {
        btnQuitarExterno.addEventListener('click', () => {
            inputArchivoExterno.value = '';
            datasetExterno = null;
            spanNombreExterno.textContent = 'Ningún archivo seleccionado';
            btnQuitarExterno.style.display = 'none';
            ocultarAlerta();
        });
    }

    // Botón Análisis
    btnAnalizar.addEventListener('click', () => {
        const errores = validarEntradas(datasetPrincipal, datasetExterno);
        if (errores.length > 0) {
            mostrarAlerta(errores.map(esc).join("<br>"));
            return;
        }
        ocultarAlerta();

        try {
            const avisos = ejecutarClasificador();
            if (avisos.length > 0) mostrarAviso(avisos.map(esc).join("<br>"));
        } catch (err) {
            mostrarAlerta("Error durante la ejecución del clasificador: " + esc(err.message));
            console.error(err);
        }
    });

    function mostrarAlerta(mensaje) {
        contenedorValidacion.classList.remove('aviso');
        contenedorValidacion.innerHTML = mensaje;
        contenedorValidacion.hidden = false;
        contenedorValidacion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function mostrarAviso(mensaje) {
        contenedorValidacion.classList.add('aviso');
        contenedorValidacion.innerHTML = mensaje;
        contenedorValidacion.hidden = false;
    }

    function ocultarAlerta() {
        contenedorValidacion.classList.remove('aviso');
        contenedorValidacion.innerHTML = "";
        contenedorValidacion.hidden = true;
    }
});

// Escapa texto proveniente de los archivos antes de insertarlo como HTML
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// 1. LECTURA DE ARCHIVOS (CSV y ARFF)
// ==========================================
const VALORES_FALTANTES = new Set(['', '?', 'NA', 'N/A']);
const REGEX_NUMERO = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

// Convierte un texto a número finito; acepta coma decimal ("1,5"). Devuelve NaN si no es un número válido.
function aNumero(v) {
    let s = String(v).trim();
    if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    if (!REGEX_NUMERO.test(s)) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

// Parser de texto delimitado que respeta comillas (RFC 4180):
// separadores y saltos de línea dentro de comillas y comillas escapadas ("").
function parseDelimitado(text, sep, comillas = '"') {
    const filas = [];
    let fila = [], campo = '', enComillas = null, entrecomillado = false, i = 0;
    const cerrarCampo = () => { fila.push(entrecomillado ? campo : campo.trim()); campo = ''; entrecomillado = false; };
    while (i < text.length) {
        const ch = text[i];
        if (enComillas) {
            if (ch === enComillas) {
                if (text[i + 1] === enComillas) { campo += ch; i += 2; continue; }
                enComillas = null; i++; continue;
            }
            campo += ch; i++; continue;
        }
        if (comillas.includes(ch) && campo.trim() === '' && !entrecomillado) {
            enComillas = ch; entrecomillado = true; campo = ''; i++; continue;
        }
        if (ch === sep) { cerrarCampo(); i++; continue; }
        if (ch === '\r' || ch === '\n') {
            cerrarCampo(); filas.push(fila); fila = [];
            if (ch === '\r' && text[i + 1] === '\n') i++;
            i++; continue;
        }
        if (entrecomillado && /\s/.test(ch)) { i++; continue; } // espacios tras la comilla de cierre
        campo += ch; i++;
    }
    if (enComillas) throw new Error("Hay comillas sin cerrar en el archivo.");
    if (campo !== '' || entrecomillado || fila.length > 0) { cerrarCampo(); filas.push(fila); }
    // Se descartan líneas vacías y comentarios que inician con '%'
    return filas.filter(f => !(f.length === 1 && f[0] === '') && !(f.length > 0 && f[0].startsWith('%')));
}

// Elige el separador (coma, punto y coma o tabulador) que produce la tabla más consistente
function detectarSeparador(text) {
    let mejor = null, errorLectura = null;
    for (const sep of [',', ';', '\t']) {
        let filas;
        try { filas = parseDelimitado(text, sep); } catch (e) { errorLectura = errorLectura || e; continue; }
        if (filas.length === 0 || filas[0].length < 2) continue;
        const nc = filas[0].length;
        const consistencia = filas.filter(f => f.length === nc).length / filas.length;
        if (!mejor || consistencia > mejor.consistencia || (consistencia === mejor.consistencia && nc > mejor.nc)) {
            mejor = { sep, filas, nc, consistencia };
        }
    }
    if (!mejor && errorLectura) throw errorLectura;
    if (!mejor) throw new Error("El archivo no tiene un formato tabular válido (se esperan al menos dos columnas separadas por coma, punto y coma o tabulador).");
    return mejor;
}

function esArff(text) {
    return /^\s*@(relation|attribute|data)\b/im.test(text);
}

// Lee un nombre de atributo ARFF (puede ir entre comillas) y devuelve [nombre, resto]
function leerNombreArff(s) {
    s = s.trim();
    if (s[0] === "'" || s[0] === '"') {
        const q = s[0], fin = s.indexOf(q, 1);
        if (fin < 0) throw new Error("Nombre de atributo ARFF con comillas sin cerrar.");
        return [s.slice(1, fin), s.slice(fin + 1).trim()];
    }
    const m = s.match(/^(\S+)\s*(.*)$/);
    return [m[1], m[2].trim()];
}

// Parser ARFF: usa los tipos declarados en @attribute (numeric/real/integer, nominal {..} o string)
function parseARFF(text) {
    const atributos = [];
    const datos = [];
    let enDatos = false;
    const lineas = text.split(/\r?\n/);
    for (let k = 0; k < lineas.length; k++) {
        const l = lineas[k].trim();
        if (!l || l.startsWith('%')) continue;
        if (!enDatos) {
            const low = l.toLowerCase();
            if (low.startsWith('@relation')) continue;
            if (low.startsWith('@attribute')) {
                const [nombre, tipo] = leerNombreArff(l.slice(10));
                const tipoLow = tipo.toLowerCase();
                if (tipo.startsWith('{')) {
                    if (!tipo.endsWith('}')) throw new Error(`Atributo nominal mal declarado: '${nombre}'.`);
                    const valores = parseDelimitado(tipo.slice(1, -1), ',', '"\'')[0] || [];
                    atributos.push({ nombre, tipo: 'categorical', valores: new Set(valores) });
                } else if (['numeric', 'real', 'integer'].includes(tipoLow)) {
                    atributos.push({ nombre, tipo: 'numeric' });
                } else if (tipoLow === 'string') {
                    atributos.push({ nombre, tipo: 'categorical' });
                } else {
                    throw new Error(`Tipo de atributo ARFF no soportado ('${tipo}') en '${nombre}'. Se admiten numeric, real, integer, string y nominales {…}.`);
                }
                continue;
            }
            if (low.startsWith('@data')) { enDatos = true; continue; }
            throw new Error(`Línea no reconocida en la cabecera ARFF (línea ${k + 1}).`);
        }
        if (l.startsWith('{')) throw new Error("El formato ARFF disperso ({índice valor}) no está soportado.");
        const fila = parseDelimitado(l, ',', '"\'')[0];
        fila.__linea = k + 1;
        datos.push(fila);
    }
    if (!enDatos) throw new Error("El archivo ARFF no contiene la sección @data.");
    if (atributos.length === 0) throw new Error("El archivo ARFF no declara atributos (@attribute).");
    // Validación de valores nominales declarados
    datos.forEach(fila => {
        if (fila.length !== atributos.length) {
            throw new Error(`Inconsistencia en la línea ${fila.__linea}: hay ${fila.length} valores y se declararon ${atributos.length} atributos.`);
        }
        atributos.forEach((a, c) => {
            const v = fila[c];
            if (a.valores && !VALORES_FALTANTES.has(v) && !a.valores.has(v)) {
                throw new Error(`Valor '${v}' no declarado para el atributo nominal '${a.nombre}' (línea ${fila.__linea}).`);
            }
        });
    });
    return {
        headers: atributos.map(a => a.nombre),
        rows: datos,
        tipos: atributos.slice(0, -1).map(a => a.tipo),
        lineas: datos.map(f => f.__linea),
        sinEncabezado: false,
        formato: 'ARFF'
    };
}

// Lee CSV/TXT/DATA. Si la primera fila contiene algún valor numérico se considera que el archivo no
// tiene encabezados y se generan nombres "Atributo 1..n" y "Clase".
function parseTabla(text) {
    const { filas } = detectarSeparador(text);
    let headers = filas[0];
    let rows = filas.slice(1);
    let sinEncabezado = false;
    let primeraLinea = 2;
    if (headers.some(h => !Number.isNaN(aNumero(h)))) {
        sinEncabezado = true;
        rows = filas;
        primeraLinea = 1;
        headers = headers.map((_, i) => i === headers.length - 1 ? 'Clase' : `Atributo ${i + 1}`);
    }
    return { headers, rows, tipos: null, lineas: rows.map((_, i) => i + primeraLinea), sinEncabezado, formato: 'CSV' };
}

function parseDataset(text, opciones = {}) {
    if (!text || text.trim() === "") {
        throw new Error("El archivo está vacío.");
    }
    text = text.replace(/^﻿/, ''); // marca BOM de algunos editores

    const datos = esArff(text) ? parseARFF(text) : parseTabla(text);
    const { headers, rows, lineas } = datos;

    if (headers.length < 2) {
        throw new Error("El dataset contiene menos de dos columnas.");
    }
    if (headers.some(h => h === "")) {
        throw new Error("El dataset contiene encabezados vacíos.");
    }
    if (new Set(headers).size !== headers.length) {
        throw new Error("El dataset contiene encabezados duplicados.");
    }
    if (rows.length === 0) {
        throw new Error("El archivo solo contiene el encabezado, no hay registros de datos.");
    }

    const numCols = headers.length;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].length !== numCols) {
            throw new Error(`Inconsistencia en la fila ${lineas[i]}: tiene ${rows[i].length} columnas y el encabezado tiene ${numCols}.`);
        }
        const c = rows[i].findIndex(v => VALORES_FALTANTES.has(v));
        if (c >= 0) {
            throw new Error(`Valor faltante ('${rows[i][c]}') en la fila ${lineas[i]}, columna '${headers[c]}'.`);
        }
    }

    // Tipos: declarados (ARFF) o inferidos (CSV: numérica si al menos el 70 % de los valores son números)
    let colTypes = datos.tipos;
    if (!colTypes) {
        colTypes = [];
        for (let c = 0; c < numCols - 1; c++) {
            const numericos = rows.filter(r => !Number.isNaN(aNumero(r[c]))).length;
            colTypes.push(numericos / rows.length >= 0.7 ? 'numeric' : 'categorical');
        }
    }

    // Columnas numéricas: todos los valores deben ser números finitos; se normalizan a formato con punto
    const rowsRaw = rows.map(r => [...r]);
    for (let c = 0; c < numCols - 1; c++) {
        if (colTypes[c] !== 'numeric') continue;
        for (let r = 0; r < rows.length; r++) {
            const n = aNumero(rows[r][c]);
            if (Number.isNaN(n)) {
                throw new Error(`Valor no numérico '${rows[r][c]}' en la columna numérica '${headers[c]}' (fila ${lineas[r]}).`);
            }
            rows[r][c] = String(n);
        }
    }

    return { rows, rowsRaw, colTypes, numCols, headers, lineas, sinEncabezado: datos.sinEncabezado, formato: datos.formato, esExterno: !!opciones.esExterno };
}

// Convierte las filas del archivo externo usando los tipos del dataset de entrenamiento.
// Devuelve { filas, conClase, errores }.
function adaptarExterno(main, ext) {
    const errores = [];
    const nAtr = main.numCols - 1;
    let conClase;
    if (ext.numCols === main.numCols) conClase = true;
    else if (ext.numCols === nAtr) conClase = false;
    else {
        errores.push(`• Incompatibilidad de columnas: el dataset principal tiene ${main.numCols} columnas (${nAtr} atributos + clase) y el externo tiene ${ext.numCols}.`);
        return { filas: [], conClase: false, errores };
    }
    // Si ambos archivos tienen encabezados, los nombres deben coincidir en el mismo orden
    if (!main.sinEncabezado && !ext.sinEncabezado) {
        const esperados = main.headers.slice(0, conClase ? main.numCols : nAtr);
        const mismos = esperados.length === ext.headers.length && esperados.every(h => ext.headers.includes(h));
        const mismoOrden = esperados.every((h, i) => h === ext.headers[i]);
        if (!mismos) {
            errores.push("• Los atributos (encabezados) del archivo externo no coinciden con los del dataset principal.");
            return { filas: [], conClase, errores };
        }
        if (!mismoOrden) {
            errores.push("• Las columnas del archivo externo están en un orden diferente al dataset principal.");
            return { filas: [], conClase, errores };
        }
    }
    const filas = [];
    for (let r = 0; r < ext.rowsRaw.length; r++) {
        const raw = ext.rowsRaw[r];
        const fila = [];
        for (let c = 0; c < nAtr; c++) {
            if (main.colTypes[c] === 'numeric') {
                const n = aNumero(raw[c]);
                if (Number.isNaN(n)) {
                    errores.push(`• Archivo externo, fila ${ext.lineas[r]}: el atributo '${main.headers[c]}' es numérico en el dataset y el valor '${raw[c]}' no es un número.`);
                    return { filas: [], conClase, errores };
                }
                fila.push(String(n));
            } else {
                fila.push(raw[c]);
            }
        }
        fila.push(conClase ? raw[nAtr] : null);
        filas.push(fila);
    }
    if (conClase) {
        const clases = new Set(main.rows.map(r => r[main.numCols - 1]));
        for (let r = 0; r < filas.length; r++) {
            const cls = filas[r][nAtr];
            if (!clases.has(cls)) {
                errores.push(`• Clase desconocida '${cls}' en la fila ${ext.lineas[r]} del archivo externo. No existe en el entrenamiento.`);
                break;
            }
        }
    }
    return { filas, conClase, errores };
}

// ==========================================
// 2. VALIDACIÓN DE ENTRADAS
// ==========================================
function validarEntradas(datasetMain, datasetExternal) {
    let errores = [];
    const mismoData = document.getElementById('Radio_same_Data').checked;
    const externo = document.getElementById('Radio_Archivo_Externo').checked;
    const simple = document.getElementById('Radio_Validacion_Simple').checked;
    const cruzada = document.getElementById('Radio_Validacion_Cruzada').checked;
    const estratificada = document.getElementById('Check_Estratificada').checked;

    // 1. Validar Dataset Principal
    if (!datasetMain) {
        if (externo && datasetExternal) {
            errores.push("• El externo necesita el dataset para entrenar.");
        } else {
            errores.push("• Falta el dataset.");
        }
    } else {
        if (!datasetMain.rows || datasetMain.rows.length < 2) {
            errores.push("• El dataset principal es demasiado pequeño.");
        }
        // Debe haber al menos 2 clases distintas para poder clasificar
        const conteoClases = contarClases(datasetMain.rows);
        if (Object.keys(conteoClases).length < 2) {
            errores.push("• El dataset debe tener al menos 2 clases distintas (solo tiene la clase '" + Object.keys(conteoClases)[0] + "').");
        }
    }

    // 2. Validar selección de modo de pruebas
    if (!mismoData && !externo) {
        errores.push("• Debe seleccionar un método de pruebas.");
    }

    // Tamaño mínimo del conjunto de entrenamiento (para validar el número de intervalos)
    let nEntrenamiento = datasetMain ? datasetMain.rows.length : 0;

    // 3. Validaciones si es "Mismo dataset"
    if (mismoData) {
        if (!simple && !cruzada) {
            errores.push("• Debe seleccionar un método de validación (Simple o Cruzada).");
        }
        // Cada clase necesita al menos 2 instancias para repartirse entre entrenamiento y prueba
        if (datasetMain) {
            const conteo = contarClases(datasetMain.rows);
            const clasesConUna = Object.keys(conteo).filter(c => conteo[c] < 2);
            if (clasesConUna.length > 0) {
                errores.push("• La(s) clase(s) '" + clasesConUna.join("', '") + "' tiene(n) solo 1 instancia; no se puede repartir entre entrenamiento y prueba.");
            }
        }
        if (simple) {
            const inputPorc = document.getElementById('Input_porcentaje_entrenamiento');
            const porcVal = inputPorc.value.trim();
            const porc = Number(porcVal);

            if (inputPorc.validity.badInput) {
                errores.push("• Porcentaje de entrenamiento: debe ser un número.");
            } else if (porcVal === "") {
                errores.push("• Porcentaje de entrenamiento: campo obligatorio.");
            } else if (isNaN(porc) || /[^0-9.-]/.test(porcVal)) {
                errores.push("• Porcentaje de entrenamiento: debe ser un número.");
            } else if (porc <= 0 || porc >= 100) {
                errores.push("• Porcentaje de entrenamiento: debe estar entre 1 y 99.");
            } else if (datasetMain) {
                // Calcula exactamente cuántas instancias quedarían en cada conjunto
                const t = tamanosSplit(datasetMain.rows, porc, estratificada);
                nEntrenamiento = t.train;
                if (t.train === 0) {
                    errores.push("• Con " + porc + "% el conjunto de ENTRENAMIENTO queda vacío. Aumente el porcentaje.");
                } else if (t.test === 0) {
                    errores.push("• Con " + porc + "% el conjunto de PRUEBA queda vacío. Disminuya el porcentaje.");
                } else if (estratificada) {
                    // En la partición estratificada, ninguna clase puede quedar fuera del entrenamiento
                    const sinEntrenar = Object.keys(t.porClase).filter(c => t.porClase[c] === 0);
                    if (sinEntrenar.length > 0) {
                        errores.push("• Con " + porc + "% la(s) clase(s) '" + sinEntrenar.join("', '") + "' no tendría(n) instancias de entrenamiento. Aumente el porcentaje.");
                    }
                }
            }
        } else if (cruzada && datasetMain) {
            const t = tamanosSplit(datasetMain.rows, 50, estratificada);
            nEntrenamiento = Math.min(t.train, t.test);
        }
    }

    // 4. Validaciones para "Archivo externo"
    if (externo) {
        if (!datasetExternal) {
            errores.push("• Ha seleccionado archivo externo pero no ha cargado ningún archivo de pruebas válido.");
        } else if (datasetMain) {
            errores.push(...adaptarExterno(datasetMain, datasetExternal).errores);
        }
    }

    // 5. Validar Parámetros de Variables Continuas
    const metodoCont = document.getElementById('Select_Metodo_Continuas').value;
    if (metodoCont === 'frecuencias' || metodoCont === 'anchos') {
        const inputDisc = document.getElementById('Input_Porcentaje_discrecion');
        const discVal = inputDisc.value.trim();
        const disc = Number(discVal);

        if (inputDisc.validity.badInput) {
            errores.push("• Intervalos de discretización: debe ser un número.");
        } else if (discVal === "") {
            errores.push("• Intervalos de discretización: campo obligatorio.");
        } else if (isNaN(disc) || /[^0-9.-]/.test(discVal)) {
            errores.push("• Intervalos de discretización: debe ser un número.");
        } else if (!Number.isInteger(disc)) {
            errores.push("• Intervalos de discretización: debe ser entero.");
        } else if (disc < 2) {
            errores.push("• Intervalos de discretización: debe ser un entero ≥ 2.");
        } else if (datasetMain && nEntrenamiento > 0 && disc > nEntrenamiento) {
            errores.push("• Intervalos de discretización: hay más intervalos (" + disc + ") que instancias de entrenamiento (" + nEntrenamiento + ").");
        }
    }

    return errores;
}

// ==========================================
// 3. CLASE ALGORITMO BAYES INGENUO
// ==========================================
class NaiveBayesClassifier {
    constructor(colTypes, useLaplace, continuousMethod) {
        this.colTypes = colTypes;
        this.useLaplace = useLaplace;
        this.continuousMethod = continuousMethod;
        this.classes = [];
        this.classCounts = {};
        this.totalRows = 0;
        this.discreteTables = {};
        this.numericStats = {};
        this.uniqueValuesPerCol = {};
    }

    // Un atributo se trata como continuo solo si es numérico y se eligió la densidad normal
    esContinuo(c) {
        return this.colTypes[c] === 'numeric' && this.continuousMethod === 'normal';
    }

    train(rows) {
        if (!rows || rows.length === 0) throw new Error("El conjunto de entrenamiento está vacío.");
        this.totalRows = rows.length;
        const numCols = rows[0].length;
        const classColIdx = numCols - 1;

        let classCountsMap = {};
        for (let c = 0; c < numCols - 1; c++) {
            this.uniqueValuesPerCol[c] = new Set();
        }

        rows.forEach(row => {
            const cls = row[classColIdx];
            classCountsMap[cls] = (classCountsMap[cls] || 0) + 1;
            for (let c = 0; c < numCols - 1; c++) {
                this.uniqueValuesPerCol[c].add(row[c]);
            }
        });

        this.classes = Object.keys(classCountsMap);
        this.classCounts = classCountsMap;

        this.classes.forEach(cls => {
            this.discreteTables[cls] = {};
            this.numericStats[cls] = {};
            for (let c = 0; c < numCols - 1; c++) {
                if (this.esContinuo(c)) this.numericStats[cls][c] = { values: [] };
                else this.discreteTables[cls][c] = {};
            }
        });

        rows.forEach(row => {
            const cls = row[classColIdx];
            for (let c = 0; c < numCols - 1; c++) {
                if (this.esContinuo(c)) {
                    const val = Number(row[c]);
                    if (!Number.isFinite(val)) throw new Error(`Valor no numérico '${row[c]}' en un atributo continuo.`);
                    this.numericStats[cls][c].values.push(val);
                } else {
                    const table = this.discreteTables[cls][c];
                    table[row[c]] = (table[row[c]] || 0) + 1;
                }
            }
        });

        // Media y varianza muestral (n - 1) por clase. Se suma una pequeña varianza de suavizado
        // proporcional a la varianza global del atributo (epsilon = 1e-9 * varianza global), como en
        // scikit-learn; si la clase tiene una sola instancia se usa la varianza global del atributo.
        const varianza = (vals) => {
            const n = vals.length;
            if (n < 2) return null;
            const m = vals.reduce((a, b) => a + b, 0) / n;
            return vals.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
        };
        for (let c = 0; c < numCols - 1; c++) {
            if (!this.esContinuo(c)) continue;
            const todos = rows.map(r => Number(r[c]));
            const varGlobal = varianza(todos) || 0;
            const epsilon = varGlobal > 0 ? 1e-9 * varGlobal : 1e-9;
            this.classes.forEach(cls => {
                const vals = this.numericStats[cls][c].values;
                const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
                const v = varianza(vals);
                const variance = (v === null ? varGlobal : v) + epsilon;
                this.numericStats[cls][c] = { mean, variance };
            });
        }
    }

    // Devuelve, para cada clase, el número de factores con probabilidad cero (solo sin Laplace)
    // y la suma de logaritmos del resto. La clase ganadora es la de menos ceros y, entre ellas,
    // la de mayor log-probabilidad: equivale exactamente a comparar productos con ceros reales.
    puntuaciones(row) {
        const numAtr = this.colTypes.length;
        return this.classes.map(cls => {
            let logProb = Math.log(this.classCounts[cls] / this.totalRows);
            let ceros = 0;
            for (let c = 0; c < numAtr; c++) {
                const val = row[c];
                if (this.esContinuo(c)) {
                    const x = Number(val);
                    if (!Number.isFinite(x)) throw new Error(`Valor no numérico '${val}' en el atributo continuo ${c + 1}.`);
                    const { mean, variance } = this.numericStats[cls][c];
                    // Logaritmo de la densidad normal calculado directamente (sin exp) para evitar underflow
                    logProb += -0.5 * Math.log(2 * Math.PI * variance) - ((x - mean) ** 2) / (2 * variance);
                } else {
                    const count = this.discreteTables[cls][c][val] || 0;
                    const totalClassCount = this.classCounts[cls];
                    if (this.useLaplace) {
                        logProb += Math.log((count + 1) / (totalClassCount + this.uniqueValuesPerCol[c].size));
                    } else if (count === 0) {
                        ceros++;
                    } else {
                        logProb += Math.log(count / totalClassCount);
                    }
                }
            }
            return { clase: cls, ceros, logProb };
        });
    }

    predict(row) {
        return this.predictDetalle(row).clase;
    }

    predictDetalle(row) {
        const p = this.puntuaciones(row);
        const minCeros = Math.min(...p.map(x => x.ceros));
        const candidatas = p.filter(x => x.ceros === minCeros);
        const maxLog = Math.max(...candidatas.map(x => x.logProb));
        const mejor = candidatas.find(x => x.logProb === maxLog);
        // Probabilidad a posteriori normalizada (las clases con más ceros tienen probabilidad 0)
        const suma = candidatas.reduce((a, x) => a + Math.exp(x.logProb - maxLog), 0);
        const probabilidad = minCeros === 0 ? 1 / suma : null;
        return { clase: mejor.clase, probabilidad };
    }
}

// ==========================================
// 4. DISCRETIZACIÓN (BINNING)
// ==========================================
function discretizarDataset(trainRows, testRows, colTypes, metodo, numBins) {
    let trainProcessed = trainRows.map(r => [...r]);
    let testProcessed = testRows ? testRows.map(r => [...r]) : null;

    if (metodo === 'normal') return { train: trainProcessed, test: testProcessed };

    const numCols = trainRows[0].length;
    for (let c = 0; c < numCols - 1; c++) {
        if (colTypes[c] !== 'numeric') continue;
        // Los límites se calculan SOLO con el conjunto de entrenamiento
        const values = trainRows.map(r => Number(r[c])).sort((a, b) => a - b);
        const min = values[0];
        const max = values[values.length - 1];

        let edges = [];
        if (max === min) {
            edges = [min, max]; // atributo constante: un solo intervalo
        } else if (metodo === 'anchos') {
            const step = (max - min) / numBins;
            for (let b = 0; b <= numBins; b++) edges.push(b === numBins ? max : min + b * step);
        } else if (metodo === 'frecuencias') {
            edges.push(min);
            for (let b = 1; b < numBins; b++) {
                edges.push(values[Math.min(Math.round(b * values.length / numBins), values.length - 1)]);
            }
            edges.push(max);
        }
        // Los valores repetidos pueden producir límites duplicados: se eliminan para no crear intervalos vacíos
        edges = edges.filter((e, i) => i === 0 || e > edges[i - 1]);
        const nIntervalos = Math.max(1, edges.length - 1);

        // Intervalos [e_b, e_{b+1}); el último incluye el máximo. Los valores de prueba fuera del rango
        // de entrenamiento se asignan al primer o al último intervalo.
        const getBin = (val) => {
            const num = Number(val);
            for (let b = 0; b < nIntervalos; b++) {
                if (b === nIntervalos - 1 || num < edges[b + 1]) return `Bin_${b + 1}`;
            }
            return `Bin_${nIntervalos}`;
        };

        for (let r = 0; r < trainProcessed.length; r++) trainProcessed[r][c] = getBin(trainProcessed[r][c]);
        if (testProcessed) {
            for (let r = 0; r < testProcessed.length; r++) testProcessed[r][c] = getBin(testProcessed[r][c]);
        }
    }
    return { train: trainProcessed, test: testProcessed };
}

// ==========================================
// 5. MUESTREO Y VALIDACIÓN
// ==========================================
// Revuelve un arreglo de forma uniforme (Fisher-Yates)
function mezclar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function contarClases(rows) {
    const classColIdx = rows[0].length - 1;
    let conteo = {};
    rows.forEach(r => conteo[r[classColIdx]] = (conteo[r[classColIdx]] || 0) + 1);
    return conteo;
}

// Cuántas instancias quedan en entrenamiento y prueba (misma regla que splitData)
function tamanosSplit(rows, trainPercent, stratified) {
    let train = 0;
    const porClase = {};
    if (stratified) {
        const conteo = contarClases(rows);
        Object.keys(conteo).forEach(c => {
            porClase[c] = Math.round((trainPercent / 100) * conteo[c]);
            train += porClase[c];
        });
    } else {
        train = Math.round((trainPercent / 100) * rows.length);
    }
    return { train, test: rows.length - train, porClase };
}

function splitData(rows, trainPercent, stratified) {
    let train = [];
    let test = [];

    if (stratified) {
        // Estratificada: el mismo porcentaje de cada clase va a entrenamiento
        const classColIdx = rows[0].length - 1;
        let classesMap = {};
        rows.forEach((row) => {
            const cls = row[classColIdx];
            if (!classesMap[cls]) classesMap[cls] = [];
            classesMap[cls].push(row);
        });
        Object.keys(classesMap).forEach(cls => {
            let classRows = mezclar([...classesMap[cls]]);
            const trainSize = Math.round((trainPercent / 100) * classRows.length);
            train.push(...classRows.slice(0, trainSize));
            test.push(...classRows.slice(trainSize));
        });
    } else {
        // Aleatoria simple: se revuelve todo el dataset sin importar la clase
        const todas = mezclar([...rows]);
        const trainSize = Math.round((trainPercent / 100) * todas.length);
        train = todas.slice(0, trainSize);
        test = todas.slice(trainSize);
    }
    mezclar(train);
    mezclar(test);

    return { train, test };
}

// Clases del dataset que no quedaron en un conjunto de entrenamiento
function clasesAusentes(trainRows, clases) {
    const presentes = new Set(trainRows.map(r => r[r.length - 1]));
    return clases.filter(c => !presentes.has(c));
}

function runCrossValidation(rows, colTypes, useLaplace, continuousMethod, numBins, stratified, avisos, clases) {
    const classColIdx = rows[0].length - 1;
    // Reutiliza splitData al 50% para formar los dos pliegues
    const mitades = splitData(rows, 50, stratified);
    const pliegues = [[mitades.train, mitades.test], [mitades.test, mitades.train]];

    let allPredictions = [];
    pliegues.forEach(([entrenamiento, prueba], k) => {
        const faltan = clasesAusentes(entrenamiento, clases);
        if (faltan.length > 0) {
            avisos.push(`Aviso: en el pliegue ${k + 1} la(s) clase(s) '${faltan.join("', '")}' no quedaron en entrenamiento; el modelo no puede predecirlas en ese pliegue. Active la selección estratificada.`);
        }
        const disc = discretizarDataset(entrenamiento, prueba, colTypes, continuousMethod, numBins);
        const nb = new NaiveBayesClassifier(colTypes, useLaplace, continuousMethod);
        nb.train(disc.train);
        disc.test.forEach(row => {
            allPredictions.push({ real: row[classColIdx], pred: nb.predict(row) });
        });
    });
    return allPredictions;
}

// ==========================================
// 6. CÁLCULO DE MÉTRICAS Y MATRIZ DE CONFUSIÓN
// ==========================================
// Filas = clase real, columnas = clase predicha. Las métricas se calculan uno contra el resto.
// Si un denominador es 0 la métrica se reporta como 0 (mismo criterio que zero_division=0 de scikit-learn).
// Los promedios se calculan sobre las clases presentes en los valores reales o en las predicciones.
function evaluarResultados(predictions, classes) {
    let matrix = {};
    classes.forEach(c1 => {
        matrix[c1] = {};
        classes.forEach(c2 => { matrix[c1][c2] = 0; });
    });

    let correct = 0;
    predictions.forEach(p => {
        if (matrix[p.real] && matrix[p.real][p.pred] !== undefined) {
            matrix[p.real][p.pred]++;
        }
        if (p.real === p.pred) correct++;
    });

    const accuracy = predictions.length > 0 ? (correct / predictions.length) : 0;
    const totalSupportAll = predictions.length;

    let metrics = {};
    classes.forEach(cls => {
        let TP = matrix[cls][cls];
        let actualSupport = 0;
        classes.forEach(c => actualSupport += matrix[cls][c]);
        let predictedSupport = 0;
        classes.forEach(c => predictedSupport += matrix[c][cls]);
        let FN = actualSupport - TP;
        let FP = predictedSupport - TP;
        let TN = totalSupportAll - (TP + FP + FN);
        let precision = (TP + FP) > 0 ? TP / (TP + FP) : 0;
        let recall = (TP + FN) > 0 ? TP / (TP + FN) : 0;
        let specificity = (TN + FP) > 0 ? TN / (TN + FP) : 0;
        let f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        metrics[cls] = { precision, recall, specificity, f1, support: actualSupport, presente: actualSupport > 0 || predictedSupport > 0 };
    });

    return { matrix, metrics, accuracy };
}

// ==========================================
// 7. ORQUESTADOR Y RENDERIZADO EN VISTA
// ==========================================
function ejecutarClasificador() {
    const mismoData = document.getElementById('Radio_same_Data').checked;
    const simple = document.getElementById('Radio_Validacion_Simple').checked;
    const cruzada = document.getElementById('Radio_Validacion_Cruzada').checked;
    const externo = document.getElementById('Radio_Archivo_Externo').checked;

    const useLaplace = document.getElementById('Check_Laplace').checked;
    const continuousMethod = document.getElementById('Select_Metodo_Continuas').value;
    const numBins = Number(document.getElementById('Input_Porcentaje_discrecion').value) || 5;
    const stratified = document.getElementById('Check_Estratificada').checked;

    const avisos = [];
    let predictions = [];
    let detalleExterno = null;

    const classColIdx = datasetPrincipal.numCols - 1;
    const classes = Array.from(new Set(datasetPrincipal.rows.map(r => r[classColIdx]))).sort();

    if (continuousMethod !== 'normal' && !datasetPrincipal.colTypes.includes('numeric')) {
        avisos.push("Aviso: el dataset no tiene atributos numéricos; el método de discretización no se aplica.");
    }

    if (mismoData) {
        if (simple) {
            const porc = Number(document.getElementById('Input_porcentaje_entrenamiento').value);
            const split = splitData(datasetPrincipal.rows, porc, stratified);
            const faltan = clasesAusentes(split.train, classes);
            if (faltan.length > 0) {
                avisos.push(`Aviso: la(s) clase(s) '${faltan.join("', '")}' no quedaron en el conjunto de entrenamiento (partición aleatoria); el modelo no puede predecirlas. Active la selección estratificada.`);
            }
            const disc = discretizarDataset(split.train, split.test, datasetPrincipal.colTypes, continuousMethod, numBins);
            const nb = new NaiveBayesClassifier(datasetPrincipal.colTypes, useLaplace, continuousMethod);
            nb.train(disc.train);
            disc.test.forEach(row => {
                predictions.push({ real: row[classColIdx], pred: nb.predict(row) });
            });
        } else if (cruzada) {
            predictions = runCrossValidation(datasetPrincipal.rows, datasetPrincipal.colTypes, useLaplace, continuousMethod, numBins, stratified, avisos, classes);
        }
    } else if (externo) {
        const { filas, conClase } = adaptarExterno(datasetPrincipal, datasetExterno);
        const disc = discretizarDataset(datasetPrincipal.rows, filas, datasetPrincipal.colTypes, continuousMethod, numBins);
        const nb = new NaiveBayesClassifier(datasetPrincipal.colTypes, useLaplace, continuousMethod);
        nb.train(disc.train);
        detalleExterno = disc.test.map((row, i) => {
            const d = nb.predictDetalle(row);
            return { instancia: datasetExterno.lineas[i], real: conClase ? filas[i][classColIdx] : null, pred: d.clase, prob: d.probabilidad };
        });
        if (conClase) {
            predictions = detalleExterno.map(d => ({ real: d.real, pred: d.pred }));
        } else {
            avisos.push("Aviso: el archivo externo no incluye la clase real, por lo que solo se muestran las predicciones (no es posible calcular la matriz de confusión ni las métricas).");
        }
    }

    if (predictions.length > 0) {
        renderizarResultados(evaluarResultados(predictions, classes), classes);
    } else {
        limpiarResultados();
    }
    renderizarPredicciones(detalleExterno);
    return avisos;
}

function fmt(v) { return v.toFixed(2); }

function renderizarResultados(evalResult, classes) {
    const { matrix, metrics, accuracy } = evalResult;

    const tablaMatriz = document.getElementById('Tabla_Matriz_Confusion');
    let theadHTML = `<tr><th>Real \\ Predicho</th>`;
    classes.forEach(c => theadHTML += `<th>${esc(c)}</th>`);
    theadHTML += `<th>Total</th></tr>`;

    let tbodyHTML = '';
    classes.forEach(realCls => {
        let rowTotal = 0;
        classes.forEach(predCls => rowTotal += matrix[realCls][predCls]);
        tbodyHTML += `<tr><th>${esc(realCls)}</th>`;
        classes.forEach(predCls => {
            const val = matrix[realCls][predCls];
            tbodyHTML += `<td class="${realCls === predCls ? 'diag' : ''}">${val}</td>`;
        });
        tbodyHTML += `<td><strong>${rowTotal}</strong></td></tr>`;
    });

    tbodyHTML += `<tr style="border-top: 2px solid var(--linea-fuerte);"><th>Total</th>`;
    let grandTotal = 0;
    classes.forEach(predCls => {
        let colTotal = 0;
        classes.forEach(realCls => colTotal += matrix[realCls][predCls]);
        grandTotal += colTotal;
        tbodyHTML += `<td><strong>${colTotal}</strong></td>`;
    });
    tbodyHTML += `<td><strong>${grandTotal}</strong></td></tr>`;

    tablaMatriz.querySelector('thead').innerHTML = theadHTML;
    tablaMatriz.querySelector('tbody').innerHTML = tbodyHTML;

    const tablaMetricas = document.getElementById('Tabla_Metricas').querySelector('tbody');
    let metricasHTML = '';
    const prom = { precision: 0, recall: 0, specificity: 0, f1: 0 };
    const pond = { precision: 0, recall: 0, specificity: 0, f1: 0 };
    let nPresentes = 0, totalSup = 0;

    classes.forEach(cls => {
        const m = metrics[cls];
        totalSup += m.support;
        if (m.presente) {
            nPresentes++;
            Object.keys(prom).forEach(k => { prom[k] += m[k]; pond[k] += m[k] * m.support; });
            metricasHTML += `<tr><th>${esc(cls)}</th><td>${fmt(m.precision)}</td><td>${fmt(m.recall)}</td><td>${fmt(m.specificity)}</td><td>${fmt(m.f1)}</td><td>${m.support}</td></tr>`;
        } else {
            // Clase sin instancias reales ni predicciones en el conjunto de prueba: métricas no definidas
            metricasHTML += `<tr><th>${esc(cls)}</th><td>—</td><td>—</td><td>—</td><td>—</td><td>0</td></tr>`;
        }
    });
    tablaMetricas.innerHTML = metricasHTML;

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('Prom_Precision', nPresentes ? fmt(prom.precision / nPresentes) : '—');
    setTxt('Prom_Recall', nPresentes ? fmt(prom.recall / nPresentes) : '—');
    setTxt('Prom_Especificidad', nPresentes ? fmt(prom.specificity / nPresentes) : '—');
    setTxt('Prom_F1', nPresentes ? fmt(prom.f1 / nPresentes) : '—');
    setTxt('Total_Soporte', totalSup);
    setTxt('Pond_Precision', totalSup ? fmt(pond.precision / totalSup) : '—');
    setTxt('Pond_Recall', totalSup ? fmt(pond.recall / totalSup) : '—');
    setTxt('Pond_Especificidad', totalSup ? fmt(pond.specificity / totalSup) : '—');
    setTxt('Pond_F1', totalSup ? fmt(pond.f1 / totalSup) : '—');
    setTxt('Pond_Soporte', totalSup);

    document.getElementById('Input_Acurrecy').value = `${(accuracy * 100).toFixed(2)}%`;
}

function limpiarResultados() {
    const tablaMatriz = document.getElementById('Tabla_Matriz_Confusion');
    tablaMatriz.querySelector('thead').innerHTML = '<tr><th>Real \\ Predicho</th></tr>';
    tablaMatriz.querySelector('tbody').innerHTML = '<tr class="vacio"><td colspan="99">No disponible: el archivo externo no incluye la clase real.</td></tr>';
    document.getElementById('Tabla_Metricas').querySelector('tbody').innerHTML = '<tr class="vacio"><td colspan="6">No disponible.</td></tr>';
    ['Prom_Precision', 'Prom_Recall', 'Prom_Especificidad', 'Prom_F1', 'Total_Soporte',
     'Pond_Precision', 'Pond_Recall', 'Pond_Especificidad', 'Pond_F1', 'Pond_Soporte'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    document.getElementById('Input_Acurrecy').value = '—';
}

// Tabla con la clase predicha de cada instancia del archivo externo
function renderizarPredicciones(detalle) {
    const bloque = document.getElementById('Bloque_Predicciones');
    if (!bloque) return;
    if (!detalle) { bloque.hidden = true; return; }
    const filas = detalle.map((d, i) => {
        const resultado = d.real === null ? '—' : (d.real === d.pred ? 'Correcta' : 'Incorrecta');
        const prob = d.prob === null ? '—' : d.prob.toFixed(4);
        return `<tr><th>${i + 1}</th><td>${d.real === null ? '—' : esc(d.real)}</td><td>${esc(d.pred)}</td><td>${prob}</td><td>${resultado}</td></tr>`;
    }).join('');
    document.getElementById('Tabla_Predicciones').querySelector('tbody').innerHTML = filas;
    bloque.hidden = false;
}
