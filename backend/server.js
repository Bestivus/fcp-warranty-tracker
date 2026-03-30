const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const dataDir = process.env.NODE_ENV === 'production' ? '/app/data' : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'fcp_orders.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error opening database', err);
    else console.log('Connected to SQLite database at', dbPath);
});

// Create table if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            date TEXT,
            orderNumber TEXT,
            sku TEXT,
            description TEXT,
            vehicle TEXT,
            price REAL,
            status TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            replacesOrderId TEXT,
            replacedByOrderId TEXT,
            rmaNumber TEXT,
            quantity INTEGER DEFAULT 1
        )
    `);

    // Upgrade existing database safely if it was created before the quantity feature
    db.run(`ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1`, (err) => {
        // We expect this to fail with "duplicate column name" if it already exists, which is totally fine.
    });
});

app.get('/api/orders', (req, res) => {
    db.all("SELECT * FROM orders ORDER BY date DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/orders', (req, res) => {
    const { date, orderNumber, sku, description, vehicle, price, status, replacesOrderId, replacedByOrderId, rmaNumber, quantity } = req.body;
    const id = uuidv4();
    
    const stmt = db.prepare(`
        INSERT INTO orders (id, date, orderNumber, sku, description, vehicle, price, status, replacesOrderId, replacedByOrderId, rmaNumber, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, date, orderNumber, sku, description, vehicle, price, status, replacesOrderId, replacedByOrderId, rmaNumber, quantity || 1], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id, date, orderNumber, sku, description, vehicle, price, status, replacesOrderId, replacedByOrderId, rmaNumber, quantity: quantity || 1 });
    });
    stmt.finalize();
});

app.put('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const updates = [];
    const values = [];
    
    // THIS LINE is what fixes your bug! We told the PUT command that 'quantity' is allowed to be updated.
    const fields = ['date', 'orderNumber', 'sku', 'description', 'vehicle', 'price', 'status', 'replacesOrderId', 'replacedByOrderId', 'rmaNumber', 'quantity'];
    fields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
        }
    });
    
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(id);
    
    db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated successfully', changes: this.changes });
    });
});

app.delete('/api/orders/:id', (req, res) => {
    db.run("DELETE FROM orders WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully', changes: this.changes });
    });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});