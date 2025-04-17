const path = require('path');
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const downloader = require('./utils/downloader');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.post('/api/fetch-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const info = await downloader.getVideoInfo(url);
        res.json(info);
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const { url, format } = req.body;
        if (!url || !format) {
            return res.status(400).json({ error: 'URL and format are required' });
        }

        const filePath = await downloader.downloadVideo(url, format);
        const fileName = path.basename(filePath);

        res.json({ 
            downloadUrl: `/downloads/${fileName}`,
            fileName
        });
    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ error: 'Failed to download video' });
    }
});

app.get('/downloads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'downloads', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error sending file');
            }
            // Delete file after download completes
            fs.unlinkSync(filePath);
        });
    } else {
        res.status(404).send('File not found');
    }
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/results.html'));
});
  
// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir);
    }
});