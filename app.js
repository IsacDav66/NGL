require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Headers de seguridad para evitar el error de CSP (Default-src none)
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; font-src * data:; img-src * data:;");
    next();
});

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// --- RUTAS CON PREFIJO /ngl (Igual que stunbot) ---

// --- CAMBIO EN LA RUTA DEL FORMULARIO ---

const initDb = async () => {
    try {
        const client = await pool.connect();
        
        // Tabla de mensajes (ya la tienes)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ngl_privados (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                target_user_id TEXT,
                notified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // NUEVA TABLA: Registro de visitas
        await client.query(`
            CREATE TABLE IF NOT EXISTS ngl_logs (
                id SERIAL PRIMARY KEY,
                ip_address TEXT,
                user_agent TEXT,
                path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        client.release();
        console.log("\x1b[32m[DB]\x1b[0m Tablas de mensajes y logs verificadas.");
    } catch (err) {
        console.error("\x1b[31m[DB Error]\x1b[0m:", err.message);
    }
};
initDb();

// Función auxiliar para capturar la IP real tras Nginx
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
    return ip.replace('::ffff:', ''); // Limpiar formato IPv6 si aparece
};

// RUTA: Formulario de envío
app.get('/ngl/tu-usuario', async (req, res) => {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'];

    try {
        // GUARDAR LOG DE VISITA
        await pool.query(
            'INSERT INTO ngl_logs (ip_address, user_agent, path) VALUES ($1, $2, $3)',
            [ip, ua, '/ngl/tu-usuario']
        );

        const result = await pool.query('SELECT "userId", pushname, "phoneNumber" FROM users WHERE pushname IS NOT NULL ORDER BY pushname ASC');
        res.render('index', { usuarios: result.rows });
    } catch (err) {
        console.error("Error logs/usuarios:", err);
        res.render('index', { usuarios: [] });
    }
});


// --- CAMBIO EN LA REDIRECCIÓN DEL POST ---
app.post('/ngl/send', async (req, res) => {
    const { question, target_user_id } = req.body;
    if (question) {
        try {
            await pool.query('INSERT INTO ngl_privados (content, target_user_id) VALUES ($1, $2)', [question, target_user_id || null]);
            res.render('success');
        } catch (e) {
            res.status(500).send("Error");
        }
    } else {
        // Asegúrate de quitar la /u/ aquí también
        res.redirect('/ngl/tu-usuario');
    }
});

app.get('/ngl/inbox', async (req, res) => {
    try {
        const query = `SELECT n.*, u.pushname, u."phoneNumber" FROM ngl_privados n LEFT JOIN users u ON n.target_user_id = u."userId" ORDER BY n.created_at DESC`;
        const result = await pool.query(query);
        res.render('inbox', { messages: result.rows });
    } catch (e) {
        res.status(500).send("Error");
    }
});



app.get('/ngl/ver-logs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ngl_logs ORDER BY created_at DESC LIMIT 100');
        
        // Formatear una respuesta simple en HTML para ver los logs
        let html = `<h1>Historial de Visitas (IPs)</h1><table border="1" cellpadding="10" style="border-collapse:collapse; font-family:sans-serif;">
                    <tr><th>Fecha/Hora</th><th>IP Address</th><th>Dispositivo (User Agent)</th></tr>`;
        
        result.rows.forEach(log => {
            html += `<tr>
                        <td>${new Date(log.created_at).toLocaleString()}</td>
                        <td><a href="https://ipinfo.io/${log.ip_address}" target="_blank">${log.ip_address}</a></td>
                        <td style="font-size:12px;">${log.user_agent}</td>
                     </tr>`;
        });
        
        html += `</table>`;
        res.send(html);
    } catch (e) {
        res.status(500).send("Error al obtener logs");
    }
});

const PORT = 3005; 

app.listen(PORT, () => {
    console.log(`🚀 NGL Running on Port ${PORT}`);
    console.log(`🔗 URL: https://davcenter.servequake.com/ngl/u/tu-usuario`);
});