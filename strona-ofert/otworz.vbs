' Otwiera stronę ofert. Gdy lokalny serwer nie działa, uruchamia go w tle (bez okna).
Option Explicit
Dim sh, fso, base, node, url, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
node = fso.BuildPath(fso.GetParentFolderName(base), "node\node.exe")
url = "http://127.0.0.1:8765/"

If Not Dziala() Then
  sh.Run """" & node & """ """ & fso.BuildPath(base, "serwer.js") & """", 0, False
  For i = 1 To 40
    WScript.Sleep 250
    If Dziala() Then Exit For
  Next
End If
sh.Run url

Function Dziala()
  Dim x
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 500, 500, 500, 500
  x.Open "GET", url & "api/ping", False
  x.Send
  Dziala = (Err.Number = 0)
  If Dziala Then Dziala = (x.Status = 200)
  On Error GoTo 0
End Function
