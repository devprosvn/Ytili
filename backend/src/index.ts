import http from 'http';
import url from 'url';
import dotenv from 'dotenv';
import pool from './db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

// Init S3 client for IPFS Filebase
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT!, // non-null asserted
  region: process.env.S3_REGION!,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.IPFS_KEY!, // non-null asserted
    secretAccessKey: process.env.IPFS_SECRET! // non-null asserted
  },
  forcePathStyle: true
});

// Ensure users table exists
// Ensure users table exists
pool.query(
  `CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`
).catch((err: any) => console.error('Error creating users table:', err));

// Ensure donations table exists
pool.query(
  `CREATE TABLE IF NOT EXISTS donations (
    id SERIAL PRIMARY KEY,
    donation_id TEXT UNIQUE,
    donor_address TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    amount NUMERIC,
    item_name TEXT,
    quantity INTEGER,
    unit TEXT,
    metadata_hash TEXT,
    tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`
).catch((err: any) => console.error('create donations table error', err));

// Ensure flexible_items table exists
pool.query(
  `CREATE TABLE IF NOT EXISTS flexible_items (
    id SERIAL PRIMARY KEY,
    donation_id TEXT REFERENCES donations(donation_id) ON DELETE CASCADE,
    image_ipfs TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    sender_address TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
  )`
).catch((err: any) => console.error('Error creating flexible_items table:', err));

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url || '', true);
  // Upload file endpoint
  } else if (parsedUrl.pathname === '/api/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { fileName, content, contentType } = data;
        if (!fileName || !content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing fields' }));
        }
        const buffer = Buffer.from(content, 'base64');
        const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: fileName, Body: buffer, ContentType: contentType || 'application/octet-stream' });
        await s3.send(command);
        const fileUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${fileName}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ url: fileUrl }));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Upload error' }));
      }
    });
  } else if (

  if (parsedUrl.pathname === '/api/profile') {
    if (req.method === 'GET') {
      const address = parsedUrl.query.address;
      if (!address || typeof address !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Address is required' }));
      }
      try {
        const result = await pool.query(
          'SELECT name, phone, email FROM users WHERE address = $1',
          [address]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result.rows[0] || {}));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'DB error' }));
      }
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { address, name, phone, email } = data;
          if (!address || !name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing fields' }));
          }
          await pool.query(
            `INSERT INTO users (address, name, phone, email)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (address) DO UPDATE SET name = $2, phone = $3, email = $4`,
            [address, name, phone, email]
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'ok' }));
        } catch (err) {
          console.error(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Server error' }));
        }
      });
    } else {
      res.writeHead(405);
      return res.end();
    }
      } else if (parsedUrl.pathname === '/api/donations' && req.method === 'GET') {
    const address = parsedUrl.query.address;
    if (!address || typeof address !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Address is required' }));
    }
    try {
      const result = await pool.query(
        `SELECT donation_id AS "donationId", donor_address AS "donorAddress", type, title, description, amount, item_name AS "itemName", quantity, unit, tx_hash AS "txHash", created_at AS "createdAt"
         FROM donations WHERE donor_address = $1 ORDER BY created_at DESC`,
        [address]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'DB error' }));
    }
  } else if (parsedUrl.pathname === '/api/flexibles' && req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT id, donation_id AS "donationId", image_ipfs AS "imageIpfs", sender_name AS "senderName", sender_phone AS "senderPhone", sender_address AS "senderAddress", status, created_at AS "createdAt"
         FROM flexible_items ORDER BY created_at DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result.rows));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'DB error' }));
    }
  } else if (parsedUrl.pathname === '/api/donation' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { donationId, txHash, donorAddress, type, title, description, quantity, unit, amount, itemName } = data;
        if (!donationId || !txHash || !donorAddress) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing fields' }));
        }
        await pool.query(
          `INSERT INTO donations (donation_id, donor_address, type, title, description, amount, item_name, quantity, unit, tx_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (donation_id) DO NOTHING`,
          [donationId, donorAddress, type, title, description, amount, itemName, quantity, unit, txHash]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'saved' }));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'DB error' }));
      }
    });
  } else if (parsedUrl.pathname === '/api/flexible' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { donationId, imageIpfs, senderName, senderPhone, senderAddress } = data;
        if (!donationId || !imageIpfs) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing fields' }));
        }
        await pool.query(
          `INSERT INTO flexible_items (donation_id, image_ipfs, sender_name, sender_phone, sender_address)
           VALUES ($1,$2,$3,$4,$5)`,
          [donationId, imageIpfs, senderName, senderPhone, senderAddress]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'saved' }));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'DB error' }));
      }
    });
  } else {
    res.writeHead(404);
    return res.end();
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
