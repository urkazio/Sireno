const mysqlConnection = require('./connection'); // Importa tu archivo de conexión a MySQL
const CryptoJS = require("crypto-js");
const config = require('../../config'); // importar el fichero que contiene la clave secreta para el token




function getUser(user, pass, rol, callback) {
  const iterations = 1000;
  const hash = CryptoJS.PBKDF2(pass, config.saltHash, { keySize: 256/32, iterations });

  mysqlConnection.query(
    'SELECT cod_usuario FROM usuario WHERE cod_usuario  = ? AND contrasena = ?',
    [user, hash.toString()],
    (err, rows, fields) => {
      if (!err) {
        if (rows.length > 0) {
          const userData = {
            usuario: rows[0].cod_usuario,
            rol: rol
          };
          callback(null, userData);
        } else {
          callback('Usuario o clave incorrectos');
        }
      } else {
        callback(err);
      }
    }
  );
}

function getRole(user, callback) {

  mysqlConnection.query(
    'SELECT rol FROM usuario WHERE cod_usuario  = ?',
    [user],
    (err, rows, fields) => {
      if (!err) {
        if (rows.length > 0) {
          const role = rows[0].rol;
          callback(null, role);
        } else {
          callback('Usuario o clave incorrectos');
        }
      } else {
        callback(err);
      }
    }
  );
}

//---------------------------------- alumnos ----------------------------------------------


function getCampanasValidasPorUsuario(usuario, callback) {
  const query = `
    SELECT c.cod_campana, c.nombre, c.fecha_fin, sd.activada, c.cod_encuesta,
           sd.cod_situacion_docente, sd.cod_asignatura, a.nombre_asignatura, sd.cod_docente, d.nombre_docente,
           sd.num_curso, c.año_curso, ac.fecha_hora_cierre
    FROM campana AS c
    JOIN situacion_docente AS sd ON c.cod_campana = sd.cod_campana
    JOIN alumno_situacion_doc AS asd ON sd.cod_situacion_docente = asd.cod_situacion_docente
    JOIN asignatura AS a ON sd.cod_asignatura = a.cod_asignatura
    JOIN docente AS d ON sd.cod_docente = d.cod_docente
    LEFT JOIN activacion_campana AS ac ON sd.cod_situacion_docente = ac.cod_situacion_docente
    WHERE asd.cod_alumno = ?
    AND c.fecha_ini <= NOW()
    AND (sd.activada = 0 AND c.fecha_fin >= NOW() OR sd.activada >= 1 AND ac.fecha_hora_cierre >= NOW())
  `;

  mysqlConnection.query(query, [usuario], (err, rows, fields) => {
    if (!err) {
      const campanasValidas = rows.map((row) => {
        return {
          cod_campana: row.cod_campana,
          nombre_campana: row.nombre,
          fecha_fin: row.fecha_fin,
          veces_activada: row.activada,
          cod_encuesta: row.cod_encuesta,
          cod_situacion_docente: row.cod_situacion_docente,
          cod_asignatura: row.cod_asignatura,
          nombre_asignatura: row.nombre_asignatura,
          cod_docente: row.cod_docente,
          nombre_docente: row.nombre_docente,
          num_curso: row.num_curso,
          año_curso: row.año_curso,
          fecha_fin_activacion: row.fecha_hora_cierre
        };
      });
      
      callback(null, campanasValidas);
    } else {
      callback(err);
    }
  });
}


