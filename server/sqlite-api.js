// A tiny SQLite-backed REST API that runs *inside* the Vite dev/preview server
// as connect middleware. Persistence is a real `rellit.db` file on disk, so it
// works regardless of whether the browser context allows web storage.
//
// Uses Node's built-in `node:sqlite` (stable in Node 24+), so there are no
// extra dependencies and nothing to compile.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'rellit.db');

let db;
function getDb() {
    if (db) return db;
    db = new DatabaseSync(DB_PATH);
    // Store the whole settings bundle as a JSON blob in `data`. The app already
    // serializes/deserializes this object wholesale, so a single column keeps
    // the schema simple while persisting *everything* (segments, typography,
    // per-line durations & colors, char overrides, timeline scale, components…).
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            last_modified INTEGER NOT NULL,
            data          TEXT NOT NULL DEFAULT '{}'
        )
    `);
    return db;
}

// Lightweight stats for the dashboard cards, computed server-side so the list
// endpoint stays small (no need to ship every project's full data blob).
function computeMeta(rawData) {
    let d = {};
    try { d = JSON.parse(rawData) || {}; } catch { /* corrupt row → empty meta */ }

    const lineDurations = Object.values(d.lineSettings || {});
    let totalDuration = lineDurations.reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0);
    if (totalDuration === 0) {
        totalDuration = (d.segments || []).reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0);
    }
    return {
        segmentCount: (d.segments || []).length,
        totalDuration,
        firstText: d.segments?.[0]?.text || ''
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 100 * 1024 * 1024) req.destroy(); // 100MB guard
        });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
}

// Collect a raw binary request body (used for the exported MP4 upload).
function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > 512 * 1024 * 1024) { req.destroy(); reject(new Error('Upload too large')); return; } // 512MB guard
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

// Transcode ONLY the audio of an exported MP4 to AAC (video is stream-copied, so
// there's no visual re-encode / quality loss). This exists because Chromium on
// Linux has no AAC *encoder* in WebCodecs — the browser can only make Opus, and
// Opus-in-MP4 is rejected by WhatsApp. Running the system ffmpeg produces a
// standard AAC track so the file uploads everywhere. Temp files live in the OS
// temp dir and are always cleaned up; the project DB is never touched.
function remuxAudioToAac(inputBuffer) {
    return new Promise(async (resolve, reject) => {
        const tag = Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        const inPath = path.join(os.tmpdir(), `rellit_in_${tag}.mp4`);
        const outPath = path.join(os.tmpdir(), `rellit_out_${tag}.mp4`);
        const cleanup = async () => {
            await fs.rm(inPath, { force: true }).catch(() => {});
            await fs.rm(outPath, { force: true }).catch(() => {});
        };
        try {
            await fs.writeFile(inPath, inputBuffer);
            // -c:v copy = keep the H.264 stream untouched; only re-encode audio.
            const args = [
                '-y', '-i', inPath,
                '-map', '0:v:0', '-map', '0:a:0?',
                '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '256k', '-ac', '2',
                '-movflags', '+faststart',
                outPath
            ];
            const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            ff.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000); });
            ff.on('error', async (e) => {
                await cleanup();
                // ENOENT → ffmpeg isn't installed on this machine.
                reject(new Error(e.code === 'ENOENT' ? 'ffmpeg-not-found' : String(e.message || e)));
            });
            ff.on('close', async (code) => {
                if (code !== 0) { await cleanup(); reject(new Error('ffmpeg exited ' + code + ': ' + stderr.slice(-500))); return; }
                try {
                    const out = await fs.readFile(outPath);
                    await cleanup();
                    resolve(out);
                } catch (e) {
                    await cleanup();
                    reject(e);
                }
            });
        } catch (e) {
            await cleanup();
            reject(e);
        }
    });
}

async function handle(req, res) {
    const database = getDb();
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
    const method = req.method;

    // POST /api/remux-aac — body is a raw MP4; returns the same video with its
    // audio converted to AAC (see remuxAudioToAac). Used by the exporter when the
    // browser could only produce Opus audio (WhatsApp-incompatible).
    if (parts[0] === 'remux-aac' && method === 'POST') {
        try {
            const input = await readRawBody(req);
            const output = await remuxAudioToAac(input);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'video/mp4');
            res.end(output);
        } catch (e) {
            const msg = String((e && e.message) || e);
            sendJson(res, msg === 'ffmpeg-not-found' ? 501 : 500, { error: msg });
        }
        return;
    }

    if (parts[0] !== 'projects') return sendJson(res, 404, { error: 'Not found' });

    // /api/projects
    if (parts.length === 1) {
        if (method === 'GET') {
            const rows = database
                .prepare('SELECT id, name, last_modified, data FROM projects ORDER BY last_modified DESC')
                .all();
            return sendJson(res, 200, rows.map(r => ({
                id: r.id,
                name: r.name,
                lastModified: r.last_modified,
                meta: computeMeta(r.data)
            })));
        }
        if (method === 'POST') {
            const b = await readBody(req);
            const id = b.id || ('proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11));
            const name = b.name || 'Untitled Project';
            const lastModified = b.lastModified || Date.now();
            const data = JSON.stringify(b.data || {});
            database
                .prepare('INSERT INTO projects (id, name, last_modified, data) VALUES (?, ?, ?, ?)')
                .run(id, name, lastModified, data);
            return sendJson(res, 201, { id, name, lastModified });
        }
    }

    const id = parts[1];

    // /api/projects/:id/duplicate
    if (parts.length === 3 && parts[2] === 'duplicate' && method === 'POST') {
        const src = database.prepare('SELECT name, data FROM projects WHERE id = ?').get(id);
        if (!src) return sendJson(res, 404, { error: 'Not found' });
        const newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        const name = `${src.name} (copy)`;
        const lastModified = Date.now();
        database
            .prepare('INSERT INTO projects (id, name, last_modified, data) VALUES (?, ?, ?, ?)')
            .run(newId, name, lastModified, src.data);
        return sendJson(res, 201, { id: newId, name, lastModified });
    }

    // /api/projects/:id
    if (parts.length === 2) {
        if (method === 'GET') {
            const r = database.prepare('SELECT id, name, last_modified, data FROM projects WHERE id = ?').get(id);
            if (!r) return sendJson(res, 404, { error: 'Not found' });
            let data = {};
            try { data = JSON.parse(r.data) || {}; } catch { /* keep empty */ }
            return sendJson(res, 200, { id: r.id, name: r.name, lastModified: r.last_modified, data });
        }
        if (method === 'PUT') { // save the full data blob
            const b = await readBody(req);
            const lastModified = Date.now();
            const info = database
                .prepare('UPDATE projects SET data = ?, last_modified = ? WHERE id = ?')
                .run(JSON.stringify(b.data || {}), lastModified, id);
            if (info.changes === 0) return sendJson(res, 404, { error: 'Not found' });
            return sendJson(res, 200, { lastModified });
        }
        if (method === 'PATCH') { // rename
            const b = await readBody(req);
            const lastModified = Date.now();
            const info = database
                .prepare('UPDATE projects SET name = ?, last_modified = ? WHERE id = ?')
                .run(b.name, lastModified, id);
            if (info.changes === 0) return sendJson(res, 404, { error: 'Not found' });
            return sendJson(res, 200, { lastModified });
        }
        if (method === 'DELETE') {
            database.prepare('DELETE FROM projects WHERE id = ?').run(id);
            return sendJson(res, 200, { ok: true });
        }
    }

    return sendJson(res, 404, { error: 'Not found' });
}

export function sqliteApiPlugin() {
    const middleware = (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        handle(req, res).catch(err => {
            console.error('[sqlite-api]', err);
            sendJson(res, 500, { error: String((err && err.message) || err) });
        });
    };
    return {
        name: 'rellit-sqlite-api',
        configureServer(server) { getDb(); server.middlewares.use(middleware); },
        configurePreviewServer(server) { getDb(); server.middlewares.use(middleware); }
    };
}
