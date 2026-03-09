let selectedFiles = [];
let outputDirectory = null;

// UI Elements
const btnSelectFiles = document.getElementById('btn-select-files');
const txtSelectedFiles = document.getElementById('txt-selected-files');
const btnSelectOutput = document.getElementById('btn-select-output');
const txtOutputDir = document.getElementById('txt-output-dir');
const selPreset = document.getElementById('sel-preset');
const chkGpu = document.getElementById('chk-gpu');

const btnStart = document.getElementById('btn-start');
const progressContainer = document.getElementById('progress-container');
const progressStatus = document.getElementById('progress-status');
const progressCount = document.getElementById('progress-count');
const progressBar = document.getElementById('progress-bar');

function validateStart() {
    if (selectedFiles.length > 0 && outputDirectory) {
        btnStart.removeAttribute('disabled');
    } else {
        btnStart.setAttribute('disabled', 'true');
    }
}

// 1. Browse Files
btnSelectFiles.addEventListener('click', async () => {
    const files = await window.electronAPI.selectFiles();
    if (files && files.length > 0) {
        selectedFiles = files;
        txtSelectedFiles.innerText = `${files.length} file(s) selected`;
        txtSelectedFiles.style.color = '#fff';
        validateStart();
    }
});

// 2. Output Directory
btnSelectOutput.addEventListener('click', async () => {
    const dir = await window.electronAPI.selectOutputDir();
    if (dir) {
        outputDirectory = dir;
        txtOutputDir.innerText = dir;
        txtOutputDir.style.color = '#fff';
        validateStart();
    }
});

// 3. Start Button
btnStart.addEventListener('click', async () => {
    // Lock UI
    btnStart.setAttribute('disabled', 'true');
    btnStart.innerText = 'Compression in Progress...';
    btnSelectFiles.setAttribute('disabled', 'true');
    btnSelectOutput.setAttribute('disabled', 'true');

    // Show Progress
    progressContainer.classList.remove('hidden');
    progressContainer.classList.add('processing');
    progressStatus.innerText = 'Initializing FFmpeg Engine...';
    progressCount.innerText = `0 / ${selectedFiles.length}`;

    const config = {
        inputFiles: selectedFiles,
        outputDir: outputDirectory,
        preset: selPreset.value,
        useGpu: chkGpu.checked
    };

    // Listen for progress
    window.electronAPI.onCompressProgress((data) => {
        if (data.error) {
            progressStatus.innerText = data.status;
            progressStatus.style.color = 'var(--danger)';
        } else {
            progressStatus.innerText = data.status;
            if (data.rawTime) {
                progressStatus.innerText += ` (Time Mark: ${data.rawTime})`;
            }
            if (data.currentFileIndex && data.totalFiles) {
                progressCount.innerText = `${data.currentFileIndex - 1} / ${data.totalFiles}`;
            }
        }
    });

    try {
        const result = await window.electronAPI.startCompression(config);

        // Done
        progressContainer.classList.remove('processing');
        progressBar.style.width = '100%';
        progressBar.style.backgroundColor = 'var(--accent)';

        if (result.success) {
            progressStatus.innerText = 'Batch Compression Complete!';
            progressCount.innerText = `${selectedFiles.length} / ${selectedFiles.length}`;
            btnStart.innerText = 'View Output Folder';
            btnStart.onclick = () => { /* Add open directory logic if needed */ };
        } else {
            progressStatus.innerText = `Failed: ${result.error}`;
            progressStatus.style.color = 'var(--danger)';
        }

    } catch (err) {
        console.error(err);
        progressStatus.innerText = 'A critical error occurred.';
    } finally {
        // We can unlock the UI after completion if desired, but making them restart the app is safer for clean state
        btnStart.removeAttribute('disabled');
        btnStart.innerText = 'Start New Batch';
        btnStart.onclick = () => { location.reload(); };
    }
});