function getPreguntasEncuesta(cod_encuesta, idioma, callback) {
  mysqlConnection.query(
    `SELECT pe.cod_pregunta, tp.texto, p.numerica
    FROM pregunta_en_encuesta pe
    JOIN texto_pregunta tp ON pe.cod_pregunta = tp.cod_pregunta
    JOIN pregunta p ON pe.cod_pregunta = p.cod_pregunta
    WHERE pe.cod_encuesta = ? AND tp.cod_idioma = ?`,
    [cod_encuesta, idioma],
    (err, rows, fields) => {
      if (err) {
        callback(err);
        return;
      }

      // Para cada pregunta, obtener las posibles respuestas según el tipo de pregunta
      const result = rows.map((row) => {
        const pregunta = {
          cod_pregunta: row.cod_pregunta,
          texto_pregunta: row.texto,
          numerica: row.numerica
        };

        if (row.numerica) {
          // Pregunta numérica, obtener las respuestas de respuesta_numerica_de_pregunta
          return new Promise((resolve, reject) => {
            mysqlConnection.query(
              `SELECT rnp.cod_respuesta_numerica
              FROM respuesta_numerica_de_pregunta rnp
              WHERE rnp.cod_pregunta = ?`,
              [row.cod_pregunta],
              (err, rows, fields) => {
                if (err) {
                  reject(err);
                } else {
                  const respuestas = rows.map((respuesta) => ({
                    cod_respuesta: respuesta.cod_respuesta_numerica,
                    texto: respuesta.cod_respuesta_numerica,
                  }));resolve({ ...pregunta, respuestas });
                }
              }
            );
          });
        } else {
          // Pregunta verbal, obtener las respuestas de respuesta_verbal y texto_respuesta en el idioma especificado
          return new Promise((resolve, reject) => {
            mysqlConnection.query(
              `SELECT tr.cod_respuesta_verbal, tr.texto
              FROM respuesta_verbal rv
              JOIN texto_respuesta tr ON rv.cod_respuesta_verbal = tr.cod_respuesta_verbal
              WHERE rv.cod_pregunta = ? AND tr.cod_idioma = ?`,
              [row.cod_pregunta, idioma],
              (err, rows, fields) => {
                if (err) {
                  reject(err);
                } else {
                  const respuestas = rows.map((respuesta) => ({
                    cod_respuesta: respuesta.cod_respuesta_verbal,
                    texto: respuesta.texto,
                  }));
                  resolve({ ...pregunta, respuestas });
                }
              }
            );
          });
        }
      });

      // Ejecutar todas las promesas y retornar el resultado final al callback
      Promise.all(result)
        .then((encuesta) => {
          callback(null, encuesta);
        })
        .catch((err) => {
          callback(err);
        });
    }
  );
}

function getSDsAlumno(user, callback) {
  mysqlConnection.query(
    'SELECT cod_situacion_docente FROM alumno_situacion_doc WHERE cod_alumno  = ?',
    [user],
    (err, rows, fields) => {
      if (!err) {
        if (rows.length > 0) {
          const situaciones_docentes = rows.map(row => row.cod_situacion_docente);
          callback(null, situaciones_docentes);
        } else {
          callback('Usuario o clave incorrectos');
        }
      } else {
        callback(err);
      }
    }
  );
}


function isActiva(cod_situacion_docente, callback) {
  const currentDate = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$2-$1')
  
  mysqlConnection.query(
    'SELECT * FROM activacion_campana WHERE cod_situacion_docente = ? AND fecha_hora_ini < ? AND fecha_hora_cierre > ?',
    [cod_situacion_docente, currentDate, currentDate],
    (err, rows, fields) => {
      if (!err) {
        const isActive = rows.length > 0;
        callback(null, isActive);
      } else {
        callback(err);
      }
    }
  );
}


function isValida(cod_situacion_docente, callback) {

  const currentDate = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$2-$1')

  mysqlConnection.query(
    'SELECT * FROM campana WHERE cod_campana = (SELECT cod_campana FROM situacion_docente WHERE cod_situacion_docente = ?) AND ? >= fecha_ini AND ? <= fecha_fin',
    [cod_situacion_docente, currentDate, currentDate],
    (err, rows, fields) => {
      if (!err) {
        const isValida = rows.length > 0;
        callback(null, isValida);
      } else {
        callback(err);
      }
    }
  );
}




