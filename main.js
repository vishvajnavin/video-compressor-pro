const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// The absolute path to the Winget FFmpeg installation we know works on this system
const FFMPEG_PATH = "C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe";
const FFPROBE_PATH = "C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffprobe.exe";

async function getAllFiles(dirPath, rootDir) {
    let results = [];
    const _rootDir = rootDir || dirPath;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (let entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await getAllFiles(fullPath, _rootDir));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const isVideo = ['.mp4', '.mov', '.mkv', '.avi', '.m4v'].includes(ext) && !entry.name.startsWith('._');
            
            results.push({
                fullPath: fullPath,
                relativePath: path.relative(_rootDir, fullPath),
                isVideo: isVideo
            });
        }
    }
    return results;
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 650,
        title: "VideoCompressor Pro",
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');

    // Optional: open dev tools for debugging
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// ====== IPC HANDLERS ======

// 1. Select Input Files (Single or Multiple)
ipcMain.handle('dialog:selectFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePaths;
});

// 1.5 Select Input Folders
ipcMain.handle('dialog:selectFolders', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections']
    });
    return result.filePaths;
});

// 2. Select Output Directory
ipcMain.handle('dialog:selectOutputDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// 3. Run Compression Process
ipcMain.handle('compress:start', async (event, config) => {
    const { inputFiles, outputDir, preset, useGpu } = config;

    if (!inputFiles || inputFiles.length === 0 || !outputDir) {
        return { success: false, error: "Missing files or destination." };
    }

    // --- RECURSIVE FOLDER RESOLUTION ---
    let allMediaForProcessing = [];
    for (const inputPath of inputFiles) {
        try {
            const statInfo = await fs.promises.stat(inputPath);
            if (statInfo.isDirectory()) {
                const files = await getAllFiles(inputPath, inputPath);
                allMediaForProcessing.push(...files);
            } else {
                const ext = path.extname(inputPath).toLowerCase();
                const basename = path.basename(inputPath);
                const isVideo = ['.mp4', '.mov', '.mkv', '.avi', '.m4v'].includes(ext) && !basename.startsWith('._');
                
                if (isVideo) {
                    allMediaForProcessing.push({
                        fullPath: inputPath,
                        relativePath: path.basename(inputPath),
                        isVideo: isVideo
                    });
                }
            }
        } catch (e) {
            console.error("Error statting input:", e);
        }
    }

    // Filter out non-video files from the processing list so we don't count them in UI totals
    allMediaForProcessing = allMediaForProcessing.filter(media => media.isVideo);

    if (allMediaForProcessing.length === 0) {
        return { success: false, error: "No video files found in the selected inputs." };
    }

    let currentIndex = 0;

    // Process files sequentially to not overload the system
    for (const media of allMediaForProcessing) {
        currentIndex++;
        const file = media.fullPath;
        const basename = path.parse(media.relativePath).name;

        // --- MIRROR NESTED DIRECTORY STRUCTURE ---
        const parsedRel = path.parse(media.relativePath);
        const outputDirPath = path.join(outputDir, parsedRel.dir);

        // Create directory if it doesn't exist recursively
        if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
        }


        const outputFile = path.join(outputDirPath, `${basename}_compressed.mp4`);

        // Notify UI which file is starting
        mainWindow.webContents.send('compress:progress', {
            status: `Processing ${currentIndex}/${allMediaForProcessing.length}: ${basename}`,
            percent: 0,
            currentFileIndex: currentIndex,
            totalFiles: allMediaForProcessing.length
        });

        // Build FFmpeg Arguments Based on Preset & GPU Selection
        let args = ['-y', '-i', file]; // -y overwrite, -i input

        // --- GPU ACCELERATION LOGIC ---
        // If NVIDIA GPU is selected, use NVENC
        const videoCodec = useGpu ? 'h264_nvenc' : 'libx264';
        const presetSpeed = useGpu ? 'p4' : 'fast'; // p4 is medium-fast preset for nvenc

        // --- PRESET LOGIC ---
        if (preset === 'proxy') {
            // Tiny 1080p proxy
            args.push('-vf', 'scale=-2:1080');
            args.push('-c:v', videoCodec);
            // force 4:2:0 for nvenc h264 compatibility
            args.push('-pix_fmt', 'yuv420p');
            // nvenc uses -cq instead of -crf for constant quality
            if (useGpu) {
                args.push('-preset', presetSpeed, '-cq', '28');
            } else {
                args.push('-preset', presetSpeed, '-crf', '28');
            }
            args.push('-c:a', 'copy');

        } else if (preset === 'lossless') {
            // High Quality 4k, visually lossless
            args.push('-c:v', videoCodec);
            if (useGpu) {
                args.push('-preset', presetSpeed, '-cq', '18');
            } else {
                args.push('-preset', presetSpeed, '-crf', '18');
            }
            args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');

        } else if (preset === 'smooth_edit') {
            // ALL-Intra Smooth Editing for Resolve/Premiere
            args.push('-c:v', videoCodec);
            args.push('-g', '1'); // Force every frame as keyframe
            if (useGpu) {
                args.push('-preset', presetSpeed, '-cq', '18');
            } else {
                args.push('-preset', presetSpeed, '-crf', '18');
            }
            args.push('-pix_fmt', 'yuv420p', '-c:a', 'copy'); // Copy original audio

        } else {
            // Standard
            args.push('-c:v', videoCodec);
            args.push('-pix_fmt', 'yuv420p');
            if (useGpu) {
                args.push('-preset', presetSpeed, '-cq', '23');
            } else {
                args.push('-preset', presetSpeed, '-crf', '23');
            }
            args.push('-c:a', 'aac', '-b:a', '192k');
        }

        args.push(outputFile);

        // 1. Get total duration of input file for calculating exact percentage
        let totalDurationSec = 0;
        try {
            const probeArgs = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file];
            const probeResult = require('child_process').spawnSync(FFPROBE_PATH, probeArgs);
            if (probeResult.stdout) {
                totalDurationSec = parseFloat(probeResult.stdout.toString().trim());
            }
        } catch (e) {
            console.error("Failed to get duration:", e);
        }

        console.log(`Executing FFmpeg: ${args.join(' ')}`);

        // Await the completion of this single file before moving to the next
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(FFMPEG_PATH, args);

            // FFmpeg writes progress to stderr
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                // Find time string like time=00:00:10.50
                const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1], 10);
                    const mins = parseInt(timeMatch[2], 10);
                    const secs = parseFloat(timeMatch[3]);
                    const currentSec = (hours * 3600) + (mins * 60) + secs;

                    let percent = 0;
                    if (totalDurationSec > 0) {
                        percent = Math.floor((currentSec / totalDurationSec) * 100);
                        if (percent > 100) percent = 100;
                    }

                    mainWindow.webContents.send('compress:progress', {
                        status: `Encoding ${basename}...`,
                        rawTime: timeMatch[0],
                        percent: percent,
                        currentFileIndex: currentIndex,
                        totalFiles: allMediaForProcessing.length
                    });
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });
        }).catch(err => {
            console.error(`Error on file ${basename}:`, err);

            // Clean up the 0kb file if encoding crashed instantly
            if (fs.existsSync(outputFile)) {
                try { fs.unlinkSync(outputFile); } catch (e) { }
            }

            mainWindow.webContents.send('compress:progress', {
                status: `Error on ${basename}`,
                error: true
            });
        });
    }

    return { success: true };
});
