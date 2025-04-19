const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Determine yt-dlp path based on environment
// In Vercel build, it's downloaded to the root (__dirname)
// In local/Termux, assume it's in PATH or provide full path if needed
const ytdlpPath = fs.existsSync(path.join(__dirname, 'yt-dlp'))
  ? path.join(__dirname, 'yt-dlp')
  : 'yt-dlp';

app.use(cors());
app.use(express.json());

// Helper function to sanitize input for shell command
function sanitize(input) {
    if (!input) return '';
    // Basic sanitization: remove potentially harmful characters for shell execution
    // Allow alphanumeric, underscore, hyphen, forward slash (for channel URLs), colon, question mark, equals, ampersand
    const sanitized = input.replace(/[^a-zA-Z0-9_\-\/:\?=&]/g, '');
    // Additionally escape quotes just in case, though embedding in quotes is better
    return sanitized.replace(/"/g, '\\"').replace(/'/g, "\\'");
}


// Helper function to run yt-dlp and handle output/errors
function runYtdlp(command, res) {
    console.log(`Executing: ${ytdlpPath} ${command}`);
    // Increase maxBuffer significantly for large JSON outputs (e.g., 50MB)
    exec(`${ytdlpPath} ${command}`, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error.message}`);
            console.error(`Stderr: ${stderr}`);
            const errorOutput = stderr || error.message;
            let statusCode = 500;
            let errorMessage = 'Failed to execute yt-dlp command.';

            if (errorOutput.includes("Video unavailable") || errorOutput.includes("404 Not Found") || errorOutput.includes("channel not found")) {
                statusCode = 404;
                errorMessage = 'Video, Playlist, or Channel not found or unavailable.';
            } else if (errorOutput.includes("Invalid URL")) {
                statusCode = 400;
                errorMessage = 'Invalid URL provided to yt-dlp.';
            } else if (error.killed) {
                 errorMessage = 'Process killed, possibly due to timeout or excessive resource usage.';
            } else if (error.code === 127) {
                 errorMessage = `Command not found: '${ytdlpPath}'. Ensure yt-dlp is installed and accessible.`;
            }

            return res.status(statusCode).json({ success: false, error: errorMessage, details: errorOutput.substring(0, 1000) }); // Limit details length
        }

        try {
            // yt-dlp --dump-single-json outputs one JSON object per line for playlists if not using --flat-playlist sometimes
            // Let's try parsing the entire output as one JSON first
            const jsonData = JSON.parse(stdout);
            res.json({ success: true, data: jsonData });
        } catch (parseError) {
             // If parsing fails, check if it's multiple JSONs (e.g., non-flat playlist)
             try {
                const lines = stdout.trim().split('\n');
                const jsonObjects = lines.map(line => JSON.parse(line));
                // If successful, it was likely a list of video details from a playlist
                res.json({ success: true, data: { entries: jsonObjects } }); // Structure it like a playlist result
             } catch (multiParseError) {
                 console.error(`JSON parse error: ${parseError.message}`);
                 console.error(`Multi-line parse error attempt: ${multiParseError.message}`);
                 // Check stderr again, sometimes errors end up there even with exit code 0
                 if (stderr) {
                    console.error(`Stderr content on parse error: ${stderr}`);
                    return res.status(500).json({ success: false, error: 'yt-dlp produced non-JSON output.', details: stderr.substring(0, 1000) });
                 }
                // Provide limited raw output for debugging
                res.status(500).json({ success: false, error: 'Failed to parse yt-dlp output as JSON.', details: parseError.message, raw_output_preview: stdout.substring(0, 500) });
             }
        }
    });
}

// --- API Routes ---

app.get('/', (req, res) => {
    res.json({ message: 'YouTube Scraper API using yt-dlp. Use endpoints like /video/:id, /playlist/:id, /channel/:id/playlists' });
});

// 1. Video Details (Title, Desc, Likes, Date, Channel, Comments)
app.get('/video/:videoId', (req, res) => {
    const videoId = sanitize(req.params.videoId);
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid YouTube Video ID format.' });
    }
    // Fetch main data, try getting some comments. Adjust max_comments as needed.
    // --no-playlist: Ensure only the single video is processed if it's part of a playlist URL
    // --extractor-args "youtube:player_client=web": Can sometimes help bypass certain restrictions
    // --ignore-config: Ensure predictable behavior
    const command = `--ignore-config --no-playlist --dump-single-json --extractor-args "youtube:max_comments=50,all;player_client=web" "https://www.youtube.com/watch?v=${videoId}"`;
    runYtdlp(command, res);
});

// 2. Comments (and Replies - if available in dump) - Often requires specific extraction
app.get('/comments/:videoId', (req, res) => {
    const videoId = sanitize(req.params.videoId);
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ success: false, error: 'Invalid YouTube Video ID format.' });
    }
    // Explicitly ask for more comments here. Still unreliable for replies.
    // Note: This might be slow and is prone to being blocked or failing.
    const command = `--ignore-config --no-playlist --dump-single-json --extractor-args "youtube:max_comments=200,all;player_client=web" "https://www.youtube.com/watch?v=${videoId}"`;
    // The frontend will need to extract the 'comments' field from the result.data
    runYtdlp(command, res);
});

// 3. Playlist Videos (List of videos in a playlist)
app.get('/playlist/:playlistId', (req, res) => {
    const playlistId = sanitize(req.params.playlistId);
    // Playlist IDs can vary, this is a basic check
    if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
        return res.status(400).json({ success: false, error: 'Invalid YouTube Playlist ID format.' });
    }
    // --flat-playlist: Get list of video entries quickly without full details for each
    // --dump-single-json: Output playlist metadata and entries list as one JSON
    const command = `--ignore-config --flat-playlist --dump-single-json "https://www.youtube.com/playlist?list=${playlistId}"`;
    runYtdlp(command, res);
});

// 4. Channel Playlists (List of playlists created by a channel)
app.get('/channel/:channelId/playlists', (req, res) => {
    const channelId = sanitize(req.params.channelId); // Can be UC... ID or custom name
    if (!channelId) {
        return res.status(400).json({ success: false, error: 'Channel ID or name is required.' });
    }
    // Construct URL. yt-dlp is good at handling various channel URL formats.
    // Using /playlists endpoint is specific.
    const channelUrl = `https://www.youtube.com/channel/${channelId}/playlists`;
    // Use --flat-playlist to get the list of playlists
    // Use --dump-single-json for overall channel info + playlist entries
    const command = `--ignore-config --flat-playlist --dump-single-json "${channelUrl}"`;
    runYtdlp(command, res);
});


