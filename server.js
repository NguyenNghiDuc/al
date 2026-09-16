import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT) || 3000;
const publicDirectory = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
};

const server = createServer(async (request, response) => {
    const requestPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    const filePath = normalize(join(publicDirectory, requestPath));

    if (!filePath.startsWith(publicDirectory)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
    }

    try {
        const content = await readFile(filePath);
        response.writeHead(200, {
            'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream'
        });
        response.end(content);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
});

server.listen(port, () => {
    console.log(`AL đang chạy tại http://localhost:${port}`);
});