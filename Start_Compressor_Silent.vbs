Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""E:\VideoCompressorPro"" && npm start", 0, False