// 5. Channel Info (Extracts from a representative video page)
app.get('/channel/:channelId/info', (req, res) => {
    const channelId = sanitize(req.params.channelId);
    if (!channelId) {
        return res.status(400).json({ success: false, error: 'Channel ID or name is required.' });
    }
    // Fetch info from the channel's main page or videos page
    // Limit processing using --playlist-items 0 to just get metadata
    const channelUrl = `https://www.youtube.com/channel/${channelId}`;
    const command = `--ignore-config --playlist-items 0 --dump-single-json "${channelUrl}"`;
    runYtdlp(command, res); // The output JSON's top-level fields contain channel info
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Attempting to use yt-dlp executable at: ${ytdlpPath}`);
    // Check if yt-dlp is accessible on start, just for info
    exec(`${ytdlpPath} --version`, (error, stdout, stderr) => {
        if (error) {
            console.warn(`[Warning] yt-dlp command check failed. Ensure '${ytdlpPath}' is installed correctly and executable.`);
            console.warn(`Error: ${error.message}`);
            if (stderr) console.warn(`Stderr: ${stderr}`);
        } else {
            console.log(`[OK] yt-dlp version check successful: ${stdout.trim()}`);
        }
    });
});

// Basic error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
  // Optionally exit: process.exit(1); // Be careful with this in server environments
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
