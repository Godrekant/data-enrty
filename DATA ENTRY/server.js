const http = require('http');
// CORRECTED IMPORT: Using the stable .promises property from the core 'fs' module
const fs = require('fs').promises; 
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json'); // File for data persistence

// --- Utility Functions for Data Persistence ---

/**
 * Reads the data from the local JSON file.
 * Initializes with empty structure if the file does not exist.
 */
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Handle file not found (ENOENT) by initializing a default structure
        if (error.code === 'ENOENT') {
            console.log('Data file not found. Initializing new data structure.');
            const initialData = { columns: [], records: [] };
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        throw error;
    }
}

/**
 * Writes the current data state back to the local JSON file.
 * @param {object} data - The data object containing 'columns' and 'records'.
 */
async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Utility Functions for HTTP Handling ---

/**
 * Parses the incoming JSON request body from the stream.
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (body) {
                    resolve(JSON.parse(body));
                } else {
                    resolve({});
                }
            } catch (e) {
                reject(new Error("Invalid JSON in request body"));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Sends a JSON response with appropriate CORS headers.
 */
function sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        // Manual CORS headers for client-side connection
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

/**
 * Handles CORS preflight OPTIONS requests.
 */
function handleOptions(res) {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Length': '0',
    });
    res.end();
}

// --- Main Request Handler ---

async function requestListener(req, res) {
    const { method, url } = req;
    const urlParts = url.split('/');

    // 1. Handle OPTIONS requests (CORS preflight)
    if (method === 'OPTIONS') {
        return handleOptions(res);
    }

    try {
        // --- GET /api/data ---
        if (method === 'GET' && url === '/api/data') {
            const data = await readData();
            return sendResponse(res, 200, data);
        }

        // --- POST /api/columns ---
        if (method === 'POST' && url === '/api/columns') {
            const { columns: newColumns } = await parseBody(req);
            
            if (!Array.isArray(newColumns)) {
                return sendResponse(res, 400, { message: 'Invalid format: "columns" must be an array.' });
            }

            const data = await readData();
            
            // Logic to clean up records when columns are removed
            const oldColumns = data.columns;
            const removedCols = oldColumns.filter(col => !newColumns.includes(col));

            const updatedRecords = data.records.map(record => {
                const newRecord = { ...record };
                removedCols.forEach(col => delete newRecord[col]);
                return newRecord;
            });

            data.columns = newColumns;
            data.records = updatedRecords;

            await writeData(data);
            return sendResponse(res, 200, data);
        }

        // --- POST /api/records ---
        if (method === 'POST' && url === '/api/records') {
            const newRecord = await parseBody(req);
            
            if (typeof newRecord !== 'object' || Array.isArray(newRecord)) {
                return sendResponse(res, 400, { message: 'Invalid format: Request body must be a single record object.' });
            }

            const data = await readData();
            
            // Clean the new record to only include defined columns
            const validRecord = {};
            data.columns.forEach(col => {
                validRecord[col] = newRecord[col] || '';
            });

            data.records.push(validRecord);
            await writeData(data);
            return sendResponse(res, 201, data);
        }

        // --- DELETE /api/records/:index ---
        if (method === 'DELETE' && url.startsWith('/api/records/')) {
            const indexStr = urlParts[3]; // The fourth part of the URL is the index
            const index = parseInt(indexStr);

            const data = await readData();

            if (isNaN(index) || index < 0 || index >= data.records.length) {
                return sendResponse(res, 404, { message: 'Invalid or out of bounds record index.' });
            }

            data.records.splice(index, 1);
            await writeData(data);
            return sendResponse(res, 200, data);
        }

        // --- 404 Not Found ---
        return sendResponse(res, 404, { message: 'Not Found' });

    } catch (error) {
        console.error('Server error:', error);
        return sendResponse(res, 500, { message: 'Internal Server Error', error: error.message });
    }
}

// Create and start the server
const server = http.createServer(requestListener);

server.listen(PORT, () => {
    console.log(`Node.js HTTP Server running at http://localhost:${PORT}`);
    console.log(`\n*** You must run this server file (server.js) using 'node server.js' ***\n`);
    console.log(`NOTE: Data is persisted to '${DATA_FILE}'`);
});