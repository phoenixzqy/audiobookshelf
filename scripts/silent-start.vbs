' Silent startup script for Windows
' This VBScript runs the server without showing a command window
' Used by Task Scheduler for auto-start on boot

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get script directory
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptPath)
backendPath = projectRoot & "\backend"
logDir = projectRoot & "\logs"
logFile = logDir & "\server.log"

' Create logs directory if not exists
If Not fso.FolderExists(logDir) Then
    fso.CreateFolder(logDir)
End If

' Change to backend directory and start server
WshShell.CurrentDirectory = backendPath

' Run npm in hidden mode
WshShell.Run "cmd /c npm run dev >> """ & logFile & """ 2>&1", 0, False

' Log startup
Set logStream = fso.OpenTextFile(logFile, 8, True)
logStream.WriteLine "[" & Now & "] Server started via silent-start.vbs"
logStream.Close
