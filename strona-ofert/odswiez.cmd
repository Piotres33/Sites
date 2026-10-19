@echo off
chcp 65001 >nul
"%~dp0..\node\node.exe" "%~dp0strona.js" %*
