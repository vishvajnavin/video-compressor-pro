const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// The absolute path to the Winget FFmpeg installation we know works on this system
const FFMPEG_PATH = "C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe";
const FFPROBE_PATH = "C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffprobe.exe";

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

    let currentIndex = 0;

    // Process files sequentially to not overload the system
    for (const file of inputFiles) {
        currentIndex++;
        const basename = path.parse(file).name;
        const outputFile = path.join(outputDir, `${basename}_compressed.mp4`);

        // Notify UI which file is starting
        mainWindow.webContents.send('compress:progress', {
            status: `Processing ${currentIndex}/${inputFiles.length}: ${basename}`,
            percent: 0,
            currentFileIndex: currentIndex,
            totalFiles: inputFiles.length
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

        } else {
            // Standard
            args.push('-c:v', videoCodec);
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
                        totalFiles: inputFiles.length
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
            mainWindow.webContents.send('compress:progress', {
                status: `Error on ${basename}`,
                error: true
            });
        });
    }

    return { success: true };
});
