# VideoCompressor Pro

VideoCompressor Pro is a high-performance, professional-grade desktop application for batch video compression. It is built as a cross-platform desktop wrapper around standard FFmpeg, specifically designed to leverage **OS-level hardware acceleration** (NVIDIA NVENC) to maximize rendering speed.

![Tech Stack](https://img.shields.io/badge/Tech_Stack-Electron.js_|_Node.js_|_FFmpeg-blue?style=flat-square)

## ✨ Core Features
- **GPU Hardware Acceleration**: Bypasses the CPU to encode massive 4K video directly on the NVIDIA GPU (using the `h264_nvenc` codec).
- **Visually Lossless 4K Profiles**: Provides 1-click presets to maintain exact camera quality (`-crf 18`) while universally flattening complex 4:2:2 10-bit color formats into standard, universally playable 4:2:0 MP4s.
- **Lightweight Editing Proxies**: Instantly shrink gigabytes of 4K video into tiny 1080p proxies (`-crf 28`) for perfectly smooth multi-cam editing in software like DaVinci Resolve or Premiere Pro.
- **Asynchronous Batch Processing**: Process 1 to 1,000 videos sequentially without blocking the OS GUI. 
- **Modern UI**: Dark-mode, responsive Electron frontend with real-time FFmpeg pipe status tracking.

## 🏗 System Architecture
This application fulfills professional DevOps deployment specifications:
1. **Frontend**: Electron.js web-view bridging custom HTML/CSS and JavaScript standard DOM events.
2. **Backend**: Node.js `child_process` spawns detached process threads, injecting variables safely via the Electron `contextBridge`.
3. **Containerization**: An Alpine Linux `Dockerfile` is included to run the FFmpeg engine headlessly in scalable cloud environments if detached from the Electron frontend.

## 🚀 How to Run Locally

### Requirements
Ensure you have the following installed on your system:
- **Node.js** (v18+)
- **FFmpeg** (Accessible in the system PATH, or hardcoded in `main.js`)
- An NVIDIA GPU (Options fall back to CPU `libx264` if disabled).

### Setup Instructions
1. Clone this repository:
   ```bash
   git clone https://github.com/vishvajnavin/video-compressor-pro.git
   cd video-compressor-pro
   ```
2. Install the Node package dependencies:
   ```bash
   npm install
   ```
3. Start the Application:
   ```bash
   npm start
   ```
   *(Windows Users can alternatively double-click the included `Start_Compressor.bat` file.)*

## 🐳 Running via Docker (Backend Only)
To deploy the compression engine headlessly on a server:
```bash
docker build -t video-compressor-engine .
docker run -d video-compressor-engine
```

## 📜 License
This software is provided "as is" for professional studio workflows.