function setRespuestas(cod_situacion_docente, respuestas, callback) {
  const queries = [];
  
  for (let i = 0; i < respuestas.length; i++) {
    const respuesta = respuestas[i];
    
    if (respuesta.numerica === 1) {
      const query = `INSERT INTO respuesta_numerica_alumnos (cod_situacion_docente, cod_respuesta_numerica, cod_pregunta, cuantos)
                     VALUES (?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE cuantos = cuantos + 1`;
      queries.push({query, params: [cod_situacion_docente, respuesta.cod_respuesta, respuesta.cod_pregunta]});

    } else {
      const query = `INSERT INTO respuesta_verbal_alumnos (cod_situacion_docente, cod_respuesta_verbal, cuantos)
                     VALUES (?, ?, 1)
                     ON DUPLICATE KEY UPDATE cuantos = cuantos + 1`;
      queries.push({query,params: [cod_situacion_docente, respuesta.cod_respuesta]});
    }
  }
  
  // Las consultas se ejecutan en serie utilizando una función recursiva llamada executeQueries
  // ejecuta cada consulta secuencialmente hasta que se hayan ejecutado todas las consultas o se produzca un error
  const executeQueries = (index) => {
    if (index >= queries.length) {
      callback(null);
      return;
    }
    
    const { query, params } = queries[index];
    
    mysqlConnection.query(query, params, (err, result) => {
      if (err) {
        callback(err);
      } else {
        executeQueries(index + 1);
      }
    });
  };
  
  executeQueries(0);
}

function updateNumAlumRespond(cod_situacion_docente, callback) {
  mysqlConnection.query(
    'UPDATE situacion_docente SET n_alum_respondido = n_alum_respondido + 1 WHERE cod_situacion_docente = ?',
    [cod_situacion_docente],
    (err, rows, fields) => {
      if (!err) {
        callback(null);
      } else {
        callback(err);
      }
    }
  );
}



function deleteSDAlumno(user, situacion_docente, callback) {
  mysqlConnection.query(
    'DELETE FROM alumno_situacion_doc WHERE cod_alumno = ? AND cod_situacion_docente = ?',
    [user, situacion_docente],
    (err, result) => {
      if (!err) {
        if (result.affectedRows > 0) {
          callback(true); // Se eliminaron filas
        } else {
          callback(false); // No se encontraron filas para eliminar
        }
      } else {
        callback(err); // Error durante la eliminación
      }
    }
  );
}

//---------------------------------- docentes ----------------------------------------------

function getCampannasValidasDocente(user, callback) {

  const currentDate = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$2-$1');
  
  console.log(currentDate);
  

  const query = `
    SELECT sd.cod_situacion_docente, sd.n_alum_total, sd.n_alum_respondido, a.nombre_Asignatura, c.fecha_fin, sd.num_curso, c.año_curso, sd.activada, sd.agrupado_con, ac.fecha_hora_cierre
    FROM situacion_docente sd
    INNER JOIN campana c ON sd.cod_campana = c.cod_campana
    JOIN asignatura AS a ON sd.cod_asignatura = a.cod_asignatura
    LEFT JOIN (
      SELECT cod_situacion_docente, MAX(fecha_hora_ini) AS max_fecha_hora_ini
      FROM activacion_campana
      WHERE '${currentDate}' <= fecha_hora_cierre
      GROUP BY cod_situacion_docente
    ) ac_latest ON sd.cod_situacion_docente = ac_latest.cod_situacion_docente
    LEFT JOIN activacion_campana ac ON ac_latest.cod_situacion_docente = ac.cod_situacion_docente AND ac_latest.max_fecha_hora_ini = ac.fecha_hora_ini
    WHERE sd.cod_docente = ? AND
    '${currentDate}' BETWEEN c.fecha_ini AND c.fecha_fin
    ORDER BY
      CASE WHEN ac.fecha_hora_cierre IS NOT NULL THEN 0 ELSE 1 END, 
      CASE WHEN ac.fecha_hora_cierre IS NULL THEN 1 ELSE 0 END, 
      ac.fecha_hora_cierre ASC,
      sd.activada ASC, 
      CASE WHEN ac.fecha_hora_cierre IS NULL THEN sd.activada END ASC,
      c.fecha_fin ASC
  `;

  /**************************** CRITERIOS DE ORDENACION DE LAS CAMPAÑAS DEVUELTAS ***************************** 

  --> CRITERIO PRINCIPAL
    -- Mostrar primero las campañas activas: aquellas situaciones docentes con fecha_hora_cierre no nula

  --> CAMPAÑAS ACTIVAS (ENCUESTA ABIERTA)
    -- Ordenar por fecha_hora_cierre ascendente
    -- En caso de empate, ordenar por veces_abierta ascendente: primero las que menos veces han sido abiertas

  --> CAMPAÑAS INACTIVA (ENCUESTA CERRADA)
    -- Primero las que menos veces han sido abiertas: Ordenar por veces_activada ascendente para las situaciones docentes con fecha_hora_cierre NULL
    -- En caso de empate, se muestran primero las que tienen fecha de expiracion proxima: Ordenar por fecha_fin ascendente

  **************************************************************************************************************/

  mysqlConnection.query(query, [user], (err, rows, fields) => {
    if (!err) {
      const situacionesDocentes = []; // Array para almacenar las situaciones docentes individuales
      const agrupados = {}; // Objeto para almacenar las situaciones docentes agrupadas

      // Recorre las filas de resultados y separa las situaciones docentes agrupadas de las no agrupadas
      rows.forEach(row => {
        const { cod_situacion_docente, agrupado_con } = row;
        if (agrupado_con) {
          if (agrupados[agrupado_con]) {
            agrupados[agrupado_con].push(cod_situacion_docente);
          } else {
            agrupados[agrupado_con] = [cod_situacion_docente];
          }
        } else {
          situacionesDocentes.push(row);
        }
      });

      // Recorre las situaciones docentes individuales y agrega los valores de n_alum_total y n_alum_respondido a las situaciones docentes agrupadas correspondientes
      situacionesDocentes.forEach(row => {
        const { cod_situacion_docente } = row;
        if (agrupados[cod_situacion_docente]) {
          row.agrupado_con = agrupados[cod_situacion_docente].map(cod => {
            const agrupado = rows.find(r => r.cod_situacion_docente === cod);
            return {
              cod_situacion_docente: cod,
              n_alum_total: agrupado.n_alum_total,
              n_alum_respondido: agrupado.n_alum_respondido
            };
          });
        }
      });

      callback(null, situacionesDocentes);
    } else {
      callback(err);
    }
  });
}


function activarCampanna(situacion, fechaHoraFinActivacion, callback) {
  const fechaHoraIni = new Date(); // Obtener la fecha y hora actual
  console.log(fechaHoraIni)

  mysqlConnection.query(
    'INSERT INTO activacion_campana (cod_situacion_docente, fecha_hora_ini, fecha_hora_cierre, abierta_por_docente) VALUES (?, ?, ?, ?)',
    [situacion, fechaHoraIni, fechaHoraFinActivacion, true], // true representa que está abierta por el docente
    (err, rows, fields) => {
      if (!err) {
        callback(null); 
      } else {
        callback(err);
      }
    }
  );
}

function updateVecesAbierta(situacion, callback) {
  mysqlConnection.query(
    'UPDATE situacion_docente SET activada = activada + 1 WHERE cod_situacion_docente = ?',
    [situacion],
    (err, rows, fields) => {
      if (!err) {
        callback(null, true);
      } else {
        callback(err);
      }
    }
  );
}




// exportar las funciones definidas en este fichero
module.exports = {
  getUser,
  getRole,
  getCampanasValidasPorUsuario,
  getPreguntasEncuesta,
  getSDsAlumno,
  deleteSDAlumno,
  isActiva,
  isValida,
  setRespuestas,
  updateNumAlumRespond,
  getCampannasValidasDocente,
  activarCampanna,
  updateVecesAbierta
};
